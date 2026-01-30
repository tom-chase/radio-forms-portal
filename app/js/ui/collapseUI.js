// app/js/ui/collapseUI.js

import { domElements, bootstrapInstances } from './domElements.js';
import { getUIState, setUIState } from '../state/uiState.js';

// Forms collapse UI - Enhanced with Bootstrap 5 features
export function syncFormsCollapseUI(isExpanded) {
  if (!domElements.formsColumn) return;
  
  // Use Bootstrap 5's built-in collapse classes and data attributes
  domElements.formsColumn.classList.toggle("rfp-collapsed", !isExpanded);
  
  // Update icon using Bootstrap 5's bi-chevron icons
  if (domElements.formsCollapseIcon) {
    domElements.formsCollapseIcon.classList.toggle("bi-chevron-left", isExpanded);
    domElements.formsCollapseIcon.classList.toggle("bi-chevron-right", !isExpanded);
  }
  
  // Update button title and ARIA attributes for accessibility
  if (domElements.toggleFormsCollapseBtn) {
    domElements.toggleFormsCollapseBtn.title = isExpanded ? "Collapse forms panel" : "Expand forms panel";
    domElements.toggleFormsCollapseBtn.setAttribute("aria-expanded", isExpanded);
  }
  
  setUIState('isFormsCollapsed', !isExpanded);
}

export function setFormsCollapsed(collapsed) {
  setUIState('isFormsCollapsed', !!collapsed);
  if (!bootstrapInstances.formsPanelCollapse) return;
  
  // Use Bootstrap 5's native collapse methods
  if (collapsed) {
    bootstrapInstances.formsPanelCollapse.hide();
  } else {
    bootstrapInstances.formsPanelCollapse.show();
  }
}

// Create collapse UI - Enhanced with Bootstrap 5
export function syncCreateCollapseUI(isExpanded) {
  if (domElements.createCollapseIcon) {
    domElements.createCollapseIcon.classList.toggle("bi-chevron-up", isExpanded);
    domElements.createCollapseIcon.classList.toggle("bi-chevron-down", !isExpanded);
  }
  
  if (domElements.toggleCreateCollapseBtn) {
    if (domElements.toggleCreateCollapseBtn.classList.contains("rfp-toggle-disabled")) {
      // Keep disabled state but update ARIA
      domElements.toggleCreateCollapseBtn.setAttribute("aria-expanded", "false");
    } else {
      domElements.toggleCreateCollapseBtn.title = isExpanded
        ? "Hide new submission form"
        : "Show new submission form";
      domElements.toggleCreateCollapseBtn.setAttribute("aria-expanded", isExpanded);
    }
  }
  
  setUIState('isCreateCollapsed', !isExpanded);
}

export function setCreateCollapsed(collapsed) {
  setUIState('isCreateCollapsed', collapsed);
  if (!bootstrapInstances.createPanelCollapse) return;
  
  // Use Bootstrap 5's native collapse methods
  if (collapsed) {
    bootstrapInstances.createPanelCollapse.hide();
  } else {
    bootstrapInstances.createPanelCollapse.show();
  }
}

// Enhanced toggle enabled function with Bootstrap 5 data attributes
export function setCreateToggleEnabled(enabled, disabledTitle = "") {
  if (!domElements.toggleCreateCollapseBtn) return;
  
  const isOn = !!enabled;
  
  // Use Bootstrap 5's built-in classes and ARIA attributes
  domElements.toggleCreateCollapseBtn.classList.toggle("rfp-toggle-disabled", !isOn);
  domElements.toggleCreateCollapseBtn.setAttribute("aria-disabled", !isOn);
  domElements.toggleCreateCollapseBtn.setAttribute("aria-expanded", "false");
  
  if (isOn) {
    // Enable Bootstrap 5's data-api toggle
    domElements.toggleCreateCollapseBtn.setAttribute("data-bs-toggle", "collapse");
    domElements.toggleCreateCollapseBtn.setAttribute("data-bs-target", "#createCollapse");
    if (domElements.createCollapseIcon) {
      domElements.createCollapseIcon.classList.remove("d-none");
    }
  } else {
    // Disable Bootstrap 5's data-api toggle
    domElements.toggleCreateCollapseBtn.removeAttribute("data-bs-toggle");
    domElements.toggleCreateCollapseBtn.removeAttribute("data-bs-target");
    domElements.toggleCreateCollapseBtn.title = disabledTitle || "You do not have permission to create submissions for this form.";
    if (domElements.createCollapseIcon) {
      domElements.createCollapseIcon.classList.add("d-none");
    }
    setCreateCollapsed(true);
  }
}

