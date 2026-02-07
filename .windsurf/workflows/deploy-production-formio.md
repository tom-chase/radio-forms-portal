---
description: Promote Form.io project structure (forms, resources, roles, actions) from local source to production
---

# Deploy Production Form.io Project

Promotes source-controlled form and resource definitions to the live production server via the `/import` API endpoint. This is independent of the code deployment (tarball push).

## Preconditions
- Local `.env` has `PROD_FORMIO_DOMAIN` and `PROD_API_KEYS` set correctly
- Changes are committed to `config/bootstrap/form_templates/`

## Steps

1. **Backup production** (recommended):
   ```bash
   mkdir -p ./backups
   FORMIO_DOMAIN="$PROD_FORMIO_DOMAIN" API_KEYS="$PROD_API_KEYS" \
     ./scripts/export-formio.sh ./backups/prod-template-$(date +%F-%H%M).json
   ```

2. **Build master template**:
   ```bash
   ./scripts/lib/sync-form-templates.sh
   ```

3. **Validate in dev** (recommended):
   ```bash
   ./scripts/sync-dev.sh
   ```
   Verify changes work in local dev before pushing to production.

4. **Deploy to production**:
   ```bash
   ./scripts/deploy-formio.sh ./config/bootstrap/default-template.json
   ```

5. **Run post-bootstrap** (if you did NOT also do a code deploy):
   ```bash
   ssh admin@<server> "docker exec formio node /app/post-bootstrap.js"
   ```
   This resolves dynamic IDs for role/group conditionals after `/import`.

6. **Smoke test in production**:
   - Confirm affected forms render correctly
   - Test one create/edit/view flow
   - If role/group logic changed, verify permission-gated UI

## Notes
- If you also deployed code (tarball push), `post-bootstrap.js` already ran during that deploy.
- If you did both tracks, re-running post-bootstrap after `/import` is safe and ensures role/group conditionals are updated.
