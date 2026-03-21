/**
 * 001-split-organization-address
 *
 * Migrates existing organization submissions from the legacy single-textarea
 * address fields to the new structured address fields:
 *
 *   physicalAddress (textarea) →  addressStreet, addressCity, addressState, addressZip
 *   billingAddress  (textarea) →  billingStreet, billingCity, billingState, billingZip
 *
 * Also sets billingSameAsPhysical = true when billingAddress was blank.
 *
 * Address parsing strategy:
 *   The legacy physicalAddress field was a free-text textarea. We attempt a
 *   best-effort parse of the most common US postal format:
 *
 *     Line 1:  Street address
 *     Last line: "City, ST  ZIPCODE"
 *
 *   Anything that doesn't match is placed into addressStreet as-is so no data
 *   is lost. The submitter can correct the split fields on next edit.
 *
 * Idempotent: submissions that already have addressStreet populated are skipped.
 */

// fetch is built-in on Node 20+

/**
 * Best-effort parse of a free-text US postal address textarea.
 * Returns { street, city, state, zip }.
 * On parse failure, returns { street: fullText, city: '', state: '', zip: '' }.
 */
function parseAddress(raw) {
    if (!raw || !raw.trim()) {
        return { street: '', city: '', state: '', zip: '' };
    }

    const lines = raw.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    if (lines.length === 0) {
        return { street: '', city: '', state: '', zip: '' };
    }

    // Last line: try to match "City, ST  ZIP" or "City ST ZIP"
    const lastLine = lines[lines.length - 1];

    // Regex: City name, optional comma, 2-letter state, optional whitespace, 5-digit zip
    const cityStateZip = lastLine.match(/^(.+?),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);

    if (cityStateZip && lines.length >= 2) {
        const city  = cityStateZip[1].trim();
        const state = cityStateZip[2].toUpperCase();
        const zip   = cityStateZip[3].replace(/-\d{4}$/, ''); // drop +4 extension

        // Everything before the last line is the street
        const street = lines.slice(0, lines.length - 1).join(', ');

        return { street, city, state, zip };
    }

    // Single line or unparseable — dump everything into street
    return { street: lines.join(', '), city: '', state: '', zip: '' };
}

module.exports = {
    id: '001-split-organization-address',
    description: 'Split organization physicalAddress and billingAddress textareas into structured street/city/state/zip fields',

    async up({ API_BASE, headers, log }) {
        // 1. Find the organization form
        log('Fetching organization resource...');
        const formResp = await fetch(`${API_BASE}/form?name=organization`, { headers });
        if (!formResp.ok) throw new Error(`Failed to fetch forms: ${formResp.status}`);
        const forms = await formResp.json();
        if (!forms || forms.length === 0) throw new Error('organization resource not found');
        const form = forms[0];
        log(`Found resource: ${form.title} (${form._id})`);

        // 2. Fetch all submissions (paginate in case of large dataset)
        log('Fetching organization submissions...');
        let allSubmissions = [];
        let skip = 0;
        const limit = 100;
        while (true) {
            const subResp = await fetch(
                `${API_BASE}/organization/submission?limit=${limit}&skip=${skip}&select=_id,data`,
                { headers }
            );
            if (!subResp.ok) throw new Error(`Failed to fetch submissions: ${subResp.status}`);
            const batch = await subResp.json();
            if (!batch || batch.length === 0) break;
            allSubmissions = allSubmissions.concat(batch);
            if (batch.length < limit) break;
            skip += limit;
        }
        log(`Found ${allSubmissions.length} organization submission(s)`);

        let migratedCount = 0;
        let skippedCount  = 0;
        let errorCount    = 0;

        for (const sub of allSubmissions) {
            const d = sub.data || {};

            // Idempotency: skip if new structured fields already populated
            if (d.addressStreet || d.addressCity || d.addressState || d.addressZip) {
                skippedCount++;
                continue;
            }

            // Also skip if there's nothing to migrate
            if (!d.physicalAddress && !d.billingAddress) {
                skippedCount++;
                continue;
            }

            // Parse physical address
            const phys = parseAddress(d.physicalAddress || '');

            // Parse billing address
            let billing = { street: '', city: '', state: '', zip: '' };
            let billingSameAsPhysical = false;

            if (!d.billingAddress || !d.billingAddress.trim()) {
                // Blank billing → same as physical
                billingSameAsPhysical = true;
            } else {
                billing = parseAddress(d.billingAddress);
            }

            // Build the patched data object — preserve all existing fields
            const patchedData = {
                ...d,
                addressStreet: phys.street,
                addressCity:   phys.city,
                addressState:  phys.state,
                addressZip:    phys.zip,
                billingSameAsPhysical,
                billingStreet: billingSameAsPhysical ? phys.street : billing.street,
                billingCity:   billingSameAsPhysical ? phys.city   : billing.city,
                billingState:  billingSameAsPhysical ? phys.state  : billing.state,
                billingZip:    billingSameAsPhysical ? phys.zip    : billing.zip,
                // Keep legacy fields for reference / rollback
                // physicalAddress and billingAddress are intentionally left intact
            };

            try {
                const updateResp = await fetch(
                    `${API_BASE}/organization/submission/${sub._id}`,
                    {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify({ data: patchedData })
                    }
                );
                if (!updateResp.ok) {
                    const txt = await updateResp.text();
                    log(`  ⚠️  Failed to update ${sub._id}: ${updateResp.status} ${txt}`);
                    errorCount++;
                } else {
                    log(`  ✓ Migrated ${sub._id}: "${d.name || '(no name)'}" → street="${phys.street}", city="${phys.city}", state="${phys.state}", zip="${phys.zip}"`);
                    migratedCount++;
                }
            } catch (err) {
                log(`  ⚠️  Error updating ${sub._id}: ${err.message}`);
                errorCount++;
            }
        }

        log('');
        log(`Summary: ${migratedCount} migrated, ${skippedCount} skipped (already structured), ${errorCount} errors`);

        if (errorCount > 0) {
            throw new Error(`Migration completed with ${errorCount} error(s). Check logs above.`);
        }

        log('✅ Migration completed successfully');
    },

    async down({ API_BASE, headers, log }) {
        // Rollback: clear the new structured fields (legacy physicalAddress/billingAddress are untouched)
        log('Rolling back: clearing structured address fields from organization submissions...');
        const formResp = await fetch(`${API_BASE}/form?name=organization`, { headers });
        const forms = await formResp.json();
        if (!forms || forms.length === 0) {
            log('organization resource not found, nothing to rollback');
            return;
        }
        const form = forms[0];

        let skip = 0;
        const limit = 100;
        let count = 0;

        while (true) {
            const subResp = await fetch(
                `${API_BASE}/organization/submission?limit=${limit}&skip=${skip}&select=_id,data`,
                { headers }
            );
            const batch = await subResp.json();
            if (!batch || batch.length === 0) break;

            for (const sub of batch) {
                const d = { ...sub.data };
                delete d.addressStreet;
                delete d.addressCity;
                delete d.addressState;
                delete d.addressZip;
                delete d.billingSameAsPhysical;
                delete d.billingStreet;
                delete d.billingCity;
                delete d.billingState;
                delete d.billingZip;

                await fetch(`${API_BASE}/organization/submission/${sub._id}`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify({ data: d })
                });
                count++;
            }

            if (batch.length < limit) break;
            skip += limit;
        }

        log(`✅ Rollback complete — cleared structured fields from ${count} submission(s)`);
    }
};
