# AGENT.md

> **CONTEXT FOR AI AGENTS**: This document is your primary source of truth. Read this first to understand the architectural invariants, deployment strategies, and current state of the "Radio Forms Portal".

## 1. Project Context
**Radio Forms Portal** is an open-source Single Page Application (SPA) and backend built for a small public radio station.
- **Goal**: Manage station forms, workflows, and user roles.
- **Philosophy**: Stability > Complexity. We prefer simple, robust solutions (like hardcoded production configs) over complex dynamic systems that are prone to failure.

## 2. Tech Stack (Invariants)
*   **Backend**: Form.io Community Edition (v4.6.0-rc.4) running on Node.js 20+.
    *   *Constraint*: Must use `platform: linux/amd64` emulation on ARM64 infrastructure.
*   **Database**: MongoDB 6.0.
*   **Web Server**: Caddy 2 (Automatic HTTPS).
*   **Frontend**: Vanilla JS (ES6 Modules) + Bootstrap 5.3 + Tabulator.js + DayPilot Lite.
    *   *Constraint*: No build step (Webpack/Vite) for the frontend logic itself. It is served raw.

## 3. Critical Architecture Patterns

### A. The "Hardcoded Config" Stability Pattern
**Status**: ACTIVE (Jan 2026)
**Reason**: Dynamic environment variable substitution in Caddy and Frontend proved unstable during production deployments.
**Rule**: For Production, we use **hardcoded values** in specific files. If you change domains (`forms.your-domain.com`) or emails (`example@your-domain.com`), you **MUST** update these files:
1.  `Caddyfile`: Email and Domain blocks.
2.  `app/js/config.js`: Fallback `API_BASE` and `SPA_ORIGIN`.
3.  `scripts/deploy-production.sh`: Generation logic for `app/config.js`.
4.  `formio-config.json.template`: `trust proxy` set to `true`.

### B. Request Handling
**Rule**: NEVER use the Form.io SDK's native `submission.save()` or `formio.saveSubmission()`.
**Action**: ALWAYS use `formioRequest()` from `@/app/js/services/formioService.js`.
**Why**: This wrapper handles token refresh, standard headers, and consistent error logging.
**Important**: `formioRequest()` expects the request body in the `data` option, not `body`.

### C. Infrastructure as Code
**Source of Truth**: `@/infrastructure/cloudformation.yaml`
**Method**: We do not manually provision EC2 instances. We use the `scripts/provision-infrastructure.sh` script to deploy the CloudFormation stack, which handles:
- VPC & Subnets
- Security Groups (Ports 80, 443, 22)
- IAM Roles (S3 Access)
- EC2 Instance (t3.large/Debian 13)

### D. Group Permissions (Resource-Based Access Control)
**Status**: IMPLEMENTED (Jan 2026)
**Pattern**: Users can be granted access to forms based on membership in Department/Committee resources.
**Implementation**:
- User submissions store `data.departments` and `data.committees` as arrays of resource IDs.
- Forms configure `settings.groupPermissions` to check membership.
- Frontend logic in `rbacService.js` evaluates both role-based and group-based access.
- UI: "Manage Groups" modal allows editing user group assignments.
**Key Files**:
- `app/js/features/groupMgmt.js`: Modal for managing user groups.
- `app/js/services/rbacService.js`: Permission evaluation logic.
- `docs/GROUP_PERMISSIONS.md`: Full configuration and usage guide.

### E. Tabulator Display vs Form Components
**Principle**: Tabulator columns are driven by `form.settings.tabulatorList` and data transforms, **not** by form components.
**Implication**: The user table can display Departments/Committees even if the `user` form schema does not define those components. Similarly, the `book` submission list uses a `bookDataTransform` to flatten a nested `preface` object into simple top-level fields for easy rendering.
**Files**:
- `app/js/features/tabulatorLists.js`: Contains the `userRolesTransform` and `bookDataTransform` functions.
- `config/bootstrap/default-template.json`: Defines `tabulatorList` settings for various resources.

### F. Post-Bootstrap Configuration
**Status**: IMPLEMENTED (Jan 2026)
**Problem**: Form.io generates new dynamic IDs for Resources/Roles on every fresh import, breaking hardcoded references in `groupPermissions` or `customConditional` logic.
**Solution**: `scripts/post-bootstrap.js` is mounted into the Form.io container and should be run after deploy/import to resolve dynamic IDs.
**Mechanism**:
1.  **Authentication**: Authenticates as the root admin.
2.  **Mapping**: Fetches all Forms and Roles to map machine names (e.g. `administrator`, `department`) to runtime IDs.
3.  **Form Creation**: Creates missing forms/resources from `default-template.json` (both `forms` and `resources` sections).
4.  **Schema Sync (Selected Forms)**: Can sync form schema fields (including `components` and `settings`) from `default-template.json` for selected forms. This is now disabled by default for most forms to prefer the export/deploy workflow.
    - Implication: If re-enabled for a form, manual schema edits made in the Form.io Admin UI for that form may be overwritten by this step.
