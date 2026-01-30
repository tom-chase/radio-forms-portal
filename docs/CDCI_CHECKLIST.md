# CD/CI Checklist (Option A: Git is Source of Truth)

This repo deploys and evolves through **two independent channels**:

1. **Frontend code** (this repo): `app/` is served as raw ES modules (no frontend build step).
2. **Form definitions** (Form.io DB state): forms/resources/settings like `settings.tabulatorList` are stored in MongoDB and only change when imported/synced.

If you deploy one without promoting the other, environments will drift.

---

## Repeatable End-to-End Workflow (Develop -> Feature -> Develop -> Main -> Deploy)

This section is the intended "happy path" workflow for you and future collaborators.

### 0) Start from `develop`

1. Ensure you have the latest `develop` locally.
2. Create your feature branch:
   - `git switch develop`
   - `git pull`
   - `git switch -c <new-feature-branch-name>`

### 1) Implement changes (commit early, commit often)

- Make small, focused commits while iterating.
- If you touched Form.io templates, follow the "Daily Dev Hygiene" steps below to keep your local running dev DB in sync.

### 2) Optional: squash the feature branch before opening a PR

If you prefer a single clean commit per PR:

- `./scripts/squash-branch.sh <branch> "<commit message>" [base-branch]`

Notes:
- Use this only on **feature branches** (never `develop`/`main`).
- This rewrites history and typically requires: `git push --force-with-lease`.

### 3) Merge into `develop`

1. Push your feature branch and open a PR targeting `develop`.
2. After review, merge the PR into `develop`.
3. Smoke test in dev.

### 4) Promote `develop` -> `main`

1. Open a PR from `develop` into `main`.
2. Merge once `develop` is verified.

### 5) Deploy

Production deployment has two channels:

1. **Deploy code (tarball push)**
2. **Deploy Form.io template** (only if templates changed)

See "Promotion Checklist" below.

## Daily Dev Hygiene (Local Dev)

### A. If you changed a form definition (schema/settings)

1. **Edit the form template in Git**
   - Source of truth: `config/bootstrap/form_templates/<form>.json`
   - Avoid UI-only edits unless you immediately export and commit back to the same file.

2. **Sync templates into the master template**
   - Run:
     - `./scripts/lib/sync-form-templates.sh <form>`
   - Result:
     - Updates `config/bootstrap/default-template.json`.

3. **Import to the running dev Form.io (non-destructive)**
   - Run:
     - `./scripts/cli-sync-dev.sh <form>`
   - This runs `./scripts/lib/sync-form-templates.sh <form>` when `<form>` is specified or defaults to 'none' if not specified.
   - This calls `POST /import` with `{ "template": ... }` to update the live dev DB.

4. **Browser smoke test**
   - Refresh and verify the form renders.
   - Run one realistic action path (e.g., create/edit/view a submission).

### B. If you changed frontend JS/CSS

1. **Deploy/restart dev if needed**
   - Use `./scripts/deploy-dev.sh` if you changed backend/docker/scripts.

2. **Cache-busting sanity check**
   - If changes aren’t showing, check `app/index.html`:
     - `<script type="module" src="/js/main.js?v=...">`
   - Confirm stack traces show the new version.

3. **Smoke test the risky UI path**
   - For list views:
     - Verify Tabulator/DayPilot renders.
     - Click one “Edit” action.

---

## Pre-Merge Checklist (PR Hygiene)

### Optional: squash your feature branch

If your workflow prefers a single commit per PR, you can squash locally before opening the PR:

- `./scripts/squash-branch.sh <branch> "<commit message>" [base-branch]`

Notes:
- Use this only on **feature branches** (never `develop`/`main`).
- This rewrites history and typically requires: `git push --force-with-lease`.

1. **Did you change Form.io templates?**
   - Confirm edits are in:
     - `config/bootstrap/form_templates/<form>.json`
   - Confirm the master is updated:
     - `config/bootstrap/default-template.json`

