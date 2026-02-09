---
description: Non-destructive sync of a form/resource schema change to the running local dev environment
---

# Sync Form Template (Dev)

Use this workflow to apply form/resource definition changes to the **running** local dev database without restarting containers or wiping data.

## Preconditions
- Local dev environment is running (see `local-dev-setup` workflow)
- `.env` has `API_KEYS` set for the dev server

## Steps

1. **Edit the form template**:
   - Source file: `config/bootstrap/form_templates/<formName>.json`

2. **Sync to running dev**:
   ```bash
   ./scripts/sync-dev.sh <formName>
   ```
   This internally runs `lib/sync-form-templates.sh` to update `default-template.json`, POSTs it to the dev server's `/import` endpoint, then runs `lib/post-bootstrap.js` to resolve dynamic IDs (roles, groups, conditionals, permissions).

3. **Verify in browser**:
   - Refresh http://localhost:3000
   - Confirm the form renders with your changes
   - Test one create/edit/view action

## Notes
- This workflow is non-destructive: existing submissions are preserved.
- The script routes templates to the `forms` or `resources` section in `default-template.json` based on the template's `type` property.
- If syncing multiple forms: `./scripts/sync-dev.sh book,tasks,contacts`
