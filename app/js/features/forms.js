// app/js/features/forms.js

import {
    handleS3Upload
    } from '../services/uploadsService.js';
import {
    getSubmissionPermissions
    } from '../services/rbacService.js';
import { 
    getCurrentUserWithRoles
    } from '../services/sessionService.js';
import { formioRequest, buildUrl } from '../services/formioService.js';
import {
    hasRelevantChanges,
    buildRevisionEntry
    } from '../services/revisionService.js';
import { getAppBridge } from '../services/appBridge.js';
import { loadSubmissions } from './submissions.js?v=2.19';

function $(id) { return document.getElementById(id); }
function show(el) { if (el) el.classList.remove('d-none'); }
function hide(el) { if (el) el.classList.add('d-none'); }

// Helper to get the display title (respecting overrides)
export function getFormDisplayTitle(form) {
    return form.settings?.ui?.alternateTitle || form.title || form.name || form.path;
}

// Load forms user can access
export async function loadForms() {
    const { config, actions, state } = getAppBridge();
    const API_BASE = config.API_BASE;
    const formsList = $("formsList");

    if (!formsList) return [];

    formsList.innerHTML =
        '<div class="text-center py-3">' +
        '<div class="spinner-border spinner-border-sm text-secondary" role="status">' +
        '<span class="visually-hidden">Loading forms...</span>' +
        "</div></div>";

    try {
        const user = await getCurrentUserWithRoles();
        const userRoles = new Set(user?.roles || []);

        const forms = await formioRequest('/form', {
            method: 'GET',
            query: { 
                limit: 500, 
                select: "title,path,name,access,submissionAccess,tags,_id,settings"
            }
        });

        let visible;

        if (state.adminMode) {
            // Admin mode: see ALL forms/resources regardless of access configuration
            visible = forms;
        } else {
        // Non-admin users: filter by access rules (read or create rights)
            visible = forms.filter((f) => {
                // Use the shared service to check permissions (Roles + Groups)
                const perms = getSubmissionPermissions(user, f, { isAdmin: false });
                
                // Also check strict "access" (Form definition access) which is usually just roles
                // but for listing, we mainly care if they can submit or read submissions.
                // However, traditionally `access` controls "Can I load the form definition?".
                // If the user has Group Permission to submit, they implicitly need form read access.
                
                const canReadSubmissions = perms.canReadAll || perms.canReadOwn;
                const canCreateSubmissions = perms.canCreateAll || perms.canCreateOwn;
                
                // Check basic form definition access (read_all/read_own on the form object itself)
                // This is legacy role-based check for the form definition
                const a = f.access || [];
                const formDefRules = a.map((r) => ({ type: r.type, roles: new Set(r.roles || []) }));
                const hasFormDefRead = formDefRules.some(
                    (r) => (r.type === "read_all" || r.type === "read_own" || r.type === "read") &&
                    (() => { for (const v of r.roles) if (userRoles.has(v)) return true; return false; })()
                );

                return hasFormDefRead || canReadSubmissions || canCreateSubmissions;
            });
        }

        // Store all accessible forms in state (unfiltered by UI settings, for Builder use)
        state.allVisibleForms = (visible || []).sort((a, b) =>
            (a.title || a.name || a.path || "").localeCompare(
                b.title || b.name || b.path || ""
            )
        );

        if (!state.allVisibleForms.length) {
            formsList.innerHTML =
                '<div class="text-muted small p-2">No accessible forms.</div>';
        } else {
            renderFormsList(state.allVisibleForms);
        }

        // Populate builder select for admins
        // (leave to main/admin tooling)
        return state.allVisibleForms;
    } catch (e) {
        console.error("loadForms error", e);
        formsList.innerHTML =
            '<div class="text-danger small p-2">Error loading forms.</div>';
        return [];
    }
}

// Helper: normalize a tag string to title-case for display
function titleCaseTag(tag) {
    if (!tag) return '';
    return tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase();
}