// Submissions collapse UI - Enhanced with Bootstrap 5
export function syncSubsCollapseUI(isExpanded) {
  if (domElements.subsCollapseIcon) {
    domElements.subsCollapseIcon.classList.toggle("bi-chevron-up", isExpanded);
    domElements.subsCollapseIcon.classList.toggle("bi-chevron-down", !isExpanded);
  }
  
  if (domElements.toggleSubsCollapseBtn) {
    domElements.toggleSubsCollapseBtn.title = isExpanded ? "Collapse submissions panel" : "Expand submissions panel";
    domElements.toggleSubsCollapseBtn.setAttribute("aria-expanded", isExpanded);
  }
  
  setUIState('isSubsCollapsed', !isExpanded);
}

export function setSubsCollapsed(collapsed) {
  setUIState('isSubsCollapsed', !!collapsed);
  if (!bootstrapInstances.subsPanelCollapse) return;
  
  if (collapsed) {
    bootstrapInstances.subsPanelCollapse.hide();
  } else {
    bootstrapInstances.subsPanelCollapse.show();
  }
}

// Admin import collapse UI - Enhanced with Bootstrap 5
export function syncAdminImportCollapseUI(isExpanded) {
  if (!domElements.adminImportColumn) return;
  
  domElements.adminImportColumn.classList.toggle("rfp-collapsed", !isExpanded);
  
  if (domElements.adminImportCollapseIcon) {
    domElements.adminImportCollapseIcon.classList.toggle("bi-chevron-left", isExpanded);
    domElements.adminImportCollapseIcon.classList.toggle("bi-chevron-right", !isExpanded);
  }
  
  if (domElements.toggleAdminImportCollapseBtn) {
    domElements.toggleAdminImportCollapseBtn.title = isExpanded
      ? "Collapse import JSON panel"
      : "Expand import JSON panel";
    domElements.toggleAdminImportCollapseBtn.setAttribute("aria-expanded", isExpanded);
  }
  
  setUIState('isAdminImportCollapsed', !isExpanded);
}

// Enhanced admin tools button state with Bootstrap 5
export function setAdminToolsButtonState({ visible, enabled, title }) {
  if (!domElements.adminToolsBtn) return;
  
  // Use Bootstrap 5's visibility classes and ARIA attributes
  if (visible) {
    domElements.adminToolsBtn.classList.remove("d-none");
  } else {
    domElements.adminToolsBtn.classList.add("d-none");
  }
  
  // Use custom disabled class for visual feedback (Bootstrap 5 compatible)
  domElements.adminToolsBtn.classList.toggle("rfp-toggle-disabled", !enabled);
  domElements.adminToolsBtn.setAttribute("aria-disabled", !enabled);
  
  if (title !== undefined) {
    domElements.adminToolsBtn.title = title;
  }
}

// Enhanced initialization with Bootstrap 5 event delegation
export function initCollapseEvents() {
  // Forms panel collapse - Use Bootstrap 5's native events
  if (domElements.formsPanelCollapseEl) {
    domElements.formsPanelCollapseEl.addEventListener("shown.bs.collapse", () => syncFormsCollapseUI(true));
    domElements.formsPanelCollapseEl.addEventListener("hidden.bs.collapse", () => syncFormsCollapseUI(false));
    // Initialize state based on current visibility
    syncFormsCollapseUI(domElements.formsPanelCollapseEl.classList.contains("show"));
  }

  // Create panel collapse
  if (domElements.createPanelCollapseEl) {
    domElements.createPanelCollapseEl.addEventListener("shown.bs.collapse", () => syncCreateCollapseUI(true));
    domElements.createPanelCollapseEl.addEventListener("hidden.bs.collapse", () => syncCreateCollapseUI(false));
    syncCreateCollapseUI(domElements.createPanelCollapseEl.classList.contains("show"));
  }

  // Submissions panel collapse
  if (domElements.subsPanelCollapseEl) {
    domElements.subsPanelCollapseEl.addEventListener("shown.bs.collapse", () => syncSubsCollapseUI(true));
    domElements.subsPanelCollapseEl.addEventListener("hidden.bs.collapse", () => syncSubsCollapseUI(false));
    syncSubsCollapseUI(domElements.subsPanelCollapseEl.classList.contains("show"));
  }

  // Admin import collapse
  if (domElements.adminImportCollapseEl) {
    domElements.adminImportCollapseEl.addEventListener("shown.bs.collapse", () => syncAdminImportCollapseUI(true));
    domElements.adminImportCollapseEl.addEventListener("hidden.bs.collapse", () => syncAdminImportCollapseUI(false));
    syncAdminImportCollapseUI(domElements.adminImportCollapseEl.classList.contains("show"));
  }
}
