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

// Cache for hasShareSettings results keyed by form._id
const _shareSettingsCache = new Map();

/**
 * Checks whether a form definition contains a Share Settings panel.
 * Results are cached per form._id to avoid repeated component traversal.
 * @param {Object} form - The form definition object
 * @returns {boolean}
 */
export function hasShareSettings(form) {
  if (!form) return false;
  const cacheKey = form._id;
  if (cacheKey && _shareSettingsCache.has(cacheKey)) return _shareSettingsCache.get(cacheKey);

  const components = form.components || [];
  const found = components.some(c => c.key === 'shareSettings' && c.type === 'panel');

  if (cacheKey) _shareSettingsCache.set(cacheKey, found);
  return found;
}

/**
 * Check if a user can access a specific submission based on its share settings.
 * Returns true if:
 *   - The user is an admin
 *   - The user owns the submission
 *   - The form has no share settings panel (open access — form-level perms already handled)
 *   - The submission matches at least one share criterion (public, roles, depts, committees, users)
 *
 * If the form HAS share settings but the submission has none set, the note is
 * treated as private to the owner (and admins).
 *
 * @param {Object} user   - Current user ({_id, roles, data:{departments,committees,...}})
 * @param {Object} submission - The submission to check ({owner, data:{sharePublic,...}})
 * @param {Object} form   - The form definition (used to detect share settings)
 * @param {Object} [options]
 * @param {boolean} [options.isAdmin=false]
 * @returns {boolean}
 */
export function checkSubmissionRowAccess(user, submission, form, { isAdmin = false } = {}) {
  // 1. Admins always pass
  if (isAdmin) return true;

  // 2. Owner always passes
  if (user?._id && submission?.owner && user._id === submission.owner) return true;

  // 3. If the form doesn't use share settings, allow (form-level perms already handled)
  if (!hasShareSettings(form)) return true;

  const d = submission?.data || {};

  // 4. Check each share criterion — any match grants access
  // sharePublic
  if (d.sharePublic === true) return true;

  // shareRoles — array of role ID strings
  if (Array.isArray(d.shareRoles) && d.shareRoles.length > 0) {
    const userRoles = new Set(user?.roles || []);
    if (d.shareRoles.some(rid => userRoles.has(typeof rid === 'object' ? rid._id : rid))) return true;
  }

  // shareDepartments — array of department submission IDs (or objects with _id)
  if (Array.isArray(d.shareDepartments) && d.shareDepartments.length > 0) {
    const userDepts = normalizeIdArray(user?.data?.departments);
    const shareDepts = normalizeIdArray(d.shareDepartments);
    if (setsOverlap(userDepts, shareDepts)) return true;
  }

  // shareCommittees — array of committee submission IDs (or objects with _id)
  if (Array.isArray(d.shareCommittees) && d.shareCommittees.length > 0) {
    const userComms = normalizeIdArray(user?.data?.committees);
    const shareComms = normalizeIdArray(d.shareCommittees);
    if (setsOverlap(userComms, shareComms)) return true;
  }

  // shareUsers — array of user submission IDs (or objects with _id)
  if (Array.isArray(d.shareUsers) && d.shareUsers.length > 0) {
    const uid = user?._id;
    if (uid && d.shareUsers.some(v => (typeof v === 'object' ? v._id : v) === uid)) return true;
  }

  // 5. Form has share settings but no criteria matched → private to owner
  return false;
}

/** Extracts a Set of ID strings from an array that may contain strings or {_id} objects. */
function normalizeIdArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return new Set();
  return new Set(arr.map(v => (typeof v === 'object' && v !== null ? v._id : v)).filter(Boolean));
}

/** Returns true if two Sets share at least one element. */
function setsOverlap(a, b) {
  if (!a.size || !b.size) return false;
  for (const v of b) if (a.has(v)) return true;
  return false;
}

export function getSubmissionPermissions(userOrRoles, formMeta, { isAdmin = false, user = null } = {}) {
  if (isAdmin) {
    return {
      canCreateAll: true, canCreateOwn: true,
      canReadAll: true, canReadOwn: true,
      canUpdateAll: true, canUpdateOwn: true,
      canDeleteAll: true, canDeleteOwn: true,
    };
  }

  // Normalize inputs
  let userRolesSet;
  let currentUser = user;

  if (userOrRoles instanceof Set) {
    userRolesSet = userOrRoles;
  } else if (userOrRoles && typeof userOrRoles === 'object' && userOrRoles.roles) {
    // It's a user object passed as first arg
    currentUser = userOrRoles;
    userRolesSet = new Set(currentUser.roles || []);
  } else {
    userRolesSet = new Set();
  }

  // 1. Standard Role-Based Access
  const accessArray = formMeta?.submissionAccess || formMeta?.access || [];
  const rules = accessArray.map((r) => ({
    type: r.type,
    roles: new Set(r.roles || []),
  }));

  const hasRolePermission = (types) => rules.some((r) => types.includes(r.type) && intersects(userRolesSet, r.roles));

  // 2. Resource-Based Access (Group Permissions)
  // We check form.settings.groupPermissions (standardize on this location)
  // Can be a single object or an array of objects.
  let hasGroupPermission = (types) => false;

  const groupSettingsRaw = formMeta?.settings?.groupPermissions;
  
  if (groupSettingsRaw && currentUser?.data) {
    // Normalize to array
    const groupSettingsList = Array.isArray(groupSettingsRaw) ? groupSettingsRaw : [groupSettingsRaw];
    
    // Check if user has permission via ANY of the configured groups
    const userPermissionsFromGroups = new Set();
    
    for (const settings of groupSettingsList) {
        if (!settings || !settings.resource) continue;
        
        const targetResourceId = settings.resource;
        let userBelongsToGroup = false;

        // Check specific fields if defined, otherwise scan logical fields
        const fieldsToCheck = ['departments', 'committees', settings.fieldName].filter(Boolean);
        
        for (const key of fieldsToCheck) {
            const val = currentUser.data[key];
            if (!val) continue;

            // Handle array of objects (populated) or strings (ids)
            if (Array.isArray(val)) {
                if (val.some(v => (v._id === targetResourceId) || (v === targetResourceId))) {
                    userBelongsToGroup = true;
                    break;
                }
            } else if (val === targetResourceId || val._id === targetResourceId) {
                userBelongsToGroup = true;
                break;
            }
        }

        if (userBelongsToGroup) {
            const accessList = settings.access || [];
            accessList.forEach(a => userPermissionsFromGroups.add(a));
        }
    }
    
    if (userPermissionsFromGroups.size > 0) {
        hasGroupPermission = (types) => types.some(t => userPermissionsFromGroups.has(t));
    }
  }

  // Combine permissions
  const check = (types) => hasRolePermission(types) || hasGroupPermission(types);

  return {
    canCreateAll: check(["create_all"]),
    canCreateOwn: check(["create_own"]),
    canReadAll: check(["read_all"]),
    canReadOwn: check(["read_own"]),
    canUpdateAll: check(["update_all"]),
    canUpdateOwn: check(["update_own"]),
    canDeleteAll: check(["delete_all"]),
    canDeleteOwn: check(["delete_own"]),
  };
}