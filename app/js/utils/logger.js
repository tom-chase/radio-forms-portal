// app/js/utils/logger.js

const DEBUG_LS_KEY = 'rfp.debug';

/**
 * Decide debug mode once at startup, based on:
 *  - explicit window.__RFP_DEBUG__ (if already set)
 *  - ?debug=1 or ?debug=0
 *  - localStorage rfp.debug=1
 */
export function initDebugFlag() {
  // If something else set it (tests, etc.), respect it.
  if (typeof window.__RFP_DEBUG__ === 'boolean') return window.__RFP_DEBUG__;

  const url = new URL(window.location.href);
  const qp = url.searchParams.get('debug');

  if (qp === '1' || qp === 'true') {
    window.__RFP_DEBUG__ = true;
    try { localStorage.setItem(DEBUG_LS_KEY, '1'); } catch {}
    return true;
  }

  if (qp === '0' || qp === 'false') {
    window.__RFP_DEBUG__ = false;
    try { localStorage.removeItem(DEBUG_LS_KEY); } catch {}
    return false;
  }

  // Default: use localStorage if present; else false.
  let persisted = false;
  try { persisted = localStorage.getItem(DEBUG_LS_KEY) === '1'; } catch {}
  window.__RFP_DEBUG__ = persisted;
  return window.__RFP_DEBUG__;
}

export function isDebug() {
  return !!window.__RFP_DEBUG__;
}

/**
 * Safe-ish serializer for debug logs; avoids printing obvious secrets.
 * (Still: don't pass tokens/headers to logger calls.)
 */
function redact(val) {
  if (!val) return val;
  if (typeof val === 'string') {
    // crude JWT-ish redaction
    if (val.split('.').length === 3 && val.length > 40) return '[REDACTED_JWT]';
    return val;
  }
  if (typeof val === 'object') {
    const copy = Array.isArray(val) ? [...val] : { ...val };
    for (const k of Object.keys(copy)) {
      const key = k.toLowerCase();
      if (key.includes('token') || key.includes('authorization') || key.includes('secret')) {
        copy[k] = '[REDACTED]';
      }
    }
    return copy;
  }
  return val;
}

export const log = {
  debug: (...args) => { if (isDebug()) console.debug('[RFP]', ...args.map(redact)); },
  info: (...args) => { console.info('[RFP]', ...args.map(redact)); },
  warn: (...args) => { console.warn('[RFP]', ...args.map(redact)); },
  error: (...args) => { console.error('[RFP]', ...args.map(redact)); },

  group: (label) => { if (isDebug()) console.groupCollapsed(`[RFP] ${label}`); },
  groupEnd: () => { if (isDebug()) console.groupEnd(); },
};
