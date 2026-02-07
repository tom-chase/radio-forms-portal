---
description: Set up or fully restart the local development environment
---

# Local Dev Setup

Use this workflow for initial setup, after code/script changes, or when you need a full restart.

## Preconditions
- Docker and Docker Compose installed
- `.env` file exists (copy from `.env.example` if missing)

## Steps

1. **First-time setup** (skip if already done):
   ```bash
   ./scripts/setup-environment.sh dev
   ```

2. **Start or restart services**:
   ```bash
   ./scripts/deploy-dev.sh
   ```
   This stops existing containers, generates configs, and starts the dev Docker Compose stack.

3. **Validate**:
   ```bash
   ./scripts/validate-dev.sh
   ```
   Confirms containers are running and ports are accessible.

4. **Access the application**:
   - SPA: http://localhost:3000
   - Form.io Admin: http://localhost:3001/admin/login
   - Default login: `admin@dev.local` / `admin123`

## ARM64 (Apple Silicon) Note
The `docker-compose.dev.yml` uses `platform: linux/amd64` for the Form.io service. If you see platform errors, verify this setting is present.

## Troubleshooting
- Container crash loop → `docker-compose -f docker-compose.dev.yml logs formio`
- Port conflict → check nothing else is bound to 3000, 3001, or 27017
- Clean restart → `docker-compose -f docker-compose.dev.yml down -v` then re-run step 2
