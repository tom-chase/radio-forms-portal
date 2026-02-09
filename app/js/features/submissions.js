// app/js/features/submissions.js

import {
    getSubmissionPermissions,
    hasShareSettings,
    checkSubmissionRowAccess
    } from '../services/rbacService.js';
import { getCurrentUserWithRoles } from '../services/sessionService.js';
import { formioRequest, buildUrl } from '../services/formioService.js';
import { getAppBridge } from '../services/appBridge.js';
import { getUIState } from '../state/uiState.js';
import { handleS3Upload } from '../services/uploadsService.js';
import { showConfirm } from '../ui/modalUtils.js';
import { renderTabulatorList, hasTabulatorConfig, destroyTabulator } from './tabulatorLists.js?v=2.19';
import { renderDayPilotCalendar, hasDayPilotConfig, destroyDayPilot } from './dayPilotCalendar.js?v=2.19';
import { openRoleMgmtModal } from './roleMgmt.js';
import { renderViewToggle } from '../utils/viewUtils.js';
import { openInlineNotesView } from './inlineNotes.js';

function $(id) { return document.getElementById(id); }

function cloneSubmission(submission) {
    try {
        return JSON.parse(JSON.stringify(submission || {}));
    } catch {
        return submission ? { ...submission } : {};
    }
}

function normalizeSubmissionView(currentView, hasDayPilot, hasTabulator) {
    const defaultView = hasDayPilot ? 'calendar' : (hasTabulator ? 'tabulator' : 'table');
    if (!currentView) return defaultView;
    if (currentView === 'table') return 'table';
    if (currentView === 'calendar' && !hasDayPilot) return hasTabulator ? 'tabulator' : 'table';
    if (currentView === 'tabulator' && !hasTabulator) return hasDayPilot ? 'calendar' : 'table';
    return currentView;
}

