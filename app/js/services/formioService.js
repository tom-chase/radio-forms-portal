// app/js/services/formioService.js

import { log } from '../utils/logger.js';

let _initialized = false;
let _baseUrl = '';
let _projectUrl = '';
let _currentUserCache = null;

// Optional: allow main.js to register a handler (e.g., redirect to login)
let _onAuthFailure = null;

function getSDK() {
    const sdk = window.Formio;
    if (!sdk) {
        throw new Error('Formio SDK not found. Ensure formio.full.min.js is loaded before main.js.');
    }
    return sdk;
}

function stripTrailingSlash(url) {
    return (url || '').replace(/\/+$/, '');
}

function ensureLeadingSlash(path) {
    if (!path) return '/';
    return path.startsWith('/') ? path : `/${path}`;
}

function normalizeJwtToken(token) {
  const raw = String(token || '').trim();
  return raw.replace(/^Bearer\s+/i, '').trim();
}

/**
 * Build absolute URL from a relative Form.io path.
 * If you pass a full URL (http/https), it is returned unchanged.
 */
export function buildUrl(pathOrUrl) {
    if (!pathOrUrl) return _projectUrl || _baseUrl;
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;

    const base = _projectUrl || _baseUrl;
    return `${stripTrailingSlash(base)}${ensureLeadingSlash(pathOrUrl)}`;
}

/**
 * Initialize the Form.io SDK URLs exactly once.
 */
export function initFormioService({ baseUrl, projectUrl, onAuthFailure } = {}) {
    const Formio = getSDK();

    // Allow updating the auth failure hook even after init.
    if (typeof onAuthFailure === 'function') _onAuthFailure = onAuthFailure;

    // True idempotency: if already initialized, do not mutate internal URLs.
    if (_initialized) {
        log.debug('Formio service already initialized', { baseUrl: _baseUrl, projectUrl: _projectUrl });
        return;
    }

    _baseUrl = stripTrailingSlash(baseUrl || _baseUrl);
    _projectUrl = stripTrailingSlash(projectUrl || baseUrl || _projectUrl);

    if (!_baseUrl) throw new Error('initFormioService requires baseUrl');
    if (!_projectUrl) throw new Error('initFormioService requires projectUrl (or baseUrl)');

    // These two calls are the “source of truth” for the whole SPA.
    Formio.setBaseUrl(_baseUrl);

    // Formio SDK API varies slightly across versions; try the common ones.
    if (typeof Formio.setProjectUrl === 'function') {
        Formio.setProjectUrl(_projectUrl);
    } else if (typeof Formio.setProject === 'function') {
        // Some examples use setProject(); if that's your SDK, this keeps compatibility.
        Formio.setProject(_projectUrl);
    } else {
        // Fallback: set internal property (last resort)
        Formio.projectUrl = _projectUrl;
    }

    // Register a Fetch Plugin so that SDK-initiated requests (e.g. Formio.createForm()
    // internal fetches) also get the triple-header auth used by formioRequest().
    if (typeof Formio.registerPlugin === 'function') {
        Formio.registerPlugin({
            priority: 0,
            preRequest(requestArgs) {
                const token = getToken();
                if (!token) return;
                const jwt = normalizeJwtToken(token);
                const opts = requestArgs.opts = requestArgs.opts || {};
                const hdrs = opts.headers = opts.headers || {};
                if (!hdrs['x-jwt-token'])   hdrs['x-jwt-token'] = jwt;
                if (!hdrs.Authorization)     hdrs.Authorization = `Bearer ${jwt}`;
                if (!hdrs['x-token'])        hdrs['x-token'] = jwt;
            },
            preStaticRequest(requestArgs) {
                const token = getToken();
                if (!token) return;
                const jwt = normalizeJwtToken(token);
                const opts = requestArgs.opts = requestArgs.opts || {};
                const hdrs = opts.headers = opts.headers || {};
                if (!hdrs['x-jwt-token'])   hdrs['x-jwt-token'] = jwt;
                if (!hdrs.Authorization)     hdrs.Authorization = `Bearer ${jwt}`;
                if (!hdrs['x-token'])        hdrs['x-token'] = jwt;
            }
        }, 'rfpAuthPlugin');
        log.debug('Registered rfpAuthPlugin (triple-header auth for SDK requests)');
    }

    _initialized = true;
    log.debug('Formio service initialized', { baseUrl: _baseUrl, projectUrl: _projectUrl });
}

