# Radio Forms Portal

Radio Forms Portal is a lightweight Single Page Application (SPA) + Form.io backend for managing forms, submissions, and role-based workflows for a small public radio station.

- **Frontend**: vanilla JS (ES6 modules) + Bootstrap (no build step)
- **Backend**: Form.io Community Edition + MongoDB
- **Reverse proxy / HTTPS**: Caddy

## Documentation

Start here:

- `docs/README.md`

Key docs:

- `docs/DEPLOYMENT.md`
- `docs/INFRASTRUCTURE.md`
- `docs/SECURITY.md`
- `docs/STAGING.md`
- `docs/COMMON_ISSUES.md`
- `docs/GROUP_PERMISSIONS.md`: Group-based access control setup and usage.

## Quick Start (Local Development)

1) Create your local `.env`:

- Copy `.env.example` to `.env` and fill in values.

2) Start the dev stack:

```bash
./scripts/setup-environment.sh dev
docker compose -f docker-compose.dev.yml up -d --build
```

3) Open:

- API/Admin Portal: `http://localhost:3001`
    - login: admin@dev.local / admin123
    - create 'user' submission for SPA Admin
    - assign role 'admin' to the user

- SPA: `http://localhost:3000`
    - login with the user you created

## Production Deployment

Production uses a "tarball push" workflow (no `git pull` on the server). The deploy script:

- Excludes environment-specific files (`app/config.js`, `config/env/production.json`, `.env`, `Caddyfile`) from the tarball
- Regenerates `app/config.js` and `config/env/production.json` on the server from the server's `.env`
- Restarts Docker Compose and runs post-bootstrap configuration

Two production server targets are supported — both use the same `deploy-production.sh` script, with the target overridden via environment variables:

| Target | Access | Guide |
|--------|--------|-------|
| **AWS EC2** | Direct SSH (key-based) | `docs/DEPLOYMENT.md` |
| **ASUS NUC 14** (on-prem) | SSH via WireGuard VPN | `docs/NUC_DEPLOYMENT.md` |

### EC2 Deploy

```bash
./scripts/deploy-production.sh ~/.ssh/your-ec2-key.pem
```

### NUC Deploy

```bash
sudo wg-quick up wg0
export PROD_SERVER="10.8.0.1"
export PROD_USER="admin"
export PROD_APP_DIR="/home/admin/radio-forms-portal"
export PROD_BACKUP_DIR="/home/admin/backups"
./scripts/deploy-production.sh ~/.ssh/mac-to-nuc
```

See `.windsurf/workflows/deploy-nuc.md` for the full NUC workflow.

### Configuration Notes

- `Caddyfile`: Hardcoded domains on the production server (not deployed from repo)
- `formio-config.json.template`: `trust proxy` set to `true`
- If you change domains or ACME email, update the server's `.env` and production `Caddyfile`

## Scripts

Script reference: `scripts/README.md`

## AI Agent Notes

High-context guidance for agentic tooling: `AGENT.md`
