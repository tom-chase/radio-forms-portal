#!/bin/bash

# Form Template Sync Script
# Syncs selected form templates from form_templates/ into default-template.json
# Usage: ./scripts/sync-form-templates.sh form1,form2,form3

set -e

# Get list of forms to sync (comma-separated)
FORMS_TO_SYNC=${1:-"book"}

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORM_TEMPLATES_DIR="$(cd "$SCRIPT_DIR/../config/bootstrap/form_templates" && pwd)"
DEFAULT_TEMPLATE="$(cd "$SCRIPT_DIR/../config/bootstrap" && pwd)/default-template.json"
BACKUP_TEMPLATE="$(cd "$SCRIPT_DIR/../config/bootstrap" && pwd)/default-template.json.backup"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔄 Syncing form templates to default-template.json...${NC}"

# Validate inputs
if [ -z "$FORMS_TO_SYNC" ]; then
    echo -e "${RED}❌ Error: No forms specified${NC}"
    echo "Usage: $0 form1,form2,form3"
    exit 1
fi

# Check if default-template.json exists
if [ ! -f "$DEFAULT_TEMPLATE" ]; then
    echo -e "${RED}❌ Error: default-template.json not found at $DEFAULT_TEMPLATE${NC}"
    exit 1
fi

# Create backup
echo -e "${YELLOW}📋 Creating backup of default-template.json...${NC}"
cp "$DEFAULT_TEMPLATE" "$BACKUP_TEMPLATE"

# Parse comma-separated form list
IFS=',' read -ra FORM_ARRAY <<< "$FORMS_TO_SYNC"

# Function to validate JSON
validate_json() {
    local file="$1"
    if ! python3 -m json.tool "$file" > /dev/null 2>&1; then
        echo -e "${RED}❌ Invalid JSON in $file${NC}"
        return 1
    fi
    return 0
}

# Function to merge form into default template
merge_form() {
    local form_name="$1"
    local form_file="$FORM_TEMPLATES_DIR/${form_name}.json"
    
    echo -e "${BLUE}  📝 Processing form: $form_name${NC}"
    
    # Check if form template exists
    if [ ! -f "$form_file" ]; then
        echo -e "${RED}    ❌ Form template not found: $form_file${NC}"
        return 1
    fi
    
    # Validate form template JSON
    if ! validate_json "$form_file"; then
        echo -e "${RED}    ❌ Invalid JSON in form template: $form_file${NC}"
        return 1
    fi
    
    # Extract form data to temporary file
    local temp_form_file="/tmp/form_${form_name}.json"
    
    python3 << EOF
import json
import sys

try:
    with open('$form_file', 'r') as f:
        form_data = json.load(f)
    
    # Extract just the form definition (remove outer wrapper if present)
    if 'title' in form_data and 'name' in form_data and 'type' in form_data:
        # This is already a form definition
        with open('$temp_form_file', 'w') as f:
            json.dump(form_data, f, indent=2)
        print("SUCCESS")
    else:
        print("ERROR: Invalid form format", file=sys.stderr)
        sys.exit(1)
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
EOF
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}    ❌ Failed to extract form data from: $form_file${NC}"
        rm -f "$temp_form_file"
        return 1
    fi
    
    # Update default-template.json using python
    local result=$(python3 << EOF
import json
import sys

try:
    # Load current default template
    with open('$DEFAULT_TEMPLATE', 'r') as f:
        template = json.load(f)
    
    # Ensure forms section exists
    if 'forms' not in template:
        template['forms'] = {}
    
    # Load the new form from temp file
    with open('$temp_form_file', 'r') as f:
        new_form = json.load(f)
    
    # Check if form already exists and show comparison
    if '$form_name' in template['forms']:
        existing_form = template['forms']['$form_name']
        print(f"    📋 Updating existing form: $form_name", file=sys.stderr)
        
        # Compare key fields
        if existing_form.get('title') != new_form.get('title'):
            print(f"      Title: {existing_form.get('title')} → {new_form.get('title')}", file=sys.stderr)
        if existing_form.get('components', []) != new_form.get('components', []):
            print(f"      Components: Updated", file=sys.stderr)
    else:
        print(f"    ➕ Adding new form: $form_name", file=sys.stderr)
    
    # Merge the form
    template['forms']['$form_name'] = new_form
    
    # Write back to file
    with open('$DEFAULT_TEMPLATE', 'w') as f:
        json.dump(template, f, indent=2)
    
    print("SUCCESS")
    
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
EOF
)
    
    # Clean up temp file
    rm -f "$temp_form_file"
    
    if [ $? -ne 0 ] || [[ "$result" != "SUCCESS" ]]; then
        echo -e "${RED}    ❌ Failed to merge form: $form_name${NC}"
        echo -e "${RED}       $result${NC}"
        return 1
    fi
    
    echo -e "${GREEN}    ✅ Successfully merged: $form_name${NC}"
    return 0
}

# Process each form
success_count=0
total_count=${#FORM_ARRAY[@]}

for form in "${FORM_ARRAY[@]}"; do
    form=$(echo "$form" | xargs) # trim whitespace
    if merge_form "$form"; then
        ((success_count++))
    fi
done

# Validate final default-template.json
echo -e "${YELLOW}🔍 Validating final default-template.json...${NC}"
if validate_json "$DEFAULT_TEMPLATE"; then
    echo -e "${GREEN}✅ default-template.json is valid${NC}"
else
    echo -e "${RED}❌ default-template.json is invalid after merge${NC}"
    echo -e "${YELLOW}🔄 Restoring from backup...${NC}"
    cp "$BACKUP_TEMPLATE" "$DEFAULT_TEMPLATE"
    exit 1
fi

# Summary
echo -e "${GREEN}🎉 Form sync completed!${NC}"
echo -e "${GREEN}   Successfully synced: $success_count/$total_count forms${NC}"

if [ $success_count -eq $total_count ]; then
    echo -e "${GREEN}   All forms processed successfully${NC}"
    echo -e "${BLUE}   📁 Backup saved to: default-template.json.backup${NC}"
else
    echo -e "${YELLOW}   ⚠️  Some forms failed to sync${NC}"
    echo -e "${YELLOW}   📁 Check backup: default-template.json.backup${NC}"
fi

echo ""
echo -e "${BLUE}📋 Forms now in default-template.json:${NC}"
python3 << EOF
import json
try:
    with open('$DEFAULT_TEMPLATE', 'r') as f:
        template = json.load(f)
    
    if 'forms' in template:
        forms = template['forms']
        for name, form in sorted(forms.items()):
            title = form.get('title', 'No title')
            print(f"   • {name}: {title}")
    else:
        print("   No forms found")
except:
    print("   Error reading forms")
EOF

echo ""
echo -e "${BLUE}💡 Next steps:${NC}"
echo "   1. Run deploy-dev.sh to test changes"
echo "   2. Verify forms in the UI"
echo "   3. Commit changes when ready"
