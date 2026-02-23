// app/js/features/tabulatorLists.js

import { getAppBridge } from '../services/appBridge.js';
import { formioRequest } from '../services/formioService.js';
import { openRoleMgmtModal } from './roleMgmt.js';
import { log } from '../utils/logger.js';
import { isSubmissionViewed, markSubmissionViewed, onSubmissionViewed, decrementFormTotal } from '../services/badgeService.js';

function $(id) { return document.getElementById(id); }

function applyAccessorDerivedFields(rows, columns) {
    if (!Array.isArray(rows) || !Array.isArray(columns)) return { rows, columns };

    const accessorNameToField = {
        bookPrefaceTitleAccessor: 'title',
        bookPrefaceStatusAccessor: 'status',
        bookPrefaceAuthorAccessor: 'author',
        bookPrefaceVersionAccessor: 'version',
        bookPrefaceChapterCountAccessor: 'chapterCount',
    };

    const derivedCols = [];
    const visit = (cols) => {
        (cols || []).forEach((col) => {
            if (!col || typeof col !== 'object') return;
            if (Array.isArray(col.columns)) {
                visit(col.columns);
                return;
            }

            if (typeof col.accessor === 'function') {
                const name = col.__rfpAccessorName;
                const derivedField = accessorNameToField[name] || `_rfp_${String(col.title || col.field || 'col').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

                derivedCols.push({
                    derivedField,
                    sourceField: col.field,
                    accessor: col.accessor,
                    accessorParams: col.accessorParams,
                });

                col.field = derivedField;
                delete col.accessor;
                delete col.accessorParams;
                delete col.__rfpAccessorName;
            }
        });
    };

    visit(columns);
    if (!derivedCols.length) return { rows, columns };

    const safeCall = (fn, value, row, params, colDef) => {
        try {
            const out = fn(value, row, undefined, params, colDef);
            if (out === undefined || out === null) return '';
            if (typeof out === 'object') return '';
            return out;
        } catch (e) {
            console.warn('Error computing derived field for Tabulator column', e);
            return '';
        }
    };

    const derivedRows = rows.map((sub) => {
        const r = {
            _id: sub?._id,
            _raw: sub,
        };

        derivedCols.forEach((dc) => {
            const v = getNestedValue(sub, dc.sourceField);
            r[dc.derivedField] = safeCall(dc.accessor, v, sub, dc.accessorParams, undefined);
        });

        return r;
    });

    return { rows: derivedRows, columns };
}

window.__rfpGetAppBridge = getAppBridge;

function normalizeBookStatus(value) {
    if (value === undefined || value === null) return '';
    const s = String(value).trim();
    if (s === '') return '';
    if (s === '0') return 'draft';
    if (s === '1') return 'review';
    if (s === '2') return 'published';
    if (s === '3') return 'archived';
    return s;
}

function resolveColumnAccessors(columns) {
    if (!Array.isArray(columns)) return;

    const resolveAccessorValue = (val) => {
        if (typeof val !== 'string') return val;
        const prefix = 'rfpColumnAccessors.';
        if (!val.startsWith(prefix)) return val;
        const fnName = val.slice(prefix.length);
        const fn = window?.rfpColumnAccessors?.[fnName];
        if (typeof fn === 'function') return fn;
        console.warn('Tabulator accessor not found on window.rfpColumnAccessors:', fnName);
        return undefined;
    };

    const visit = (cols) => {
        (cols || []).forEach((col) => {
            if (!col || typeof col !== 'object') return;

            // If params exist without a valid headerFilter, Tabulator may still attempt to build a filter editor.
            if (!Object.prototype.hasOwnProperty.call(col, 'headerFilter') && Object.prototype.hasOwnProperty.call(col, 'headerFilterParams')) {
                delete col.headerFilterParams;
            }

            Object.keys(col).forEach((k) => {
                if (!k.startsWith('accessor')) return;

                const rawVal = col[k];
                const resolved = resolveAccessorValue(rawVal);

                if (resolved === undefined) {
                    delete col[k];
                    return;
                }

                if (typeof rawVal === 'string' && rawVal.startsWith('rfpColumnAccessors.')) {
                    col.__rfpAccessorName = rawVal.slice('rfpColumnAccessors.'.length);
                }

                col[k] = resolved;
            });

            if (Array.isArray(col.columns)) visit(col.columns);
        });
    };

    visit(columns);
}

function normalizeLookupFormatterParams(columns) {
    if (!Array.isArray(columns)) return;

    const visit = (cols) => {
        (cols || []).forEach((col) => {
            if (!col || typeof col !== 'object') return;

            if (col.formatter === 'lookup' && col.formatterParams && typeof col.formatterParams === 'object') {
                const fp = col.formatterParams;

                // If status keys exist, ensure numeric keys also map (some legacy data stores 0-3).
                if (fp.draft || fp.review || fp.published || fp.archived) {
                    fp[0] = fp[0] ?? fp.draft;
                    fp[1] = fp[1] ?? fp.review;
                    fp[2] = fp[2] ?? fp.published;
                    fp[3] = fp[3] ?? fp.archived;
                    fp['0'] = fp['0'] ?? fp.draft;
                    fp['1'] = fp['1'] ?? fp.review;
                    fp['2'] = fp['2'] ?? fp.published;
                    fp['3'] = fp['3'] ?? fp.archived;
                }
            }

            if (Array.isArray(col.columns)) visit(col.columns);
        });
    };

    visit(columns);
}

/**
 * Safely get a nested value from an object using a dot-notation string.
 * Supports array access like 'path[0].to.value'.
 */

/**
 * Data transform functions for special tabulator configurations
 */
/**
 * Accessor functions for Tabulator columns.
 * These must be globally available or attached to a global object to be used from JSON configs.
 */
const rfpColumnAccessors = {
    getNestedValue: (value, data, type, params, component) => {
        // 'data' is the full row data object
        // 'params' should contain { path: 'path.to.value' }
        if (!params.path) return undefined;
        return getNestedValue(data, params.path);
    },
    bookPrefaceTitleAccessor: (value, data) => {
        const preface = Array.isArray(value) ? value?.[0] : value;
        return preface?.title ?? '';
    },
    bookPrefaceStatusAccessor: (value, data) => {
        const preface = Array.isArray(value) ? value?.[0] : value;
        const raw = preface?.metadata?.status ?? preface?.status ?? '';
        return normalizeBookStatus(raw);
    },
    bookPrefaceAuthorAccessor: (value, data) => {
        const preface = Array.isArray(value) ? value?.[0] : value;
        const author = preface?.author;
        return author?.data?.email ?? author?.email ?? '';
    },
    bookPrefaceVersionAccessor: (value, data) => {
        const preface = Array.isArray(value) ? value?.[0] : value;
        return preface?.metadata?.version ?? preface?.version ?? '';
    },
    bookPrefaceChapterCountAccessor: (value, data) => {
        const preface = Array.isArray(value) ? value?.[0] : value;
        const fromPreface = preface?.metadata?.chapterCount ?? preface?.chapterCount;
        if (fromPreface !== undefined && fromPreface !== null && fromPreface !== '') return fromPreface;
        const chapters = data?.data?.chapters;
        return Array.isArray(chapters) ? chapters.length : '';
    },
};

// Make accessors globally available for Tabulator
window.rfpColumnAccessors = rfpColumnAccessors;

const dataTransforms = {
    /**
     * Flattens the nested book submission data for easy Tabulator rendering.
     */
    bookDataTransform: (submissions, formMeta) => {
        return (submissions || []).map(sub => {
            const preface = (Array.isArray(sub.data?.preface) && sub.data.preface.length > 0)
                ? sub.data.preface[0]
                : {};
            const meta = preface?.metadata || {};
            return {
                _id: sub._id,
                _raw: sub,
                title: preface.title || '',
                status: normalizeBookStatus(meta.status || preface.status || ''),
                author: preface.author?.data?.email || '',
                version: meta.version || preface.version || '',
                chapterCount: (meta.chapterCount ?? preface.chapterCount) ?? (Array.isArray(sub.data?.chapters) ? sub.data.chapters.length : ''),
            };
        });
    },
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

function sanitizeHeaderFilters(columns) {
    if (!Array.isArray(columns)) return;

    const allowed = new Set([
        'input',
        'textarea',
        'number',
        'range',
        'tickCross',
        'list',
        'autocomplete'
    ]);

    const visit = (cols) => {
        (cols || []).forEach((col) => {
            if (!col || typeof col !== 'object') return;

            if (Object.prototype.hasOwnProperty.call(col, 'headerFilter')) {
                const hf = col.headerFilter;

                // Tabulator supports: string editor name, function editor, or boolean (true => input)
                if (hf === true) {
                    col.headerFilter = 'input';
                } else if (hf === false || hf === undefined || hf === null) {
                    delete col.headerFilter;
                    if (Object.prototype.hasOwnProperty.call(col, 'headerFilterParams')) delete col.headerFilterParams;
                } else if (typeof hf === 'function') {
                    // ok
                } else if (typeof hf === 'string') {
                    const trimmed = hf.trim();
                    const invalidString = trimmed === '' || trimmed === 'undefined' || trimmed === 'null';
                    if (invalidString) {
                        delete col.headerFilter;
                        if (Object.prototype.hasOwnProperty.call(col, 'headerFilterParams')) delete col.headerFilterParams;
                    }
                    else if (trimmed === 'select') col.headerFilter = 'list';
                    else if (allowed.has(trimmed)) col.headerFilter = trimmed;
                    else {
                        delete col.headerFilter;
                        if (Object.prototype.hasOwnProperty.call(col, 'headerFilterParams')) delete col.headerFilterParams;
                    }
                } else {
                    // Any other type (object/number/etc) is invalid for our use.
                    delete col.headerFilter;
                    if (Object.prototype.hasOwnProperty.call(col, 'headerFilterParams')) delete col.headerFilterParams;
                }
            }

            if (Array.isArray(col.columns)) visit(col.columns);
        });
    };

    visit(columns);
}

/**
 * Merge form-specific config with defaults
 */

/**
 * Merge form-specific config with defaults
 */

function mergeTabulatorConfig(formConfig = {}) {
    const defaultConfig = createDefaultConfig();
    const mergedColumns = Array.isArray(formConfig.columns) ? formConfig.columns.map(c => ({ ...c })) : defaultConfig.columns;


    sanitizeHeaderFilters(mergedColumns);

    return {
        ...defaultConfig,
        ...formConfig,
        columns: mergedColumns
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
        
        const hideDownloads = formMeta?.settings?.ui?.hideDownloads === true;
        const isAdminOrManagement = state.adminMode || permissions?.canUpdateAll;
        const showDownloads = !hideDownloads && !!isAdminOrManagement;

        const viewToggleHtml = await renderViewToggle(formMeta, state.currentSubmissionView || 'tabulator', { showDownloads });
        subsList.innerHTML = viewToggleHtml + '<div id="rfpSubsTabulator"></div>';
        const host = document.getElementById("rfpSubsTabulator");
        if (!host) return false;

        // Apply data transform if specified
        let transformedData = await applyDataTransform(
            submissions, 
            tabulatorConfig.dataTransform, 
            formMeta
        );

        // Destroy existing tabulator instance
        destroyTabulator();

        // Merge configuration
        const finalConfig = mergeTabulatorConfig(tabulatorConfig);

        // Debug hook for DevTools (we overwrite later after we derive row fields)
        window.__rfpLastTabulatorData = transformedData;

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
                title: '',
                field: '_rfp_actions',
                hozAlign: 'center',
                headerSort: false,
                width: 50,
                resizable: false,
                download: false,
                cssClass: 'rfp-actions-cell',
                formatter: (cell, formatterParams, onRendered) => {
                    const rowData = cell.getRow().getData();
                    const rawSub = rowData?._raw || rowData;
                    
                    if (!rawSub || !rawSub._id) return '';
                    
                    const currentUserId = user?._id || null;
                    const isOwner = !!currentUserId && rawSub.owner === currentUserId;
                    
                    const canEditThis = permissions?.canUpdateAll || (permissions?.canUpdateOwn && isOwner);
                    const canDeleteThis = permissions?.canDeleteAll || (permissions?.canDeleteOwn && isOwner);
                    const canViewThis = permissions?.canReadAll || (permissions?.canReadOwn && isOwner);

                    const items = [];

                    if (isUserResource) {
                        if (canManageRoles) {
                            items.push(`<button class="rfp-kebab-item" data-action="role-mgmt" data-id="${rawSub._id}">Change Roles</button>`);
                        }
                        if (canManageAdminRoles) {
                            items.push(`<button class="rfp-kebab-item" data-action="role-mgmt-admin" data-id="${rawSub._id}">Change Admin Role</button>`);
                        }
                        if (canManageRoles) {
                            items.push(`<button class="rfp-kebab-item" data-action="group-mgmt" data-id="${rawSub._id}">Manage Groups</button>`);
                        }
                    } else {
                        if (canViewThis) {
                            items.push(`<button class="rfp-kebab-item" data-action="view" data-id="${rawSub._id}">View</button>`);
                        }
                        if (canEditThis) {
                            items.push(`<button class="rfp-kebab-item" data-action="edit" data-id="${rawSub._id}">Edit</button>`);
                        }
                        if (state.adminMode) {
                            items.push(`<button class="rfp-kebab-item" data-action="json" data-id="${rawSub._id}">View JSON</button>`);
                        }
                        if (canDeleteThis) {
                            if (items.length) items.push('<div class="rfp-kebab-divider"></div>');
                            items.push(`<button class="rfp-kebab-item text-danger" data-action="delete" data-id="${rawSub._id}">Delete</button>`);
                        }
                    }

                    if (!items.length) return '';

                    return `<div class="rfp-kebab-dropdown">
                        <button type="button" class="rfp-kebab-btn" aria-label="Actions"><i class="bi bi-three-dots-vertical"></i></button>
                        <div class="rfp-kebab-menu">${items.join('')}</div>
                    </div>`;
                },
                cellClick: async (e, cell) => {
                    // Handle kebab toggle
                    const kebabBtn = e?.target?.closest?.('.rfp-kebab-btn');
                    if (kebabBtn) {
                        const menu = kebabBtn.nextElementSibling;
                        if (!menu) return;

                        // Close any other open menus first
                        document.querySelectorAll('.rfp-kebab-menu.show').forEach(m => {
                            if (m !== menu) m.classList.remove('show');
                        });

                        // Determine drop direction based on viewport position
                        const rect = kebabBtn.getBoundingClientRect();
                        const spaceBelow = window.innerHeight - rect.bottom;
                        menu.classList.toggle('rfp-dropup', spaceBelow < 200);

                        menu.classList.toggle('show');
                        e.stopPropagation();
                        return;
                    }

                    // Handle menu item click
                    const target = e?.target?.closest?.('.rfp-kebab-item');
                    const action = target?.dataset?.action;
                    const id = target?.dataset?.id;
                    if (!action || !id) return;

                    // Close the menu
                    const openMenu = target.closest('.rfp-kebab-menu');
                    if (openMenu) openMenu.classList.remove('show');

                    const rowData = cell.getRow().getData();
                    const rawSub = rowData?._raw || rowData;
                    
                    if (!rawSub) return;
                    
                    if (action === "json") {
                        const { actions } = getAppBridge();
                        actions.showJsonModal?.(rawSub.data || {});
                    } else if (action === "edit" || action === "view") {
                        const { startEditSubmission, startViewSubmission } = await import('./submissions.js?v=2.19');
                        // Mark as viewed and remove new-row indicator
                        if (rawSub._id && formMeta?._id) {
                            markSubmissionViewed(rawSub._id, formMeta._id).then(wasNew => {
                                if (wasNew) {
                                    onSubmissionViewed(formMeta._id, rawSub._id);
                                    // Remove new-row indicator from this row
                                    const rowEl = cell.getRow().getElement();
                                    if (rowEl) rowEl.classList.remove('rfp-tabulator-new-row');
                                }
                            }).catch(() => {});
                        }
                        if (action === "edit") {
                            startEditSubmission(rawSub);
                        } else {
                            startViewSubmission(rawSub);
                        }
                    } else if (action === "delete") {
                        const { showConfirm } = await import('../ui/modalUtils.js');
                        const { formioRequest } = await import('../services/formioService.js');
                        const { loadSubmissions } = await import('./submissions.js?v=2.19');
                        const { actions } = getAppBridge();
                        
                        const confirmed = await showConfirm("Delete this submission? This cannot be undone.");
                        if (!confirmed) return;
                        
                        try {
                            const path = String(formMeta?.path || '').replace(/^\/+/, '');
                            await formioRequest(`/${path}/submission/${id}`, { method: "DELETE" });
                            // Update sidebar badge counts
                            if (formMeta?._id) decrementFormTotal(formMeta._id, id);
                            actions.showToast?.("Submission deleted.", "success");
                            await loadSubmissions(formMeta, permissions, user);
                        } catch (err) {
                            console.error("deleteSubmission error", err);
                            actions.showToast?.("Error deleting submission.", "danger");
                        }
                    } else if (action === "role-mgmt" || action === "role-mgmt-admin") {
                        if (action === 'role-mgmt' && !canManageRoles) return;
                        if (action === 'role-mgmt-admin' && !canManageAdminRoles) return;
                        
                        const variant = action === 'role-mgmt-admin' ? 'roleMgmtAdmin' : 'roleMgmt';

                        await openRoleMgmtModal({
                            targetUserSubmission: rawSub,
                            variant,
                            onSaved: async () => {
                                const { loadSubmissions } = await import('./submissions.js?v=2.19');
                                await loadSubmissions(formMeta, permissions, user);
                            }
                        });
                    } else if (action === "group-mgmt") {
                        const { openGroupMgmtModal } = await import(`./groupMgmt.js?v=${Date.now()}`);
                        await openGroupMgmtModal({
                            targetUserSubmission: rawSub,
                            onSaved: async () => {
                                const { loadSubmissions } = await import('./submissions.js?v=2.19');
                                await loadSubmissions(formMeta, permissions, user);
                            }
                        });
                    }
                }
            });
        }
        // Re-sanitize after we mutate/append columns.
        resolveColumnAccessors(cols);
        const derived = applyAccessorDerivedFields(transformedData, cols);
        transformedData = derived.rows;
        sanitizeHeaderFilters(cols);
        normalizeLookupFormatterParams(cols);
        finalConfig.columns = cols;

        // Debug hooks for DevTools (this is the actual data/config sent to Tabulator)
        window.__rfpLastTabulatorData = transformedData;

        // Snapshot the final config actually sent to Tabulator.
        window.__rfpLastTabulatorConfig = finalConfig;

        // Final safety pass: ensure no column has a present-but-invalid headerFilter.
        // (Missing headerFilter is OK; Tabulator errors if it exists but resolves to an unknown editor.)
        sanitizeHeaderFilters(finalConfig.columns);

        // Add default row double-click handler for editing if not specified (but not for user forms)
        if (!finalConfig.rowDblClick && !isUserResource) {
            finalConfig.rowDblClick = async (e, row) => {
                const data = row.getData();
                if (data?._raw) {
                    // Mark as viewed and remove new-row indicator
                    const subId = data._raw._id;
                    if (subId && formMeta?._id) {
                        markSubmissionViewed(subId, formMeta._id).then(wasNew => {
                            if (wasNew) {
                                onSubmissionViewed(formMeta._id, subId);
                                const rowEl = row.getElement();
                                if (rowEl) rowEl.classList.remove('rfp-tabulator-new-row');
                            }
                        }).catch(() => {});
                    }
                    const { startEditSubmission } = await import('./submissions.js?v=2.19');
                    startEditSubmission(data._raw);
                }
            };
        }

        // Add rowFormatter for new-row indicators (skip if badges disabled for this form)
        if (!formMeta?.settings?.ui?.hideBadges) {
            const origRowFormatter = finalConfig.rowFormatter;
            finalConfig.rowFormatter = (row) => {
                if (origRowFormatter) origRowFormatter(row);
                const data = row.getData();
                const subId = data?._raw?._id || data?._id;
                if (subId && !isSubmissionViewed(subId)) {
                    row.getElement().classList.add('rfp-tabulator-new-row');
                }
            };
        }

        (finalConfig.columns || []).forEach((c) => {
            if (!c || typeof c !== 'object') return;
            if (!Object.prototype.hasOwnProperty.call(c, 'headerFilter')) return;
            const hf = c.headerFilter;
            const invalidString = typeof hf === 'string' && ['','undefined','null'].includes(hf.trim());
            if (hf === undefined || invalidString) {
                console.warn('Invalid Tabulator headerFilter for column:', c);
                delete c.headerFilter;
            }
        });

        state.currentSubsTabulator = new Tabulator(host, {
            data: transformedData,
            ...finalConfig
        });

        window.__rfpSubsTabulator = state.currentSubsTabulator;

        // Wire download buttons
        if (showDownloads) {
            const safeTitle = (formMeta?.title || formMeta?.name || 'export')
                .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            subsList.querySelectorAll('.rfp-download-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const fmt = btn.dataset.format;
                    state.currentSubsTabulator?.download(fmt, `${safeTitle}.${fmt}`);
                });
            });
        }

        // Close any open kebab menus when clicking outside
        if (!window.__rfpKebabCloseHandler) {
            window.__rfpKebabCloseHandler = (e) => {
                if (!e.target.closest('.rfp-kebab-dropdown')) {
                    document.querySelectorAll('.rfp-kebab-menu.show').forEach(m => m.classList.remove('show'));
                }
            };
            document.addEventListener('click', window.__rfpKebabCloseHandler);
        }

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
