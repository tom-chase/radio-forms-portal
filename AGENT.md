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
**Implication**: The user table can display Departments/Committees even if the `user` form schema does not define those components, because:
- `userRolesTransform` formats `userSubmission.data.departments/committees` into human-readable columns.
- These properties can exist in submission data without being defined as form components.
**Files**:
- `app/js/features/tabulatorLists.js`: Transform and column rendering.
- `config/bootstrap/default-template.json`: Defines `latestRoleLogId` as hidden field; departments/committees are not form components.

## 4. Deployment Workflow

### "Tarball Push" (Production)
We do **not** pull code from Git on the production server.
1.  **Local**: `scripts/deploy-production.sh` creates a tarball of the current directory.
2.  **Transfer**: SCPs the tarball to the production server.
3.  **Remote**: Unpacks, generates `app/config.js` (hardcoded values), and restarts Docker Compose.
**Benefit**: What you have locally is exactly what gets deployed. No Git auth issues on the server.

### "Local Dev" (ARM64)
1.  `scripts/setup-environment.sh dev`
2.  `docker-compose -f docker-compose.dev.yml up -d`
3.  Access at `localhost:3000`.

## 5. Development Guidelines for Agents

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
