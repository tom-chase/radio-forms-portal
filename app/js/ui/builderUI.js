// app/js/ui/builderUI.js

import { domElements } from './domElements.js';
import { showJsonModal, setJsonModalTitle, showToast, escapeHTML, parseTagsInput } from './uiUtils.js';
import { formioRequest } from '../services/formioService.js';
import { getUIState, setUIState } from '../state/uiState.js';

export function renderBuilderMetaPanel(formDef) {
    if (!domElements.builderMetaPanel) return;
    if (!formDef) {
        domElements.builderMetaPanel.classList.add("d-none");
        domElements.builderMetaPanel.innerHTML = "";
        return;
    }

    const tagsStr = Array.isArray(formDef.tags) ? formDef.tags.join(", ") : "";

    domElements.builderMetaPanel.classList.remove("d-none");
    domElements.builderMetaPanel.innerHTML = `
    <div class="card border-0 shadow-sm">
        <div class="card-body p-2">
        <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div class="fw-semibold">
            <i class="bi bi-info-circle me-1"></i> Metadata
            </div>
            <div class="d-flex gap-2 flex-wrap">
            <button type="button" id="builderViewJsonBtn" class="btn btn-outline-secondary btn-sm">
                <i class="bi bi-braces me-1"></i> View JSON
            </button>
            <button type="button" id="builderEditJsonBtn" class="btn btn-outline-secondary btn-sm">
                <i class="bi bi-pencil me-1"></i> Edit JSON
            </button>
            <button type="button" id="builderVerifyServerJsonBtn" class="btn btn-outline-secondary btn-sm">
                <i class="bi bi-cloud-check me-1"></i> Verify server JSON
            </button>
            <button type="button" id="builderToggleDisplayBtn" class="btn btn-outline-secondary btn-sm">
                <i class="bi bi-signpost-2 me-1"></i> Toggle display
            </button>
            </div>
        </div>

        <div class="row g-2 mt-1">
            <div class="col-12 col-md-6">
            <label class="form-label mb-1 small">Title</label>
            <input id="builderMetaTitle" class="form-control form-control-sm" value="${escapeHTML(formDef.title || "")}">
            </div>
            <div class="col-12 col-md-3">
            <label class="form-label mb-1 small">Name</label>
            <input id="builderMetaName" class="form-control form-control-sm" value="${escapeHTML(formDef.name || "")}">
            </div>
            <div class="col-12 col-md-3">
            <label class="form-label mb-1 small">Path</label>
            <input id="builderMetaPath" class="form-control form-control-sm" value="${escapeHTML(formDef.path || "")}">
            </div>

            <div class="col-12 col-md-3">
            <label class="form-label mb-1 small">Type</label>
            <select id="builderMetaType" class="form-select form-select-sm">
                <option value="form" ${formDef.type === "form" ? "selected" : ""}>form</option>
                <option value="resource" ${formDef.type === "resource" ? "selected" : ""}>resource</option>
            </select>
            </div>
            <div class="col-12 col-md-3">
            <label class="form-label mb-1 small">Display</label>
            <select id="builderMetaDisplay" class="form-select form-select-sm">
                <option value="form" ${(formDef.display || "form") === "form" ? "selected" : ""}>form</option>
                <option value="wizard" ${(formDef.display || "form") === "wizard" ? "selected" : ""}>wizard</option>
            </select>
            </div>
            <div class="col-12 col-md-6">
            <label class="form-label mb-1 small">Tags (comma-separated)</label>
            <input id="builderMetaTags" class="form-control form-control-sm" value="${escapeHTML(tagsStr)}" placeholder="underwriting, ops, internal">
            </div>

            <div class="col-12 col-md-4">
            <label class="form-label mb-1 small">_id</label>
            <input class="form-control form-control-sm" value="${escapeHTML(formDef._id || "")}" disabled>
            </div>
            <div class="col-12 col-md-4">
            <label class="form-label mb-1 small">Owner</label>
            <input class="form-control form-control-sm" value="${escapeHTML(formDef.owner || "")}" disabled>
            </div>
            <div class="col-12 col-md-4">
            <label class="form-label mb-1 small">Created / Modified</label>
            <input class="form-control form-control-sm" value="${escapeHTML((formDef.created || "") + " / " + (formDef.modified || ""))}" disabled>
            </div>
        </div>
        </div>
    </div>
    `;

    // Wire buttons
    const viewBtn = document.getElementById("builderViewJsonBtn");
    const editBtn = document.getElementById("builderEditJsonBtn");
    const toggleBtn = document.getElementById("builderToggleDisplayBtn");
    if (viewBtn) viewBtn.addEventListener("click", showFormDefinitionJson);
    if (editBtn) editBtn.addEventListener("click", openFormJsonEditModal);
    if (toggleBtn) {
        toggleBtn.addEventListener("click", async () => {
            const currentBuilder = getUIState('currentBuilder');
            if (!currentBuilder) return;
            const current = currentBuilder.form?.display || "form";
            const next = current === "wizard" ? "form" : "wizard";
            currentBuilder.form.display = next;
            await rebuildBuilder(currentBuilder.form, { keepLoadedDef: true });
            showToast(`Display set to "${next}".`, "info");
        });
    }

    const verifyBtn = document.getElementById("builderVerifyServerJsonBtn");
    if (verifyBtn) verifyBtn.addEventListener("click", async () => {
        const builderCurrentFormId = getUIState('builderCurrentFormId');
        if (!builderCurrentFormId) return;
        setJsonModalTitle("Server /form/:id JSON");
        try {
            const serverDef = await formioRequest(`/form/${builderCurrentFormId}`, { method: "GET" });

            // Action API scope: actions may not be embedded on the form JSON payload.
            let serverActions = null;
            const candidates = [
                `/form/${builderCurrentFormId}/action`,
                `/form/${builderCurrentFormId}/actions`,
                `/action`
            ];
            for (const url of candidates) {
                try {
                    if (url === '/action') {
                        serverActions = await formioRequest(url, { method: "GET", query: { limit: 1000, form: builderCurrentFormId } });
                    } else {
                        serverActions = await formioRequest(url, { method: "GET" });
                    }
                    break;
                } catch (e) {
                    // try next candidate
                }
            }

            setJsonModalTitle("Server form JSON (+ actions if available)");
            showJsonModal({ form: serverDef, actions: serverActions });

        } catch (e) {
            console.error("Verify server JSON error", e);
            showToast("Unable to fetch server form JSON.", "danger");
        }
    });

    // Wire inputs -> currentBuilder.form
    const titleEl = document.getElementById("builderMetaTitle");
    const nameEl = document.getElementById("builderMetaName");
    const pathEl = document.getElementById("builderMetaPath");
    const typeEl = document.getElementById("builderMetaType");
    const displayEl = document.getElementById("builderMetaDisplay");
    const tagsEl = document.getElementById("builderMetaTags");

    const sync = () => {
        const currentBuilder = getUIState('currentBuilder');
        if (!currentBuilder) return;
        const f = currentBuilder.form || {};
        f.title = (titleEl?.value || "").trim();
        f.name = (nameEl?.value || "").trim();
        f.path = (pathEl?.value || "").trim();
        f.type = typeEl?.value || f.type;
        f.display = displayEl?.value || f.display || "form";
        f.tags = parseTagsInput(tagsEl?.value || "");
        currentBuilder.form = f;
    };

    [titleEl, nameEl, pathEl, typeEl, displayEl, tagsEl].forEach((el) => {
        if (!el) return;
        el.addEventListener("change", sync);
        el.addEventListener("blur", sync);
    });
}

