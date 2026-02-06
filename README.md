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
docker-compose -f docker-compose.dev.yml up -d --build
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

See `docs/DEPLOYMENT.md` for full details.

### Configuration Notes

- `Caddyfile`: Hardcoded domains on the production server (not deployed from repo)
- `formio-config.json.template`: `trust proxy` set to `true`
- If you change domains or ACME email, update the server's `.env` and production `Caddyfile`

## Scripts

Script reference: `scripts/README.md`

## AI Agent Notes

High-context guidance for agentic tooling: `AGENT.md`
