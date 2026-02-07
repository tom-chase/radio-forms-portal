---
trigger: always_on
---
# Form.io Development Patterns

## Request Handling
- **MUST** use `formioRequest()` from `app/js/services/formioService.js` for all API calls.
- **MUST** pass the request body in the `data` option (not `body`).
- **MUST NOT** use the Form.io SDK's `submission.save()` or `formio.saveSubmission()`.
- **Why**: `formioRequest()` handles token refresh, standard headers, and consistent error logging.

## Dual-Channel Deployment
This project has two independent promotion channels:
1. **Code Promotion** ("Tarball Push"): SPA, scripts, Docker config → `scripts/deploy-production.sh`.
2. **Form.io Project Promotion**: Forms, resources, roles, actions → `scripts/deploy-formio.sh`.

Changing one without the other causes environment drift. See workflows: `deploy-production-code.md` and `deploy-production-formio.md`.

## Template Management
- **MUST NOT** overwrite `config/bootstrap/default-template.json` from a full Form.io "project export" bundle. These exports include environment-specific noise.
- **MUST** use per-form exports into `config/bootstrap/form_templates/<formName>.json` and promote via `scripts/lib/sync-form-templates.sh`.

## readOnly Toggle
- To toggle `readOnly` on a Form.io instance, **destroy and recreate** the instance with the `readOnly` option set at creation time. Do not attempt to toggle it on a live instance.
