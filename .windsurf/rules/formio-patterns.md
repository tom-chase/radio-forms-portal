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

## Three-Layer Access Model
| Layer | Mechanism | Enforced by |
|---|---|---|
| **Roles** | `form.access` / `form.submissionAccess` | Form.io server |
| **Groups** | `form.settings.groupPermissions` | Client (`rbacService.js` + `forms.js`) |
| **Shares** | `shareSettings` panel | Client (`checkSubmissionRowAccess`) |

- **MUST** include `authenticated` in `access.read_all` for all forms (prevents 401 → logout).
- For dept-scoped forms, sidebar visibility is gated by **group membership only** — the `forms.js` filter strips `submissionAccess` when checking group-gated forms.
- Admins see all forms via admin mode (bypasses filter).

## Role Hierarchy
`anonymous` → `authenticated` → `staff` → `management` → `administrator`. Department scoping uses groups, not roles.

## Save Actions
- **MUST** add a `formName:save` action in `default-template.json` for every new form/resource. Without it, submissions echo back HTTP 200 but are NOT persisted.

## readOnly Toggle
- To toggle `readOnly` on a Form.io instance, **destroy and recreate** the instance with the `readOnly` option set at creation time. Do not attempt to toggle it on a live instance.
