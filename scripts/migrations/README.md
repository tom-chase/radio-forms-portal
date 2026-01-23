# Form.io Migrations

This directory contains migration scripts for managing incremental changes to Form.io forms and resources in production.

## Philosophy

Migrations handle **structural changes** to forms that can't be safely automated:
- Adding/removing/modifying form components
- Renaming fields (with data migration)
- Complex permission changes
- Breaking changes that require data transformation

**Note**: Simple changes like permission syncing and new form creation are handled automatically by `post-bootstrap.js`.

## Migration File Naming

Migrations must follow this naming convention:
```
NNN-description-of-change.js
```

Examples:
- `001-add-status-field-to-incident-report.js`
- `002-rename-department-to-departments.js`
- `003-update-user-form-email-validation.js`

## Migration Script Structure

Each migration exports an object with:
- `id`: Unique identifier (matches filename without .js)
- `description`: Human-readable description
- `up`: Function to apply the migration
- `down`: (Optional) Function to rollback the migration

### Example Migration

```javascript
const fetch = require('node-fetch');

module.exports = {
    id: '001-add-status-field-to-incident-report',
    description: 'Add status dropdown field to incident report form',
    
    async up({ API_BASE, headers, log }) {
        log('Fetching incident report form...');
        const formResp = await fetch(`${API_BASE}/form?name=incidentReport`, { headers });
        const forms = await formResp.json();
        
        if (!forms || forms.length === 0) {
            throw new Error('Incident report form not found');
        }
        
        const form = forms[0];
        
        // Check if field already exists
        if (form.components.some(c => c.key === 'status')) {
            log('Status field already exists, skipping');
            return;
        }
        
        // Add new component
        form.components.push({
            type: 'select',
            key: 'status',
            label: 'Status',
            data: {
                values: [
                    { label: 'Open', value: 'open' },
                    { label: 'In Progress', value: 'in_progress' },
                    { label: 'Resolved', value: 'resolved' }
                ]
            },
            defaultValue: 'open',
            validate: { required: true }
        });
        
        // Update form
        const updateResp = await fetch(`${API_BASE}/form/${form._id}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(form)
        });
        
        if (!updateResp.ok) {
            throw new Error(`Failed to update form: ${updateResp.statusText}`);
        }
        
        log('Successfully added status field to incident report');
    },
    
    async down({ API_BASE, headers, log }) {
        // Optional: implement rollback logic
        log('Rollback not implemented for this migration');
    }
};
```

## Running Migrations

Migrations run automatically during deployment via `scripts/run-migrations.js`.

### Manual Execution

To run migrations manually:

```bash
# Development
docker-compose exec formio node /app/run-migrations.js

# Production (SSH into server first)
docker exec formio node /app/run-migrations.js
```

### Check Migration Status

```bash
# View applied migrations
docker exec formio node -e "
const fetch = require('node-fetch');
fetch('http://localhost:3001/migration').then(r => r.json()).then(console.log);
"
```

## Migration Tracking

Applied migrations are tracked in a `migration` resource with submissions containing:
- `migrationId`: The migration ID (e.g., "001-add-status-field")
- `appliedAt`: Timestamp when migration was applied
- `status`: "completed" or "failed"
- `error`: Error message if failed

## Best Practices

1. **Idempotent**: Migrations should be safe to run multiple times
2. **Atomic**: Each migration should do one logical change
3. **Tested**: Test migrations in development before production
4. **Documented**: Include clear description and comments
5. **Reversible**: Implement `down()` when possible for rollback
6. **Data-safe**: Always check for existing data before destructive operations

## When to Use Migrations vs post-bootstrap.js

### Use Migrations For:
- ✅ Adding/removing form components
- ✅ Changing field types or validation rules
- ✅ Renaming fields (requires data migration)
- ✅ Complex multi-step changes
- ✅ Changes that need to transform existing submission data

### Use post-bootstrap.js For:
- ✅ Creating new forms/resources
- ✅ Syncing permissions from template
- ✅ Updating role-based conditional logic
- ✅ Creating seed data (departments, committees)
- ✅ Dynamic ID resolution

## Troubleshooting

### Migration Failed
1. Check logs: `docker logs formio` or `logs/migrations.log`
2. Verify migration syntax and logic
3. Check Form.io API is accessible
4. Ensure authentication is working

### Rollback a Migration
1. Implement the `down()` function
2. Manually remove the migration record from the `migration` resource
3. Re-run migrations

### Skip a Migration
Manually create a migration record with `status: "completed"` to mark it as applied without running it.
