// app/js/features/tabulatorLists.js

import { getAppBridge } from '../services/appBridge.js';
import { formioRequest } from '../services/formioService.js';
import { openRoleMgmtModal } from './roleMgmt.js';
import { log } from '../utils/logger.js';

function $(id) { return document.getElementById(id); }

/**
 * Data transform functions for special tabulator configurations
 */
const dataTransforms = {
    /**
     * Transform user submissions to include role information
     * Matches the original user form tabulator behavior
     */
    userRolesTransform: async (submissions, formMeta) => {
        log.debug("userRolesTransform called", { count: submissions?.length });
        
        // Load latest role logs once and join client-side
        let latestRoleLogByUserId = new Map();
        let deptMap = new Map();
        let commMap = new Map();

        try {
            const [roleLogs, depts, comms] = await Promise.all([
                fetchLatestRoleLogsByUserId({ limit: 5000 }),
                formioRequest('/department/submission', { method: 'GET', query: { limit: 1000, select: '_id,data.name' } }).catch(() => []),
                formioRequest('/committee/submission', { method: 'GET', query: { limit: 1000, select: '_id,data.name' } }).catch(() => [])
            ]);

            latestRoleLogByUserId = roleLogs;
            
            if (Array.isArray(depts)) depts.forEach(d => deptMap.set(d._id, d.data?.name || 'Unknown'));
            if (Array.isArray(comms)) comms.forEach(c => commMap.set(c._id, c.data?.name || 'Unknown'));

        } catch (e) {
            console.warn("Unable to load reference data for user list transformation.", e);
        }

        return (submissions || []).map((u) => {
            const email = u?.data?.email || "—";
            const latestLog = latestRoleLogByUserId.get(u._id);
            
            // Format Departments and Committees
            const formatGroup = (list, map) => {
                if (!Array.isArray(list)) return '';
                return list.map(item => {
                    // Item could be an ID string or an object depending on form storage config
                    const id = (typeof item === 'object' && item !== null) ? item._id : item;
                    return map.get(id) || 'Unknown';
                }).filter(Boolean).join(', ');
            };

            return {
                _id: u._id,
                email,
                roles: rolesStringFromLatestLog(latestLog),
                departments: formatGroup(u.data?.departments, deptMap),
                committees: formatGroup(u.data?.committees, commMap),
                _raw: u
            };
        });
    }
};

/**
 * Helper functions from the original implementation
 */
