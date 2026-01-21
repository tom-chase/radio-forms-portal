// app/js/services/rbacService.js

import { formioRequest } from './formioService.js';
import { log } from '../utils/logger.js';

let _rolesCache = null;

export function clearRolesCache() {
  _rolesCache = null;
}

export function intersects(aSet, bSet) {
  if (!aSet || !bSet) return false;
  for (const v of bSet) if (aSet.has(v)) return true;
  return false;
}

export async function fetchProjectRoles(force = false) {
  if (!force && Array.isArray(_rolesCache)) return _rolesCache;
  try {
    const roles = await formioRequest('/role', {
      method: 'GET',
      query: { limit: 1000, select: '_id,admin,title,machineName,name,default,description' }
    });
    _rolesCache = roles || [];
    return _rolesCache;
  } catch (e) {
    // Re-throw auth errors so userIsAdmin can handle them specifically
    const status = e?.status || 0;
    if (status === 401 || status === 403) {
      throw e;
    }
    // For other errors, return empty array
    log.warn('fetchProjectRoles failed', e);
    _rolesCache = [];
    return _rolesCache;
  }
}

export async function userIsAdmin(user) {
  try {
    if (!user) return { isAdmin: false, warning: 'Not signed in.' };

    const userRoleIds = Array.isArray(user.roles) ? user.roles : [];
    if (!userRoleIds.length) return { isAdmin: false, warning: null };

    const roles = await fetchProjectRoles(true);
    const roleById = new Map((roles || []).map(r => [r._id, r]));
    const isAdmin = userRoleIds.some(rid => roleById.get(rid)?.admin === true);
    return { isAdmin, warning: null };
  } catch (e) {
    const status = e?.status || 0;
    if (status === 401 || status === 403) {
      // Fallback: Check if user has the known admin role ID
      // This works around Form.io Community Edition permission limitations
      const userRoleIds = Array.isArray(user.roles) ? user.roles : [];
      const ADMIN_ROLE_ID = '69552291edff9781468a08f6'; // Known admin role ID
      const hasAdminRole = userRoleIds.includes(ADMIN_ROLE_ID);
      
      if (hasAdminRole) {
        return { isAdmin: true, warning: 'Admin status confirmed via role ID (role lookup limited)' };
      }
      
      // If user can't read roles and doesn't have admin role ID, they're not an admin
      return { isAdmin: false, warning: null };
    }
    log.warn('userIsAdmin() failed', { status, message: String(e?.message || '') });
    return { isAdmin: false, warning: 'Admin tools unavailable (role lookup failed).' };
  }
}

export function getSubmissionPermissions(userRolesSet, formMeta, { isAdmin = false } = {}) {
  if (isAdmin) {
    return {
      canCreateAll: true, canCreateOwn: true,
      canReadAll: true, canReadOwn: true,
      canUpdateAll: true, canUpdateOwn: true,
      canDeleteAll: true, canDeleteOwn: true,
    };
  }

  const accessArray = formMeta?.submissionAccess || formMeta?.access || [];
  const rules = accessArray.map((r) => ({
    type: r.type,
    roles: new Set(r.roles || []),
  }));

  const has = (types) => rules.some((r) => types.includes(r.type) && intersects(userRolesSet, r.roles));

  return {
    canCreateAll: has(["create_all"]),
    canCreateOwn: has(["create_own"]),
    canReadAll: has(["read_all"]),
    canReadOwn: has(["read_own"]),
    canUpdateAll: has(["update_all"]),
    canUpdateOwn: has(["update_own"]),
    canDeleteAll: has(["delete_all"]),
    canDeleteOwn: has(["delete_own"]),
  };
}