export async function showFormDefinitionJson() {
    const formDef = getBuilderExportDef();
    console.log('showFormDefinitionJson - formDef:', formDef); // Debug log
    
    if (!formDef || Object.keys(formDef).length === 0) {
        showToast("No form definition available to view. Please load or create a form first.", "warning");
        return;
    }
    
    setJsonModalTitle("Form definition JSON");
    showJsonModal(formDef);
}

export async function openFormJsonEditModal() {
    if (!domElements.formJsonEditModalEl || !domElements.formJsonEditTextarea) return;
    
    const formDef = getBuilderExportDef();
    console.log('openFormJsonEditModal - formDef:', formDef); // Debug log
    
    if (!formDef || Object.keys(formDef).length === 0) {
        showToast("No form definition available to edit. Please load or create a form first.", "warning");
        return;
    }
    
    domElements.formJsonEditTextarea.value = JSON.stringify(formDef, null, 2);
    
    // Wire up the apply button
    const applyBtn = document.getElementById("formJsonEditApplyBtn");
    if (applyBtn) {
        // Remove any existing listeners to avoid duplicates
        applyBtn.replaceWith(applyBtn.cloneNode(true));
        const newApplyBtn = document.getElementById("formJsonEditApplyBtn");
        newApplyBtn.addEventListener("click", async () => {
            const jsonText = domElements.formJsonEditTextarea.value;
            await applyJsonToBuilder(jsonText);
            // Close modal after successful apply
            window.bootstrap.Modal.getOrCreateInstance(domElements.formJsonEditModalEl).hide();
        });
    }
    
    window.bootstrap.Modal.getOrCreateInstance(domElements.formJsonEditModalEl).show();
}

