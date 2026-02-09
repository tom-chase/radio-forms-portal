// app/js/main.js

import { initDebugFlag, isDebug, log } from './utils/logger.js';
import { userIsAdmin } from './services/rbacService.js';
import { setAppBridge, getAppBridge } from './services/appBridge.js';
import { CONFIG } from "./config.js";
import { loadRoles } from "./features/admin/roles.js";
import {
    initFormioService,
    buildUrl,
    formioRequest,
    getToken,
    clearToken,
    logout as formioLogout
    } from './services/formioService.js';
import { 
    loadForms, renderFormsList, renderForm, populateBuilderFormSelect, createMainFormInstance, getFormDisplayTitle
    } from "./features/forms.js?v=2.19";
import { 
    renderSubmissionsTable, loadSubmissions, startEditSubmission
    } from "./features/submissions.js?v=2.19";
import {
    getCurrentUserWithRoles,
    clearUserSessionCache
    } from './services/sessionService.js';

// New ES modules for UI state and utilities
import { uiState, setUIState, getUIState } from './state/uiState.js';
import { domElements, bootstrapInstances } from './ui/domElements.js';
import { showToast, showJsonModal, setJsonModalTitle, escapeHTML, slugify, parseTagsInput, normalizeArray, intersects, extractPlainTextFromHtml, formatSummaryValue, destroyInlineForm, destroyUserEditModalForm, stripEmptyPassword, show, hide, isHidden } from './ui/uiUtils.js';
import { showSuccess, showAlert, showPrompt, showConfirm, showValidationError } from './ui/modalUtils.js';
import { initCollapseEvents, syncFormsCollapseUI, setFormsCollapsed, syncCreateCollapseUI, setCreateCollapsed, setCreateToggleEnabled, syncSubsCollapseUI, setSubsCollapsed, syncAdminImportCollapseUI, setAdminToolsButtonState } from './ui/collapseUI.js';
import { attachFormioErrorHandler, attachUserAdminSubmitGuards, addAttachmentToFormData, destroyLoginForm, renderLoginForm } from './ui/formManagement.js';
import { rebuildBuilder, mergeForSave } from './ui/builderUI.js';    

initDebugFlag();
log.debug('Debug logging enabled');
if (isDebug()) {
  console.log('%c Radio Forms Portal v2.15 (Groups Prefill) Loaded ', 'background: #222; color: #bada55; padding: 4px;');
}

initFormioService({
  // In your CE setup (no /project/<id> path), baseUrl and projectUrl are the same.
  baseUrl: CONFIG.API_BASE,       // e.g. 'https://api.forms.your-domain.com'
  projectUrl: CONFIG.API_BASE,
  onAuthFailure: (err) => {
    log.warn('Auth failure; forcing login UI', { status: err.status });
    // Expired / invalid token → trigger full logout so the login form loads
    if (domElements.logoutBtn) domElements.logoutBtn.click();
  }
});

// Login state (kept in main.js as it's core app state)
// Note: We now use single /user/login form for all users

// Initialize collapse events
initCollapseEvents();

// User edit modal event wiring
if (domElements.userEditModalEl) {
    domElements.userEditModalEl.addEventListener("hidden.bs.modal", () => {
        destroyUserEditModalForm();
    });
}

let currentUserObj = null;

async function initLoginForm() {
    await renderLoginForm();
}

