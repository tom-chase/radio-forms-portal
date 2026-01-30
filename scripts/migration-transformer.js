const fetch = require('node-fetch');

const API_BASE = process.env.FORMIO_URL || 'http://localhost:3001';
const ROOT_EMAIL = process.env.ROOT_EMAIL || 'admin@dev.local';
const ROOT_PASSWORD = process.env.ROOT_PASSWORD || 'admin123';

// Helper to log with timestamp
const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

// Authenticates with the destination server to get a token.
async function authenticate(retries = 5, delay = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            log(`Authenticating as ${ROOT_EMAIL}... (Attempt ${i + 1}/${retries})`);
            const authResponse = await fetch(`${API_BASE}/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: { email: ROOT_EMAIL, password: ROOT_PASSWORD } })
            });

            if (authResponse.ok) {
                const token = authResponse.headers.get('x-jwt-token');
                if (token) {
                    log('Authentication successful.');
                    return token;
                }
            }
        } catch (err) {
            log(`Authentication error: ${err.message}`);
        }
        if (i < retries - 1) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error('Failed to authenticate after multiple attempts');
}

// Fetches all items for a given type (e.g., 'role', 'form')
async function fetchAll(resource, token) {
    const headers = { 'x-jwt-token': token };
    const response = await fetch(`${API_BASE}/${resource}?limit=1000`, { headers });
    if (!response.ok) {
        throw new Error(`Failed to fetch ${resource}: ${response.statusText}`);
    }
    return response.json();
}

// Ensures a specific submission exists, creating it if necessary.
async function ensureSubmission(formName, formId, matchData, createData, token) {
    const headers = { 'Content-Type': 'application/json', 'x-jwt-token': token };
    const query = new URLSearchParams(Object.entries(matchData).map(([k, v]) => [`data.${k}`, v])).toString();

    const searchResp = await fetch(`${API_BASE}/${formName}/submission?${query}`, { headers });
    const found = await searchResp.json();

    if (found && found.length > 0) {
        log(`Found existing ${formName} submission: ${found[0]._id}`);
        return found[0]._id;
    }

    log(`Creating ${formName} submission...`);
    const createResp = await fetch(`${API_BASE}/${formName}/submission`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ form: formId, data: createData })
    });
    const created = await createResp.json();
    log(`Created ${formName} submission: ${created._id}`);
    return created._id;
}


module.exports = async function(template, next) {
    try {
        log('Starting Form.io project transformation...');
        const token = await authenticate();

        // 1. Fetch live data from destination
        const [liveRoles, liveForms] = await Promise.all([
            fetchAll('role', token),
            fetchAll('form', token)
        ]);

        const roleMap = liveRoles.reduce((acc, role) => ({ ...acc, [role.machineName]: role._id }), {});
        const formMap = liveForms.reduce((acc, form) => ({ ...acc, [form.name]: form._id }), {});
        log(`Live Role Map: ${Object.keys(roleMap).join(', ')}`);

        // 2. Ensure critical group submissions exist (for groupPermissions)
        const departmentFormId = formMap['department'];
        const committeeFormId = formMap['committee'];
        if (!departmentFormId || !committeeFormId) {
            throw new Error('Department or Committee resource forms not found on destination!');
        }

        const engineeringDeptId = await ensureSubmission('department', departmentFormId, { name: 'Engineering' }, { name: 'Engineering', description: 'Engineering Department' }, token);
        const technologyCommId = await ensureSubmission('committee', committeeFormId, { name: 'Technology' }, { name: 'Technology', description: 'Technology Committee' }, token);

        // 3. Transform the template
        const transformedProject = JSON.parse(JSON.stringify(template)); // Deep copy

        for (const form of Object.values(transformedProject.forms)) {
            // a. Normalize role IDs in access rules
            const mapRoles = (rules) => rules.map(rule => ({
                ...rule,
                roles: rule.roles.map(roleName => roleMap[roleName] || roleName).filter(Boolean)
            }));
            if (form.access) form.access = mapRoles(form.access);
            if (form.submissionAccess) form.submissionAccess = mapRoles(form.submissionAccess);

            // b. Update group permission resource IDs
            if (form.settings && form.settings.groupPermissions) {
                form.settings.groupPermissions.forEach(perm => {
                    if (perm.resource === 'department') perm.resource = engineeringDeptId;
                    if (perm.resource === 'committee') perm.resource = technologyCommId;
                });
            }

            // c. Update conditional logic for roleMgmt form
            if (form.name === 'roleMgmt') {
                const mgmtComp = form.components.find(c => c.key === 'management');
                if (mgmtComp && mgmtComp.customConditional) {
                    const adminRoleId = roleMap['administrator'];
                    const mgmtRoleId = roleMap['management'];
                    if (adminRoleId && mgmtRoleId) {
                        mgmtComp.customConditional = `// Show Management checkbox only to admins and management\nshow = Array.isArray(user.roles) && (user.roles.indexOf('${adminRoleId}') !== -1 || user.roles.indexOf('${mgmtRoleId}') !== -1);`;
                        log('Updated roleMgmt conditional logic.');
                    }
                }
            }
        }

        log('Transformation complete.');
        next(null, transformedProject);
    } catch (error) {
        log(`FATAL ERROR in transformer: ${error.message}`);
        next(error);
    }
};