// Load submissions respecting role-based access
export async function loadSubmissions(formMeta, permissions, user) {
    const { actions, state } = getAppBridge();
    const subsList = $("subsList");
    const subsSearchInput = $("subsSearch");
    const subsSearchContainer = $("subsSearchContainer");

    const currentUser =
        user || (await getCurrentUserWithRoles());
    state.currentUserObj = currentUser;
    // Pass full currentUser object to enable Group Permission checks
    const perms =
        permissions ||
        getSubmissionPermissions(currentUser, formMeta, { isAdmin: state.adminMode });
    state.currentSubmissionPermissions = perms;

    const params = { limit: 25, sort: "-created" };

    if (!perms.canReadAll && perms.canReadOwn) {
        params.owner = (currentUser && currentUser._id) || "me";
    } else if (!perms.canReadAll && !perms.canReadOwn) {
        subsList.innerHTML =
            '<div class="alert alert-warning m-3 mb-0 small">You do not have permission to view submissions for this form.</div>';
        state.currentSubmissions = [];
        actions.destroyInlineForm?.();
        if (subsSearchContainer) subsSearchContainer.classList.add("d-none");
        return;
    }

    if (subsSearchInput) {
        subsSearchInput.value = "";
    }

    subsList.innerHTML =
        '<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-secondary" role="status"><span class="visually-hidden">Loading submissions...</span></div></div>';

    try {
        const path = String(formMeta?.path || '').replace(/^\/+/, '');
        const subs = await formioRequest(`/${path}/submission`, { method: "GET", query: params });

        // Filter by share settings if the form uses them
        // formMeta from the sidebar may lack components (loadForms uses select=),
        // so fetch the full form definition when components are missing.
        let filteredSubs = subs || [];
        let fullFormDef = formMeta;
        if (!formMeta.components) {
            try {
                fullFormDef = await formioRequest(`/${path}`, { method: 'GET' });
            } catch (e) {
                console.warn('[shareFilter] Could not fetch full form def, skipping share filter', e);
            }
        }
        if (hasShareSettings(fullFormDef)) {
            const isAdmin = !!getUIState('adminMode');
            filteredSubs = filteredSubs.filter(s =>
                checkSubmissionRowAccess(currentUser, s, fullFormDef, { isAdmin })
            );
        }
        state.currentSubmissions = filteredSubs;

        // Always render view toggle if form has multiple view configurations
        const hasDayPilot = hasDayPilotConfig(formMeta);
        const hasTabulator = hasTabulatorConfig(formMeta);
        
        // Helper to toggle search visibility
        const updateSearchVisibility = (view) => {
            if (!subsSearchContainer) return;
            if (view === 'table') {
                subsSearchContainer.classList.remove('d-none');
            } else {
                subsSearchContainer.classList.add('d-none');
            }
        };

        if (!filteredSubs.length) {
            actions.destroyInlineForm?.();
            
            // Render view toggle even with no submissions
            if (hasDayPilot || hasTabulator) {
                state.currentSubmissionView = normalizeSubmissionView(state.currentSubmissionView, hasDayPilot, hasTabulator);
                updateSearchVisibility(state.currentSubmissionView);
                
                const viewToggleHtml = await renderViewToggle(formMeta, state.currentSubmissionView);
                subsList.innerHTML = viewToggleHtml + '<p class="text-muted small px-3 pt-3 mb-0">No submissions yet.</p>';
                
                // Wire up view toggle click handlers
                const viewButtons = subsList.querySelectorAll('[data-view]');
                viewButtons.forEach(button => {
                    button.addEventListener('click', async () => {
                        const newView = button.dataset.view;
                        if (newView !== state.currentSubmissionView) {
                            await switchSubmissionView(newView, formMeta, perms, currentUser);
                        }
                    });
                });
            } else {
                updateSearchVisibility('table');
                subsList.innerHTML = '<p class="text-muted small px-3 pt-3 mb-0">No submissions yet.</p>';
            }
            return;
        }

        // Determine which view to render based on configuration and user preference
        
        state.currentSubmissionView = normalizeSubmissionView(state.currentSubmissionView, hasDayPilot, hasTabulator);
        updateSearchVisibility(state.currentSubmissionView);
        
        // Render view toggle UI
        const viewToggleHtml = await renderViewToggle(formMeta, state.currentSubmissionView);
        
        // Try to render with the preferred view
        let rendered = false;
        let contentHtml = '';
        
        if (state.currentSubmissionView === 'calendar' && hasDayPilot) {
            // For calendar, we need to render the toggle first, then let DayPilot handle the rest
            subsList.innerHTML = viewToggleHtml + '<div id="rfpDayPilotCalendar"></div>';
            rendered = await renderDayPilotCalendar(filteredSubs, formMeta, currentUser, perms);
            if (!rendered && hasTabulator) {
                // Calendar failed, try tabulator
                state.currentSubmissionView = 'tabulator';
                subsList.innerHTML = viewToggleHtml + '<div id="rfpSubsTabulator"></div>';
                rendered = await renderTabulatorList(filteredSubs, formMeta, currentUser, perms);
            }
        } else if (state.currentSubmissionView === 'tabulator' && hasTabulator) {
            subsList.innerHTML = viewToggleHtml + '<div id="rfpSubsTabulator"></div>';
            rendered = await renderTabulatorList(filteredSubs, formMeta, currentUser, perms);
        }
        
        // Fall back to regular table if needed
        if (!rendered) {
            state.currentSubmissionView = 'table';
            contentHtml = await renderSubmissionsTable(filteredSubs, formMeta, currentUser, perms);
            subsList.innerHTML = viewToggleHtml + contentHtml;
            
            // Wire up table view event handlers
            await wireTableEventHandlers(filteredSubs, formMeta, currentUser, perms);
        }
        
        // Wire up view toggle click handlers
        const viewButtons = subsList.querySelectorAll('[data-view]');
        viewButtons.forEach(button => {
            button.addEventListener('click', async () => {
                const newView = button.dataset.view;
                if (newView !== state.currentSubmissionView) {
                    await switchSubmissionView(newView, formMeta, perms, currentUser);
                }
            });
        });
    } catch (e) {
        console.error("loadSubmissions error", e);
        actions.destroyInlineForm?.();
        subsList.innerHTML =
            '<div class="alert alert-danger m-3 mb-0 small">Error loading submissions.</div>';
    }
}

// Switch between different submission views (calendar, tabulator, table)
export async function switchSubmissionView(viewType, formMeta, permissions, user) {
    const { state, actions } = getAppBridge();
    
    if (!formMeta || !viewType) return;
    
    // Clean up existing instances
    actions.destroyInlineForm?.();
    destroyTabulator();
    destroyDayPilot();
    
    // Update view state
    state.currentSubmissionView = viewType;
    
    // Reload submissions with new view
    await loadSubmissions(formMeta, permissions, user);
}