// Session bootstrap
async function initSession() {
    // 1) Only this block decides "signed in vs signed out".
    let user = null;
    try {
      user = await getCurrentUserWithRoles({ force: true });
    } catch (e) {
      console.warn("Current user lookup failed", e);
      user = null;
    }

    // 2) Signed out path
    if (!user) {
      // Ensure no stale token blocks rendering /user/login
      try { clearToken(); } catch {}
      try { Formio.setUser(null); } catch {}
      
      // Reset UI state
      setUIState('adminMode', false);
      setUIState('allVisibleForms', []);
      
      // Hide admin tools button for signed-out users
      setAdminToolsButtonState({ visible: false, enabled: false, title: "Admin tools" });
      
      destroyLoginForm();
      destroyBuilder();
      show(domElements.loginSection);
      hide(domElements.appSection);
      await initLoginForm();
      return;
    }

    // 3) Signed in UI path (do not let RBAC/forms load failures bounce us back to login)
    Formio.setUser(user);
    const email = user.data?.email || user.email || "user";
    domElements.statusEl.textContent = `Signed in as ${email}`;
    setUIState('currentUserObj', user);

    show(domElements.logoutBtn);
    hide(domElements.loginSection);
    show(domElements.appSection);

    setFormsCollapsed(false);
    setCreateCollapsed(true);
    setCreateToggleEnabled(false, "Select a form to create a new submission.");

    // 4) Admin check is best-effort (never throw user back to login UI)
    const defaultAdminTitle = "Admin tools";
    try {
      const adminCheck = await userIsAdmin(user);
      setUIState('adminMode', !!adminCheck.isAdmin);

      if (getUIState('adminMode')) {
        setAdminToolsButtonState({ visible: true, enabled: true, title: defaultAdminTitle });
      } else {
        if (adminCheck.warning) {
          setAdminToolsButtonState({ visible: true, enabled: false, title: adminCheck.warning });
        } else {
          setAdminToolsButtonState({ visible: false, enabled: false, title: defaultAdminTitle });
        }
        hide(domElements.adminSection);
      }
    } catch (e) {
      console.warn("Admin check failed; leaving user signed in but disabling admin tools", e);
      setUIState('adminMode', false);
      setAdminToolsButtonState({
        visible: true,
        enabled: false,
        title: "Admin tools unavailable (unable to verify roles)."
      });
      hide(domElements.adminSection);
      destroyBuilder();
    }

    // 5) Load forms is also best-effort (show toast but keep session)
    try {
      const maybeForms = await loadForms();
      // If your feature returns forms, keep main.js's local cache in sync.
      if (Array.isArray(maybeForms)) setUIState('allVisibleForms', maybeForms);
    } catch (e) {
      console.warn("loadForms failed", e);
      showToast("Signed in, but unable to load forms list.", "warning");
    }
}


// Logout clears token and user
domElements.logoutBtn.addEventListener("click", async () => {
    try {
        await formioLogout();
    } catch {}
    try { Formio.setUser(null); } catch {}
    try { localStorage.removeItem("formioToken"); } catch {}
    clearUserSessionCache();
    setUIState('currentUserObj', null);

    // Destroy active Form.io instances FIRST (before nulling/resetting state)
    destroyInlineForm();
    destroyMainForm();
    destroyBuilder();

    // Reset UI state
    domElements.formsList.innerHTML = "";
    domElements.formRender.innerHTML =
        '<p class="text-muted mb-0 small">Choose a form from the left to begin.</p>';
    domElements.subsList.innerHTML =
        '<p class="text-muted small px-3 pt-3 mb-0">No form selected.</p>';
    domElements.formTitle.textContent = "Select a form";
    domElements.formTagBadge.textContent = "";
    hide(domElements.formTagBadge);
    hide(domElements.editBanner);
    setUIState('isEditing', false);
    setUIState('editingSubmissionId', null);
    setUIState('currentFormMeta', null);
    setUIState('currentSubmissionsFormio', null);
    setUIState('currentSubmissions', []);

    if (domElements.formsSearchInput) domElements.formsSearchInput.value = "";
    if (domElements.subsSearchInput) domElements.subsSearchInput.value = "";

    // Admin / builder reset
    setUIState('adminMode', false);
    hide(domElements.adminToolsBtn);
    hide(domElements.adminSection);
    
    setFormsCollapsed(false);
    setCreateCollapsed(true);
    setCreateToggleEnabled(false, "Select a form to create a new submission.");


    domElements.statusEl.textContent = "Not signed in";
    hide(domElements.logoutBtn);
    show(domElements.loginSection);
    hide(domElements.appSection);

    await initLoginForm();
});

// Search/filter forms
if (domElements.formsSearchInput) domElements.formsSearchInput.addEventListener("input", () => {
    const term =
        domElements.formsSearchInput.value
            .trim()
            .toLowerCase();
    if (!term) {
        renderFormsList(getUIState('allVisibleForms'));
        return;
    }
    const filtered = getUIState('allVisibleForms').filter(
        (f) => {
            const label = getFormDisplayTitle(f).toLowerCase();
            return label.includes(term);
        }
    );
    renderFormsList(filtered);
});

