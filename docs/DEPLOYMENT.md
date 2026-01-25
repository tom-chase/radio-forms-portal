
 # Deployment Guide
 
 ## 📌 Overview
 
 This repository deploys as:
 - **SPA**: static files served by **Caddy**
 - **API**: **Form.io Community Edition** behind Caddy reverse proxy
 - **DB**: MongoDB
 
 This project currently prioritizes **production stability** over portability.
 
 ---
 
 ## ✅ Prerequisites
 
 - **Docker** + **Docker Compose**
 - A `.env` file (see `.env.example`)
 - DNS for your domains pointing to the server (production/staging)
 
 ---
 
 ## 🔒 The “Hardcoded Config” Production Pattern
 
 **Status**: Active
 
 During production bring-up we found that runtime substitution (especially in Caddy and frontend config) created failure modes that were hard to diagnose (empty vars, template substitution pitfalls, caching).
 
 In production we intentionally hardcode values in a few places to reduce risk:
 - `Caddyfile`
 - `scripts/deploy-production.sh` (generates `app/config.js`)
 - `app/js/config.js` (fallbacks)
 - `formio-config.json.template` (`trust proxy` is fixed)
 
 If you change domains or ACME email, update those files.
 
 ---
 
## 🚀 Production Deployment (“Tarball Push”)
 
Production deploys do **not** use `git pull` on the server.
 
### 1) On your laptop
 
- Ensure your local checkout is exactly what you want deployed.
- Run:
 
```bash
./scripts/deploy-production.sh /path/to/your-ssh-key.pem
```
 
What it does (high level):
- Creates a tarball of the current directory (excluding `.env`, `.git`, etc.)
- Uploads it to the server
- Extracts it into the app directory
- Regenerates Form.io config (from server `.env`)
- Generates `app/config.js` for the SPA (hardcoded production URLs)
- Restarts Docker Compose
- Runs post-bootstrap configuration (creates missing forms/resources, syncs permissions, and may sync selected form schemas)
- Runs database migrations (applies structural changes to forms)
 
### 2) On the server
 
The script handles the remote steps for you.

Useful validation commands:
 
```bash
docker-compose ps
docker-compose logs --tail=200 caddy
docker-compose logs --tail=200 formio
```
 
---

## 🔄 Database Migrations

### Overview

The project uses a hybrid approach for managing Form.io schema changes:

1. **Automated** (via `post-bootstrap.js`): New forms/resources, permission syncing, seed data, dynamic ID resolution, and (for selected forms) schema syncing
2. **Manual Migrations** (via `scripts/migrations/`): Structural changes to existing forms

**Note on schema syncing**:
- Some forms (currently `book`) are treated as "schema as code" and may have their schema (`components`, `settings`, templates) synced from `config/bootstrap/default-template.json` during post-bootstrap.
- Implication: manual schema edits made in the Form.io Admin UI for these forms may be overwritten on deploy.

**Note on prototyping new forms**:
- During early development it is acceptable to prototype in the Form.io Admin UI Builder.
- Prefer capturing changes via per-form exports into `config/bootstrap/form_templates/` and promoting into `default-template.json` once stable.
- Avoid replacing `default-template.json` from a full "project export" bundle.

### When to Create a Migration

Create a migration when you need to:
- Add/remove fields from existing forms
- Change field types or validation rules
- Rename fields (especially with data migration)
- Update form layouts or component order

### Quick Start

```bash
# 1. Create migration from template
cp scripts/migrations/000-example-migration.js.template \
   scripts/migrations/001-add-status-field.js

# 2. Edit the migration
vim scripts/migrations/001-add-status-field.js

# 3. Test in development
./scripts/deploy-dev.sh

# 4. Deploy to production (migrations run automatically)
./scripts/deploy-production.sh ~/.ssh/key.pem
```

### Migration Execution

Migrations run automatically during deployment:
1. After Docker Compose restart
2. After post-bootstrap configuration
3. Before deployment completion

Logs are written to:
- **Development**: Console output
- **Production**: `logs/migrations.log` on server

### Checking Migration Status

```bash
# View applied migrations
ssh admin@server "docker exec formio node -e \"
const fetch = require('node-fetch');
fetch('http://localhost:3001/migration/submission?limit=100')
  .then(r => r.json())
  .then(data => console.log(JSON.stringify(data, null, 2)));
\""
```

### Documentation

For detailed migration guide, see:
- **`docs/MIGRATIONS.md`**: Comprehensive guide with examples
- **`scripts/migrations/README.md`**: Quick reference for migration authors

---
 
## 🧩 Configuration Management
 
### `.env`
 
- Local dev uses `.env` for secrets and local URLs.
- Production keeps its own `.env` on the server.
- The production deploy script explicitly **does not** upload your local `.env`.
 
### Backend config generation
 
 Backend configuration is generated via:
 
 ```bash
 ./scripts/generate-formio-config.sh production
 ```
 
 This produces `config/env/production.json` from `formio-config.json.template`.
 
 ---
 
 ## 💻 Local Development
 
 ### Setup
 
 ```bash
 ./scripts/setup-environment.sh dev
 docker-compose -f docker-compose.dev.yml up -d --build
 ```
 
 Default URLs:
 - SPA: `http://localhost:3000`
 - API: `http://localhost:3001`
 
 ### ARM64 (Apple Silicon) note
 
 Form.io Community Edition may require AMD64 emulation.
 If you see image/platform errors on ARM64, ensure the compose config uses:
 - `platform: linux/amd64` for the Form.io service
 
 ---
 
 ## 🧪 Staging
 
 Staging is intended for pre-production testing. See:
 - `STAGING.md`
 
 ---
 
 ## 🔧 Troubleshooting
 
 ### Caddy won’t start
 
 - Check `docker-compose logs caddy`
 - Validate the `Caddyfile` syntax
 - Confirm ports 80/443 are reachable and not already bound
 
 ### SPA points at `localhost`
 
 In production this usually means:
 - The generated `app/config.js` didn’t update as expected
 - The browser cached an old config
 
 Checks:
 - Confirm `app/config.js` exists on the server inside the deployed directory
 - Confirm `app/index.html` includes the `/config.js` loader
 - Hard refresh or clear cache if needed
 
 ### Form.io container crash loop
 
 - Check `docker-compose logs formio`
 - Validate the generated config JSON in `config/env/production.json`
 - Confirm MongoDB credentials match the server `.env`
 
 ---
 
 ## 📚 Related Docs
 
 - `INFRASTRUCTURE.md`
 - `SECURITY.md`
 - `STAGING.md`
 - `COMMON_ISSUES.md`

