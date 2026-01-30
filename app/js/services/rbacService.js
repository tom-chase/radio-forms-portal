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