// app/js/services/badgeService.js
//
// Sidebar badge counts: total submissions per form + "new" (unviewed) per user.
// Uses Content-Range header from Form.io CE to get totals without fetching full payloads.

import { buildUrl, getToken, formioRequest } from './formioService.js';
import { getSubmissionPermissions, hasShareSettings, checkSubmissionRowAccess } from './rbacService.js';
import { getAppBridge } from './appBridge.js';
import { log } from '../utils/logger.js';

// ── Internal state ──────────────────────────────────────────────────────────

/** Map<formId, { total: number, newCount: number, subIds: string[] }> */
const _badgeCounts = new Map();

/** Set<submissionId> — submissions the current user has viewed */
let _viewedSet = new Set();

/** Map<submissionId, viewedSubmissionRecordId> — for dedup on server */
const _viewedRecordIds = new Map();

/** Concurrency limiter */
const BATCH_SIZE = 5;

// ── Low-level fetch with Content-Range ──────────────────────────────────────

function normalizeJwt(token) {
  return String(token || '').replace(/^Bearer\s+/i, '').trim();
}

/**
 * Fetch a Form.io list endpoint and return { body, contentRange }.
 * contentRange is parsed into { start, end, total } or null.
 */
async function fetchWithRange(pathOrUrl, query = {}) {
  const url = new URL(buildUrl(pathOrUrl));
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, String(v));
  }

  const headers = { Accept: 'application/json' };
  const token = getToken();
  if (token) {
    const jwt = normalizeJwt(token);
    headers['x-jwt-token'] = jwt;
    headers.Authorization = `Bearer ${jwt}`;
    headers['x-token'] = jwt;
  }

  const resp = await fetch(url.toString(), { method: 'GET', headers });
  if (!resp.ok) {
    throw new Error(`Badge fetch failed: ${resp.status} ${resp.statusText}`);
  }

  const crHeader = resp.headers.get('content-range');
  let contentRange = null;
  if (crHeader) {
    // Format: "0-9/51" or "*/0"
    const m = crHeader.match(/(\d+)-(\d+)\/(\d+)/);
    if (m) {
      contentRange = { start: +m[1], end: +m[2], total: +m[3] };
    } else if (crHeader.includes('*/')) {
      const t = crHeader.split('/')[1];
      contentRange = { start: 0, end: 0, total: parseInt(t, 10) || 0 };
    }
  }

  const body = await resp.json().catch(() => []);
  return { body, contentRange };
}

// ── Viewed submissions (server-side tracking) ───────────────────────────────

/**
 * Load all viewedSubmissions records for the current user.
 * Populates _viewedSet and _viewedRecordIds.
 */
export async function loadViewedSubmissions() {
  _viewedSet = new Set();
  _viewedRecordIds.clear();

  try {
    const records = await formioRequest('/viewedsubmissions/submission', {
      method: 'GET',
      query: { limit: 5000, select: '_id,data.submissionId' }
    });

    if (Array.isArray(records)) {
      for (const rec of records) {
        const subId = rec?.data?.submissionId;
        if (subId) {
          _viewedSet.add(subId);
          _viewedRecordIds.set(subId, rec._id);
        }
      }
    }
    log.debug(`[badgeService] Loaded ${_viewedSet.size} viewed submissions`);
  } catch (e) {
    log.warn('[badgeService] Failed to load viewed submissions', e);
  }
}

/**
 * Mark a submission as viewed. Deduplicates against local set.
 * Returns true if newly marked (was not previously viewed).
 */
export async function markSubmissionViewed(submissionId, formId) {
  if (!submissionId) return false;
  if (_viewedSet.has(submissionId)) return false;

  _viewedSet.add(submissionId);

  // Fire-and-forget server write
  try {
    const result = await formioRequest('/viewedsubmissions/submission', {
      method: 'POST',
      data: {
        data: {
          submissionId,
          form: formId || ''
        }
      }
    });
    if (result?._id) {
      _viewedRecordIds.set(submissionId, result._id);
    }
  } catch (e) {
    log.warn('[badgeService] Failed to save viewed record', e);
  }

  return true;
}

/**
 * Check if a submission has been viewed by the current user.
 */
export function isSubmissionViewed(submissionId) {
  return _viewedSet.has(submissionId);
}

// ── Count fetching ──────────────────────────────────────────────────────────

/**
 * Get the total submission count for a form using Content-Range header.
 * For owner-only forms, adds owner filter.
 */
async function getFormTotalCount(formPath, extraQuery = {}) {
  const query = { limit: 1, select: '_id', ...extraQuery };
  const { contentRange, body } = await fetchWithRange(`/${formPath}/submission`, query);

  if (contentRange) return contentRange.total;
  // Fallback: if no Content-Range, use body length (unreliable for paginated)
  return Array.isArray(body) ? body.length : 0;
}

