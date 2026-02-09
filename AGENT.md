# AGENT.md

> **CONTEXT FOR AI AGENTS**: Quick orientation for the Radio Forms Portal. Constraints are enforced via `.windsurf/rules/` and procedures live in `.windsurf/workflows/`.

## Quick Reference

- **Project**: Radio Forms Portal — open-source SPA + Form.io backend for a small public radio station.
- **Philosophy**: Stability > Complexity. Simple, robust solutions preferred.
- **Tech Stack**: Form.io CE (v4.6.0-rc.4), Node.js 20+, MongoDB 6.0, Caddy 2, Vanilla JS (ES6 Modules) + Bootstrap 5.3 + Tabulator.js + DayPilot Lite.
- **Production OS**: Debian 12 (Bookworm).
- **Frontend**: No build step — served raw as ES modules.

## Cascade Integration

| Type | Location | Purpose |
|------|----------|---------|
| **Rules** | `.windsurf/rules/` | Always-on constraints (tech stack, production stability, Form.io patterns) |
| **Workflows** | `.windsurf/workflows/` | Step-by-step procedures (dev setup, deployments, migrations, infra) |
| **Memories** | Cascade memory DB | Architectural patterns (group permissions, EditGrid, post-bootstrap, etc.) |
| **Human docs** | `docs/` | Architecture rationale, specs, checklists for collaborators |

## Key Architecture (Summary)

Details live in rules, workflows, memories, and `docs/`. Brief pointers:

- **Dual-Channel Deployment**: Code (tarball push) and Form.io project (/import) are independent. See `deploy-production-code` and `deploy-production-formio` workflows.
- **Hardcoded Config Pattern**: Production configs generated on server from `.env`. See rule: `production-stability.md`.
- **Post-Bootstrap**: `scripts/lib/post-bootstrap.js` resolves dynamic IDs after deploy/import. Run automatically by `sync-dev.sh` and deploy scripts.
- **Migration System**: Numbered scripts in `scripts/migrations/` for structural form changes. See `create-migration` workflow and `docs/MIGRATIONS.md`.
- **Schema as Code**: Form templates in `config/bootstrap/form_templates/`. Sync via `sync-dev.sh`. See `sync-form-template` workflow.
- **Group Permissions**: Resource-based access via `form.settings.groupPermissions`. See `docs/GROUP_PERMISSIONS.md`.
- **Tabulator Display**: Columns driven by `form.settings.tabulatorList` and data transforms, not form components.

## Debugging Reminders

1. **Config mismatch?** Check `app/config.js` vs actual server URL.
2. **Frontend changes not showing?** Check `?v=...` cache-bust in `app/index.html`.
3. **Logs**: `docker-compose logs -f --tail=100 caddy formio`

## When Modifying Infrastructure

1. Update `infrastructure/cloudformation.yaml`.
2. Update `docs/INFRASTRUCTURE.md`.

## Memory Bank (Quick Context)

- **Primary Domain**: `forms.your-domain.com`
- **API Domain**: `api.forms.your-domain.com`
- **User**: `admin` (EC2)
- **OS**: Debian 12 (Bookworm)
- **Secrets**: Managed via `.env` (locally) and generated config files (for app stability).
- **Key Scripts**: See `scripts/README.md` for full script reference.
