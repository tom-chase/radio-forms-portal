---
description: Create and test a new Form.io database migration
---

# Create Migration

Use migrations for structural changes to existing forms (add/remove fields, change types, rename with data migration). For new forms/resources, permission syncing, or seed data, use `post-bootstrap.js` instead.

## Preconditions
- Local dev environment running (see `local-dev-setup` workflow)

## Steps

1. **Create migration from template**:
   ```bash
   cp scripts/migrations/000-example-migration.js.template \
      scripts/migrations/NNN-description-of-change.js
   ```
   Use the next sequential number (e.g., `001`, `002`).

2. **Edit the migration**:
   - Set `id` to match the filename (without `.js`)
   - Add a `description`
   - Implement `up()` with your migration logic
   - Optionally implement `down()` for rollback
   - **Always check idempotency**: verify changes don't already exist before applying

3. **Test in dev**:
   ```bash
   docker exec formio-dev node /app/run-migrations.js
   ```

4. **Verify**:
   - Check the affected form in the browser
   - Confirm migration recorded in the `migration` resource

5. **Deploy to production**:
   - Deploy code via `deploy-production-code` workflow
   - Then run migrations on the server:
     ```bash
     docker exec formio node /app/run-migrations.js
     ```

## Key References
- Template: `scripts/migrations/000-example-migration.js.template`
- Runner: `scripts/lib/run-migrations.js`
- Quick reference: `scripts/migrations/README.md`
- Comprehensive guide: `docs/MIGRATIONS.md`