/**
 * Fetch counts for a single form. Returns { total, newCount, subIds }.
 * For share-settings forms, fetches submissions with share fields and applies
 * client-side filtering via checkSubmissionRowAccess to match what the user
 * actually sees in the submission list.
 */
async function fetchFormCounts(form, user, isAdmin) {
  const path = String(form.path || '').replace(/^\/+/, '');
  const perms = getSubmissionPermissions(user, form, { isAdmin });

  // Check if user has any read access
  if (!perms.canReadAll && !perms.canReadOwn) {
    return { total: 0, newCount: 0, subIds: [] };
  }

  const ownerQuery = (!perms.canReadAll && perms.canReadOwn) ? { owner: user._id || 'me' } : {};

  // Sidebar forms lack components, so fetch full form def to check for share settings
  let fullForm = form;
  if (!form.components) {
    try {
      fullForm = await formioRequest(`/${path}`, { method: 'GET' });
    } catch (e) {
      log.warn(`[badgeService] Could not fetch form def for ${path}`, e);
    }
  }

  let total, subIds;

  if (hasShareSettings(fullForm)) {
    // Share-settings forms: fetch submissions with share fields, filter client-side
    const shareSelect = '_id,owner,data.sharePublic,data.shareRoles,data.shareDepartments,data.shareCommittees,data.shareUsers';
    const subs = await formioRequest(`/${path}/submission`, {
      method: 'GET',
      query: { limit: 5000, select: shareSelect, ...ownerQuery }
    });
    const filtered = (subs || []).filter(s => checkSubmissionRowAccess(user, s, fullForm, { isAdmin }));
    total = filtered.length;
    subIds = filtered.map(s => s._id);
  } else {
    // Standard forms: use efficient Content-Range count
    total = await getFormTotalCount(path, ownerQuery);
    subIds = null;
  }

  let newCount = 0;

  if (subIds) {
    // We already have exact IDs from share filtering
    newCount = subIds.filter(id => !_viewedSet.has(id)).length;
  } else if (total > 0) {
    // Fetch just IDs to compare against viewed set
    try {
      const { body } = await fetchWithRange(`/${path}/submission`, {
        limit: 5000,
        select: '_id',
        ...ownerQuery
      });
      subIds = (body || []).map(s => s._id).filter(Boolean);
      newCount = subIds.filter(id => !_viewedSet.has(id)).length;
    } catch (e) {
      log.warn(`[badgeService] Could not fetch IDs for new count on ${path}`, e);
    }
  }

  return { total, newCount, subIds: subIds || [] };
}

// ── Batch orchestration ─────────────────────────────────────────────────────

/**
 * Run promises in batches of `size` to limit concurrency.
 */
async function batchRun(tasks, size) {
  const results = [];
  for (let i = 0; i < tasks.length; i += size) {
    const batch = tasks.slice(i, i + size);
    const batchResults = await Promise.allSettled(batch.map(fn => fn()));
    results.push(...batchResults);
  }
  return results;
}

/** Track whether a full init has completed */
let _initialized = false;

/**
 * Initialize badge counts for all visible forms.
 * Call after sidebar renders. Updates DOM progressively.
 * On subsequent calls (e.g. search filter re-render), reuses cached counts.
 */
export async function initBadgeCounts(visibleForms, user) {
  if (!visibleForms?.length || !user) return;

  // If already initialized, just re-apply cached badges to the (possibly re-rendered) DOM
  if (_initialized) {
    visibleForms.forEach(f => updateSidebarBadge(f._id));
    updateAllCategoryBadges();
    return;
  }

  const { state } = getAppBridge();
  const isAdmin = !!state.adminMode;

  // Load viewed submissions first
  await loadViewedSubmissions();

  // Skip forms with hideBadges setting
  const forms = visibleForms.filter(f => !f.settings?.ui?.hideBadges);

  // Create tasks for each form
  const tasks = forms.map(form => async () => {
    try {
      const counts = await fetchFormCounts(form, user, isAdmin);
      _badgeCounts.set(form._id, counts);
      updateSidebarBadge(form._id);
    } catch (e) {
      log.warn(`[badgeService] Count fetch failed for ${form.path}`, e);
    }
  });

  // Run in batches
  await batchRun(tasks, BATCH_SIZE);

  // Update all category badges after all forms are done
  updateAllCategoryBadges();
  _initialized = true;
}

// ── DOM updates ─────────────────────────────────────────────────────────────