export async function renderSubmissionsTable(
    subs,
    formMeta,
    user,
    permissions
) {
    const { actions, state } = getAppBridge();
    if (!subs || !subs.length) {
        return '<p class="text-muted small px-3 pt-3 mb-0">No submissions yet.</p>';
    }

    const currentUserId = user?._id || null;
    const perms =
        permissions ||
        state.currentSubmissionPermissions || {
            canReadAll: true,
            canReadOwn: true,
        };

    const isUserResource = String(formMeta?.path || "").toLowerCase() === "user";
    
    // Check if current user can create role management forms
    const currentUser = await getCurrentUserWithRoles();
    
    // Get permissions for roleMgmt and roleMgmtAdmin forms
    const { getSubmissionPermissions, getFormPermissions } = await import('../services/rbacService.js');
    const { formioRequest } = await import('../services/formioService.js');
    
    // Fetch actual form definitions to get real permissions
    let roleMgmtPerms = { canCreateAll: false, canCreateOwn: false };
    let roleMgmtAdminPerms = { canCreateAll: false, canCreateOwn: false };
    
    try {
        // Try to fetch roleMgmt form
        const roleMgmtForm = await formioRequest('/rolemgmt', { method: 'GET' });
        if (roleMgmtForm) {
            roleMgmtPerms = getSubmissionPermissions(currentUser, roleMgmtForm, { isAdmin: state.adminMode });
        }
    } catch (e) {
        console.warn('Could not fetch roleMgmt form, using defaults:', e);
        // Fallback to defaults
        roleMgmtPerms = getSubmissionPermissions(currentUser, {
            submissionAccess: [
                { type: "create_all", roles: ["management", "staff", "administrator"] },
                { type: "create_own", roles: ["management", "staff", "administrator"] }
            ]
        }, { isAdmin: state.adminMode });
    }
    
    try {
        // Try to fetch roleMgmtAdmin form
        const roleMgmtAdminForm = await formioRequest('/rolemgmtadmin', { method: 'GET' });
        if (roleMgmtAdminForm) {
            roleMgmtAdminPerms = getSubmissionPermissions(currentUser, roleMgmtAdminForm, { isAdmin: state.adminMode });
        }
    } catch (e) {
        console.warn('Could not fetch roleMgmtAdmin form, using defaults:', e);
        // Fallback to defaults
        roleMgmtAdminPerms = getSubmissionPermissions(currentUser, {
            submissionAccess: [
                { type: "create_all", roles: ["administrator"] },
                { type: "create_own", roles: ["administrator"] }
            ]
        }, { isAdmin: state.adminMode });
    }
    
    const canManageRoles = isUserResource && (roleMgmtPerms.canCreateAll || roleMgmtPerms.canCreateOwn);
    const canManageAdminRoles = isUserResource && (roleMgmtAdminPerms.canCreateAll || roleMgmtAdminPerms.canCreateOwn);

    // Keys we prefer to show first in the summary, in order
    const preferredKeys = [
        "title", // tasks, generic
        "name", // orgs
        "campaignName", // uwCampaigns
        "contractName", // uwContracts
        "spotName", // uwSpots
        "orgName",
        "onAirName",
        "status",
    ];

    let html =
        '<div class="table-responsive"><table class="table table-sm table-hover align-middle mb-0">' +
        '<thead class="table-light">' +
        "<tr>" +
        '<th scope="col">Summary</th>' +
        '<th scope="col" class="text-end">Actions</th>' +
        "</tr>" +
        "</thead><tbody>";

    subs.forEach((s) => {
        const data = s.data || {};
        const id = s._id;
        const encodedId = actions.escapeHTML?.(id) || id;
        const isOwner =
            !!currentUserId && s.owner === currentUserId;

        // Build summary based on preferred keys first
        const usedKeys = new Set();
        const summaryParts = [];

        preferredKeys.forEach((key) => {
            if (
                data[key] !== undefined &&
                data[key] !== null &&
                summaryParts.length < 4
            ) {
                usedKeys.add(key);
                summaryParts.push(
                    `<strong>${actions.escapeHTML?.(
                        key
                    )}:</strong> ${actions.escapeHTML?.(
                        actions.formatSummaryValue?.(data[key]) ?? String(data[key] ?? '')
                    )}`
                );
            }
        });

        // If we still have room, fall back to other fields
        if (summaryParts.length < 4) {
            Object.entries(data).forEach(([k, v]) => {
                if (summaryParts.length >= 4) return;
                if (usedKeys.has(k)) return;
                summaryParts.push(
                    `<strong>${actions.escapeHTML?.(
                        k
                    )}:</strong> ${actions.escapeHTML?.(
                        actions.formatSummaryValue?.(v) ?? String(v ?? '')
                    )}`
                );
            });
        }

        const summary =
            summaryParts.length === 0
                ? "<span class='text-muted'>No fields</span>"
                : summaryParts.join("<br>");

        const canEditThis =
            perms.canUpdateAll ||
            (perms.canUpdateOwn && isOwner);
        const canDeleteThis =
            perms.canDeleteAll ||
            (perms.canDeleteOwn && isOwner);
        const canViewThis =
            perms.canReadAll ||
            (perms.canReadOwn && isOwner);

        let actionsHtml =
            '<div class="btn-group btn-group-sm" role="group">';

        // Notes button (always available for viewing)
        actionsHtml += `<button type="button" class="btn btn-outline-info" data-action="notes" data-id="${encodedId}" title="View/Add Notes">
                <i class="bi bi-chat-left-text"></i>
            </button>`;

        // JSON view always available (server will enforce access)
        actionsHtml += `<button type="button" class="btn btn-outline-secondary" data-action="json" data-id="${encodedId}" title="View JSON">
                <i class="bi bi-code-slash"></i>
            </button>`;

        if (canEditThis) {
            actionsHtml += `<button type="button" class="btn btn-outline-primary" data-action="edit" data-id="${encodedId}" title="Edit submission inline">
                    <i class="bi bi-pencil-square"></i>
                </button>`;
        } else if (canViewThis) {
            actionsHtml += `<button type="button" class="btn btn-outline-primary" data-action="view" data-id="${encodedId}" title="View submission inline">
                    <i class="bi bi-eye"></i>
                </button>`;
        }

        if (canDeleteThis) {
            actionsHtml += `<button type="button" class="btn btn-outline-danger" data-action="delete" data-id="${encodedId}" title="Delete submission">
                    <i class="bi bi-trash"></i>
                </button>`;
        }

        if (canManageRoles) {
            actionsHtml += `<button type="button" class="btn btn-outline-secondary" data-action="role-mgmt" data-id="${encodedId}" title="Change roles">
                    <i class="bi bi-shield-lock"></i>
                </button>`;
        }
        if (canManageAdminRoles) {
            actionsHtml += `<button type="button" class="btn btn-outline-warning" data-action="role-mgmt-admin" data-id="${encodedId}" title="Change admin role">
                    <i class="bi bi-shield-exclamation"></i>
                </button>`;
        }

        actionsHtml += "</div>";

        html += `<tr data-sub-id="${id}">
                <td class="small">${summary}</td>
                <td class="text-end">
                    ${actionsHtml}
                </td>
            </tr>
            <tr class="submission-inline-row d-none" data-detail-for="${id}">
                <td colspan="2">
                    <div class="inline-form-container p-2"></div>
                </td>
            </tr>`;
    });

    html += "</tbody></table></div>";
    
    // Return HTML for the caller to set innerHTML
    // Note: Event wiring will be handled by the caller after setting innerHTML
    return html;
}