2. **Did you change frontend JS modules?**
   - Confirm any required cache-bust version updates are in:
     - `app/index.html`
     - Any module import query strings where used

3. **Local validation**
   - Run the dev sync script for the form(s) you touched.
   - Confirm no console errors for the main flows.

---

## Promotion Checklist (Staging / Production)

This project has **two independent promotion tracks**. For a non-destructive update you must decide (and often do both):

1. **Code promotion (tarball push)**: deploy the repo contents to the server.
2. **Form.io project promotion (/import)**: update Form.io forms/resources/settings stored in MongoDB.

### Step 0: Pre-flight (Required)

1. Ensure you are on `main` and the working tree is clean.
2. Confirm whether this release includes:
   - Frontend / scripts / docker changes (`app/`, `scripts/`, `docker-compose.yml`, `Caddyfile*`)
   - Form template changes (`config/bootstrap/form_templates/*` and/or `config/bootstrap/default-template.json`)
   - Migration scripts (`scripts/migrations/*`)
3. Ensure your local `.env` has:
   - `PROD_FORMIO_DOMAIN`
   - `PROD_API_KEYS`

### Track A: Code Promotion (Tarball Push)

Use this when anything in the repo must change on the production server (frontend JS/CSS, deployment scripts, docker config).

1. Deploy:
   - `./scripts/deploy-production.sh ~/.ssh/<your-key>.pem`

2. Confirm post-bootstrap ran (deploy script runs it inside the Form.io container):
   - Check `logs/post-bootstrap.log` on the server if needed.

3. If this release includes migrations:
   - Run migrations on the server:
     - `docker exec formio node /app/run-migrations.js`

### Track B: Form.io Project Promotion (Non-Destructive /import)

Use this when you changed any Form.io form/resource schema or `settings.*` (including `settings.tabulatorList`).

1. **(Recommended) Export a backup of production before importing**
   - This gives you a rollback reference if `/import` has unintended side effects.
   - Ensure the backup directory exists:
     - `mkdir -p ./backups`
   - Run:
     - `FORMIO_DOMAIN="$PROD_FORMIO_DOMAIN" API_KEYS="$PROD_API_KEYS" ./scripts/cli-export-template.sh ./backups/prod-template-$(date +%F-%H%M).json`

2. **Build the master template from git**
   - `./scripts/sync-form-templates.sh`

3. **Validate locally first (recommended)**
   - Apply to running local dev DB:
     - `./scripts/cli-sync-dev.sh <form>`

4. **Deploy template to production**
   - `./scripts/cli-deploy-template.sh ./config/bootstrap/default-template.json`

5. **Run post-bootstrap after importing (recommended)**
   - `/import` updates forms/resources/settings, but it does not resolve dynamic IDs (roles/resources) in conditionals/groupPermissions.
   - If you did Track A, post-bootstrap already ran during the deploy.
   - If you did both Track A and Track B, re-running post-bootstrap after `/import` is a safe way to ensure role/group conditionals are updated.
   - If you only did Track B, SSH to the server and run:
     - `docker exec formio node /app/post-bootstrap.js`

### Step 3: Post-Deploy Smoke Test (Required)

1. Confirm SPA loads and points at production API (generated `app/config.js`).
2. Confirm list views render (Tabulator/DayPilot) with no console errors.
3. Confirm one create/edit/view flow on the most impacted form.
4. If you changed role/group logic, confirm permission-gated UI (e.g. `roleMgmt` visibility conditions).

---

## Drift Prevention Rules

- **Rule 1**: If you changed anything under `config/bootstrap/form_templates/`, you must import/sync to the environment you’re testing.
- **Rule 2**: If you changed anything under `app/`, you must deploy the frontend (or bump cache version) for the environment you’re testing.
- **Rule 3**: Avoid “quick fixes” in the Form.io UI that aren’t captured back into git.