5.  **Permission Syncing**: Syncs `access` and `submissionAccess` rules from template to existing forms.
6.  **Seeding**: Ensures required reference submissions exist (e.g. "Engineering" Department).
7.  **Linking**: Updates `form.settings.groupPermissions` to point to these specific *Submission IDs* (not Form IDs).
8.  **Logic Update**: Rewrites `customConditional` logic in forms (like `roleMgmt`) to use the correct runtime Role IDs.
**Files**:
- `scripts/post-bootstrap.js`: The configuration logic.
- `scripts/deploy-dev.sh` & `scripts/deploy-production.sh`: Trigger the script via `docker exec`.

### G. Migration System
**Status**: IMPLEMENTED (Jan 2026)
**Problem**: Need a safe, version-controlled way to apply structural changes to forms in production without wiping data.
**Solution**: Hybrid approach combining automated syncing (post-bootstrap) with manual migrations for complex changes.
**When to Use**:
- **Post-Bootstrap** (automatic): New forms/resources, permission syncing, seed data, dynamic IDs
- **Migrations** (manual): Adding/removing fields, changing field types, renaming fields with data migration
**Mechanism**:
1.  **Migration Files**: Numbered scripts in `scripts/migrations/` (e.g., `001-add-status-field.js`)
2.  **Runner**: `scripts/run-migrations.js` executes pending migrations in order
3.  **Tracking**: Applied migrations stored in `migration` resource to prevent re-runs
4.  **Execution**: Run on-demand during deployments when schema/data changes require it
5.  **Idempotency**: Migrations check for existing changes before applying
**Files**:
- `scripts/migrations/`: Migration scripts directory
- `scripts/run-migrations.js`: Migration runner
- `scripts/migrations/README.md`: Quick reference for migration authors
- `docs/MIGRATIONS.md`: Comprehensive migration guide
**Integration**: Migrations are mounted into the Form.io container as `/app/run-migrations.js` and can be run via `docker exec`.

Note:
- Migrations are mounted into the container (`/app/run-migrations.js`). If your deploy script does not invoke them, run manually:
  - `docker exec formio node /app/run-migrations.js`

### H. Form Schema as Code (Book Resource)
**Status**: ACTIVE (Jan 2026)
**Rule**: The `book` resource schema (including layout/templates) is treated as **source-controlled configuration**.
**Source of Truth**:
1. `config/bootstrap/form_templates/book.json` (Primary source)
2. `config/bootstrap/default-template.json` (Generated/Synced destination)
3. `app/css/custom.css` (UI styling)

**Development Workflow (for schema changes)**:
1. Make changes in `config/bootstrap/form_templates/<resourceName>.json`.
2. Run `./scripts/cli-sync-dev.sh <resourceName>` to apply the changes to your *running* local dev environment.
3. Verify the changes in your browser at `http://localhost:3000`.

This workflow is non-destructive and does not require restarting containers or wiping the database.

**Verification Note**: The Book chapter EditGrid uses a custom display template that renders the accordion for rows **after a row is saved** (display mode). While a row is being edited, the accordion layout will not be visible.

### K. Form.io Project Promotion
**Status**: ACTIVE (Jan 2026)
**Problem**: The "Tarball Push" deploys code, but a separate mechanism is needed to promote Form.io project structure (forms, resources, roles, actions) from local source files to production without manual UI work.
**Solution**: Use `curl` to directly interact with the Form.io API, building a master template from source files and deploying it to the production server.

**Key Scripts**:
- `scripts/sync-form-templates.sh`: Builds the master `config/bootstrap/default-template.json` from all the individual templates in `config/bootstrap/form_templates/`.
- `scripts/cli-deploy-template.sh`: Deploys a specified template file (e.g., `default-template.json`) to the production server by `POST`-ing it to the `/import` endpoint. This is the correct method for the Form.io Community Edition.

**Authentication**:
- The scripts authenticate using API keys set in the `.env` file.
- **Dev Server**: `API_KEYS` variable must be set in the dev environment.
- **Prod Server**: `PROD_API_KEYS` variable in the local `.env` must match the `API_KEYS` value on the production server.

### I. Prototyping New Forms (Admin UI) + Capturing Back to Git
**Status**: ACTIVE (Jan 2026)

During early development, it is acceptable to prototype form schemas in the Form.io Admin UI Builder for speed.

**Rule**: Do not overwrite `config/bootstrap/default-template.json` from a full "project export" (bundle export). These exports often include environment-specific noise and can accidentally clobber curated template structure.

**Recommended Capture Workflow**:
1. Prototype in Admin UI.
2. Export only the specific form(s) you changed (per-form export via the Form.io API).
3. Save each form JSON into `config/bootstrap/form_templates/<formName>.json`.
4. Once stable, "promote" the form into `config/bootstrap/default-template.json` (and decide whether it remains DB-owned + migrations, or becomes schema-as-code).

### J. Advanced Form Patterns

