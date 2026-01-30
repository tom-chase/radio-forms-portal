// app/js/utils/roleUtils.js

/**
 * Role flag mapping for checkbox UI
 */
export const ROLE_FLAG_KEYS = {
  administrator: ["administrator", "admin"],
  management: ["management"],
  staff: ["staff"],
  programmer: ["programmer", "engineering"],
  underwriting: ["underwriting"],
  volunteer: ["volunteer"]
};

/**
 * Build a mapping from role machine names to role IDs
 */
export function buildRoleIdMapFromRoles(allRoles) {
    const byId = new Map();
    const byMachine = new Map();
    (allRoles || []).forEach(r => {
        if (r._id) {
            byId.set(r._id, r);
            const key = String(r.machineName || r.name || "").toLowerCase();
            if (key) {
                byMachine.set(key, r._id);
            }
        }
    });
    return { byId, byMachine };
}

/**
 * Apply role checkboxes to submission
 * - roles represented by our checkboxes are controlled by checkboxes
 * - other roles remain untouched
 */
export function applyRoleCheckboxesToSubmission(submission, checkboxKeyToRoleId, preserveUnmanaged = true) {
    const data = submission?.data || {};
    const currentRoles = new Set(normalizeArray(submission.roles));

    // Apply checkbox selections - use field ID mapping
    Object.entries(checkboxKeyToRoleId.byId).forEach(([fieldId, roleId]) => {
        const checked = Boolean(data[fieldId]);
        if (checked) {
            currentRoles.add(roleId);
        } else {
            currentRoles.delete(roleId);
        }
    });

    // Preserve unmanaged roles so you don't accidentally wipe roles
    // that aren't represented in this checkbox panel.
    if (preserveUnmanaged) {
        const managedRoleIds = new Set(Object.values(checkboxKeyToRoleId));
        submission.roles = Array.from(currentRoles).filter(roleId => !managedRoleIds.has(roleId));
    } else {
        submission.roles = Array.from(currentRoles);
    }
    return submission;
}

/**
 * Helper functions from original implementation
 * Note: These functions are kept for compatibility but server-side role management is preferred
 */
export async function fetchLatestRoleLogsByUserId(options = {}) {
    console.warn('fetchLatestRoleLogsByUserId is legacy - prefer server-side role management');
    const API_BASE = window.API_BASE || '/formio';
    
    try {
        const { formioRequest } = await import('../services/formioService.js');
        const logs = await formioRequest('/rolemgmtlog/submission', {
            method: 'GET',
            query: { limit: options.limit || 1000, sort: '-created' }
        });
        
        const latestByUserId = new Map();
        (logs || []).forEach(log => {
            const userId = log.data?.targetUserId || log.data?.userId;
            if (userId && !latestByUserId.has(userId)) {
                latestByUserId.set(userId, log);
            }
        });
        
        return latestByUserId;
    } catch (e) {
        console.error('Error fetching role logs:', e);
        return new Map();
    }
}

export function rolesStringFromLatestLog(log) {
    console.warn('rolesStringFromLatestLog is legacy - prefer server-side role management');
    console.log('Role log data:', log);
    if (!log || !log.data) return '';
    
    const roles = log.data.roles || [];
    console.log('Roles array from log:', roles);
    if (Array.isArray(roles) && roles.length) {
        return roles.join(', ');
    }
    return '';
}

/**
 * Normalize array input - ensure it's an array
 */
function normalizeArray(arr) {
    if (!arr) return [];
    if (Array.isArray(arr)) return arr;
    return [arr];
}
