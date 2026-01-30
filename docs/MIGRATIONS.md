# Form.io Migrations Guide

## Overview

The Radio Forms Portal uses a hybrid approach for managing Form.io schema changes:

1. **Automated Syncing** (`post-bootstrap.js`): Handles permissions, new forms/resources, dynamic IDs, and (for selected forms) schema syncing
2. **Manual Migrations** (`scripts/migrations/`): Handles structural changes to existing forms

This document focuses on the migration system for managing incremental changes to production forms.

## When to Use Migrations

### ✅ Use Migrations For:
- Adding/removing form components (fields)
- Changing field types or validation rules
- Renaming fields (especially when data migration is needed)
- Updating form layouts or component order
- Complex multi-step changes
- Changes that need to transform existing submission data

### ❌ Use post-bootstrap.js For:
- Creating new forms/resources (automatic)
- Syncing permissions from template (automatic)
- Updating role-based conditional logic (automatic)
- Creating seed data (departments, committees)
- Dynamic ID resolution

### "Schema as Code" note (Selected Forms)

Some forms (currently `book`) are treated as **schema as code**:
- Their schema (`components`, `settings`, templates) is stored in `config/bootstrap/default-template.json` and may be synced to the DB during `post-bootstrap.js`.
- Implication: manual schema edits made in the Form.io Admin UI for these forms may be overwritten during deployments.

If you need to change `book`, prefer updating `default-template.json` and re-running post-bootstrap. Only use a migration for `book` when you must transform existing submission data.

### Capturing Admin UI Prototypes (Early Development)

During early development it is acceptable to prototype new forms in the Form.io Admin UI. To capture that work in git without introducing large, unstable diffs:

1. Export only the specific form(s) you changed (per-form export).
2. Save each exported form JSON into `config/bootstrap/form_templates/<formName>.json`.
3. When the form stabilizes, promote it into `config/bootstrap/default-template.json`.

Avoid overwriting `default-template.json` from a full "project export" bundle. Those exports can include environment-specific fields and make the template hard to review and maintain.

## Quick Start

### 1. Create a Migration

```bash
# Copy the template
cp scripts/migrations/000-example-migration.js.template \
   scripts/migrations/001-my-first-migration.js

# Edit the migration
vim scripts/migrations/001-my-first-migration.js
```

### 2. Test in Development

```bash
# Deploy to dev (start/restart services)
./scripts/deploy-dev.sh

# Then run migrations
docker exec formio-dev node /app/run-migrations.js
```

### 3. Deploy to Production

```bash
# Deploy code to production (tarball push)
./scripts/deploy-production.sh ~/.ssh/your-key.pem

# Then run migrations on the server (inside the Form.io container)
docker exec formio node /app/run-migrations.js
```

## Migration File Structure

### Naming Convention

```
NNN-description-of-change.js
```

- `NNN`: Three-digit sequential number (001, 002, 003, etc.)
- `description-of-change`: Kebab-case description
- Must end with `.js`

### File Template

```javascript
const fetch = require('node-fetch');

module.exports = {
    // Must match filename without .js extension
    id: '001-add-status-field',
    
    // Human-readable description
    description: 'Add status dropdown to incident report form',
    
    // Apply the migration
    async up({ API_BASE, headers, log }) {
        // Your migration logic here
    },
    
    // Optional: rollback the migration
    async down({ API_BASE, headers, log }) {
        // Your rollback logic here
    }
};
```

## Common Migration Patterns

### Pattern 1: Add a Field to a Form

