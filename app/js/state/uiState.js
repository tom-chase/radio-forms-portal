// app/js/state/uiState.js

// UI State Management
export const uiState = {
  // Forms panel state
  allVisibleForms: [],
  isFormsCollapsed: false,
  isCreateCollapsed: true,
  isSubsCollapsed: false,
  isAdminImportCollapsed: false,
  
  // Current form/submission state
  currentFormInstance: null,
  currentFormMeta: null,
  originalSubmissionData: null,
  currentSubmissionsFormio: null,
  currentSubmissions: [],
  currentSubmissionPermissions: null,
  currentSubmissionView: null, // 'table', 'tabulator', or 'calendar'
  currentSubsTabulator: null,
  currentDayPilotCalendar: null,
  currentDayPilotFormMeta: null,
  currentDayPilotUser: null,
  currentDayPilotPermissions: null,
  dayPilotConfig: null,
  inlineFormInstance: null,
  inlineFormSubmissionId: null,
  inlineFormContainerEl: null,
  isEditing: false,
  editingSubmissionId: null,
  
  // Admin / builder state
  adminMode: false,
  currentBuilder: null,
  builderCurrentFormio: null,
  builderIsNew: false,
  builderCurrentFormId: null,
  builderLoadedFormDef: null,
  
  // Forms index for builder select
  allVisibleFormsById: new Map(),
  
  // Users state
  currentUserObj: null,
  userEditFormInstance: null,
  
  // Login state
  loginFormInstance: null,
};

// State setters
export const setUIState = (key, value) => {
  uiState[key] = value;
};

export const getUIState = (key) => {
  return uiState[key];
};

// Bulk state updates
export const updateUIState = (updates) => {
  Object.assign(uiState, updates);
};