**Nested EditGrid Hierarchies (e.g., Books > Chapters > Sections)**
- **Structure**: EditGrid (`chapters`) containing another EditGrid (`sections`).
- **Numbering**: To achieve hierarchical numbering (e.g., "1.2. Section Title"):
  - Use `{{ rowIndex + 1 }}` for the current level.
  - For nested levels, parse `{{ instance.path }}` to extract the parent index (e.g., `chapters[0]`).
  - *Note*: `instance` is available in the row template context.
- **Reordering**: Enable `"reorder": true` on the EditGrid component to allow drag-and-drop reordering.
- **Templates**: Use `_.each` instead of `util.each` for iterating components in custom row templates.

## 4. Deployment Workflows

This project now has two parallel promotion channels:
1.  **Code Promotion**: For the SPA, server scripts, and Docker configuration.
2.  **Form.io Project Promotion**: For forms, resources, roles, and actions.

### Code Promotion ("Tarball Push" to Production)
We do **not** pull code from Git on the production server.
1.  **Local**: `scripts/deploy-production.sh` creates a tarball of the current directory.
2.  **Transfer**: SCPs the tarball to the production server.
3.  **Remote**: Unpacks, generates `app/config.js` (hardcoded values), and restarts Docker Compose.
**Benefit**: What you have locally is exactly what gets deployed. No Git auth issues on the server.

### Form.io Project Promotion (Local Source → Prod)

This workflow promotes the source-controlled form and resource definitions to the live production server.

1.  **Make Schema Changes**: Edit the relevant file(s) in `config/bootstrap/form_templates/`.
2.  **Build Master Template**: Run `./scripts/sync-form-templates.sh` to build the `default-template.json`.
3.  **Validate in Dev**: Run `./scripts/cli-sync-dev.sh` to apply the changes to your local dev environment and test them.
4.  **Deploy to Prod**: Run `./scripts/cli-deploy-template.sh ./config/bootstrap/default-template.json` to push the master template to the live production server.

### "Local Dev" (ARM64)

**Initial Setup / Full Restart:**
1.  `./scripts/setup-environment.sh dev` (for first-time setup).
2.  `./scripts/deploy-dev.sh` (for starting or restarting the environment after code changes).

**Applying Form/Resource Schema Changes (Non-Destructive):**
1.  `./scripts/cli-sync-dev.sh <form_name>`

### Daily Hygiene Checklist (Option A: Git is Source of Truth)

This project deploys and evolves through two independent channels:
1.  **Frontend Code**: `app/` (served as raw ES modules, no build step)
2.  **Form Definitions**: Form.io DB state (forms/resources/settings like `settings.tabulatorList`)

If you change one without promoting the other, environments will drift.

**Daily Dev Checklist (Local Dev):**
1.  **Make form changes in Git**: edit `config/bootstrap/form_templates/<form>.json` (avoid UI-only edits).
2.  **Sync templates into the master**: `./scripts/lib/sync-form-templates.sh <form>` (or the higher-level sync script).
3.  **Apply to running dev Form.io (non-destructive)**: `./scripts/cli-sync-dev.sh <form>`.
4.  **If you changed frontend JS**: hard-refresh and confirm the app loads the latest `?v=...` versions from `app/index.html`.
5.  **Smoke test the risky path**: render the list view (Tabulator/DayPilot) and perform one edit/view action.

**Promotion Checklist (Staging/Prod):**
1.  **Deploy frontend code** using the standard code promotion workflow.
2.  **Promote Form.io templates** by building `config/bootstrap/default-template.json` from `form_templates/` and POSTing it to the target environment via the `/import` endpoint.
3.  **Post-deploy smoke test** in the target environment.

## 5. Development Guidelines for Agents

### Version Control
**CRITICAL RULE**: AI agents are **NEVER** permitted to push code to the remote GitHub repository (`git push`). This includes force-pushes. The user is solely responsible for pushing changes. Agents may only commit changes to the local repository.

### When Debugging
1.  **Check Configuration First**: Is the issue caused by a mismatch between `config.js` and the actual server URL?
2.  **Cache Busting**: If frontend changes aren't showing, check `index.html` for the `?v=...` query string on imports.
3.  **Logs**: Use `docker-compose logs -f --tail=100 caddy formio` on the server.

### When Modifying Infrastructure
1.  **Update CloudFormation**: Modify `infrastructure/cloudformation.yaml`.
2.  **Update Documentation**: Reflect changes in `docs/INFRASTRUCTURE.md`.

### When Modifying Deployment
1.  **Respect the Hardcode**: Do not try to revert to dynamic env vars without explicit instruction.
2.  **Update the Script**: Modify `scripts/deploy-production.sh`.

## 6. Memory Bank (Quick Context)
- **Primary Domain**: `forms.your-domain.com`
- **API Domain**: `api.forms.your-domain.com`
- **User**: `admin` (EC2)
- **OS**: Debian 13
- **Secrets**: Managed via `.env` (locally) and hardcoded config files (for app stability).