// Filter submissions (client-side)
if (domElements.subsSearchInput) {
    domElements.subsSearchInput.addEventListener(
        "input",
        async () => {
            if (
                !getUIState('currentFormMeta') ||
                !getUIState('currentSubmissions') ||
                !getUIState('currentSubmissions').length
            ) {
                return;
            }
            const term =
                domElements.subsSearchInput.value
                    .trim()
                    .toLowerCase();
            if (!term) {
                await renderSubmissionsTable(
                    getUIState('currentSubmissions'),
                    getUIState('currentFormMeta'),
                    getUIState('currentUserObj'),
                    getUIState('currentSubmissionPermissions')
                );
                return;
            }

            const filtered =
                getUIState('currentSubmissions').filter(
                    (s) => {
                        const when =
                            new Date(
                                s.created
                            )
                                .toLocaleString()
                                .toLowerCase();
                        const owner = (
                            s.owner || ""
                        ).toLowerCase();
                        const dataStr =
                            JSON.stringify({});

                        return (
                            when.includes(
                                term
                            ) ||
                            owner.includes(
                                term
                            ) ||
                            dataStr.includes(
                                term
                            )
                        );
                    }
                );

            await renderSubmissionsTable(
                filtered,
                getUIState('currentFormMeta'),
                getUIState('currentUserObj'),
                getUIState('currentSubmissionPermissions')
            );
        }
    );
}

async function safeSetSubmission(formio, submission) {
    if (!formio) return;
    const sub = submission || {};

    if (typeof formio.setSubmission === "function") {
        await formio.setSubmission(sub);
        return;
    }

    // Fallback for older/different formio builds
    formio.submission = sub;
    if (typeof formio.redraw === "function") {
        formio.redraw();
    }
}

domElements.cancelEditBtn.addEventListener("click", async () => {
    const currentFormInstance = getUIState('currentFormInstance');
    if (!currentFormInstance) return;
    
    const isEditing = getUIState('isEditing');
    const editingSubmissionId = getUIState('editingSubmissionId');
    const originalSubmissionData = getUIState('originalSubmissionData');
    
    // Reset editing state
    setUIState('isEditing', false);
    setUIState('editingSubmissionId', null);
    setUIState('originalSubmissionData', null);
    if (domElements.cancelEditBtn) {
        domElements.cancelEditBtn.textContent = "Cancel edit";
    }
    
    // Reset form to clean state (editable, empty or restored draft)
    const currentFormMeta = getUIState('currentFormMeta');
    if (currentFormMeta) {
        try {
            await createMainFormInstance(currentFormMeta, false, originalSubmissionData || {});
        } catch (e) {
            console.error("Error resetting form on cancel", e);
            // Fallback to safeSetSubmission if recreation fails
            await safeSetSubmission(currentFormInstance, originalSubmissionData || {});
        }
    }
    
    // Hide edit banner
    hide(domElements.editBanner);
    
    // Close create panel after cancel
    const { actions } = getAppBridge?.() || {};
    if (actions) {
        const perms = getUIState('currentSubmissionPermissions');
        const canCreate = !!(perms && (perms.canCreateAll || perms.canCreateOwn));
        if (canCreate) {
            actions.setCreateToggleEnabled?.(true);
        } else {
            actions.setCreateToggleEnabled?.(
                false,
                "You do not have permission to create new submissions for this form."
            );
        }
        actions.setCreateCollapsed?.(true);
    }
});

function destroyMainForm() {
    const currentFormInstance = getUIState('currentFormInstance');
    if (currentFormInstance && typeof currentFormInstance.destroy === "function") {
        try {
            currentFormInstance.destroy(true);
        } catch (e) {
            console.warn("Error destroying main form instance", e);
        }
    }
    setUIState('currentFormInstance', null);
}

function destroyBuilder() {
    const currentBuilder = getUIState('currentBuilder');
    if (currentBuilder && typeof currentBuilder.destroy === "function") {
        try {
            currentBuilder.destroy(true);
        } catch (e) {
            console.warn("Error destroying builder instance", e);
        }
    }
    setUIState('currentBuilder', null);
    setUIState('builderCurrentFormio', null);
    setUIState('builderIsNew', false);
    setUIState('builderCurrentFormId', null);
    setUIState('builderLoadedFormDef', null);
    if (domElements.builderSaveBtn) domElements.builderSaveBtn.disabled = true;
    if (domElements.builderContainer) {
        domElements.builderContainer.innerHTML =
            '<p class="text-muted small mb-0">Select a form above or create a new one to start the builder.</p>';
    }
    if (domElements.builderMetaPanel) {
        domElements.builderMetaPanel.classList.add("d-none");
        domElements.builderMetaPanel.innerHTML = "";
    }
}