```javascript
async up({ API_BASE, headers, log }) {
    // Fetch the form
    const resp = await fetch(`${API_BASE}/form?name=incidentReport`, { headers });
    const forms = await resp.json();
    
    if (!forms || forms.length === 0) {
        throw new Error('Form not found');
    }
    
    const form = forms[0];
    
    // Check if field already exists (idempotency)
    if (form.components.some(c => c.key === 'status')) {
        log('Field already exists, skipping');
        return;
    }
    
    // Add the new field
    form.components.push({
        type: 'select',
        key: 'status',
        label: 'Status',
        data: {
            values: [
                { label: 'Open', value: 'open' },
                { label: 'Resolved', value: 'resolved' }
            ]
        },
        defaultValue: 'open'
    });
    
    // Update the form
    const updateResp = await fetch(`${API_BASE}/form/${form._id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(form)
    });
    
    if (!updateResp.ok) {
        throw new Error(`Update failed: ${updateResp.statusText}`);
    }
    
    log('Successfully added status field');
}
```

### Pattern 2: Modify Existing Field

```javascript
async up({ API_BASE, headers, log }) {
    const resp = await fetch(`${API_BASE}/form?name=user`, { headers });
    const forms = await resp.json();
    const form = forms[0];
    
    // Find the component
    const emailField = form.components.find(c => c.key === 'email');
    
    if (!emailField) {
        throw new Error('Email field not found');
    }
    
    // Modify properties
    emailField.validate = emailField.validate || {};
    emailField.validate.required = true;
    emailField.validate.pattern = '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$';
    
    // Update form
    await fetch(`${API_BASE}/form/${form._id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(form)
    });
    
    log('Updated email field validation');
}
```

### Pattern 3: Rename Field with Data Migration

```javascript
async up({ API_BASE, headers, log }) {
    // 1. Update form schema
    const formResp = await fetch(`${API_BASE}/form?name=user`, { headers });
    const forms = await formResp.json();
    const form = forms[0];
    
    const oldField = form.components.find(c => c.key === 'department');
    if (oldField) {
        oldField.key = 'departments';
        oldField.label = 'Departments';
        oldField.multiple = true; // Now allows multiple selections
    }
    
    await fetch(`${API_BASE}/form/${form._id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(form)
    });
    
    // 2. Migrate existing submission data
    log('Migrating submission data...');
    const submResp = await fetch(`${API_BASE}/user/submission?limit=1000`, { headers });
    const submissions = await submResp.json();
    
    let migratedCount = 0;
    for (const sub of submissions) {
        if (sub.data.department && !sub.data.departments) {
            // Convert single value to array
            sub.data.departments = [sub.data.department];
            delete sub.data.department;
            
            await fetch(`${API_BASE}/user/submission/${sub._id}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(sub)
            });
            
            migratedCount++;
        }
    }
    
    log(`Migrated ${migratedCount} submissions`);
}
```

### Pattern 4: Add Component to Nested Layout

```javascript
async up({ API_BASE, headers, log }) {
    const resp = await fetch(`${API_BASE}/form?name=incidentReport`, { headers });
    const forms = await resp.json();
    const form = forms[0];
    
    // Find a panel or columns component
    const detailsPanel = form.components.find(c => c.key === 'detailsPanel');
    
    if (!detailsPanel) {
        throw new Error('Details panel not found');
    }
    
    // Add field to nested components
    detailsPanel.components = detailsPanel.components || [];
    detailsPanel.components.push({
        type: 'textarea',
        key: 'additionalNotes',
        label: 'Additional Notes',
        rows: 3
    });
    
    await fetch(`${API_BASE}/form/${form._id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(form)
    });
    
    log('Added field to details panel');
}
```

## Migration Lifecycle

### 1. Development Phase
- Create migration file in `scripts/migrations/`
- Test with `./scripts/deploy-dev.sh`
- Verify changes in development environment
- Test rollback if `down()` is implemented

### 2. Review Phase
- Commit migration to version control
- Review migration code in PR
- Ensure idempotency (safe to run multiple times)
- Verify error handling

### 3. Deployment Phase
- Migrations run automatically during `./scripts/deploy-production.sh`
- Execution order: alphabetical by filename
- Stops on first failure
- Logs to `logs/migrations.log` on server

### 4. Post-Deployment
- Verify migration applied: Check `migration` resource submissions
- Test affected forms in production
- Monitor for issues

## Tracking & Status

### View Applied Migrations

```bash
# Via API
curl -H "x-jwt-token: YOUR_TOKEN" \
  http://localhost:3001/migration/submission

# Via Docker
docker exec formio node -e "
const fetch = require('node-fetch');
fetch('http://localhost:3001/migration/submission?limit=100')
  .then(r => r.json())
  .then(data => console.log(JSON.stringify(data, null, 2)));
"
```

### Check Migration Status

Each migration creates a submission in the `migration` resource with:
- `migrationId`: The migration ID
- `appliedAt`: ISO timestamp
- `status`: "completed" or "failed"
- `error`: Error message if failed

## Troubleshooting

### Migration Failed

1. **Check logs:**
   ```bash
   # Production
   ssh admin@server "cat /home/admin/radio-forms-portal/logs/migrations.log"
   
   # Development
   docker logs formio-dev
   ```

2. **Common issues:**
   - Form not found: Check form name/path
   - Authentication failed: Verify ROOT_EMAIL/ROOT_PASSWORD
   - Component not found: Check component key spelling
   - Update failed: Check Form.io API response

3. **Fix and retry:**
   - Fix the migration code
   - Delete the failed migration record from `migration` resource
   - Re-run deployment

### Skip a Migration

To mark a migration as applied without running it:

```bash
docker exec formio node -e "
const fetch = require('node-fetch');
fetch('http://localhost:3001/migration/submission', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-jwt-token': 'YOUR_TOKEN'
  },
  body: JSON.stringify({
    data: {
      migrationId: '001-my-migration',
      appliedAt: new Date().toISOString(),
      status: 'completed'
    }
  })
}).then(r => r.json()).then(console.log);
"
```

### Rollback a Migration

1. Implement the `down()` function in your migration
2. Remove the migration record from the `migration` resource
3. Run the migration manually with a custom runner (not currently automated)

## Best Practices

### 1. Idempotency
Always check if changes already exist before applying:

```javascript
// ✅ Good
if (!form.components.some(c => c.key === 'newField')) {
    form.components.push({ ... });
}

