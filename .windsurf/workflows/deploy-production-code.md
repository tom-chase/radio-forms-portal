---
description: Deploy application code to production via tarball push
---

# Deploy Production Code (Tarball Push)

Pushes the SPA, scripts, and Docker configuration to the production server. Does **not** update Form.io project structure (forms/resources/roles) — see `deploy-production-formio` workflow for that.

## Preconditions
- On `main` branch with clean working tree
- SSH key available for the production server
- Server `.env` has `SPA_DOMAIN`, `API_DOMAIN`, and related variables set

## Steps

1. **Deploy**:
   ```bash
   ./scripts/deploy-production.sh /path/to/your-ssh-key.pem
   ```
   What it does:
   - Creates a tarball (excludes `.env`, `.git`, `Caddyfile`, `app/config.js`, `config/env/production.json`)
   - SCPs to server and extracts
   - Regenerates `config/env/production.json` and `app/config.js` from server `.env`
   - Restarts Docker Compose
   - Runs `post-bootstrap.js` (creates missing forms, syncs permissions, resolves dynamic IDs)

2. **Verify on server**:
   ```bash
   docker-compose ps
   docker-compose logs --tail=200 caddy
   docker-compose logs --tail=200 formio
   ```

3. **Run migrations** (if this release includes migration scripts):
   ```bash
   docker exec formio node /app/run-migrations.js
   ```

4. **Smoke test**:
   - Confirm SPA loads and points at production API
   - Confirm list views render (Tabulator/DayPilot)
   - Test one create/edit/view flow on the most impacted form

## Configuration Overrides
You can override `PROD_SERVER`, `PROD_USER`, `PROD_APP_DIR`, and `PROD_BACKUP_DIR` via environment variables.