export function getBaseUrl() {
  return _baseUrl;
}

export function getProjectUrl() {
  return _projectUrl;
}

/**
 * Token helpers. Prefer the SDK built-ins; fallback to localStorage key used by Formio.
 */
export function getToken() {
  const Formio = getSDK();
  let token = null;
  
  if (typeof Formio.getToken === 'function') {
    token = Formio.getToken();
  } else {
    // Fallback to localStorage
  }

  // Fallback; Formio historically uses "formioToken"
  if (!token) {
    try { 
      token = localStorage.getItem('formioToken');
    } catch {}
  }

  return token ? normalizeJwtToken(token) : null;
}

export function setToken(token) {
  const Formio = getSDK();
  _currentUserCache = null;

  if (typeof Formio.setToken === 'function') {
    Formio.setToken(token);
    return;
  }
  
  // Fallback to localStorage
  try { 
    localStorage.setItem('formioToken', token);
  } catch {}
}

export function clearToken() {
  const Formio = getSDK();
  _currentUserCache = null;

  if (typeof Formio.clearToken === 'function') {
    Formio.clearToken();
    return;
  }
  try { localStorage.removeItem('formioToken'); } catch {}
}

/**
 * Normalize Form.io request errors into something consistent for UI + logging.
 */
export function normalizeFormioError(err) {
  // Formio errors can be: { status, message }, or fetch Response-ish, or { details }
  const out = {
    name: 'FormioRequestError',
    status: err?.status || err?.response?.status || err?.code || 0,
    message: err?.message || err?.error || 'Request failed',
    details: err?.details || err?.response?.data || null,
    original: err,
  };

  // Sometimes Formio returns { errors: [ ... ] } inside details
  if (!out.details && err?.errors) out.details = { errors: err.errors };

  return out;
}