export function renderFormsList(forms) {
    const { actions } = getAppBridge();
    const formsList = $("formsList");
    if (!formsList) return;

    // Filter out forms hidden via settings.ui.formsList.hidden
    // This applies to both admin and regular users for the main UI list
    const displayForms = forms.filter(f => !f.settings?.ui?.formsList?.hidden);

    if (!displayForms.length) {
        formsList.innerHTML =
            '<div class="text-muted small p-2">No matching forms.</div>';
        return;
    }

    // Group forms by tag (case-insensitive, title-cased key).
    // Forms with no/empty tags fall into "General".
    // Multi-tag forms appear in each relevant section.
    const DEFAULT_TAG = 'General';
    const tagGroups = new Map();

    displayForms.forEach((form) => {
        const tags = (form.tags || []).filter(t => t && t.trim());
        const normalizedTags = tags.length
            ? tags.map(t => titleCaseTag(t.trim()))
            : [DEFAULT_TAG];

        normalizedTags.forEach((tag) => {
            if (!tagGroups.has(tag)) tagGroups.set(tag, []);
            tagGroups.get(tag).push(form);
        });
    });

    // Sort tag keys: "General" first, then alphabetical
    const sortedTags = [...tagGroups.keys()].sort((a, b) => {
        if (a === DEFAULT_TAG) return -1;
        if (b === DEFAULT_TAG) return 1;
        return a.localeCompare(b);
    });

    // Sort forms within each group by display title
    sortedTags.forEach((tag) => {
        tagGroups.get(tag).sort((a, b) =>
            getFormDisplayTitle(a).localeCompare(getFormDisplayTitle(b))
        );
    });

    // Render tag-grouped accordion
    formsList.innerHTML = "";
    const accordionId = "formsTagAccordion";

    sortedTags.forEach((tag, idx) => {
        const groupForms = tagGroups.get(tag);
        const collapseId = `formsTag-${idx}`;
        const headingId = `formsTagHeading-${idx}`;
        const isGeneral = (tag === DEFAULT_TAG);

        const item = document.createElement("div");
        item.className = "accordion-item rfp-tag-section";

        const header = document.createElement("h2");
        header.className = "accordion-header";
        header.id = headingId;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `accordion-button rfp-tag-accordion-btn${isGeneral ? '' : ' collapsed'}`;
        btn.setAttribute("data-bs-toggle", "collapse");
        btn.setAttribute("data-bs-target", `#${collapseId}`);
        btn.setAttribute("aria-expanded", isGeneral ? "true" : "false");
        btn.setAttribute("aria-controls", collapseId);
        btn.textContent = tag;

        header.appendChild(btn);
        item.appendChild(header);

        const collapseDiv = document.createElement("div");
        collapseDiv.id = collapseId;
        collapseDiv.className = `accordion-collapse collapse${isGeneral ? ' show' : ''}`;
        collapseDiv.setAttribute("aria-labelledby", headingId);

        const body = document.createElement("div");
        body.className = "accordion-body p-0";

        const listGroup = document.createElement("div");
        listGroup.className = "list-group list-group-flush small";

        groupForms.forEach((form) => {
            const formBtn = document.createElement("button");
            formBtn.type = "button";
            formBtn.className =
                "list-group-item list-group-item-action";

            // Use alternate title if configured
            formBtn.textContent = getFormDisplayTitle(form);

            formBtn.addEventListener("click", () => {
                // Highlight the selected form across all tag sections
                formsList
                    .querySelectorAll(".list-group-item.active")
                    .forEach((el) => el.classList.remove("active"));
                formBtn.classList.add("active");

                renderForm(form);
            });
            listGroup.appendChild(formBtn);
        });

        body.appendChild(listGroup);
        collapseDiv.appendChild(body);
        item.appendChild(collapseDiv);
        formsList.appendChild(item);
    });
}

