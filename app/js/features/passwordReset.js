// app/js/features/passwordReset.js
//
// Password reset workflow — inline in the login card.
// Uses the built-in Form.io CE "resetpass" action on a single passwordReset form.
//
// The resetpass action dynamically shows/hides fields via ?live=1:
//   A) Without token → shows email field + "Send Reset Link" button
//   B) With x-jwt-token → shows password field + "Submit" button
//
// The action returns custom JSON responses (not normal submissions):
//   - Forgot flow: { message: "Password reset email was sent." }
//   - Reset flow:  { message: "Password was successfully updated." }

import { CONFIG } from '../config.js';
import { domElements } from '../ui/domElements.js';
import { show, hide } from '../ui/uiUtils.js';
import { log } from '../utils/logger.js';

console.log('[passwordReset] Module loaded');

let forgotFormInstance = null;
let resetFormInstance = null;
let _onBackToLogin = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function showLoginView() {
  if (domElements.loginCardTitle) domElements.loginCardTitle.innerHTML = '<i class="bi bi-person-lock me-2"></i>Sign in';
  show(domElements.loginFormContainer);
  if (domElements.forgotPasswordLink) show(domElements.forgotPasswordLink.parentElement);
  if (domElements.loginHelpText) show(domElements.loginHelpText);
  hide(domElements.forgotPasswordContainer);
  hide(domElements.resetPasswordContainer);

  // Clean up URL params without reload
  const url = new URL(window.location.href);
  if (url.searchParams.has('x-jwt-token') || url.searchParams.has('token') || url.searchParams.has('reset')) {
    url.searchParams.delete('x-jwt-token');
    url.searchParams.delete('token');
    url.searchParams.delete('reset');
    window.history.replaceState({}, '', url.pathname + (url.search || ''));
  }
}

function showForgotView() {
  if (domElements.loginCardTitle) domElements.loginCardTitle.innerHTML = '<i class="bi bi-envelope me-2"></i>Reset password';
  hide(domElements.loginFormContainer);
  if (domElements.forgotPasswordLink) hide(domElements.forgotPasswordLink.parentElement);
  if (domElements.loginHelpText) hide(domElements.loginHelpText);
  hide(domElements.resetPasswordContainer);
  show(domElements.forgotPasswordContainer);
  hide(domElements.forgotPasswordSuccess);
  if (domElements.forgotPasswordFormHost) domElements.forgotPasswordFormHost.classList.remove('d-none');
}

function showResetView() {
  if (domElements.loginCardTitle) domElements.loginCardTitle.innerHTML = '<i class="bi bi-key me-2"></i>Set new password';
  hide(domElements.loginFormContainer);
  if (domElements.forgotPasswordLink) hide(domElements.forgotPasswordLink.parentElement);
  if (domElements.loginHelpText) hide(domElements.loginHelpText);
  hide(domElements.forgotPasswordContainer);
  show(domElements.resetPasswordContainer);
  hide(domElements.resetPasswordSuccess);
  if (domElements.resetPasswordFormHost) domElements.resetPasswordFormHost.classList.remove('d-none');
}

function destroyForgotForm() {
  if (forgotFormInstance && typeof forgotFormInstance.destroy === 'function') {
    try { forgotFormInstance.destroy(true); } catch (e) { /* ignore */ }
  }
  forgotFormInstance = null;
  if (domElements.forgotPasswordFormHost) domElements.forgotPasswordFormHost.innerHTML = '';
}

function destroyResetForm() {
  if (resetFormInstance && typeof resetFormInstance.destroy === 'function') {
    try { resetFormInstance.destroy(true); } catch (e) { /* ignore */ }
  }
  resetFormInstance = null;
  if (domElements.resetPasswordFormHost) domElements.resetPasswordFormHost.innerHTML = '';
}

// ---------------------------------------------------------------------------
// View A: "Forgot Password" — send reset email via resetpass action
// The form is loaded with ?live=1 so the server hides the password field
// and relabels the button to "Send Reset Link".
// ---------------------------------------------------------------------------

async function renderForgotPasswordForm() {
  destroyForgotForm();
  if (!domElements.forgotPasswordFormHost) return;

  try {
    const Formio = window.Formio;

    // Clear any stale token so the server shows the "enter email" mode
    try { Formio.setToken(null); } catch (e) { /* ignore */ }
    try { localStorage.removeItem('formioToken'); } catch (e) { /* ignore */ }

    forgotFormInstance = await Formio.createForm(
      domElements.forgotPasswordFormHost,
      `${CONFIG.API_BASE}/passwordreset?live=1`,
      { noAlerts: true }
    );

    // The resetpass action intercepts create and returns {message: "..."}
    // This triggers submitDone with the custom response.
    forgotFormInstance.on('submitDone', (response) => {
      log.info('Forgot password response:', response);
      hide(domElements.forgotPasswordFormHost);
      show(domElements.forgotPasswordSuccess);
    });

    // Also handle the regular submit event as fallback
    forgotFormInstance.on('submit', (response) => {
      if (response && response.message) {
        hide(domElements.forgotPasswordFormHost);
        show(domElements.forgotPasswordSuccess);
      }
    });

    // On error, still show success to avoid email enumeration
    forgotFormInstance.on('error', (err) => {
      log.warn('Forgot password form error:', err);
      hide(domElements.forgotPasswordFormHost);
      show(domElements.forgotPasswordSuccess);
    });

    // Handle custom error responses (e.g., user not found returns 400)
    forgotFormInstance.on('submitError', (err) => {
      log.warn('Forgot password submitError:', err);
      // Still show success to avoid email enumeration
      hide(domElements.forgotPasswordFormHost);
      show(domElements.forgotPasswordSuccess);
    });

  } catch (err) {
    log.error('Failed to render forgot password form:', err);
    if (domElements.forgotPasswordFormHost) {
      domElements.forgotPasswordFormHost.innerHTML =
        '<div class="alert alert-danger small">Unable to load the password reset form. Please contact an administrator.</div>';
    }
  }
}