async function openInlineSubmissionForm(
    submission,
    formMeta,
    mode,
    perms,
    user
) {
    const { actions, state } = getAppBridge();
    const subsList = $("subsList");
    if (!subsList || !formMeta) return;

    const id = submission._id;
    const detailRow = subsList.querySelector(
        `tr.submission-inline-row[data-detail-for="${id}"]`
    );
    if (!detailRow) return;

    const container = detailRow.querySelector(
        ".inline-form-container"
    );
    if (!container) return;

    // If clicking the same row that's already open, toggle it closed.
    if (
        state.inlineFormSubmissionId === id &&
        state.inlineFormContainerEl === container
    ) {
        detailRow.classList.add("d-none");
        actions.destroyInlineForm?.();
        return;
    }

    // Close any previously-open inline form
    if (
        state.inlineFormContainerEl &&
        state.inlineFormContainerEl !== container
    ) {
        const prevRow = state.inlineFormContainerEl.closest(
            "tr.submission-inline-row"
        );
        if (prevRow) prevRow.classList.add("d-none");
        actions.destroyInlineForm?.();
    }

    detailRow.classList.remove("d-none");
    container.innerHTML =
        '<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-secondary" role="status"><span class="visually-hidden">Loading submission...</span></div></div>';

    try {
        const currentUser =
            user || (await getCurrentUserWithRoles());
        
        // Pass full currentUser to support Group Permissions
        const effectivePerms =
            perms ||
            getSubmissionPermissions(currentUser, formMeta, { isAdmin: state.adminMode });

        const isOwner =
            !!currentUser._id &&
            submission.owner === currentUser._id;
        const canEditThis =
            effectivePerms.canUpdateAll ||
            (effectivePerms.canUpdateOwn && isOwner);

        const readOnly =
            mode === "view" || !canEditThis;

        const formio = await Formio.createForm(
            container,
            buildUrl(`/${String(formMeta.path || '').replace(/^\/+/, '')}`),
            {
                readOnly,
                user: currentUser,
            }
        );
        actions.attachFormioErrorHandler?.(formio, "Inline submission form");
        actions.attachUserAdminSubmitGuards?.(formio, formMeta);

        state.inlineFormInstance = formio;
        state.inlineFormSubmissionId = id;
        state.inlineFormContainerEl = container;

        await actions.safeSetSubmission?.(formio, submission);

        // When the user clicks the "Upload file(s)" button
        formio.on("s3Upload", () => {
            handleS3Upload(formio, formMeta);
        });

        if (!readOnly) {
            formio.on("submitDone", async () => {
                actions.showToast?.(
                    "Submission updated successfully.",
                    "success"
                );
                actions.destroyInlineForm?.();
                detailRow.classList.add("d-none");
                await loadSubmissions(
                    formMeta,
                    effectivePerms,
                    currentUser
                );
            });
        }
    } catch (e) {
        console.error(
            "openInlineSubmissionForm error",
            e
        );
        container.innerHTML =
            '<div class="alert alert-danger small mb-0">Unable to load submission.</div>';
    }
}

