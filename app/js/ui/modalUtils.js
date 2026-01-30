// app/js/ui/modalUtils.js

import { domElements } from './domElements.js';
import { showToast } from './uiUtils.js';

/**
 * Bootstrap 5 Modal Utilities - Replaces window.alert, window.prompt, window.confirm
 */

// Generic modal creator
export function createModal(options = {}) {
  const {
    title = 'Modal',
    body = '',
    size = 'md', // sm, md, lg, xl
    backdrop = true,
    keyboard = true,
    centered = true,
    showFooter = true,
    confirmText = 'OK',
    confirmVariant = 'primary',
    cancelText = 'Cancel',
    cancelVariant = 'secondary',
    onConfirm = null,
    onCancel = null,
    onCreate = null
  } = options;

  // Create modal HTML
  const modalHTML = `
    <div class="modal fade" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-${size}">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${title}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">${body}</div>
          ${showFooter ? `
            <div class="modal-footer">
              <button type="button" class="btn btn-${cancelVariant}" data-bs-dismiss="modal">${cancelText}</button>
              <button type="button" class="btn btn-${confirmVariant}" data-bs-action="confirm">${confirmText}</button>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;

  // Create modal element and append to body
  const modalContainer = document.createElement('div');
  modalContainer.innerHTML = modalHTML;
  document.body.appendChild(modalContainer);

  // Call onCreate callback if provided
  if (onCreate) {
    onCreate(modalContainer);
  }

  // Get modal instance
  const modal = new bootstrap.Modal(modalContainer.querySelector('.modal'));

  // Handle confirmation
  if (onConfirm) {
    const confirmBtn = modalContainer.querySelector('[data-bs-action="confirm"]');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        onConfirm();
        modal.hide();
      });
    }
  }

  // Handle cancellation
  if (onCancel) {
    const cancelBtn = modalContainer.querySelector('[data-bs-dismiss="modal"]');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        onCancel();
      });
    }
  }

  // Clean up after modal is hidden
  modalContainer.addEventListener('hidden.bs.modal', () => {
    document.body.removeChild(modalContainer);
  });

  return modal;
}

// Alert modal (replaces window.alert)
export function showAlert(message, title = 'Alert', variant = 'warning') {
  const modal = createModal({
    title,
    body: `<div class="alert alert-${variant} mb-0">${message}</div>`,
    size: 'md',
    showFooter: false,
    backdrop: true,
    centered: true
  });

  modal.show();
  return modal;
}

// Prompt modal (replaces window.prompt)
export function showPrompt(message, defaultValue = '', title = 'Input Required', inputType = 'text', inputPlaceholder = '') {
  return new Promise((resolve) => {
    let modalContainer;
    
    const modal = createModal({
      title,
      body: `
        <div class="mb-3">${message}</div>
        <input type="${inputType}" class="form-control" value="${defaultValue}" placeholder="${inputPlaceholder}" autocomplete="off">
      `,
      size: 'md',
      confirmText: 'OK',
      cancelText: 'Cancel',
      onConfirm: () => {
        const input = modalContainer.querySelector('input');
        resolve(input.value);
      },
      onCancel: () => {
        resolve(null);
      },
      onCreate: (container) => {
        modalContainer = container;
      }
    });

    modal.show();
  });
}

// Confirm modal (replaces window.confirm)
export function showConfirm(message, title = 'Confirm Action', variant = 'warning') {
  return new Promise((resolve) => {
    const modal = createModal({
      title,
      body: `
        <div class="alert alert-${variant} mb-0">
          <i class="bi bi-exclamation-triangle me-2"></i>
          ${message}
        </div>
      `,
      size: 'md',
      confirmText: 'OK',
      cancelText: 'Cancel',
      confirmVariant: variant === 'danger' ? 'danger' : 'primary',
      cancelVariant: 'secondary',
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false)
    });

    modal.show();
  });
}

// Form validation modal (for JSON parsing errors)
export function showValidationError(message, title = 'Validation Error') {
  const modal = createModal({
    title,
    body: `
      <div class="alert alert-danger mb-0">
        <i class="bi bi-exclamation-octagon me-2"></i>
        <strong>Error:</strong> ${message}
      </div>
      <div class="text-muted small">
        Please check your input and try again.
      </div>
    `,
    size: 'md',
    showFooter: false,
    backdrop: true,
    centered: true
  });

  modal.show();
  return modal;
}

// Success modal (for successful operations)
export function showSuccess(message, title = 'Success') {
  const modal = createModal({
    title,
    body: `
      <div class="alert alert-success mb-0">
        <i class="bi bi-check-circle me-2"></i>
        ${message}
      </div>
    `,
    size: 'md',
    showFooter: false,
    backdrop: true,
    centered: true
  });

  modal.show();
  return modal;
}

// Form input modal (for role creation, etc.)
export function showFormModal(fields, title = 'Form Input', submitText = 'Save') {
  return new Promise((resolve) => {
    const fieldInputs = fields.map(field => `
      <div class="mb-3">
        <label for="modal-${field.name}" class="form-label">${field.label}${field.required ? ' *' : ''}</label>
        <input 
          type="${field.type || 'text'}" 
          id="modal-${field.name}" 
          class="form-control" 
          value="${field.value || ''}" 
          placeholder="${field.placeholder || ''}"
          ${field.required ? 'required' : ''}
          ${field.pattern ? 'pattern="' + field.pattern + '"' : ''}
        >
        ${field.help ? `<small class="form-text text-muted">${field.help}</small>` : ''}
      </div>
    `).join('');

    const modal = createModal({
      title,
      body: fieldInputs,
      size: 'md',
      confirmText: submitText,
      cancelText: 'Cancel',
      onConfirm: () => {
        const formData = {};
        fields.forEach(field => {
          const input = modalContainer.querySelector(`#modal-${field.name}`);
          formData[field.name] = input.value;
        });
        resolve(formData);
      },
      onCancel: () => resolve(null)
    });

    modal.show();
  });
}
