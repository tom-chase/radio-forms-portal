// app/js/services/sessionService.js
//
// Shared session helpers that can be imported by feature modules.
// This avoids features reaching into main.js for auth/session state.

import { getCurrentUser, formioRequest } from './formioService.js';
import { TokenService } from './tokenService.js';
import { log } from '../utils/logger.js';

let _cachedUserWithRoles = null;

export function clearUserSessionCache() {
  _cachedUserWithRoles = null;
}

/**
 * Get the current user and ensure roles are present.
 * Formio.currentUser() sometimes returns a "base user" without roles;
 * we attempt to enrich by fetching the full submission.
 */
export async function getCurrentUserWithRoles({ force = false } = {}) {
  if (!force && _cachedUserWithRoles) return _cachedUserWithRoles;

  // Proactively validate token before making API calls
  const validToken = TokenService.getToken();
  if (!validToken) {
    console.warn('No valid token available in getCurrentUserWithRoles');
    _cachedUserWithRoles = null;
    return null;
  }

  const baseUser = await getCurrentUser({ force: true });
  if (!baseUser) {
    _cachedUserWithRoles = null;
    return null;
  }

  // If roles are already present and non-empty, just use them.
  if (Array.isArray(baseUser.roles) && baseUser.roles.length) {
    _cachedUserWithRoles = baseUser;
    return baseUser;
  }

  // Otherwise, enrich roles by looking up the full submission.
  try {
    const tryPaths = [
      `/user/submission/${baseUser._id}`
    ];

    for (const p of tryPaths) {
      try {
        const full = await formioRequest(p, { method: 'GET' });
        if (full && Array.isArray(full.roles)) {
          const enriched = { ...baseUser, roles: full.roles };
          _cachedUserWithRoles = enriched;
          return enriched;
        }
      } catch (e) {
        // keep trying other paths
      }
    }
  } catch (e) {
    log.warn('Failed to enrich current user with roles', e);
  }

  // Fall back if we can't fetch extra info
  _cachedUserWithRoles = baseUser;
  return baseUser;
}
