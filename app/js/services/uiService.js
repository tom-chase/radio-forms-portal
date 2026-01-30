// app/js/services/uiService.js

function $(id) { return document.getElementById(id); }

export function escapeHTML(str) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(str ?? "").replace(/[&<>"']/g, (s) => map[s]);
}

export function showToast(message, variant = "primary") {
  const toastEl = $("appToast");
  const toastBodyEl = $("appToastBody");
  if (!toastEl || !toastBodyEl) return;

  toastEl.className = `toast text-bg-${variant} border-0`;
  toastBodyEl.textContent = String(message ?? "");
  const toast = bootstrap.Toast.getOrCreateInstance(toastEl);
  toast.show();
}

export function showJsonModal(obj, title = "JSON") {
  const modalEl = $("jsonModal");
  const modalBody = $("jsonModalBody");
  const modalLabel = $("jsonModalLabel");
  if (!modalEl || !modalBody) return;
  if (modalLabel) modalLabel.textContent = title;
  modalBody.textContent = JSON.stringify(obj ?? null, null, 2);
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
}