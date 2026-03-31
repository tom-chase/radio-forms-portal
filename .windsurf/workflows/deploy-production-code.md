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

4. **Verify Caddyfile on server** (if uploads or new endpoints were added):
   The production `Caddyfile` is excluded from the tarball. If the uploads service has new endpoints (e.g., `/api/v1/uploads/whoami`), ensure the server's `Caddyfile` includes the `@uploads path /api/v1/uploads*` proxy rule in both the SPA and API server blocks. The `--build` flag in `docker compose up` rebuilds the uploads container, but Caddy must proxy to it.

5. **Smoke test**:
   - Confirm SPA loads and points at production API
   - Confirm list views render (Tabulator/DayPilot)
   - Test one create/edit/view flow on the most impacted form
   - Verify file upload/download works (uploads container was rebuilt)

## Configuration Overrides
You can override `PROD_SERVER`, `PROD_USER`, `PROD_APP_DIR`, and `PROD_BACKUP_DIR` via environment variables.
