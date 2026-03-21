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
   - **Or**: prototype in the Admin UI builder at `http://localhost:3001`, then export and clean (see below).

### Optional: Admin UI → Export → Clean round-trip

If you made changes in the Form.io admin builder instead of editing JSON directly:

```bash
# 1. Export the single form from the running server (use the form's URL path, e.g. /organization)
curl -sf -H "x-token: $API_KEYS" http://localhost:3001/<formpath> > /tmp/<formName>-raw.json

# 2. Clean the export and merge into the template file
python3 scripts/lib/clean-form-export.py /tmp/<formName>-raw.json \
  config/bootstrap/form_templates/<formName>.json

# 3. Review the diff before proceeding
git diff config/bootstrap/form_templates/<formName>.json
```

The cleaner strips server IDs, runtime defaults, and resolved role/resource IDs, and always
re-injects the `settings` block (groupPermissions, tabulatorList, ui) from the existing
template file since these are never stored server-side.

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