if (domElements.adminToolsBtn) {
    domElements.adminToolsBtn.addEventListener("click", async () => {
        // Guard: never open Admin Tools unless adminMode is true.
        if (!getUIState('adminMode')) {
            showToast("Admin tools are unavailable for your account (roles not loaded or not authorized).", "warning");
            return;
        }
        
        if (isHidden(domElements.adminSection)) {
            // First time opening Admin Tools - load all data
            show(domElements.adminSection);
            hide(domElements.appSection); // hide user-facing dashboard while in Admin Tools mode
            domElements.adminToolsBtn.classList.add("active");
            
            // Load initial data for all admin panels
            try {
                await Promise.all([
                    loadRoles(false),    // Load roles list
                    loadForms()         // Load forms list
                ]);
                
                // Populate builder form select after forms are loaded
                if (getUIState('adminMode')) {
                    populateBuilderFormSelect();
                }
            } catch (e) {
                console.warn("Failed to load initial admin data:", e);
                showToast("Some admin data failed to load. Use refresh buttons.", "warning");
            }
        } else {
            hide(domElements.adminSection);
            show(domElements.appSection);
            domElements.adminToolsBtn.classList.remove("active");
        }
        bootstrap.Collapse
                .getOrCreateInstance(domElements.adminToolsCollapseEl, { toggle: false })
                .show();
        domElements.adminSection.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    });
}

async function loadFormIntoBuilder(formId) {
    destroyBuilder();
    if (!formId || !domElements.builderContainer) return;

    domElements.builderContainer.innerHTML =
        '<div class="text-center py-3">' +
        '<div class="spinner-border spinner-border-sm text-secondary" role="status">' +
        '<span class="visually-hidden">Loading builder...</span>' +
        "</div></div>";

    try {
        const formDef = await formioRequest(`/form/${formId}`, { method: "GET" });
        setUIState('builderCurrentFormId', formId);
        setUIState('builderLoadedFormDef', formDef);
        setUIState('builderIsNew', false);

        await rebuildBuilder(formDef, { keepLoadedDef: true });

        if (domElements.builderSaveBtn) domElements.builderSaveBtn.disabled = false;

        showToast(
            `Loaded form "${formDef.title || formDef.name || formDef.path}" into builder.`,
            "info"
        );
    } catch (e) {
        console.error("loadFormIntoBuilder error", e);
        domElements.builderContainer.innerHTML =
            '<div class="alert alert-danger small mb-0">Error loading form for builder.</div>';
    }
}

if (domElements.builderFormSelect) {
    domElements.builderFormSelect.addEventListener("change", async () => {
        const formId = domElements.builderFormSelect.value;
        if (!formId) {
            destroyBuilder();
            return;
        }
        await loadFormIntoBuilder(formId);
    });
}

async function createNewFormOrResource(type) {
    if (!domElements.builderContainer) return;

    const typeLabel = type === "resource" ? "resource" : "form";

    const title = await showPrompt(
        `Enter a title for the new ${typeLabel}:`
    );
    if (!title) return;

    const pathInput = await showPrompt(
        `Enter a unique path (URL segment) for this ${typeLabel}, e.g. "tasks":`
    );
    if (!pathInput) return;

    const path = slugify(pathInput);
    const name = slugify(title);

    const baseDef = {
        title,
        name,
        path,
        type: type === "resource" ? "resource" : "form",
        display: "form",
        components: [
            {
                type: "textfield",
                key: "title",
                label: "Title",
                input: true,
                validate: { required: true },
            },
            {
                type: "textarea",
                key: "details",
                label: "Details",
                editor: "ckeditor", // uses your custom ckeditor.js
                input: true,
            },
            {
                type: "button",
                action: "submit",
                label: "Submit",
                theme: "primary",
                input: true,
                key: "submit",
            },
        ],
        tags: [],
        access: [],
        submissionAccess: [],
    };

    destroyBuilder();
    setUIState('builderCurrentFormio', null);
    setUIState('builderCurrentFormId', null);
    setUIState('builderLoadedFormDef', baseDef);
    setUIState('builderIsNew', true);

    try {
        await rebuildBuilder(baseDef, { keepLoadedDef: true });
        if (domElements.builderSaveBtn) domElements.builderSaveBtn.disabled = false;

        showToast(
            `New ${typeLabel} scaffold created in builder. Use the Form Settings tab to fine-tune details, then click Save.`,
            "info"
        );
    } catch (e) {
        console.error("createNewFormOrResource error", e);
        domElements.builderContainer.innerHTML =
            '<div class="alert alert-danger small mb-0">Error creating new form/resource in builder.</div>';
    }
}