// ❌ Bad
form.components.push({ ... }); // Will duplicate on re-run
```

### 2. Error Handling
Throw descriptive errors for debugging:

```javascript
if (!updateResp.ok) {
    const errorText = await updateResp.text();
    throw new Error(`Failed to update form: ${updateResp.status} ${errorText}`);
}
```

### 3. Atomic Changes
One logical change per migration:

```javascript
// ✅ Good: 001-add-status-field.js, 002-add-priority-field.js
// ❌ Bad: 001-add-all-new-fields.js (too broad)
```

### 4. Data Safety
Always backup before destructive operations:

```javascript
// When renaming/removing fields, consider keeping old data
sub.data.newField = sub.data.oldField;
// Don't delete sub.data.oldField until verified
```

### 5. Testing
Test in development first, always:

```bash
# Never skip this step
./scripts/deploy-dev.sh
# Verify changes manually
# Then deploy to production
```

## Integration with Deployment

Migrations are integrated into both deployment workflows:

### Development (`deploy-dev.sh`)
1. Start Docker Compose
2. Wait for services
3. Run `post-bootstrap.js` (creates forms, syncs permissions)
4. Run `run-migrations.js` (applies structural changes)

### Production (`deploy-production.sh`)
1. Upload tarball to server
2. Generate configuration
3. Restart Docker Compose
4. Run `post-bootstrap.js`
5. Run `run-migrations.js`
6. Log results to `logs/migrations.log`

## Example Workflow

```bash
# 1. Create migration
cp scripts/migrations/000-example-migration.js.template \
   scripts/migrations/001-add-incident-severity.js

# 2. Edit migration
vim scripts/migrations/001-add-incident-severity.js

# 3. Test in dev
./scripts/cleanup.sh
./scripts/deploy-dev.sh

# 4. Verify in browser
open http://localhost:3000

# 5. Commit
git add scripts/migrations/001-add-incident-severity.js
git commit -m "feat: add severity field to incident report"

# 6. Deploy to production
./scripts/deploy-production.sh ~/.ssh/key.pem

# 7. Verify in production
# Check logs/migrations.log on server
```

## Related Documentation

- `scripts/migrations/README.md` - Quick reference for migration authors
- `AGENT.md` - Post-Bootstrap Configuration pattern
- `DEPLOYMENT.md` - Deployment workflows
- `docs/COMMON_ISSUES.md` - Troubleshooting guide