async function parseFetchBody(response) {
  const contentType = String(response?.headers?.get?.('content-type') || '');
  const text = await response.text();
  if (!text) return null;

  // Prefer JSON when possible, but tolerate non-JSON error bodies.
  const looksJson = contentType.includes('application/json') || /^[\s\n\r\t]*[\[{]/.test(text);
  if (!looksJson) return text;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * A consistent wrapper around Form.io API requests that:
 *  - accepts relative paths
 *  - appends query params
 *  - applies auth headers consistently
 *  - provides consistent error normalization
 *  - allows a single auth-failure hook
 *
 * Usage:
 *   await formioRequest('/form');
 *   await formioRequest(`/form/${formId}/submission`, { method: 'GET', query: { limit: 50 } });
 */
export async function formioRequest(pathOrUrl, options = {}) {
  const Formio = getSDK();
  if (!_initialized) {
    log.warn('formioRequest called before initFormioService(); using SDK defaults.');
  }

  const {
    method = 'GET',
    data = null,
    headers = {},
    query = null,
    ...rest
  } = options;

  const url = buildUrl(pathOrUrl);

  // Append query params (common need for list endpoints)
  let finalUrl = url;
  if (query && typeof query === 'object') {
    const u = new URL(url);
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      u.searchParams.set(k, String(v));
    }
    finalUrl = u.toString();
  }

  try {
    log.debug('Formio.request', { method, url: finalUrl });

    // Formio CDN build expects Headers instance as 4th parameter
    // Plain objects cause "s.set is not a function"
    let normalizedHeaders;
    if (typeof Headers !== 'undefined') {
      // Create proper Headers instance
      normalizedHeaders = new Headers();
      // Add our plain object headers
      Object.entries(headers || {}).forEach(([key, value]) => {
        normalizedHeaders.set(key, String(value));
      });
    } else {
      // Fallback for environments without Headers
      normalizedHeaders = headers || {};
    }

    /**
     * Formio SDK Headers Issue Resolution
     *
     * PROBLEM: In our environment, Formio SDK request handling has been unreliable
     * (e.g. header plumbing / request construction differences vs. Postman).
     *
     * SOLUTION: Use fetch() as the authoritative request mechanism for Form.io API calls
     * made by this SPA.
     *
     * IMPORTANT: This deployment expects auth via the custom header:
     *  - x-jwt-token: <token>
     *
     * Some Form.io builds/endpoints also accept Authorization: Bearer or x-token.
     * We send all three (with the same JWT) to match Postman behavior and avoid
     * endpoint-specific auth parsing differences.
     */

    // NOTE: We intentionally prefer direct fetch() over Formio.request().
    // It matches Postman behavior more closely (notably x-jwt-token) and avoids SDK edge-cases.
    const token = getToken();
    const fetchHeaders = {};

    if (normalizedHeaders && typeof normalizedHeaders.forEach === 'function') {
      normalizedHeaders.forEach((value, key) => {
        fetchHeaders[key] = value;
      });
    } else {
      Object.assign(fetchHeaders, normalizedHeaders);
    }

    if (!fetchHeaders.Accept) fetchHeaders.Accept = 'application/json';

    if (token) {
      const jwt = normalizeJwtToken(token);
      fetchHeaders['x-jwt-token'] = jwt;
      fetchHeaders.Authorization = `Bearer ${jwt}`;
      fetchHeaders['x-token'] = jwt;
    }

    if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && data && !fetchHeaders['Content-Type']) {
      fetchHeaders['Content-Type'] = 'application/json';
    }

    const fetchResponse = await fetch(finalUrl, {
      method,
      headers: fetchHeaders,
      body: (method === 'GET' || method === 'HEAD') ? undefined : (data ? JSON.stringify(data) : undefined)
    });

    if (fetchResponse.ok) {
      const jwtToken = fetchResponse.headers.get('x-jwt-token');
      if (jwtToken) setToken(jwtToken);
    }

    const parsed = await parseFetchBody(fetchResponse);

    if (!fetchResponse.ok) {
      const message =
        (parsed && typeof parsed === 'object' && (parsed.message || parsed.error))
          ? String(parsed.message || parsed.error)
          : (typeof parsed === 'string' && parsed)
            ? parsed
            : `Request failed (${fetchResponse.status})`;

      const err = normalizeFormioError({
        status: fetchResponse.status,
        message,
        details: (parsed && typeof parsed === 'object') ? parsed : null,
      });

      // Call optional auth failure handler (401/403) for session-level failures.
      // Some deployments return 401/403 for privileged endpoints (e.g. /role) even when
      // the session token is otherwise valid; callers can handle those as "access denied".
      const path = String(pathOrUrl || '').toLowerCase();
      const isPrivilegedEndpoint = path.includes('/role');
      if (!isPrivilegedEndpoint && (err.status === 401 || err.status === 403)) {
        try {
          if (typeof _onAuthFailure === 'function') _onAuthFailure(err);
        } catch (hookErr) {
          log.warn('onAuthFailure hook threw', hookErr);
        }
      }

      throw err;
    }

    return parsed;
  } catch (err) {
    const norm = normalizeFormioError(err);

    // Note: onAuthFailure is handled above for fetch() non-OK responses.

    log.debug('Formio request failed', { method, url: finalUrl, status: norm.status, message: norm.message });
    throw norm;
  }
}

/**
 * Cached currentUser accessor.
 * Many SPAs call this repeatedly; caching avoids repeated /current calls.
 */
export async function getCurrentUser({ force = false } = {}) {
  const Formio = getSDK();

  if (!force && _currentUserCache) return _currentUserCache;

  // If not logged in, Formio.currentUser() may reject. Treat that as null user.
  try {
    const user = await Formio.currentUser();
    _currentUserCache = user || null;
    return _currentUserCache;
  } catch (err) {
    _currentUserCache = null;

    // If a stale/invalid token is present, Form.io may throw Unauthorized here.
    // Clear it so login forms can load without sending a bad Authorization header.
    const status = err?.status || err?.response?.status || 0;
    const msg = String(err?.message || err?.error || '');
    const isAuthError = status === 401 || status === 403 || /unauthorized/i.test(msg);
    if (isAuthError) {
      try {
        log.warn('Current user lookup unauthorized; clearing token');
      } catch {}
      try { clearToken(); } catch {}
    }
    return null;
  }
}

/**
 * Convenience helper for logout.
 * Note: Depending on your usage, you might also call /user/logout.
 */
export async function logout() {
  const Formio = getSDK();
  _currentUserCache = null;

  try {
    if (typeof Formio.logout === 'function') {
      await Formio.logout();
    }
  } finally {
    clearToken();
  }
}