if (domElements.builderNewFormBtn) {
    domElements.builderNewFormBtn.addEventListener("click", async () => {
        await createNewFormOrResource("form");
    });
}

if (domElements.builderNewResourceBtn) {
    domElements.builderNewResourceBtn.addEventListener("click", async () => {
        await createNewFormOrResource("resource");
    });
}

if (domElements.builderSaveBtn) {
    domElements.builderSaveBtn.addEventListener("click", async () => {
        const currentBuilder = getUIState('currentBuilder');
        const builderLoadedFormDef = getUIState('builderLoadedFormDef');
        const builderIsNew = getUIState('builderIsNew');
        const builderCurrentFormId = getUIState('builderCurrentFormId');
        if (!currentBuilder) return;

        const edited = currentBuilder.form || {};
        const formToSave = mergeForSave(builderLoadedFormDef, edited);
        if (!formToSave.path || !formToSave.name) {
            showValidationError(
                'Form definition must include at least "path" and "name". Please open the "Form Settings" tab in the builder and set them.'
            );
            return;
        }

        try {
            let saved;
            // IMPORTANT: builderCurrentFormio is not a reliable "loaded vs new" flag.
            // Use builderIsNew / builderCurrentFormId instead.
            if (builderIsNew || !builderCurrentFormId) {      // New form/resource: POST to /form
                saved = await formioRequest("/form", {
                    method: "POST",
                    data: formToSave
                });
                showToast("New form/resource created.", "success");
            } else {
                // Existing form/resource: save via Formio instance
                saved = await formioRequest(`/form/${builderCurrentFormId}`, {
                    method: "PUT",
                    data: formToSave
                });
                showToast("Form/resource saved.", "success");
            }

            // Refresh forms list and builder dropdown
            await loadForms();
            if (getUIState('adminMode')) populateBuilderFormSelect();

            // Update builder state to reference saved form
            setUIState('builderIsNew', false);
            setUIState('builderCurrentFormId', saved._id);
            setUIState('builderLoadedFormDef', saved);
            if (domElements.builderFormSelect) {
                domElements.builderFormSelect.value = saved._id;
            }
        } catch (e) {
            console.error("Error saving form/resource", e);
            showToast(
                "Error saving form/resource. See console for details.",
                "danger"
            );
        }
    });
}

if (importJsonBtn) {
    importJsonBtn.addEventListener("click", async () => {
        try {
            // Helper: normalize imported form path
            const normalizeFormPath = (p) => {
                // Form.io form.path should not start with "/"
                return String(p || "").trim().replace(/^\/+/, "");
            };

            // Helper: find an existing form by path
            const findExistingFormByPath = async (path) => {
                if (!path) return null;
                const res = await formioRequest("/form", {
                    method: "GET",
                    query: { limit: 1, select: "_id,title,name,path,type", path }
                });
                return Array.isArray(res) && res.length ? res[0] : null;
            };

            let jsonText = importJsonText.value.trim();
            const file =
                importJsonFile && importJsonFile.files
                    ? importJsonFile.files[0]
                    : null;

            if (file) {
                jsonText = await file.text();
            }

            if (!jsonText) {
                alert(
                    "Please select a JSON file or paste JSON into the text area."
                );
                return;
            }

            let def;
            try {
                def = JSON.parse(jsonText);
            } catch (e) {
                alert("JSON parse error: " + e.message);
                return;
            }

            if (!def.path || !def.name) {
                alert(
                    'Imported JSON must at least contain "name" and "path" properties.'
                );
                return;
            }

            // Ensure required fields are present
            if (!def.title) {
                def.title = def.name; // Use name as fallback for title
            }

            def.path = normalizeFormPath(def.path);

            const overwrite =
                domElements.importOverwriteCheckbox &&
                domElements.importOverwriteCheckbox.checked;

            let saved;
            if (overwrite) {
                const existingForm = await findExistingFormByPath(def.path);
                if (existingForm?._id) {
                    saved = await formioRequest(`/form/${existingForm._id}`, {
                        method: "PUT",
                        data: { ...def, _id: existingForm._id }
                    });
                } else {
                    saved = await formioRequest("/form", { method: "POST", data: def });
                }
            } else {
                saved = await formioRequest("/form", { method: "POST", data: def });
            }

            showToast(
                `Form/resource "${saved.title || saved.name || saved.path}" imported.`,
                "success"
            );

            if (domElements.importJsonFile) domElements.importJsonFile.value = "";
            if (domElements.importJsonText) domElements.importJsonText.value = "";
            if (domElements.importOverwriteCheckbox)
                domElements.importOverwriteCheckbox.checked = false;

            await loadForms();
            if (getUIState('adminMode')) populateBuilderFormSelect();
        } catch (e) {
            console.error("Import JSON error", e);
            showToast(
                "Error importing JSON definition. See console for details.",
                "danger"
            );
        }
    });
}