// Render a form and prepare new-submission panel  submissions list
export async function renderForm(formMeta) {
    const { config, actions, state } = getAppBridge();
    const API_BASE = config.API_BASE;

    const formTitle = $("formTitle");
    const formTagBadge = $("formTagBadge");
    const subsList = $("subsList");
    const subsTitle = $("subsTitle");
    const subsSubtitle = $("subsSubtitle");
    const formRender = $("formRender");
    const editBanner = $("editBanner");

    // Prevent event leaks / "ghost listeners" when switching forms.
    actions.destroyMainForm?.();

    state.currentFormMeta = formMeta;
    state.isEditing = false;
    state.editingSubmissionId = null;
    state.currentSubmissionView = null;
    hide(editBanner);
    actions.destroyInlineForm?.();

    // Use alternate title if configured
    formTitle.textContent = getFormDisplayTitle(formMeta);

    // Customize Submissions Header
    const customSubsTitle = formMeta.settings?.ui?.submissionsTitle;
    if (customSubsTitle !== undefined) {
        // Custom title configured (can be empty string)
        if (subsTitle) subsTitle.textContent = customSubsTitle || "";
        
        if (subsSubtitle) {
            if (!customSubsTitle) {
                // If custom title is blank, hide/clear subtitle
                subsSubtitle.textContent = "";
                hide(subsSubtitle);
            } else {
                // If custom title exists, use templated subtitle
                subsSubtitle.textContent = `View or edit existing ${customSubsTitle}.`;
                show(subsSubtitle);
            }
        }
    } else {
        // Default behavior
        if (subsTitle) subsTitle.textContent = "Submissions";
        if (subsSubtitle) {
            subsSubtitle.textContent = "View or edit existing submissions.";
            show(subsSubtitle);
        }
    }

    if (
        Array.isArray(formMeta.tags) &&
        formMeta.tags.length
    ) {
        formTagBadge.textContent =
            formMeta.tags.join(", ");
        show(formTagBadge);
    } else {
        formTagBadge.textContent = "";
        hide(formTagBadge);
    }

    subsList.innerHTML =
        '<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-secondary" role="status"><span class="visually-hidden">Loading submissions...</span></div></div>';

    formRender.innerHTML =
        '<div class="text-center py-3"><div class="spinner-border text-secondary" role="status"><span class="visually-hidden">Loading form...</span></div></div>';

    const formUrl = `${API_BASE}/${formMeta.path}`;

    try {
        const currentUser = await getCurrentUserWithRoles();
        state.currentUserObj = currentUser;
        
        // Pass full user object to support group permissions
        const submissionPerms = getSubmissionPermissions(
            currentUser,
            formMeta,
            { isAdmin: state.adminMode }
        );
        state.currentSubmissionPermissions = submissionPerms;

        // Enable create accordion only if user can create
        {
            const canCreate =
                submissionPerms.canCreateAll || submissionPerms.canCreateOwn;
            if (canCreate) {
                actions.setCreateToggleEnabled?.(true);
            } else {
                actions.setCreateToggleEnabled?.(
                    false,
                    "You do not have permission to create new submissions for this form."
                );
            }
        }

        const formio = await createMainFormInstance(formMeta, false, {});
        
        // Keep collapse toggling *after* the form is instantiated (avoid collapsing mid-render).
        actions.setCreateCollapsed?.(true);

        await loadSubmissions(
            formMeta,
            submissionPerms,
            currentUser
        );
    } catch (e) {
        console.error("renderForm error", e);
        formRender.innerHTML =
            '<div class="text-danger small">Unable to render form.</div>';
        subsList.innerHTML = "";
    }
}