/**
 * Update the sidebar badge for a specific form.
 */
export function updateSidebarBadge(formId) {
  const counts = _badgeCounts.get(formId);
  if (!counts) return;

  const btn = document.querySelector(`[data-form-id="${formId}"]`);
  if (!btn) return;

  let container = btn.querySelector('.rfp-badge-container');
  if (!container) {
    container = document.createElement('span');
    container.className = 'rfp-badge-container ms-auto';
    btn.appendChild(container);
  }

  const { total, newCount } = counts;

  if (total === 0) {
    container.innerHTML = '';
    return;
  }

  if (newCount > 0) {
    container.innerHTML =
      `<span class="rfp-badge-new text-danger">${newCount} new</span>` +
      `<span class="rfp-badge-sep text-muted"> / </span>` +
      `<span class="rfp-badge-total text-muted">${total}</span>`;
  } else {
    container.innerHTML =
      `<span class="rfp-badge-total text-muted">${total}</span>`;
  }

  // Also update parent category badge
  updateCategoryBadgeFor(btn);
}

/**
 * Recalculate the category badge for the tag section containing a form button.
 */
function updateCategoryBadgeFor(formBtn) {
  const section = formBtn?.closest('.rfp-tag-section');
  if (!section) return;

  const tagBtn = section.querySelector('.rfp-tag-accordion-btn');
  if (!tagBtn) return;

  updateCategoryBadgeElement(tagBtn, section);
}

/**
 * Update a single category badge element by summing child form counts.
 */
function updateCategoryBadgeElement(tagBtn, section) {
  const formBtns = section.querySelectorAll('[data-form-id]');
  let catTotal = 0;
  let catNew = 0;

  formBtns.forEach(btn => {
    const fid = btn.getAttribute('data-form-id');
    const c = _badgeCounts.get(fid);
    if (c) {
      catTotal += c.total;
      catNew += c.newCount;
    }
  });

  let container = tagBtn.querySelector('.rfp-badge-container');
  if (!container) {
    container = document.createElement('span');
    container.className = 'rfp-badge-container ms-auto';
    tagBtn.appendChild(container);
  }

  if (catTotal === 0) {
    container.innerHTML = '';
    return;
  }

  if (catNew > 0) {
    container.innerHTML =
      `<span class="rfp-badge-new text-danger">${catNew} new</span>` +
      `<span class="rfp-badge-sep text-muted"> / </span>` +
      `<span class="rfp-badge-total text-muted">${catTotal}</span>`;
  } else {
    container.innerHTML =
      `<span class="rfp-badge-total text-muted">${catTotal}</span>`;
  }
}

/**
 * Update all category badges (call after all form counts are loaded).
 */
function updateAllCategoryBadges() {
  const sections = document.querySelectorAll('.rfp-tag-section');
  sections.forEach(section => {
    const tagBtn = section.querySelector('.rfp-tag-accordion-btn');
    if (tagBtn) updateCategoryBadgeElement(tagBtn, section);
  });
}

// ── Mutation helpers (submit / delete / view) ───────────────────────────────

/**
 * Increment total count for a form (after new submission created).
 * The new submission is automatically "viewed" by its creator.
 */
export function incrementFormTotal(formId, submissionId) {
  const counts = _badgeCounts.get(formId);
  if (!counts) return;
  counts.total += 1;
  if (submissionId) {
    counts.subIds.push(submissionId);
    _viewedSet.add(submissionId); // Creator has seen it
  }
  updateSidebarBadge(formId);
}

/**
 * Decrement total count for a form (after submission deleted).
 */
export function decrementFormTotal(formId, submissionId) {
  const counts = _badgeCounts.get(formId);
  if (!counts) return;
  counts.total = Math.max(0, counts.total - 1);
  if (submissionId) {
    counts.subIds = counts.subIds.filter(id => id !== submissionId);
    if (_viewedSet.has(submissionId)) {
      // Was viewed — newCount stays the same
    } else {
      counts.newCount = Math.max(0, counts.newCount - 1);
    }
  }
  updateSidebarBadge(formId);
}

/**
 * Called after a submission is viewed/edited. Updates badge counts.
 */
export function onSubmissionViewed(formId, submissionId) {
  if (!submissionId || !formId) return;

  const wasNew = !_viewedSet.has(submissionId);
  _viewedSet.add(submissionId);

  if (wasNew) {
    const counts = _badgeCounts.get(formId);
    if (counts) {
      counts.newCount = Math.max(0, counts.newCount - 1);
      updateSidebarBadge(formId);
    }
  }
}

/**
 * Get current badge counts for a form.
 */
export function getBadgeCounts() {
  return _badgeCounts;
}