async function fetchLatestRoleLogsByUserId(options = {}) {
    const { config } = getAppBridge();
    const API_BASE = config.API_BASE;
    
    try {
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

function rolesStringFromLatestLog(log) {
    if (!log || !log.data) return '';
    
    const roles = log.data.roles || [];
    if (Array.isArray(roles) && roles.length) {
        return roles.join(', ');
    }

    // Back-compat: legacy roleMgmtLog stored boolean flags (administrator, management, etc.)
    const keys = [
        'administrator',
        'admin',
        'management',
        'staff',
        'programmer',
        'engineering',
        'underwriting',
        'volunteer'
    ];
    return keys.filter(k => log.data?.[k] === true).join(', ');
}

/**
 * Check if Tabulator library is available
 */
function isTabulatorAvailable() {
    return typeof Tabulator !== "undefined";
}

/**
 * Apply data transform function if specified
 */
async function applyDataTransform(submissions, transformName, formMeta) {
    if (!transformName) {
        return submissions;
    }
    
    // 1. Check for registered named transform
    if (dataTransforms[transformName]) {
        try {
            return await dataTransforms[transformName](submissions, formMeta);
        } catch (e) {
            console.error(`Error applying data transform '${transformName}':`, e);
            return submissions;
        }
    }

    // 2. Check for inline JavaScript code
    // Treats the string as the body of a function(submissions, formMeta)
    if (typeof transformName === 'string' && transformName.trim().length > 0) {
        try {
            // Remove "javascript:" prefix if present (optional convention)
            const code = transformName.trim().startsWith('javascript:') 
                ? transformName.trim().substring(11) 
                : transformName;

            const func = new Function('submissions', 'formMeta', code);
            const result = func(submissions, formMeta);
            
            // Handle both sync and async results
            return result instanceof Promise ? await result : result;
        } catch (e) {
            console.warn('Error executing inline data transform:', e);
            return submissions;
        }
    }

    return submissions;
}

/**
 * Create default tabulator configuration
 */
function createDefaultConfig() {
    return {
        layout: "fitColumns",
        height: "60vh",
        pagination: "local",
        paginationSize: 25,
        movableColumns: true,
        placeholder: "No submissions found.",
        columns: []
    };
}

/**
 * Merge form-specific config with defaults
 */
function mergeTabulatorConfig(formConfig = {}) {
    const defaultConfig = createDefaultConfig();
    
    return {
        ...defaultConfig,
        ...formConfig,
        columns: formConfig.columns || defaultConfig.columns
    };
}

/**
 * Render submissions using Tabulator configuration from form settings
 */
export async function renderTabulatorList(submissions, formMeta, user, permissions) {
    const { actions, state } = getAppBridge();
    const subsList = $("subsList");
    
    if (!subsList || !submissions || !submissions.length) {
        return false;
    }

    // Check if Tabulator is available
    if (!isTabulatorAvailable()) {
        console.warn('Tabulator library not loaded, falling back to table view');
        return false;
    }

    // Get tabulator configuration from form settings
    const tabulatorConfig = formMeta?.settings?.tabulatorList;
    
    // If no tabulator config or explicitly disabled, fall back
    if (!tabulatorConfig || tabulatorConfig.enabled === false) {
        return false;
    }

    try {
        // Clear existing content and create host element with view toggle
        const { renderViewToggle } = await import('../utils/viewUtils.js');
        const { getAppBridge } = await import('../services/appBridge.js');
        const { state } = getAppBridge();
        
        const viewToggleHtml = await renderViewToggle(formMeta, state.currentSubmissionView || 'tabulator');
        subsList.innerHTML = viewToggleHtml + '<div id="rfpSubsTabulator"></div>';
        const host = document.getElementById("rfpSubsTabulator");
        if (!host) return false;

        // Apply data transform if specified
        const transformedData = await applyDataTransform(
            submissions, 
            tabulatorConfig.dataTransform, 
            formMeta
        );

        // Destroy existing tabulator instance
        destroyTabulator();

        // Merge configuration
        const finalConfig = mergeTabulatorConfig(tabulatorConfig);

        const isUserResource = String(formMeta?.path || '').toLowerCase() === 'user';
        
        // Check if current user can create role management forms
        const { getCurrentUserWithRoles } = await import('../services/sessionService.js');
        const currentUser = await getCurrentUserWithRoles();
        const userRoles = new Set(currentUser?.roles || []);
        
        // Get permissions for roleMgmt and roleMgmtAdmin forms
        const { getSubmissionPermissions } = await import('../services/rbacService.js');
        const { formioRequest } = await import('../services/formioService.js');
        
        // Fetch actual form definitions to get real permissions
        let roleMgmtPerms = { canCreateAll: false, canCreateOwn: false };
        let roleMgmtAdminPerms = { canCreateAll: false, canCreateOwn: false };
        
        // Helper to resolve role IDs from names for fallback
        const resolveRoleIds = async (names) => {
            try {
                const { fetchProjectRoles } = await import('../services/rbacService.js');
                const roles = await fetchProjectRoles();
                const ids = [];
                for (const name of names) {
                    const role = roles.find(r => r.machineName === name || r.title.toLowerCase() === name.toLowerCase());
                    if (role) ids.push(role._id);
                }
                return ids;
            } catch (e) {
                return [];
            }
        };

        try {
            // Try to fetch roleMgmt form
            const roleMgmtForm = await formioRequest('/rolemgmt', { method: 'GET' });
            if (roleMgmtForm) {
                roleMgmtPerms = getSubmissionPermissions(currentUser, roleMgmtForm, { isAdmin: state.adminMode });
            }
        } catch (e) {
            console.warn('Could not fetch roleMgmt form, using defaults:', e);
            // Fallback to defaults with ID resolution
            const managerRoleIds = await resolveRoleIds(["management", "staff", "administrator"]);
            
            roleMgmtPerms = getSubmissionPermissions(currentUser, {
                submissionAccess: [
                    { type: "create_all", roles: managerRoleIds },
                    { type: "create_own", roles: managerRoleIds }
                ]
            }, { isAdmin: state.adminMode });
        }
        
        try {
            // Try to fetch roleMgmtAdmin form
            const roleMgmtAdminForm = await formioRequest('/rolemgmtadmin', { method: 'GET' });
            if (roleMgmtAdminForm) {
                roleMgmtAdminPerms = getSubmissionPermissions(currentUser, roleMgmtAdminForm, { isAdmin: state.adminMode });
            }
        } catch (e) {
            console.warn('Could not fetch roleMgmtAdmin form, using defaults:', e);
            // Fallback to defaults
            const adminRoleIds = await resolveRoleIds(["administrator"]);
            roleMgmtAdminPerms = getSubmissionPermissions(currentUser, {
                submissionAccess: [
                    { type: "create_all", roles: adminRoleIds },
                    { type: "create_own", roles: adminRoleIds }
                ]
            }, { isAdmin: state.adminMode });
        }
        
        const canManageRoles = isUserResource && (roleMgmtPerms.canCreateAll || roleMgmtPerms.canCreateOwn);
        const canManageAdminRoles = isUserResource && (roleMgmtAdminPerms.canCreateAll || roleMgmtAdminPerms.canCreateOwn);

        const cols = Array.isArray(finalConfig.columns) ? finalConfig.columns.slice() : [];
        const hasActionsCol = cols.some(c => String(c?.field || '') === '_rfp_actions');
        if (!hasActionsCol) {
            cols.push({
                title: 'Actions',
                field: '_rfp_actions',
                hozAlign: 'right',
                headerSort: false,
                width: 200,
                formatter: (cell, formatterParams, onRendered) => {
                    const rowData = cell.getRow().getData();
                    const rawSub = rowData?._raw || rowData;
                    
                    if (!rawSub || !rawSub._id) return '';
                    
                    const currentUserId = user?._id || null;
                    const isOwner = !!currentUserId && rawSub.owner === currentUserId;
                    
                    const canEditThis = permissions?.canUpdateAll || (permissions?.canUpdateOwn && isOwner);
                    const canDeleteThis = permissions?.canDeleteAll || (permissions?.canDeleteOwn && isOwner);
                    const canViewThis = permissions?.canReadAll || (permissions?.canReadOwn && isOwner);
                    
                    // DEBUG: Check permissions for button rendering
                    if (isUserResource) {
                        log.debug(`Row ${rawSub._id}: canManageRoles=${canManageRoles}, canManageAdminRoles=${canManageAdminRoles}`);
                    }

                    let actionsHtml = '<div class="btn-group btn-group-sm" role="group">';
                    
                    // For user forms, only show role management buttons (special case)
                    if (isUserResource) {
                        if (canManageRoles) {
                            actionsHtml += `<button type="button" class="btn btn-outline-secondary" data-action="role-mgmt" data-id="${rawSub._id}" title="Change roles">
                                <i class="bi bi-shield-lock"></i>
                            </button>`;
                        }
                        if (canManageAdminRoles) {
                            actionsHtml += `<button type="button" class="btn btn-outline-warning" data-action="role-mgmt-admin" data-id="${rawSub._id}" title="Change admin role">
                                <i class="bi bi-shield-exclamation"></i>
                            </button>`;
                        }
                        // Add Groups management button
                        if (canManageRoles) { 
                             actionsHtml += `<button type="button" class="btn btn-outline-primary" data-action="group-mgmt" data-id="${rawSub._id}" title="Manage Groups">
                                <i class="bi bi-people"></i>
                            </button>`;
                        }
                    } else {
                        // For non-user forms, show standard edit/view/delete buttons
                        // JSON view only for admins
                        if (state.adminMode) {
                            actionsHtml += `<button type="button" class="btn btn-outline-secondary" data-action="json" data-id="${rawSub._id}" title="View JSON">
                                <i class="bi bi-code-slash"></i>
                            </button>`;
                        }
                        
                        if (canViewThis) {
                            actionsHtml += `<button type="button" class="btn btn-outline-info" data-action="view" data-id="${rawSub._id}" title="View submission inline">
                                <i class="bi bi-eye"></i>
                            </button>`;
                        }
                        
                        if (canEditThis) {
                            actionsHtml += `<button type="button" class="btn btn-outline-primary" data-action="edit" data-id="${rawSub._id}" title="Edit submission inline">
                                <i class="bi bi-pencil-square"></i>
                            </button>`;
                        }
                        
                        if (canDeleteThis) {
                            actionsHtml += `<button type="button" class="btn btn-outline-danger" data-action="delete" data-id="${rawSub._id}" title="Delete submission">
                                <i class="bi bi-trash"></i>
                            </button>`;
                        }
                    }
                    
                    actionsHtml += '</div>';
                    return actionsHtml;
                },
                cellClick: async (e, cell) => {
                    const target = e?.target?.closest?.('button[data-action]');
                    const action = target?.dataset?.action;
                    const id = target?.dataset?.id;
                    if (!action || !id) return;

                    const rowData = cell.getRow().getData();
                    const rawSub = rowData?._raw || rowData;
                    
                    if (!rawSub) return;
                    
                    // Handle different actions
                    if (action === "json") {
                        const { actions } = getAppBridge();
                        actions.showJsonModal?.(rawSub.data || {});
                    } else if (action === "edit" || action === "view") {
                        const { startEditSubmission, startViewSubmission } = await import('./submissions.js?v=2.14');
                        if (action === "edit") {
                            startEditSubmission(rawSub);
                        } else {
                            startViewSubmission(rawSub);
                        }
                    } else if (action === "delete") {
                        const { showConfirm } = await import('../ui/modalUtils.js');
                        const { formioRequest } = await import('../services/formioService.js');
                        const { loadSubmissions } = await import('./submissions.js?v=2.14');
                        const { actions } = getAppBridge();
                        
                        const confirmed = await showConfirm("Delete this submission? This cannot be undone.");
                        if (!confirmed) return;
                        
                        try {
                            const path = String(formMeta?.path || '').replace(/^\/+/, '');
                            await formioRequest(`/${path}/submission/${id}`, { method: "DELETE" });
                            actions.showToast?.("Submission deleted.", "success");
                            await loadSubmissions(formMeta, permissions, user);
                        } catch (err) {
                            console.error("deleteSubmission error", err);
                            actions.showToast?.("Error deleting submission.", "danger");
                        }
                    } else if (action === "role-mgmt" || action === "role-mgmt-admin") {
                        // Check permissions before proceeding
                        if (action === 'role-mgmt' && !canManageRoles) return;
                        if (action === 'role-mgmt-admin' && !canManageAdminRoles) return;
                        
                        const variant = action === 'role-mgmt-admin' ? 'roleMgmtAdmin' : 'roleMgmt';

                        await openRoleMgmtModal({
                            targetUserSubmission: rawSub,
                            variant,
                            onSaved: async () => {
                                const { loadSubmissions } = await import('./submissions.js?v=2.14');
                                await loadSubmissions(formMeta, permissions, user);
                            }
                        });
                    } else if (action === "group-mgmt") {
                        const { openGroupMgmtModal } = await import(`./groupMgmt.js?v=${Date.now()}`);
                        await openGroupMgmtModal({
                            targetUserSubmission: rawSub,
                            onSaved: async () => {
                                const { loadSubmissions } = await import('./submissions.js?v=2.14');
                                await loadSubmissions(formMeta, permissions, user);
                            }
                        });
                    }
                }
            });
        }
            finalConfig.columns = cols;

        // Add default row double-click handler for editing if not specified (but not for user forms)
        if (!finalConfig.rowDblClick && !isUserResource) {
            finalConfig.rowDblClick = async (e, row) => {
                const data = row.getData();
                if (data?._raw) {
                    const { startEditSubmission } = await import('./submissions.js?v=2.14');
                    startEditSubmission(data._raw);
                }
            };
        }

        // Create new Tabulator instance
        state.currentSubsTabulator = new Tabulator(host, {
            data: transformedData,
            ...finalConfig
        });

        return true;
    } catch (e) {
        console.error('Error rendering tabulator list:', e);
        return false;
    }
}

/**
 * Destroy existing tabulator instance
 */
export function destroyTabulator() {
    const { state } = getAppBridge();
    
    if (state.currentSubsTabulator) {
        try { 
            state.currentSubsTabulator.destroy(); 
        } catch (e) { 
            console.warn('Error destroying tabulator:', e);
        }
    }
    state.currentSubsTabulator = null;
}

/**
 * Check if a form has tabulator configuration
 */
export function hasTabulatorConfig(formMeta) {
    const config = formMeta?.settings?.tabulatorList;
    return config && config.enabled !== false;
}

/**
 * Get available data transform functions
 */
export function getDataTransforms() {
    return Object.keys(dataTransforms);
}