export async function createMainFormInstance(formMeta, readOnly = false, submission = null) {
    const { config, actions, state } = getAppBridge();
    const formRender = $("formRender");
    
    // Prevent event leaks / "ghost listeners" when switching forms.
    actions.destroyMainForm?.();

    // Clear container and show spinner
    if (formRender) {
        formRender.innerHTML = '<div class="text-center py-3"><div class="spinner-border text-secondary" role="status"><span class="visually-hidden">Loading...</span></div></div>';
    }

    const currentUser = state.currentUserObj || (await getCurrentUserWithRoles());
    
    const formio = await Formio.createForm(
        formRender,
        buildUrl(`/${String(formMeta.path || '').replace(/^\/+/, '')}`),
        {
            readOnly: !!readOnly,
            user: currentUser, // makes 'user' available in conditional/logic JS
            saveDraft: formMeta.settings?.saveDraft,
            saveDraftThrottle: formMeta.settings?.saveDraftThrottle || 5000
        }
    );

    // Attach revision tracking by wrapping submit() so we inject revision data
    // into formio.submission.data *before* the SDK deep-clones it.
    const revSettings = formMeta?.settings?.revisionTracking;
    if (revSettings?.enabled) {
        const origSubmit = formio.submit.bind(formio);
        formio.submit = function (...args) {
            injectRevisionEntry(this, revSettings, currentUser);
            return origSubmit(...args);
        };
    }
    actions.attachFormioErrorHandler?.(formio, "Main form");
    actions.attachUserAdminSubmitGuards?.(formio, formMeta);

    state.currentFormInstance = formio;

    // When the user clicks the "Upload file(s)" button
    formio.on("s3Upload", () => {
        handleS3Upload(formio, formMeta);
    });

    formio.on("submitDone", async () => {
        const action = state.isEditing ? "updated" : "submitted";
        state.isEditing = false;
        state.editingSubmissionId = null;
        const editBanner = $("editBanner");
        if (editBanner) hide(editBanner);

        actions.showToast?.(
            `Submission ${action} successfully.`,
            "success"
        );
        
        // Collapse forms panel and clear form data
        actions.setFormsCollapsed?.(true);
        actions.setCreateCollapsed?.(true);
        actions.safeSetSubmission?.(formio, {});
        
        await loadSubmissions(
            formMeta,
            state.currentSubmissionPermissions,
            state.currentUserObj
        );
    });

    if (submission) {
        await actions.safeSetSubmission?.(formio, submission);
        
        // If we're viewing/editing a submission, render the notes section
        if (submission._id && formRender) {
            const notesContainer = document.createElement('div');
            notesContainer.id = 'submissionNotesContainer';
            formRender.appendChild(notesContainer);
            
            // Dynamically import and render inline notes view
            try {
                const { renderNotesInFormView } = await import('./inlineNotes.js');
                await renderNotesInFormView(submission, formMeta, notesContainer);
            } catch (error) {
                console.error('Error loading notes section:', error);
            }

            // Render revision history if enabled for this form
            if (formMeta.settings?.revisionTracking?.enabled) {
                const revContainer = document.createElement('div');
                revContainer.id = 'revisionHistoryContainer';
                formRender.appendChild(revContainer);

                try {
                    const { renderRevisionHistory } = await import('./revisionHistory.js');
                    await renderRevisionHistory(submission, formMeta, revContainer);
                } catch (error) {
                    console.error('Error loading revision history:', error);
                }
            }
        }
    }
    
    return formio;
}

function injectRevisionEntry(formio, revSettings, currentUser) {
    try {
        const data = formio.submission?.data;
        if (!data) return;

        const revisions = Array.isArray(data.copyRevisions) ? data.copyRevisions : [];
        const lastRevision = revisions.length > 0 ? revisions[revisions.length - 1] : null;

        if (hasRelevantChanges(data, lastRevision, revSettings)) {
            const entry = buildRevisionEntry(data, currentUser, revSettings);
            if (!Array.isArray(data.copyRevisions)) {
                data.copyRevisions = [];
            }
            data.copyRevisions.push(entry);
            console.log('[RevisionTracking] Revision injected. Total:', data.copyRevisions.length);
        }
    } catch (err) {
        console.error('[RevisionTracking] Error injecting revision:', err);
    }
}

export function populateBuilderFormSelect() {
    // Admin tooling: deferred for your “state comprehensively” pass.
    // Kept here so imports don’t break.
    const builderFormSelect = $("builderFormSelect");
    const { state } = getAppBridge();
    if (!builderFormSelect) return;
    builderFormSelect.innerHTML =
        '<option value="">– Select form/resource –</option>';

    const allVisibleFormsById = new Map();
    (state.allVisibleForms || []).forEach((form) => {
        const opt = document.createElement("option");
        // Use /form/:id so we can load full definitions (including actions)
        opt.value = form._id;
        opt.textContent = `${form.title || form.name || form.path}  (${form.path})`;
        builderFormSelect.appendChild(opt);
        if (form._id) allVisibleFormsById.set(form._id, form);
    });
}
