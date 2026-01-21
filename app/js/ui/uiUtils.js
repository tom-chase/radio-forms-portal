// app/js/ui/uiUtils.js

import { domElements } from './domElements.js';
import { getUIState, setUIState } from '../state/uiState.js';

// UI visibility helpers
export function show(el) {
  if (!el) return;
  el.classList.remove("d-none");
}

export function hide(el) {
  if (!el) return;
  el.classList.add("d-none");
}

export function isHidden(el) {
  if (!el) return true;
  return el.classList.contains("d-none");
}

// Toast notifications
export function showToast(message, variant = "primary") {
  if (!domElements.toastEl) return;
  domElements.toastEl.className = `toast text-bg-${variant} border-0`;
  domElements.toastBodyEl.textContent = message;
  const toast = bootstrap.Toast.getOrCreateInstance(domElements.toastEl);
  toast.show();
}

// Modal helpers
export function showJsonModal(obj) {
  if (!domElements.jsonModalEl || !domElements.jsonModalBody) return;
  domElements.jsonModalBody.textContent = JSON.stringify(obj, null, 2);
  const modal = bootstrap.Modal.getOrCreateInstance(domElements.jsonModalEl);
  modal.show();
}

export function setJsonModalTitle(title) {
  const lbl = document.getElementById("jsonModalLabel");
  if (lbl) lbl.textContent = title || "JSON";
}

// Form utilities
export function escapeHTML(str) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return String(str).replace(/[&<>"']/g, (s) => map[s]);
}

export function slugify(str) {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseTagsInput(str) {
  const raw = String(str || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Data formatting
export function extractPlainTextFromHtml(str) {
  if (!str) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = str;
  return tmp.textContent || tmp.innerText || "";
}

export function formatSummaryValue(value, maxLength = 160) {
  if (value === null || value === undefined) return "";
  let str = String(value);
  if (/<[a-z][\s\S]*>/i.test(str)) {
    str = extractPlainTextFromHtml(str);
  }
  if (str.length > maxLength) {
    str = str.slice(0, maxLength) + "…";
  }
  return str;
}

export function normalizeArray(v) {
  return Array.isArray(v) ? v.filter(Boolean) : [];
}

// Set operations
export function intersects(aSet, bSet) {
  for (const v of bSet) if (aSet.has(v)) return true;
  return false;
}

// Form instance management
export function destroyInlineForm() {
  const inlineFormInstance = getUIState('inlineFormInstance');
  if (inlineFormInstance && typeof inlineFormInstance.destroy === "function") {
    try {
      inlineFormInstance.destroy(true);
    } catch (e) {
      console.warn("Error destroying inline form instance", e);
    }
  }
  // Update state
  setUIState('inlineFormInstance', null);
  setUIState('inlineFormSubmissionId', null);
  setUIState('inlineFormContainerEl', null);
}

export function destroyUserEditModalForm() {
  const userEditFormInstance = getUIState('userEditFormInstance');
  if (userEditFormInstance && typeof userEditFormInstance.destroy === "function") {
    try { 
      userEditFormInstance.destroy(true); 
    } catch (e) {
      console.warn("Error destroying user edit modal form", e);
    }
  }
  setUIState('userEditFormInstance', null);
  if (domElements.userEditModalBody) domElements.userEditModalBody.innerHTML = "";
}

// Password utilities
export function stripEmptyPassword(submission) {
  if (!submission || typeof submission !== "object") return;
  if (!submission.data || typeof submission.data !== "object") return;
  const pw = submission.data.password;
  const isEmpty =
    pw === "" || pw === null || pw === undefined || (typeof pw === "string" && pw.trim() === "");
  if (isEmpty) delete submission.data.password;
}