async function openUserInForm(userSubmission) {
    try {
        // Try to find the User form in the cached forms list
        let userFormMeta =
        getUIState('allVisibleForms').find((f) => f.path === "user" || f.name === "user");

        if (!userFormMeta) {
            // Fallback: reload forms from API and try again
            const forms = await formioRequest('/form', {
                method: 'GET',
                query: { limit: 500, select: 'title,path,name,access,submissionAccess,tags,_id' }
            });
            setUIState('allVisibleForms', forms || []);
            userFormMeta =
                getUIState('allVisibleForms').find((f) => f.path === "user" || f.name === "user");
        }

        if (!userFormMeta) {
            showToast(
                "User form/resource not found. Make sure the User resource is visible to admin.",
                "danger"
            );
            return;
        }

        // Render the /user form in the main Form card
        await renderForm(userFormMeta);

        // Load the selected user's submission into that form for editing
        await startEditSubmission(userSubmission);
    } catch (e) {
        console.error("openUserInForm error", e);
        showToast("Error opening user in form. See console for details.", "danger");
    }
}

if (rolesRefreshBtn) {
    rolesRefreshBtn.addEventListener("click", async () => {
        await loadRoles(true);
    });
}

if (domElements.rolesNewBtn) {
    domElements.rolesNewBtn.addEventListener("click", async () => {
        const title = await showPrompt("Enter a title for the new role (e.g., Underwriting):");
        if (!title) return;

        const machineInput = await showPrompt(
            'Enter a machine name (no spaces, e.g., "underwriting"), or leave blank to use a slug of the title:'
        );
        const machineName = (machineInput || slugify(title)).trim();
        const description =
        await showPrompt("Optional: description for this role:", "") || "";

        const makeAdmin = await showConfirm(
            "Should this role have full administrator privileges?\n\nOK = Yes, Cancel = No"
        );
        if (!makeAdmin) return;

        const body = {
            title: title.trim(),
            description: description.trim(),
            admin: !!makeAdmin,
            default: false,
            machineName
        };

        try {
            await formioRequest('/role', {
                method: "POST",
                data: body
            });
            showToast("Role created.", "success");
            await loadRoles(true);
        } catch (e) {
            console.error("Error creating role", e);
            showToast("Error creating role.", "danger");
        }
    });
}