export async function startEditSubmission(submission) {
    const { actions, state } = getAppBridge();
    const editBanner = $("editBanner");
    const editBannerText = $("editBannerText");

    if (!state.currentFormInstance) {
      actions.showToast?.("Form is not ready yet. Please wait and try again.", "warning");
      return;
    }

    const originalSubmission = cloneSubmission(state.currentFormInstance?.submission || {});

    state.isEditing = true;
    state.editingSubmissionId = submission?._id || null;
    if (editBannerText) editBannerText.textContent = "Editing submission…";
    if (editBanner) editBanner.classList.remove("d-none");

    // Ensure the create panel is visible while editing.
    actions.setCreateToggleEnabled?.(true);
    actions.setCreateCollapsed?.(false);

    try {
        // Recreate form instance in editable mode with submission data
        await actions.createMainFormInstance?.(state.currentFormMeta, false, submission || {});
        
        // Store original submission for potential restoration
        state.originalSubmissionData = originalSubmission;
    } catch (error) {
        console.error('Error setting submission data:', error);
        actions.showToast?.("Error loading submission data", "danger");
    }
}

export async function startViewSubmission(submission) {
    const { actions, state } = getAppBridge();
    const editBanner = $("editBanner");
    const editBannerText = $("editBannerText");
    const cancelEditBtn = $("cancelEditBtn");

    if (!state.currentFormInstance) {
      actions.showToast?.("Form is not ready yet. Please wait and try again.", "warning");
      return;
    }

    state.isEditing = false; // Not editing, just viewing
    state.editingSubmissionId = submission?._id || null;
    if (editBannerText) editBannerText.textContent = "Viewing (read-only)";
    if (cancelEditBtn) cancelEditBtn.textContent = "Close";
    if (editBanner) editBanner.classList.remove("d-none");

    // Ensure the create panel is visible while viewing.
    actions.setCreateToggleEnabled?.(true);
    actions.setCreateCollapsed?.(false);

    const originalSubmission = cloneSubmission(state.currentFormInstance?.submission || {});
    
    try {
        // Recreate form instance in read-only mode with submission data
        await actions.createMainFormInstance?.(state.currentFormMeta, true, submission || {});
        
        // Store original submission for potential restoration
        state.originalSubmissionData = originalSubmission;
        
    } catch (error) {
        console.error('Error setting submission data:', error);
        actions.showToast?.("Error loading submission data", "danger");
    }
}

