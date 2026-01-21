// app/js/ui/formManagement.js

import { CONFIG } from '../config.js';
import { getUIState, setUIState } from '../state/uiState.js';
import { formioRequest, buildUrl } from '../services/formioService.js';
import { showToast } from './uiUtils.js';
import { domElements } from './domElements.js';

// Login form management
export async function renderLoginForm() {
  // Cleanup any previous instance
  const loginFormInstance = getUIState('loginFormInstance');
  if (loginFormInstance && typeof loginFormInstance.destroy === "function") {
    try {
      loginFormInstance.destroy(true);
    } catch (e) {
      console.warn("Error destroying login form instance", e);
    }
  }
  setUIState('loginFormInstance', null);
  
  if (!domElements.loginFormContainer) {
    console.error('renderLoginForm: loginFormContainer not found');
    return;
  }

  try {
    const Formio = window.Formio; // Global Formio from CDN
    
    const loginFormInstance = await Formio.createForm(
      domElements.loginFormContainer,
      `${CONFIG.API_BASE}/user/login`,
      {
        hooks: {
          beforeSubmit: (submission) => {
            // Store the login form instance for later reference
            setUIState('loginFormInstance', loginFormInstance);
            return submission;
          }
        }
      }
    );

    attachFormioErrorHandler(loginFormInstance, "Login Form");
    attachUserAdminSubmitGuards(loginFormInstance, { path: `${CONFIG.API_BASE}/user/login` });

    // Wire up login success handling
    loginFormInstance.on("submit", async (submission) => {
      try {
        const { setToken } = await import('../services/formioService.js');
        if (submission.token) {
          setToken(submission.token);
        }
        // The session will be re-initialized automatically
      } catch (e) {
        console.error("Login submission error", e);
        showToast("Login failed. Please try again.", "danger");
      }
    });

    // Also add submitDone handler as fallback
    loginFormInstance.on("submitDone", async (submission) => {
      try {
        const { setToken } = await import('../services/formioService.js');
        if (submission.token) {
          setToken(submission.token);
        }
      } catch (e) {
        console.error("Login submitDone error", e);
        showToast("Login failed. Please try again.", "danger");
      }
    });
    
    // Add error handling
    loginFormInstance.on("error", (err) => {
      console.error('Login form error event:', err);
    });
    
    // Add submit button handler for manual submission (consistent with SPA using formioRequest)
    setTimeout(() => {
      const submitBtn = domElements.loginFormContainer.querySelector('button[type="submit"], [data-bs-action="submit"], .btn-submit');
      if (submitBtn) {
        // Add click handler to use formioRequest instead of SDK submit
        submitBtn.addEventListener('click', (e) => {
          // Check if form is valid
          if (typeof loginFormInstance.isValid === 'function') {
            const valid = loginFormInstance.isValid();
            
            if (valid) {
              // Get submission data
              const submissionData = loginFormInstance.submission;
              
              // Submit using formioRequest (consistent with SPA pattern)
              import('../services/formioService.js').then(({ formioRequest }) => {
                formioRequest(`${CONFIG.API_BASE}/user/login`, {
                  method: 'POST',
                  data: submissionData
                }).then(result => {
                  // Login successful - reload page to show logged-in state
                  showToast('Login successful! Redirecting...', 'success');
                  setTimeout(() => {
                    window.location.reload();
                  }, 1000);
                }).catch(err => {
                  console.error('Login submission error:', err);
                  showToast('Login failed. Please try again.', 'danger');
                });
              });
            } else {
              showToast('Please fill in all required fields.', 'warning');
            }
          } else {
            showToast('Form validation error. Please try again.', 'danger');
          }
        });
      }
    }, 1000);
    
    setUIState('loginFormInstance', loginFormInstance);

  } catch (err) {
    console.error("Failed to render login form:", err);
    if (domElements.loginFormContainer) {
      domElements.loginFormContainer.innerHTML = `
        <div class="alert alert-danger">
          <strong>Error:</strong> Unable to load the login form. Please contact an administrator.
        </div>
      `;
    }
  }
}

export function destroyLoginForm() {
  const loginFormInstance = getUIState('loginFormInstance');
  if (loginFormInstance && typeof loginFormInstance.destroy === "function") {
    try {
      loginFormInstance.destroy(true);
    } catch (e) {
      console.warn("Error destroying login form instance", e);
    }
  }
  setUIState('loginFormInstance', null);
}

// Form error handling
export function attachFormioErrorHandler(formio, contextLabel = "Form") {
  if (!formio || typeof formio.on !== "function") return;
  formio.on("error", (err) => {
    console.error(`${contextLabel} error:`, err);
    console.error(`${contextLabel} error details:`, {
      message: err.message,
      status: err.status,
      response: err.response,
      stack: err.stack
    });
    showToast("Form error. Please try again.", "danger");
  });
}

// User admin form guards
export function attachUserAdminSubmitGuards(formio, formMeta) {
  if (!formio || typeof formio.on !== "function") return;
  const path = (formMeta?.path || formio?.form?.path || "").toLowerCase();
  
  // Exclude login forms - they should not have user/admin submit guards
  if (path.includes("login")) {
    return;
  }
  
  if (!["user", "admin"].includes(path)) return;

  formio.on("submit", async (submission) => {
    // Always keep existing roles if outgoing payload doesn't include them.
    if (
      formio.submission &&
      Array.isArray(formio.submission.roles) &&
      !Array.isArray(submission.roles)
    ) {
      submission.roles = formio.submission.roles;
    }

    // Prevent blank password overwrites
    const { stripEmptyPassword } = await import('./uiUtils.js');
    stripEmptyPassword(submission);

    // NEW: if we're editing the /user resource, and current operator is admin,
    // compute roles from checkbox UI and set submission.roles in ONE write.
    // This avoids the multi-action lost-update problem.
    try {
      const adminMode = getUIState('adminMode');
      if (path === "user" && adminMode === true) {
        // Fetch roles directly instead of using cache
        const { formioRequest } = await import('../services/formioService.js');
        const rolesRes = await formioRequest('/role', {
          method: 'GET',
          query: { limit: 1000, select: '_id,machineName,name' }
        });
        
        const allRoles = Array.isArray(rolesRes) ? rolesRes : [];
        const { buildRoleIdMapFromRoles, applyRoleCheckboxesToSubmission } = await import('../utils/roleUtils.js');
        const checkboxKeyToRoleId = buildRoleIdMapFromRoles(allRoles);

        // Use the currently-loaded roles as baseline (so unmanaged roles can be preserved).
        const { normalizeArray } = await import('./uiUtils.js');
        const baselineRoles =
          normalizeArray(submission.roles).length
            ? submission.roles
            : normalizeArray(formio.submission?.roles);

        submission.roles = baselineRoles;

        // Preserve unmanaged roles so you don't accidentally wipe roles
        // that aren't represented in this checkbox panel.
        applyRoleCheckboxesToSubmission(submission, checkboxKeyToRoleId, true);
      }
    } catch (e) {
      console.warn("Role checkbox mapping failed; leaving roles unchanged.", e);
    }

    return submission;
  });
}

// Attachment handling
export function addAttachmentToFormData(formio, fileMeta) {
  // This assumes you created a Data Grid with key "attachments"
  const attachmentsComp = formio.getComponent("attachments");

  if (!attachmentsComp) {
    console.warn("No 'attachments' component found on form");
    return;
  }

  const current = attachmentsComp.dataValue || [];
  const updated = current.concat(fileMeta);
  attachmentsComp.setValue(updated);
}