export async function applyJsonToBuilder(jsonText) {
    let def;
    try {
        def = JSON.parse(jsonText);
    } catch (e) {
        alert("JSON parse error: " + e.message);
        return;
    }
    
    // Preserve builder state flags; JSON might be for a loaded or new form.
    const builderIsNew = getUIState('builderIsNew');
    const builderCurrentFormId = getUIState('builderCurrentFormId');
    
    // Update the builder with the new definition
    await rebuildBuilder(def, { keepLoadedDef: true });
    
    // Show success message
    showToast("Form JSON applied successfully to builder.", "success");
}

// Builder management
export async function rebuildBuilder(formDef, opts = {}) {
  // Destroy existing builder but keep state variables
  const currentBuilder = getUIState('currentBuilder');
  if (currentBuilder && typeof currentBuilder.destroy === "function") {
    try { currentBuilder.destroy(true); } catch (e) {}
  }
  setUIState('currentBuilder', null);
  if (!domElements.builderContainer) return;

  const Formio = window.Formio; // Global Formio from CDN
  const newBuilder = await Formio.builder(domElements.builderContainer, formDef, {});
  setUIState('currentBuilder', newBuilder);
  
  if (domElements.builderSaveBtn) domElements.builderSaveBtn.disabled = false;
  
  renderBuilderMetaPanel(newBuilder.form || formDef);

  // If requested, keep builderLoadedFormDef around (to preserve actions on save)
  if (!opts.keepLoadedDef) setUIState('builderLoadedFormDef', formDef);
}

// Builder export
export function getBuilderExportDef() {
  const currentBuilder = getUIState('currentBuilder');
  const builderLoadedFormDef = getUIState('builderLoadedFormDef');
  // Prefer merged server+builder so admin-only fields (actions) are retained.
  if (!currentBuilder) return builderLoadedFormDef || {};
  return mergeForSave(builderLoadedFormDef, currentBuilder.form || {});
}

// Builder utilities
export function mergeForSave(serverDef, builderDef) {
    // Start with builder definition (has latest changes)
    const merged = { ...builderDef };
    
    // Preserve critical server fields that shouldn't be overwritten
    if (serverDef._id) merged._id = serverDef._id;
    if (serverDef.created) merged.created = serverDef.created;
    if (serverDef.owner) merged.owner = serverDef.owner;
    if (serverDef.access) merged.access = serverDef.access;
    if (serverDef.submissionAccess) merged.submissionAccess = serverDef.submissionAccess;
    if (serverDef.roles) merged.roles = serverDef.roles;
    
    // Preserve actions from server (builder UI doesn't manage these)
    if (serverDef.actions) merged.actions = serverDef.actions;
    
    return merged;
}