// Wire up event handlers for table view (moved from renderSubmissionsTable)
async function wireTableEventHandlers(subs, formMeta, user, permissions) {
    const { actions, state } = getAppBridge();
    const subsList = $("subsList");
    
    const currentUserId = user?._id || null;
    const perms = permissions || state.currentSubmissionPermissions || {
        canReadAll: true,
        canReadOwn: true,
    };

    const isUserResource = String(formMeta?.path || "").toLowerCase() === "user";
    
    // Check if current user can create role management forms
    const currentUser = await getCurrentUserWithRoles();
    
    // Get permissions for roleMgmt and roleMgmtAdmin forms
    const { getSubmissionPermissions } = await import('../services/rbacService.js');
    const { formioRequest } = await import('../services/formioService.js');
    
    // Fetch actual form definitions to get real permissions
    let roleMgmtPerms = { canCreateAll: false, canCreateOwn: false };
    let roleMgmtAdminPerms = { canCreateAll: false, canCreateOwn: false };
    
    try {
        // Try to fetch roleMgmt form
        const roleMgmtForm = await formioRequest('/rolemgmt', { method: 'GET' });
        if (roleMgmtForm) {
            roleMgmtPerms = getSubmissionPermissions(currentUser, roleMgmtForm, { isAdmin: state.adminMode });
        }
    } catch (e) {
        console.warn('Could not fetch roleMgmt form, using defaults:', e);
        roleMgmtPerms = getSubmissionPermissions(currentUser, {
            submissionAccess: [
                { type: "create_all", roles: ["management", "staff", "administrator"] },
                { type: "create_own", roles: ["management", "staff", "administrator"] }
            ]
        }, { isAdmin: state.adminMode });
    }
    
    try {
        // Try to fetch roleMgmtAdmin form
        const roleMgmtAdminForm = await formioRequest('/rolemgmtadmin', { method: 'GET' });
        if (roleMgmtAdminForm) {
            roleMgmtAdminPerms = getSubmissionPermissions(currentUser, roleMgmtAdminForm, { isAdmin: state.adminMode });
        }
    } catch (e) {
        console.warn('Could not fetch roleMgmtAdmin form, using defaults:', e);
        roleMgmtAdminPerms = getSubmissionPermissions(currentUser, {
            submissionAccess: [
                { type: "create_all", roles: ["administrator"] },
                { type: "create_own", roles: ["administrator"] }
            ]
        }, { isAdmin: state.adminMode });
    }
    
    const canManageRoles = isUserResource && (roleMgmtPerms.canCreateAll || roleMgmtPerms.canCreateOwn);
    const canManageAdminRoles = isUserResource && (roleMgmtAdminPerms.canCreateAll || roleMgmtAdminPerms.canCreateOwn);

    // Wire up inline actions
    subsList
        .querySelectorAll("button[data-action]")
        .forEach((btn) => {
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            const sub = subs.find((s) => s._id === id);
            if (!sub) return;

            btn.addEventListener("click", async () => {
                if (action === "json") {
                    actions.showJsonModal?.(sub.data || {});
                } else if (
                    action === "view" ||
                    action === "edit"
                ) {
                    const mode = action === "edit" ? "edit" : "view";
                    await openInlineSubmissionForm(sub, formMeta, mode, perms, user);
                } else if (action === "delete") {
                    const confirmed = await showConfirm("Delete this submission? This cannot be undone.");
                    if (!confirmed) return;
                    try {
                        const path = String(formMeta?.path || '').replace(/^\/+/, '');
                        await formioRequest(`/${path}/submission/${id}`, { method: "DELETE" });

                        actions.showToast?.("Submission deleted.", "success");
                        await loadSubmissions(formMeta, perms, user);
                    } catch (err) {
                        console.error("deleteSubmission error", err);
                        actions.showToast?.("Error deleting submission.", "danger");
                    }
                } else if (action === "notes") {
                    await openInlineNotesView(sub, formMeta, user);
                } else if (action === "role-mgmt" || action === "role-mgmt-admin") {
                    if (action === "role-mgmt" && !canManageRoles) return;
                    if (action === "role-mgmt-admin" && !canManageAdminRoles) return;
                    const variant = action === "role-mgmt-admin" ? "roleMgmtAdmin" : "roleMgmt";
                    await openRoleMgmtModal({
                        targetUserSubmission: sub,
                        variant,
                        onSaved: async () => {
                            actions.showToast?.("Roles updated successfully", "success");
                            await loadSubmissions(formMeta, perms, user);
                        },
                    });
                }
            });
    });
}

export { openInlineSubmissionForm };
