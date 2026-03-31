# Frontend Feature Reference

This document covers implemented frontend features of the Radio Forms Portal that are not described elsewhere in the docs. For form schema and access control, see `GROUP_PERMISSIONS.md`. For deployment, see `DEPLOYMENT.md`.

**Last Updated**: 2026-03-31

---

## Table of Contents

1. [PDF Download](#pdf-download)
2. [Sidebar Badges & "New" Counts](#sidebar-badges--new-counts)
3. [Login Log](#login-log)
4. [File Uploads (Local + S3 Fallback)](#file-uploads-local--s3-fallback)
5. [Underwriting Onboarding Tour](#underwriting-onboarding-tour)
6. [Revision History](#revision-history)
7. [SMTP Email Notifications](#smtp-email-notifications)

---

## PDF Download

Client-side PDF generation using [html2pdf.js](https://github.com/eKoopmans/html2pdf.js) (html2canvas + jsPDF), vendored at `app/js/vendor/html2pdf@0.10.2/html2pdf.bundle.min.js`.

### Service

`app/js/services/pdfService.js` — exports `downloadSubmissionPdf(submission, formMeta, formRenderEl?)`.

### Three Rendering Modes

| Mode | Trigger | Behavior |
|---|---|---|
| **Template mode** | `form.settings.ui.pdfTemplate` is set | Loads `app/js/templates/pdf/{key}.js`; module default export receives `{ submission, formMeta, user }` and returns an HTML string |
| **Default mode** | `formRenderEl` passed (edit banner) | Clones the visible rendered Form.io form, strips buttons/notes/revision history/alerts, adds a header with form title + submission date |
| **Off-screen mode** | No `formRenderEl` (kebab menu or table action) | Creates a temporary read-only Form.io instance off-screen, renders submission, captures PDF, destroys instance |

### UI Entry Points

- **Edit banner**: `#downloadPdfBtn` — visible when viewing/editing a submission with `_id`. Uses default mode.
- **Tabulator kebab menu**: "Download PDF" item (`data-action="pdf"`). Uses off-screen mode.
- **Table view**: PDF icon button (`data-action="pdf"`) in action button group. Uses off-screen mode.

### Custom PDF Templates

Per-form PDF templates live in `app/js/templates/pdf/`. Each is an ES module whose default export is `({ submission, formMeta, user }) => htmlString`.

| Key | File | Form |
|---|---|---|
| `underwritingContract` | `app/js/templates/pdf/underwritingContract.js` | Underwriting Contracts |

To add a new template:
1. Create `app/js/templates/pdf/{key}.js`.
2. Set `form.settings.ui.pdfTemplate: "{key}"` on the form definition.

The underwriting contract template renders a formal legal contract document (inline CSS only — required for html2pdf compatibility) with: logo/header, parties block, contract details table, recitals, terms, copy summary, approval record table, and a two-column signature block.

### Station Identity Variables

Station identity is injected via `app/config.js` as `window.STATION_*` globals (sourced from `.env`), flowing through `CONFIG.STATION` in `app/js/config.js`.

| Variable | Used in |
|---|---|
| `STATION_NAME` | Navbar fallback (if no call sign set), PDF contract parties block |
| `STATION_CALL_SIGN` | Navbar branding (preferred over name if set), PDF header |
| `STATION_ADDRESS` | PDF contract parties block |
| `STATION_LOGO_URL` | **Navbar header** (replaces the default broadcast-pin icon) + **PDF contract header** |

If `STATION_LOGO_URL` is blank, the navbar shows the default broadcast-pin icon and "Radio Forms Portal"; the PDF omits the logo.

---

## Sidebar Badges & "New" Counts

Badges on the sidebar form list showing `3 new / 12` format — "3 new" in red, "/ 12" in muted gray. Category (tag) headers aggregate child totals. Tabulator rows get a red left-border for unviewed submissions.

### Service

`app/js/services/badgeService.js` — key exports:

| Export | Purpose |
|---|---|
| `initBadgeCounts(forms, user)` | Background-fetches all counts; `_initialized` guard prevents re-fetch on search filter re-renders |
| `loadViewedSubmissions()` | Bulk-loads the current user's viewed submission IDs |
| `markSubmissionViewed(subId, formId)` | Deduplicates locally, fire-and-forget write to `viewedSubmissions` |
| `isSubmissionViewed(subId)` | Synchronous check against local set |
| `onSubmissionViewed(formId, subId)` | Updates badge counts in memory and DOM after a view event |
| `incrementFormTotal(formId, subId)` | Increments total count for a form (called on `submitDone`) |
| `decrementFormTotal(formId, subId)` | Decrements total count for a form (called on delete) |
| `updateSidebarBadge(formId)` | Pushes updated badge DOM to the sidebar list item |

### Backend Resource

`viewedSubmissions` — a Form.io resource that stores per-user, per-submission viewed records.

| Field | Type | Notes |
|---|---|---|
| `submissionId` | textfield | ID of the viewed submission |
| `form` | textfield | Machine name of the form |

Access: `create_own` + `read_own` + `update_own` for `authenticated`. Hidden from the sidebar via `settings.ui.formsList.hidden: true`.

### Count Strategy

- **Standard forms**: `Content-Range` header from a `limit=1&select=_id` request via direct `fetch()` (not `formioRequest`, which discards response headers).
- **Share-settings forms**: Fetches submissions with share fields, filters client-side via `checkSubmissionRowAccess` so counts match what the user actually sees. Requires fetching the full form definition once per form to detect the `shareSettings` panel (cached via `hasShareSettings`).
- Requests are batched in groups of 5.

### `hideBadges` Setting

`form.settings.ui.hideBadges: true` skips badge count fetching **and** Tabulator new-row styling for a form. Applied to: `user`, `engineeringSchedule`.

### "Viewed" Touch Points

Submissions are marked as viewed in: `openInlineSubmissionForm()`, `startEditSubmission()`, `startViewSubmission()` (all in `submissions.js`), Tabulator kebab view/edit, and Tabulator double-click (both in `tabulatorLists.js`).

---

## Login Log

Every authenticated session records a login event to the `loginLog` Form.io resource.

### Service

`app/js/services/loginLogService.js` — exports `recordLoginEvent(user)`.

- **Deduplication**: uses `sessionStorage` flag (`rfp_login_recorded`) so that token refreshes and `initSession` re-runs within the same tab don't generate duplicate entries.
- **Data captured**: `loginAt` (ISO timestamp), `userEmail`, `userId`, `userAgent`, `ipAddress` (fetched from the uploads service `/api/v1/uploads/whoami` endpoint using the user's Form.io token; falls back to `'unknown'` on failure or timeout).

### Backend Resource

`loginLog` (`config/bootstrap/form_templates/loginLog.json`) — a system resource hidden from the sidebar via `settings.ui.formsList.hidden: true`. Access: `create_own` for `authenticated`, `read_all` for `administrator`.

---

## File Uploads (Local + S3 Fallback)

File attachments are uploaded to local NUC storage by default via the `uploads` service. If local upload fails, optional S3 fallback can be enabled through the presign proxy endpoint.

### Service

- `app/js/services/uploadsService.js` — exports `handleFileUpload(formio, formMeta)`, `bindAttachmentsDatagridUpload(formio, formMeta)`, `deleteAttachment(storageKey)`. Legacy alias `handleS3Upload` is preserved for backward compatibility.
- `deployment/uploads-service/server.py` — local upload API (Python, `multipart` library), authenticated file serving, and file deletion.

### Upload Triggers

Uploads can be triggered two ways:

1. **`s3Upload` Form.io event** — if a form schema contains a button component with `action: "event"` and `event: "s3Upload"`, clicking it fires the upload flow. The event listener is only registered on non-readOnly forms.
2. **Datagrid "Add Another" intercept** — `bindAttachmentsDatagridUpload()` attaches a delegated click listener on the form root element that detects clicks on the `attachments` datagrid's "Add Another" button. It matches by CSS class (`formio-button-add-row`), `ref` attribute, `name` attribute, or button text content. This intercept is **DOM-class dependent** — if Form.io changes its datagrid button markup, the intercept may need updating.

Both triggers are wired in `app/js/features/forms.js` (main form) and `app/js/features/submissions.js` (inline submission form).

### Upload Flow

1. A hidden `<input type="file" multiple>` is created and triggered programmatically. A `window.focus` listener detects picker cancellation and cleans up the orphaned input.
2. Files exceeding `CONFIG.UPLOAD.MAX_FILE_SIZE_MB` (default 50 MB) are rejected client-side with a per-file toast.
3. For each valid file, the SPA posts multipart file data to `CONFIG.UPLOAD.LOCAL_UPLOAD_URL` using `formioRequest()`.
4. The uploads service validates the Form.io token via `/current`, checks `Content-Length` against the server-side `UPLOADS_MAX_FILE_SIZE_MB` limit, stores the file in `/uploads/<formPath>/<submissionId-or-draft>/`, and returns metadata + object URL.
5. The metadata object is appended to the form's `attachments` data grid via `actions.addAttachmentToFormData`.
6. If local upload fails and `CONFIG.UPLOAD.ENABLE_S3_FALLBACK` is `true`, the client requests a presigned S3 URL from `CONFIG.UPLOAD.PRESIGN_URL` and uploads with `PUT`.
7. Per-file progress toasts are shown during multi-file uploads.

### Download Flow

Attachment downloads use authenticated blob retrieval via `formioRequest()` with `responseType: 'blob'`. If the blob download fails and the attachment storage is S3, the download falls back to `window.open()` for direct access.

Three UI touch points provide download access:

- **Table view** (`submissions.js`): a paperclip button with attachment count, visible when the submission has attachments and the user has read permission.
- **Tabulator view** (`tabulatorLists.js`): a kebab menu item "Download Attachments (N)".
- **DayPilot calendar** (`dayPilotCalendar.js`): a right-click context menu item "Download Attachments".

Downloads run in parallel batches of 3 for better throughput.

### Configuration

`CONFIG.UPLOAD` supports:

- `MODE` — `local` (default) or `s3`
- `LOCAL_UPLOAD_URL` — endpoint for local file uploads
- `PRESIGN_URL` — endpoint for S3 presigned URL requests
- `ENABLE_S3_FALLBACK` — fall back to S3 if local upload fails (default `true`)
- `OBJECT_URL` — base URL for authenticated file retrieval
- `MAX_FILE_SIZE_MB` — maximum file size in MB (default `50`, applied on both frontend and backend)

All new uploads are private by default; file retrieval is served through authenticated upload-service endpoints. Both `GET` and `DELETE` on `/api/v1/uploads/object/:key` verify that the caller's Form.io token has read access to the submission that owns the file (by querying Form.io's submission API internally). This prevents authenticated users from accessing files belonging to submissions they lack permission for. A `/api/v1/uploads/whoami` endpoint returns the caller's IP address (used by `loginLogService`).

---

## Underwriting Onboarding Tour

A guided onboarding tour for Underwriting department users, implemented using [Driver.js](https://driverjs.com/).

### File

`app/js/features/uwOnboarding.js`

### Behavior

- Triggers automatically **once per browser** on first login by an Underwriting department member (controlled by a `localStorage` flag: `rfp_uw_tour_seen`).
- A **"Help"** button (`#uwTourBtn`) is injected into the navbar for Underwriting users, allowing the tour to be manually re-triggered at any time.
- Department membership is resolved from `groupPermissions._groupName === 'Underwriting'` on loaded forms — no hardcoded IDs.

### Tour Steps

The tour walks through: the sidebar (finding UW forms), the Contracts list, creating a new contract, the Campaigns and Spots lists, and the PDF download button.

---

## Revision History

The revision history system tracks field-level changes to submissions over time, using Form.io's built-in revision API.

### Files

- `app/js/services/revisionService.js` — API calls for fetching revision history
- `app/js/features/revisionHistory.js` — UI rendering of revision diffs

### Current Usage

Revision tracking is enabled on the `underwritingSpot` resource for the `copy` field:

```json
"settings": {
  "revisionTracking": {
    "enabled": true,
    "trackedFields": ["copy"]
  }
}
```

Every save of the `copy` field records a revision via Form.io's revision API (`GET /underwritingspot/{id}/v/{revision}`). The revision history UI renders in the spot detail view, allowing staff to compare versions and restore prior copy.

### Use Cases

- **Approval audit trail**: Track exactly what copy was submitted at each approval stage.
- **Rollback**: Restore prior copy if a new revision introduces FCC compliance issues.
- **Legal records**: Timestamped history for FCC record-keeping.

---

## SMTP Email Notifications

> **Status**: Scaffolded — not yet active in production. SMTP credentials must be configured in `.env` before email delivery works.

Email notification actions are defined in `config/bootstrap/default-template.json` for two forms:

| Form | Trigger | Recipient |
|---|---|---|
| `incidentReport` | New submission | `management@your-domain.com` |
| `contactIntake` | New submission | `management@your-domain.com` |

### Configuration

The following vars must be set in `.env` (and therefore in the production server's `.env`) to activate email delivery:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@your-domain.com
SMTP_PASS=<app-password>
SMTP_FROM=noreply@your-domain.com
```

Form.io reads SMTP settings from `config/env/production.json` (generated on the server by `scripts/lib/generate-formio-config.sh`). The template `formio-config.json.template` maps these env vars into the Form.io `email` settings block.

### Adding Notifications to Other Forms

1. Add an Email action to the form's `actions` array in `default-template.json`:

```json
"formName:notify": {
  "title": "Email Notification",
  "name": "email",
  "form": "formName",
  "priority": 0,
  "method": ["create"],
  "handler": ["after"],
  "settings": {
    "from": "noreply@your-domain.com",
    "to": "management@your-domain.com",
    "subject": "New [Form Name] Submission",
    "message": "<p>A new submission was received.</p>"
  }
}
```

2. Deploy the updated template via `./scripts/deploy-formio.sh ./config/bootstrap/default-template.json`.
