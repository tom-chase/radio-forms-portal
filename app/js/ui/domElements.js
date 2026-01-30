// app/js/ui/domElements.js

// Cache DOM elements to avoid repeated getElementById calls
export const domElements = {
  // Status and login elements
  statusEl: document.getElementById("statusText"),
  loginSection: document.getElementById("loginSection"),
  appSection: document.getElementById("appSection"),
  loginFormContainer: document.getElementById("loginFormContainer"),
  
  // Forms elements
  logoutBtn: document.getElementById("logoutBtn"),
  formsColumn: document.getElementById("formsColumn"),
  formsList: document.getElementById("formsList"),
  formsSearchInput: document.getElementById("formsSearch"),
  subsSearchInput: document.getElementById("subsSearch"),
  formTitle: document.getElementById("formTitle"),
  formTagBadge: document.getElementById("formTagBadge"),
  formRender: document.getElementById("formRender"),
  subsList: document.getElementById("subsList"),
  subsTitle: document.getElementById("subsTitle"),
  subsSubtitle: document.getElementById("subsSubtitle"),
  subsSearchContainer: document.getElementById("subsSearchContainer"),
  editBanner: document.getElementById("editBanner"),
  editBannerText: document.getElementById("editBannerText"),
  cancelEditBtn: document.getElementById("cancelEditBtn"),
  
  // Collapse elements
  toggleFormsCollapseBtn: document.getElementById("toggleFormsCollapseBtn"),
  formsCollapseIcon: document.getElementById("formsCollapseIcon"),
  toggleCreateCollapseBtn: document.getElementById("toggleCreateCollapseBtn"),
  createCollapseIcon: document.getElementById("createCollapseIcon"),
  formsPanelCollapseEl: document.getElementById("formsPanelCollapse"),
  createPanelCollapseEl: document.getElementById("createCollapse"),
  
  // Submissions collapse
  toggleSubsCollapseBtn: document.getElementById("toggleSubsCollapseBtn"),
  subsCollapseIcon: document.getElementById("subsCollapseIcon"),
  subsPanelCollapseEl: document.getElementById("subsCollapse"),
  
  // Admin elements
  adminSection: document.getElementById("adminSection"),
  adminToolsBtn: document.getElementById("adminToolsBtn"),
  adminToolsCollapseEl: document.getElementById("adminToolsCollapse"),
  adminImportColumn: document.getElementById("adminImportColumn"),
  adminImportCollapseEl: document.getElementById("adminImportCollapse"),
  toggleAdminImportCollapseBtn: document.getElementById("toggleAdminImportCollapseBtn"),
  adminImportCollapseIcon: document.getElementById("adminImportCollapseIcon"),
  
  // Import elements
  importJsonFile: document.getElementById("importJsonFile"),
  importJsonText: document.getElementById("importJsonText"),
  importOverwriteCheckbox: document.getElementById("importOverwriteCheckbox"),
  importJsonBtn: document.getElementById("importJsonBtn"),
  
  // Builder elements
  builderFormSelect: document.getElementById("builderFormSelect"),
  builderNewFormBtn: document.getElementById("builderNewFormBtn"),
  builderNewResourceBtn: document.getElementById("builderNewResourceBtn"),
  builderSaveBtn: document.getElementById("builderSaveBtn"),
  builderContainer: document.getElementById("builderContainer"),
  builderMetaPanel: document.getElementById("builderMetaPanel"),
  
  // Builder metadata elements
  builderMetaTitle: document.getElementById("builderMetaTitle"),
  builderMetaName: document.getElementById("builderMetaName"),
  builderMetaPath: document.getElementById("builderMetaPath"),
  builderMetaType: document.getElementById("builderMetaType"),
  builderMetaDisplay: document.getElementById("builderMetaDisplay"),
  builderMetaTags: document.getElementById("builderMetaTags"),
  
  // Modal elements
  jsonModalEl: document.getElementById("jsonModal"),
  jsonModalBody: document.getElementById("jsonModalBody"),
  formJsonEditModalEl: document.getElementById("formJsonEditModal"),
  formJsonEditTextarea: document.getElementById("formJsonEditTextarea"),
  toastEl: document.getElementById("appToast"),
  toastBodyEl: document.getElementById("appToastBody"),
  
  // User edit modal
  userEditModalEl: document.getElementById("userEditModal"),
  userEditModalBody: document.getElementById("userEditModalBody"),
  userEditModalLabel: document.getElementById("userEditModalLabel"),
  
  // Roles elements
  rolesList: document.getElementById("rolesList"),
  rolesRefreshBtn: document.getElementById("rolesRefreshBtn"),
  rolesNewBtn: document.getElementById("rolesNewBtn")
};

// Bootstrap collapse instances
export const bootstrapInstances = {
  formsPanelCollapse: domElements.formsPanelCollapseEl 
    ? bootstrap.Collapse.getOrCreateInstance(domElements.formsPanelCollapseEl, { toggle: false }) 
    : null,
  createPanelCollapse: domElements.createPanelCollapseEl 
    ? bootstrap.Collapse.getOrCreateInstance(domElements.createPanelCollapseEl, { toggle: false }) 
    : null,
  subsPanelCollapse: domElements.subsPanelCollapseEl
    ? bootstrap.Collapse.getOrCreateInstance(domElements.subsPanelCollapseEl, { toggle: false })
    : null,
  adminImportCollapse: domElements.adminImportCollapseEl
    ? bootstrap.Collapse.getOrCreateInstance(domElements.adminImportCollapseEl, { toggle: false })
    : null
};

// Helper function to get element safely
export const getElement = (selector) => {
  return document.getElementById(selector);
};

// Helper to check if element exists
export const elementExists = (element) => {
  return element !== null;
};
