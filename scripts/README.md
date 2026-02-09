# Scripts Directory

Scripts for the Radio Forms Portal. Human-facing scripts live at the root; internal helpers live in `lib/`.

## Quick Reference

### Environment & Dev

| Script | Purpose |
|---|---|
| `setup-environment.sh [env]` | Initialize environment (ARM64-optimized for dev) |
| `deploy-dev.sh [branch] [forms]` | Start/restart local dev (Docker Compose) |
| `validate-dev.sh` | Verify dev containers, ports, and config |

### Deployment (Code)

| Script | Purpose |
|---|---|
| `deploy-production.sh [ssh-key]` | Tarball push to production server |
| `squash-branch.sh [branch] [msg]` | Squash feature branch before PR |

### Deployment (Form.io Project)

| Script | Purpose |
|---|---|
| `deploy-formio.sh <template-file>` | Deploy template to production via `/import` |
| `export-formio.sh [output-file]` | Export project state from a running server |
| `sync-dev.sh [form-name]` | Sync form definition to running local dev DB |

### Maintenance

| Script | Purpose |
|---|---|
| `health-check.sh [env]` | System health check (containers, endpoints, disk) |
| `backup.sh [env]` | Create MongoDB + config + app backup |
| `cleanup.sh [env] [--deep\|--reset-data]` | Clean up containers, images, logs, temp files |
| `provision-infrastructure.sh [env] [key] [cidr]` | Deploy AWS CloudFormation stack |

## `lib/` — Internal Helpers

These are called by the scripts above and generally not run directly.

| Script | Called By |
|---|---|
| `lib/sync-form-templates.sh` | `sync-dev.sh`, `deploy-dev.sh` |
| `lib/generate-formio-config.sh` | `setup-environment.sh`, `deploy-dev.sh`, `deploy-production.sh` |
| `lib/generate-secrets.sh` | `setup-environment.sh` |
| `lib/build-formio.sh` | `setup-environment.sh` |
| `lib/post-bootstrap.js` | `sync-dev.sh`, Docker container (`/app/post-bootstrap.js`) |
| `lib/run-migrations.js` | Mounted into Docker container (`/app/run-migrations.js`) |

## Script Details

### `setup-environment.sh`
Unified setup for all environments. On ARM64 dev: creates `.env`, generates config/secrets, builds Form.io from source, starts services, and validates.

### `deploy-dev.sh`
Checks out a branch, generates configs, restarts the dev Docker Compose stack. Does **not** sync form templates by default (`forms-to-sync` defaults to `none`).

### `deploy-production.sh`
Tarball push to production. Excludes `.env`, `Caddyfile`, `app/config.js`, and `config/env/production.json` from the tarball — these are regenerated on the server from the server's `.env`. Runs `post-bootstrap.js` after restart.

Override defaults via env vars: `PROD_SERVER`, `PROD_USER`, `PROD_APP_DIR`, `PROD_BACKUP_DIR`.

### `deploy-formio.sh`
POSTs a JSON template to the production Form.io `/import` endpoint. Reads `PROD_FORMIO_DOMAIN` and `PROD_API_KEYS` from `.env`.

### `export-formio.sh`
Exports the current project state from a running Form.io server to a JSON file. Useful for backups before `/import`.

### `sync-dev.sh`
Non-destructive sync of form/resource definitions to the running local dev DB. Calls `lib/sync-form-templates.sh`, POSTs the updated `default-template.json` to `/import`, then runs `lib/post-bootstrap.js` to resolve dynamic IDs.

### `lib/sync-form-templates.sh`
Merges individual form templates from `config/bootstrap/form_templates/` into `default-template.json`. Routes to `forms` or `resources` section based on the template's `type` property.

### `lib/post-bootstrap.js`
Runs inside the Form.io container after deploy/import. Resolves dynamic IDs for roles, groups, and conditionals. Creates missing forms/resources and syncs permissions from the template.

### `lib/run-migrations.js`
Migration runner mounted into the Form.io container. Applies numbered migration scripts from `scripts/migrations/`. Tracks applied migrations in a `migration` resource.

## Dual-Channel Production Workflow

**Channel 1 — Code** (SPA, scripts, Docker config):
1. Merge to `main`.
2. `./scripts/deploy-production.sh /path/to/key.pem`
3. `./scripts/health-check.sh production`

**Channel 2 — Form.io Project** (forms, resources, roles):
1. Edit templates in `config/bootstrap/form_templates/`.
2. `./scripts/lib/sync-form-templates.sh` — build master template.
3. `./scripts/sync-dev.sh` — validate in dev.
4. `./scripts/deploy-formio.sh ./config/bootstrap/default-template.json` — deploy to production.