// ---- App Bridge (transitional shared context for feature modules) ----
// This lets feature modules read/write main.js state in a controlled way,
// without circular imports or relying on window globals.
setAppBridge({
  config: CONFIG,
  // Expose only what features need (you can tighten this over time).
  actions: {
    showToast,
    showJsonModal,
    escapeHTML,
    formatSummaryValue,
    attachFormioErrorHandler,
    attachUserAdminSubmitGuards,
    safeSetSubmission,
    destroyInlineForm,
    destroyMainForm,
    setCreateCollapsed,
    setCreateToggleEnabled,
    addAttachmentToFormData,
    createMainFormInstance,

  },
  state: {
    get adminMode() { return getUIState('adminMode'); },
    set adminMode(v) { setUIState('adminMode', !!v); },
    get currentUserObj() { return getUIState('currentUserObj'); },
    set currentUserObj(v) { setUIState('currentUserObj', v); },

    get allVisibleForms() { return getUIState('allVisibleForms'); },
    set allVisibleForms(v) { setUIState('allVisibleForms', Array.isArray(v) ? v : []); },

    get currentFormInstance() { return getUIState('currentFormInstance'); },
    set currentFormInstance(v) { setUIState('currentFormInstance', v); },

    get currentFormMeta() { return getUIState('currentFormMeta'); },
    set currentFormMeta(v) { setUIState('currentFormMeta', v); },

    get currentSubmissionsFormio() { return getUIState('currentSubmissionsFormio'); },
    set currentSubmissionsFormio(v) { setUIState('currentSubmissionsFormio', v); },

    get currentSubmissions() { return getUIState('currentSubmissions'); },
    set currentSubmissions(v) { setUIState('currentSubmissions', Array.isArray(v) ? v : []); },

    get currentSubmissionPermissions() { return getUIState('currentSubmissionPermissions'); },
    set currentSubmissionPermissions(v) { setUIState('currentSubmissionPermissions', v); },

    get currentSubmissionView() { return getUIState('currentSubmissionView'); },
    set currentSubmissionView(v) { setUIState('currentSubmissionView', v); },

    get originalSubmissionData() { return getUIState('originalSubmissionData'); },
    set originalSubmissionData(v) { setUIState('originalSubmissionData', v); },

    get currentDayPilotFormMeta() { return getUIState('currentDayPilotFormMeta'); },
    set currentDayPilotFormMeta(v) { setUIState('currentDayPilotFormMeta', v); },

    get currentDayPilotUser() { return getUIState('currentDayPilotUser'); },
    set currentDayPilotUser(v) { setUIState('currentDayPilotUser', v); },

    get currentDayPilotPermissions() { return getUIState('currentDayPilotPermissions'); },
    set currentDayPilotPermissions(v) { setUIState('currentDayPilotPermissions', v); },

    get dayPilotConfig() { return getUIState('dayPilotConfig'); },
    set dayPilotConfig(v) { setUIState('dayPilotConfig', v); },

    get inlineFormInstance() { return getUIState('inlineFormInstance'); },
    set inlineFormInstance(v) { setUIState('inlineFormInstance', v); },

    get inlineFormSubmissionId() { return getUIState('inlineFormSubmissionId'); },
    set inlineFormSubmissionId(v) { setUIState('inlineFormSubmissionId', v); },

    get inlineFormContainerEl() { return getUIState('inlineFormContainerEl'); },
    set inlineFormContainerEl(v) { setUIState('inlineFormContainerEl', v); },

    get isEditing() { return getUIState('isEditing'); },
    set isEditing(v) { setUIState('isEditing', !!v); },

    get editingSubmissionId() { return getUIState('editingSubmissionId'); },
    set editingSubmissionId(v) { setUIState('editingSubmissionId', v); },

    get currentBuilder() { return getUIState('currentBuilder'); },
    set currentBuilder(v) { setUIState('currentBuilder', v); },

    get builderCurrentFormio() { return getUIState('builderCurrentFormio'); },
    set builderCurrentFormio(v) { setUIState('builderCurrentFormio', v); },

    get builderIsNew() { return getUIState('builderIsNew'); },
    set builderIsNew(v) { setUIState('builderIsNew', v); },

    get builderCurrentFormId() { return getUIState('builderCurrentFormId'); },
    set builderCurrentFormId(v) { setUIState('builderCurrentFormId', v); },

    get builderLoadedFormDef() { return getUIState('builderLoadedFormDef'); },
    set builderLoadedFormDef(v) { setUIState('builderLoadedFormDef', v); },

    get allVisibleFormsById() { return getUIState('allVisibleFormsById'); },
    set allVisibleFormsById(v) { setUIState('allVisibleFormsById', v); },

    get userEditFormInstance() { return getUIState('userEditFormInstance'); },
    set userEditFormInstance(v) { setUIState('userEditFormInstance', v); },

    get loginFormInstance() { return getUIState('loginFormInstance'); },
    set loginFormInstance(v) { setUIState('loginFormInstance', v); },
  }
});

// Kick things off
initSession();
