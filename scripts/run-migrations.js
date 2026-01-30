#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const API_BASE = process.env.FORMIO_API_BASE || 'http://localhost:3001';
const ROOT_EMAIL = process.env.ROOT_EMAIL || 'admin@localhost.local';
const ROOT_PASSWORD = process.env.ROOT_PASSWORD || 'CHANGEME';
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || '/app/migrations';

const log = (msg) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${msg}`);
};

const authenticate = async () => {
    log(`Authenticating as ${ROOT_EMAIL}...`);
    const resp = await fetch(`${API_BASE}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { email: ROOT_EMAIL, password: ROOT_PASSWORD } })
    });

    if (!resp.ok) {
        throw new Error(`Authentication failed: ${resp.status} ${resp.statusText}`);
    }

    const token = resp.headers.get('x-jwt-token');
    if (!token) {
        throw new Error('No JWT token received from authentication');
    }

    log('Authentication successful');
    return token;
};

const ensureMigrationResource = async (headers) => {
    log('Checking for migration resource...');
    
    const checkResp = await fetch(`${API_BASE}/form?name=migration`, { headers });
    const forms = await checkResp.json();
    
    if (forms && forms.length > 0) {
        log('Migration resource already exists');
        return forms[0]._id;
    }

    log('Creating migration resource...');
    const createResp = await fetch(`${API_BASE}/form`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            title: 'Migration',
            name: 'migration',
            path: 'migration',
            type: 'resource',
            display: 'form',
            components: [
                {
                    type: 'textfield',
                    key: 'migrationId',
                    label: 'Migration ID',
                    validate: { required: true, unique: true }
                },
                {
                    type: 'datetime',
                    key: 'appliedAt',
                    label: 'Applied At',
                    defaultValue: 'moment()'
                },
                {
                    type: 'select',
                    key: 'status',
                    label: 'Status',
                    data: {
                        values: [
                            { label: 'Completed', value: 'completed' },
                            { label: 'Failed', value: 'failed' }
                        ]
                    }
                },
                {
                    type: 'textarea',
                    key: 'error',
                    label: 'Error Message'
                }
            ],
            access: [
                { type: 'read_all', roles: [] },
                { type: 'create_all', roles: [] },
                { type: 'update_all', roles: [] },
                { type: 'delete_all', roles: [] }
            ],
            settings: {
                ui: {
                    formsList: { hidden: true }
                }
            }
        })
    });

    if (!createResp.ok) {
        throw new Error(`Failed to create migration resource: ${createResp.statusText}`);
    }

    const created = await createResp.json();
    log(`Migration resource created with id ${created._id}`);
    return created._id;
};

const getAppliedMigrations = async (headers) => {
    const resp = await fetch(`${API_BASE}/migration/submission?limit=1000`, { headers });
    if (!resp.ok) {
        return [];
    }
    const submissions = await resp.json();
    return submissions
        .filter(s => s.data && s.data.status === 'completed')
        .map(s => s.data.migrationId);
};

const recordMigration = async (headers, migrationId, status, error = null) => {
    const data = {
        migrationId,
        appliedAt: new Date().toISOString(),
        status,
        error
    };

    const resp = await fetch(`${API_BASE}/migration/submission`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ data })
    });

    if (!resp.ok) {
        log(`WARNING: Failed to record migration ${migrationId}: ${resp.statusText}`);
    }
};

const loadMigrations = () => {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
        log(`Migrations directory not found: ${MIGRATIONS_DIR}`);
        return [];
    }

    const files = fs.readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.js') && f !== 'README.md')
        .sort();

    return files.map(file => {
        const filePath = path.join(MIGRATIONS_DIR, file);
        const migration = require(filePath);
        
        if (!migration.id || !migration.up) {
            throw new Error(`Invalid migration file ${file}: must export 'id' and 'up'`);
        }

        return migration;
    });
};

const runMigration = async (migration, context) => {
    const { id, description, up } = migration;
    
    log(`Running migration: ${id}`);
    if (description) {
        log(`  ${description}`);
    }

    try {
        await up(context);
        log(`✅ Migration ${id} completed successfully`);
        return { success: true };
    } catch (error) {
        log(`❌ Migration ${id} failed: ${error.message}`);
        return { success: false, error: error.message };
    }
};

const main = async () => {
    log('Starting migration runner...');

    try {
        const token = await authenticate();
        const headers = {
            'Content-Type': 'application/json',
            'x-jwt-token': token
        };

        await ensureMigrationResource(headers);
        const appliedMigrations = await getAppliedMigrations(headers);
        
        log(`Found ${appliedMigrations.length} previously applied migrations`);

        const migrations = loadMigrations();
        log(`Found ${migrations.length} migration files`);

        const pendingMigrations = migrations.filter(m => !appliedMigrations.includes(m.id));
        
        if (pendingMigrations.length === 0) {
            log('No pending migrations to run');
            return;
        }

        log(`Running ${pendingMigrations.length} pending migrations...`);

        const context = { API_BASE, headers, log };
        let successCount = 0;
        let failCount = 0;

        for (const migration of pendingMigrations) {
            const result = await runMigration(migration, context);
            
            if (result.success) {
                await recordMigration(headers, migration.id, 'completed');
                successCount++;
            } else {
                await recordMigration(headers, migration.id, 'failed', result.error);
                failCount++;
                log('⚠️  Stopping migration run due to failure');
                break;
            }
        }

        log('');
        log('Migration Summary:');
        log(`  ✅ Successful: ${successCount}`);
        log(`  ❌ Failed: ${failCount}`);
        log(`  ⏭️  Skipped: ${migrations.length - pendingMigrations.length}`);

        if (failCount > 0) {
            process.exit(1);
        }

    } catch (error) {
        log(`ERROR: ${error.message}`);
        process.exit(1);
    }
};

if (require.main === module) {
    main();
}

module.exports = { main };
