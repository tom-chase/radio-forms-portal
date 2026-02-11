const API_BASE = process.env.FORMIO_DOMAIN || 'http://localhost:3001';
const ROOT_EMAIL = process.env.ROOT_EMAIL || 'admin@dev.local';
const ROOT_PASSWORD = process.env.ROOT_PASSWORD || 'admin123';

const fs = require('fs');

// Helper to log with timestamp
const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

async function authenticate(retries = 5, delay = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            log(`Authenticating as ${ROOT_EMAIL}... (Attempt ${i + 1}/${retries})`);
            const authResponse = await fetch(`${API_BASE}/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: {
                        email: ROOT_EMAIL,
                        password: ROOT_PASSWORD
                    }
                })
            });

            if (authResponse.ok) {
                const token = authResponse.headers.get('x-jwt-token');
                if (token) {
                    log('Authentication successful.');
                    return token;
                }
            } else {
                log(`Authentication failed: ${authResponse.status} ${authResponse.statusText}`);
            }
        } catch (err) {
            log(`Authentication error: ${err.message}`);
        }
        
        if (i < retries - 1) {
            log(`Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error('Failed to authenticate after multiple attempts');
}

async function main() {
    log('Starting post-bootstrap configuration...');

    // 1. Authenticate
    const token = await authenticate();

    const headers = {
        'Content-Type': 'application/json',
        'x-jwt-token': token
    };

    // 2. Fetch Roles (to map machine names to IDs)
    log('Fetching roles...');
    const rolesResponse = await fetch(`${API_BASE}/role?limit=100`, { headers });
    const roles = await rolesResponse.json();
    const roleMap = roles.reduce((acc, role) => {
        acc[role.machineName] = role._id;
        return acc;
    }, {});
    log(`Found roles: ${Object.keys(roleMap).join(', ')}`);

    // 3. Fetch Forms/Resources (to map machine names to IDs)
    log('Fetching forms and resources...');
    const formsResponse = await fetch(`${API_BASE}/form?limit=100&select=_id,name,title,path`, { headers });
    const forms = await formsResponse.json();
    const formMap = forms.reduce((acc, form) => {
        acc[form.name] = form._id;
        return acc;
    }, {});
    log(`Found ${forms.length} forms.`);

    const templatePath = process.env.DEFAULT_TEMPLATE_PATH || './config/bootstrap/default-template.json';
    let templateForms = null;
    const getTemplateForms = () => {
        if (templateForms) return templateForms;
        try {
            const raw = fs.readFileSync(templatePath, 'utf8');
            const parsed = JSON.parse(raw);
            const forms = parsed && parsed.forms ? parsed.forms : {};
            const resources = parsed && parsed.resources ? parsed.resources : {};
            templateForms = { ...forms, ...resources };
            const formCount = Object.keys(forms).length;
            const resourceCount = Object.keys(resources).length;
            log(`Loaded default template from ${templatePath} (${formCount} forms, ${resourceCount} resources).`);
            return templateForms;
        } catch (e) {
            log(`WARNING: Could not read default template at ${templatePath}: ${e.message}`);
            templateForms = null;
            return null;
        }
    };

    const mapRoleNamesToIds = (rolesList) => {
        if (!Array.isArray(rolesList)) return rolesList;
        return rolesList
            .map((r) => (typeof r === 'string' && roleMap[r] ? roleMap[r] : r))
            .filter((r) => !!r);
    };

    const normalizeAccessRoles = (formDef) => {
        if (!formDef || typeof formDef !== 'object') return formDef;

        if (Array.isArray(formDef.access)) {
            formDef.access = formDef.access.map((rule) => {
                if (rule && Array.isArray(rule.roles)) {
                    return { ...rule, roles: mapRoleNamesToIds(rule.roles) };
                }
                return rule;
            });
        }

        if (Array.isArray(formDef.submissionAccess)) {
            formDef.submissionAccess = formDef.submissionAccess.map((rule) => {
                if (rule && Array.isArray(rule.roles)) {
                    return { ...rule, roles: mapRoleNamesToIds(rule.roles) };
                }
                return rule;
            });
        }

        return formDef;
    };

    const syncFormSchema = async (formName) => {
        const formId = formMap[formName];
        const formsFromTemplate = getTemplateForms();

        if (!formId || !formsFromTemplate || !formsFromTemplate[formName]) {
            return;
        }

        try {
            const formResp = await fetch(`${API_BASE}/form/${formId}`, { headers });
            if (!formResp.ok) {
                log(`WARNING: Could not fetch form ${formName} for schema sync`);
                return;
            }

            const currentForm = await formResp.json();
            const templateFormRaw = formsFromTemplate[formName];
            const templateForm = normalizeAccessRoles(JSON.parse(JSON.stringify(templateFormRaw)));

            const keysToSync = ['title', 'name', 'path', 'type', 'display', 'components', 'settings', 'tags', 'pdfComponents'];
            let updated = false;

            for (const k of keysToSync) {
                if (!Object.prototype.hasOwnProperty.call(templateForm, k)) continue;
                if (JSON.stringify(currentForm[k]) !== JSON.stringify(templateForm[k])) {
                    currentForm[k] = templateForm[k];
                    updated = true;
                }
            }

            if (!updated) {
                return;
            }

            log(`Syncing schema for ${formName}...`);
            const updateResp = await fetch(`${API_BASE}/form/${formId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(currentForm)
            });

            if (!updateResp.ok) {
                const text = await updateResp.text();
                log(`ERROR: Failed to sync schema for ${formName}: ${updateResp.status} ${text}`);
            } else {
                log(`Updated schema for ${formName}`);
            }
        } catch (e) {
            log(`ERROR: Exception syncing schema for ${formName}: ${e.message}`);
        }
    };

    const createFormFromTemplate = async (formName) => {
        if (formMap[formName]) {
            return formMap[formName];
        }

        const formsFromTemplate = getTemplateForms();
        if (!formsFromTemplate || !formsFromTemplate[formName]) {
            log(`WARNING: Template does not include form '${formName}'.`);
            return null;
        }

        try {
            log(`Creating missing form '${formName}' from default-template.json...`);

            const createBody = normalizeAccessRoles(JSON.parse(JSON.stringify(formsFromTemplate[formName])));
            const createResp = await fetch(`${API_BASE}/form`, {
                method: 'POST',
                headers,
                body: JSON.stringify(createBody)
            });

            if (!createResp.ok) {
                const text = await createResp.text();
                log(`ERROR: Failed to create form '${formName}': ${createResp.status} ${createResp.statusText} - ${text}`);
                return null;
            }

            const created = await createResp.json();
            if (created && created._id) {
                formMap[formName] = created._id;
                log(`Created form '${formName}' with id ${created._id}`);
                return created._id;
            }

            log(`ERROR: Unexpected response creating form '${formName}'.`);
            return null;
        } catch (e) {
            log(`ERROR: Exception creating form '${formName}': ${e.message}`);
            return null;
        }
    };

    const componentKeyExists = (components, key) => {
        if (!Array.isArray(components)) return false;
        for (const comp of components) {
            if (comp && comp.key === key) return true;
            if (componentKeyExists(comp && comp.components, key)) return true;
            if (componentKeyExists(comp && comp.columns && comp.columns.flatMap(c => c.components || []), key)) return true;
            if (componentKeyExists(comp && comp.rows && Array.isArray(comp.rows) ? comp.rows.flatMap(r => Array.isArray(r) ? r.flatMap(c => c.components || []) : []) : null, key)) return true;
        }
        return false;
    };

    const findComponentByKey = (components, key) => {
        if (!Array.isArray(components)) return null;
        for (const comp of components) {
            if (comp && comp.key === key) return comp;
            const inComponents = findComponentByKey(comp && comp.components, key);
            if (inComponents) return inComponents;
            const colComps = comp && comp.columns ? comp.columns.flatMap(c => c.components || []) : null;
            const inCols = findComponentByKey(colComps, key);
            if (inCols) return inCols;
            const rowComps = comp && comp.rows && Array.isArray(comp.rows) ? comp.rows.flatMap(r => Array.isArray(r) ? r.flatMap(c => c.components || []) : []) : null;
            const inRows = findComponentByKey(rowComps, key);
            if (inRows) return inRows;
        }
        return null;
    };

    const ensureUserGroupFields = async () => {
        const userId = formMap['user'];
        const formsFromTemplate = getTemplateForms();
        if (!userId || !formsFromTemplate || !formsFromTemplate['user']) return;

        try {
            const formResp = await fetch(`${API_BASE}/form/${userId}`, { headers });
            const userForm = await formResp.json();
            const hasDepartments = componentKeyExists(userForm.components || [], 'departments');
            const hasCommittees = componentKeyExists(userForm.components || [], 'committees');

            if (hasDepartments && hasCommittees) {
                return;
            }

            const templateUserForm = formsFromTemplate['user'];
            const departmentsComp = hasDepartments ? null : findComponentByKey(templateUserForm.components || [], 'departments');
            const committeesComp = hasCommittees ? null : findComponentByKey(templateUserForm.components || [], 'committees');

            const toAdd = [];
            if (departmentsComp) toAdd.push(JSON.parse(JSON.stringify(departmentsComp)));
            if (committeesComp) toAdd.push(JSON.parse(JSON.stringify(committeesComp)));

            if (!toAdd.length) return;

            userForm.components = Array.isArray(userForm.components) ? userForm.components : [];
            userForm.components.push(...toAdd);

            log('Updating user form to include missing group fields...');
            const putResp = await fetch(`${API_BASE}/form/${userId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(userForm)
            });

            if (!putResp.ok) {
                const text = await putResp.text();
                log(`ERROR: Failed updating user form group fields: ${putResp.status} ${putResp.statusText} - ${text}`);
            }
        } catch (e) {
            log(`ERROR: Exception updating user form group fields: ${e.message}`);
        }
    };

    const syncFormPermissions = async (formName) => {
        const formId = formMap[formName];
        const formsFromTemplate = getTemplateForms();
        
        if (!formId || !formsFromTemplate || !formsFromTemplate[formName]) {
            return;
        }

        try {
            const formResp = await fetch(`${API_BASE}/form/${formId}`, { headers });
            if (!formResp.ok) {
                log(`WARNING: Could not fetch form ${formName} for permission sync`);
                return;
            }

            const currentForm = await formResp.json();
            const templateForm = formsFromTemplate[formName];
            
            let updated = false;

            // Sync access rules
            if (templateForm.access && JSON.stringify(currentForm.access) !== JSON.stringify(templateForm.access)) {
                currentForm.access = normalizeAccessRoles(templateForm).access;
                updated = true;
                log(`Syncing access rules for ${formName}...`);
            }

            // Sync submissionAccess rules
            if (templateForm.submissionAccess && JSON.stringify(currentForm.submissionAccess) !== JSON.stringify(templateForm.submissionAccess)) {
                currentForm.submissionAccess = normalizeAccessRoles(templateForm).submissionAccess;
                updated = true;
                log(`Syncing submission access rules for ${formName}...`);
            }

            if (!updated) {
                return;
            }

            const updateResp = await fetch(`${API_BASE}/form/${formId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(currentForm)
            });

            if (!updateResp.ok) {
                const text = await updateResp.text();
                log(`ERROR: Failed to sync permissions for ${formName}: ${updateResp.status} ${text}`);
            } else {
                log(`Updated permissions for ${formName}`);
            }
        } catch (e) {
            log(`ERROR: Exception syncing permissions for ${formName}: ${e.message}`);
        }
    };

    await createFormFromTemplate('department');
    await createFormFromTemplate('committee');
    await ensureUserGroupFields();

    // Sync permissions from template for all forms
    log('Syncing permissions from template...');
    const formsToSync = Object.keys(formMap).filter((name) => name !== 'book');
    for (const formName of formsToSync) {
        await syncFormPermissions(formName);
    }

    // --- Task 1: Update Group Permissions in Forms ---
    // Critical Fix: groupPermissions.resource must be a SUBMISSION ID (Specific Group), not a FORM ID.
    // We must ensure the specific groups exist (e.g. "Engineering" Dept) and link to them.

    // Helper to find or create a submission
    const ensureSubmission = async (formName, matchData, createData) => {
        const formId = formMap[formName];
        if (!formId) return null;

        try {
            // Build query string from matchData
            const queryParts = Object.entries(matchData).map(([k, v]) => `data.${k}=${encodeURIComponent(v)}`);
            const query = queryParts.join('&');
            
            const searchResp = await fetch(`${API_BASE}/${formName}/submission?${query}`, { headers });
            const found = await searchResp.json();

            if (found && found.length > 0) {
                log(`Found existing ${formName} submission: ${found[0]._id}`);
                return found[0]._id;
            }

            log(`Creating ${formName} submission (formId: ${formId})...`);
            const createResp = await fetch(`${API_BASE}/${formName}/submission`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    form: formId,
                    data: createData
                })
            });
            const created = await createResp.json();
            log(`Created ${formName} submission: ${created._id}`);
            return created._id;
        } catch (e) {
            log(`Error ensuring submission for ${formName}: ${e.message}`);
            return null;
        }
    };

    // --- Declarative group submission map ---
    // To add a new group: add one entry here + _groupName in the form template + form name to formsToUpdate.
    const groupSubmissions = {
        Engineering: await ensureSubmission('department', { name: 'Engineering' }, { name: 'Engineering', description: 'Engineering Department' }),
        Underwriting: await ensureSubmission('department', { name: 'Underwriting' }, { name: 'Underwriting', description: 'Underwriting Department' }),
        Programming: await ensureSubmission('department', { name: 'Programming' }, { name: 'Programming', description: 'Programming Department' }),
        Technology: await ensureSubmission('committee', { name: 'Technology' }, { name: 'Technology', description: 'Technology Committee' }),
    };

    log(`Group submission IDs: ${JSON.stringify(Object.fromEntries(Object.entries(groupSubmissions).filter(([, v]) => v)))}`);

    // All forms that use groupPermissions
    const formsToUpdate = [
        'incidentReport', 'engineeringSchedule',
        'contactIntake', 'uwContracts', 'uwCampaigns', 'uwSpots', 'uwLogs',
        'programmingShow', 'programmingRundown'
    ];

    for (const formName of formsToUpdate) {
        const formId = formMap[formName];
        if (!formId) {
            log(`Form ${formName} not found. Skipping group permissions.`);
            continue;
        }

        const formResp = await fetch(`${API_BASE}/form/${formId}`, { headers });
        if (!formResp.ok) {
            log(`WARNING: Could not fetch form ${formName} for group permissions update.`);
            continue;
        }
        const form = await formResp.json();

        let updated = false;
        if (form.settings && Array.isArray(form.settings.groupPermissions)) {
            form.settings.groupPermissions = form.settings.groupPermissions.map(perm => {
                // Data-driven resolution via _groupName marker
                if (perm._groupName && groupSubmissions[perm._groupName]) {
                    const targetId = groupSubmissions[perm._groupName];
                    if (perm.resource !== targetId) {
                        perm.resource = targetId;
                        updated = true;
                    }
                    return perm;
                }

                // Legacy fallback for entries without _groupName (backward compat)
                const isDept = (perm.resource === 'department' || perm.resource === formMap['department'] || !perm.access.includes('delete_all'));
                const isComm = (perm.resource === 'committee' || perm.resource === formMap['committee'] || perm.access.includes('delete_all'));

                if (isDept && groupSubmissions.Engineering) {
                    if (perm.resource !== groupSubmissions.Engineering) {
                        perm.resource = groupSubmissions.Engineering;
                        updated = true;
                    }
                } else if (isComm && groupSubmissions.Technology) {
                    if (perm.resource !== groupSubmissions.Technology) {
                        perm.resource = groupSubmissions.Technology;
                        updated = true;
                    }
                }
                return perm;
            });
        }

        if (updated) {
            await fetch(`${API_BASE}/form/${formId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(form)
            });
            log(`Updated ${formName} group permissions.`);
        } else {
            log(`No changes needed for ${formName}.`);
        }
    }

    // --- Task 2: Update roleMgmt Conditional Logic ---
    const roleMgmtId = formMap['roleMgmt'];
    if (roleMgmtId) {
        log('Checking roleMgmt conditional logic...');
        const formResp = await fetch(`${API_BASE}/form/${roleMgmtId}`, { headers });
        const form = await formResp.json();
        
        const adminRoleId = roleMap['administrator'];
        const mgmtRoleId = roleMap['management'];
        
        if (adminRoleId && mgmtRoleId) {
            // Find the 'management' checkbox component
            const findComponent = (components) => {
                for (const comp of components) {
                    if (comp.key === 'management') return comp;
                    if (comp.components) {
                        const found = findComponent(comp.components);
                        if (found) return found;
                    }
                }
                return null;
            };

            const mgmtComp = findComponent(form.components || []);
            if (mgmtComp) {
                const oldLogic = mgmtComp.customConditional || '';
                const targetLogic = `// Show Management checkbox only to admins and management
show = Array.isArray(user.roles) &&
       (user.roles.indexOf('${adminRoleId}') !== -1 ||
       user.roles.indexOf('${mgmtRoleId}') !== -1);
`;

                if (oldLogic.replace(/\s+/g, '') !== targetLogic.replace(/\s+/g, '')) {
                    mgmtComp.customConditional = targetLogic;
                    await fetch(`${API_BASE}/form/${roleMgmtId}`, {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify(form)
                    });
                    log('Updated roleMgmt conditional logic.');
                } else {
                    log('roleMgmt conditional logic is already up to date.');
                }
            }
        } else {
            log('WARNING: Administrator or Management role not found. Skipping roleMgmt update.');
        }
    }

    // --- Task 3: Resolve shareRoles select values to role IDs ---
    // Forms with a shareRoles field use dataSrc:"values" with role machine names
    // as placeholders. Rewrite them to actual role IDs so checkSubmissionRowAccess works.
    const formsWithShareRoles = ['note', 'event'];
    for (const shareFormName of formsWithShareRoles) {
        const shareFormId = formMap[shareFormName];
        if (!shareFormId) continue;

        log(`Checking shareRoles values in ${shareFormName} form...`);
        const shareResp = await fetch(`${API_BASE}/form/${shareFormId}`, { headers });
        if (!shareResp.ok) continue;

        const shareForm = await shareResp.json();
        const shareRolesComp = findComponentByKey(shareForm.components || [], 'shareRoles');
        if (!shareRolesComp || !shareRolesComp.data || !Array.isArray(shareRolesComp.data.values)) continue;

        let changed = false;
        shareRolesComp.data.values = shareRolesComp.data.values.map(v => {
            const machName = v.value;
            if (machName && roleMap[machName] && machName !== roleMap[machName]) {
                changed = true;
                return { label: v.label, value: roleMap[machName] };
            }
            return v;
        });
        if (changed) {
            const putResp = await fetch(`${API_BASE}/form/${shareFormId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(shareForm)
            });
            if (putResp.ok) {
                log(`Updated ${shareFormName} shareRoles values with role IDs.`);
            } else {
                log(`ERROR: Failed to update ${shareFormName} shareRoles: ${putResp.status}`);
            }
        } else {
            log(`${shareFormName} shareRoles values already resolved.`);
        }
    }

    log('Post-bootstrap configuration complete.');
}

main().catch(err => {
    console.error('FATAL ERROR:', err);
    process.exit(1);
});