// ---------------------------------------------------------------------------
// View B: "Reset Password" — set new password via resetpass action
// We render a simple client-side form with just a password field.
// The resetpass action expects the token in the x-jwt-token header.
// ---------------------------------------------------------------------------

async function renderResetPasswordForm(token) {
  console.log('[passwordReset] renderResetPasswordForm called with token:', token ? token.substring(0, 20) + '...' : '(no token)');
  destroyResetForm();
  if (!domElements.resetPasswordFormHost) {
    console.error('[passwordReset] resetPasswordFormHost element not found!');
    return;
  }

  try {
    const Formio = window.Formio;
    console.log('[passwordReset] Formio available:', !!Formio);

    // Set the reset token so it's sent with all subsequent requests
    Formio.setToken(token);
    localStorage.setItem('formioToken', token);

    // Create a simple password-only form client-side
    const passwordFormDef = {
      display: 'form',
      components: [
        {
          label: 'New Password',
          tableView: false,
          key: 'password',
          type: 'password',
          input: true,
          placeholder: 'Enter your new password',
          validate: {
            required: true,
            minLength: 8
          }
        },
        {
          type: 'button',
          theme: 'primary',
          disableOnInvalid: true,
          action: 'submit',
          block: true,
          key: 'submit',
          label: 'Set New Password',
          input: true
        }
      ]
    };

    resetFormInstance = await Formio.createForm(
      domElements.resetPasswordFormHost,
      passwordFormDef,
      { noAlerts: true }
    );

    // Override the submission URL to point to the passwordreset endpoint
    resetFormInstance.url = `${CONFIG.API_BASE}/passwordreset/submission`;

    resetFormInstance.on('submit', async (submission) => {
      log.info('Submitting password reset with token');
      try {
        const response = await fetch(`${CONFIG.API_BASE}/passwordreset/submission`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-jwt-token': token
          },
          body: JSON.stringify({ data: submission.data })
        });

        const result = await response.json().catch(() => ({}));
        log.info('Password reset response:', response.status, result);

        if (response.ok && result.message && result.message.includes('successfully')) {
          hide(domElements.resetPasswordFormHost);
          show(domElements.resetPasswordSuccess);
          // Clear the temp token
          try { Formio.setToken(null); } catch (e) { /* ignore */ }
          try { Formio.setUser(null); } catch (e) { /* ignore */ }
          try { localStorage.removeItem('formioToken'); } catch (e) { /* ignore */ }
        } else {
          showResetError(result.message || 'Failed to reset password. The link may have expired.');
        }
      } catch (err) {
        log.error('Password reset fetch error:', err);
        showResetError('Failed to reset password. Please try again.');
      }
    });

  } catch (err) {
    log.error('Failed to render reset password form:', err);
    if (domElements.resetPasswordFormHost) {
      domElements.resetPasswordFormHost.innerHTML =
        '<div class="alert alert-danger small">Unable to load the password reset form. Please contact an administrator.</div>';
    }
  }
}

function showResetError(message) {
  const host = domElements.resetPasswordFormHost;
  if (host) {
    const existing = host.querySelector('.alert-danger');
    if (existing) existing.remove();
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-danger small mb-2';
    alertDiv.innerHTML = `<i class="bi bi-exclamation-triangle me-1"></i>${message}`;
    host.prepend(alertDiv);
  }
}

// ---------------------------------------------------------------------------
// Initialization — called from main.js before initSession()
// ---------------------------------------------------------------------------

/**
 * Initialize the password reset feature.
 * Returns true if a reset flow was activated (caller should skip normal login).
 */
export function initPasswordReset({ onBackToLogin } = {}) {
  _onBackToLogin = onBackToLogin || null;

  // Wire up "Forgot your password?" link
  if (domElements.forgotPasswordLink) {
    domElements.forgotPasswordLink.addEventListener('click', (e) => {
      e.preventDefault();
      showForgotView();
      renderForgotPasswordForm();
    });
  }

  // Wire up "Back to sign in" links
  if (domElements.backToLoginFromForgot) {
    domElements.backToLoginFromForgot.addEventListener('click', (e) => {
      e.preventDefault();
      destroyForgotForm();
      showLoginView();
    });
  }

  if (domElements.backToLoginFromReset) {
    domElements.backToLoginFromReset.addEventListener('click', (e) => {
      e.preventDefault();
      destroyResetForm();
      showLoginView();
      // If we came from a reset link (initSession was skipped), trigger it now
      if (_onBackToLogin) _onBackToLogin();
    });
  }

  // Check URL for reset token from the built-in resetpass action
  // The resetpass action uses ?x-jwt-token=<token> in the email link
  const params = new URLSearchParams(window.location.search);
  const resetToken = params.get('x-jwt-token');

  if (resetToken) {
    console.log('[passwordReset] Reset token found, showing reset view');
    showResetView();
    renderResetPasswordForm(resetToken);
    return true;
  }

  return false;
}

/**
 * Clean up password reset forms (called during logout).
 */
export function destroyPasswordResetForms() {
  destroyForgotForm();
  destroyResetForm();
}
