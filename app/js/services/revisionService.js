// app/js/services/revisionService.js

import { HtmlDiff } from '../vendor/htmldiff@1.0.0.js';

const APPROVAL_LEVELS = [
    { key: 'programDirector', label: 'Program Director' },
    { key: 'generalManager', label: 'General Manager' },
    { key: 'complianceOfficer', label: 'Compliance Officer' }
];

/**
 * Extract a compact approval-state snapshot from submission data.
 * Reads flat top-level keys (containers have input:false in uwSpots).
 */
export function getApprovalSnapshot(data) {
    if (!data) return {};
    const snap = {};
    for (const level of APPROVAL_LEVELS) {
        // Containers with input:false flatten children to top-level data
        snap[level.key] = {
            approved: !!data[`${level.key}Approved`],
            approver: data[`${level.key}Approver`] || null,
            date: data[`${level.key}ApprovalDate`] || null
        };
    }
    return snap;
}

/**
 * Determine whether any tracked field or approval state has changed
 * compared to the most recent revision snapshot.
 *
 * @param {object} currentData  - submission.data (current form values)
 * @param {object|null} lastRevision - the most recent entry from copyRevisions[]
 * @param {object} settings - form.settings.revisionTracking
 * @returns {boolean}
 */
export function hasRelevantChanges(currentData, lastRevision, settings) {
    if (!lastRevision) return true; // first revision always recorded

    const trackedFields = settings?.trackedFields || ['copy'];

    // Check tracked fields (e.g. copy)
    for (const field of trackedFields) {
        const current = normalizeHtml(currentData[field] || '');
        const previous = normalizeHtml(lastRevision.copySnapshot || '');
        if (current !== previous) return true;
    }

    // Check approval state changes
    if (settings?.trackApprovals) {
        const currentApprovals = getApprovalSnapshot(currentData);
        const prevApprovals = lastRevision.approvals || {};

        for (const level of APPROVAL_LEVELS) {
            const curr = currentApprovals[level.key] || {};
            const prev = prevApprovals[level.key] || {};
            if (curr.approved !== prev.approved) return true;
            if (String(curr.approver || '') !== String(prev.approver || '')) return true;
        }

        // Check top-level status
        if ((currentData.status || 'draft') !== (lastRevision.status || 'draft')) return true;
    }

    return false;
}

/**
 * Build a revision entry from the current form data and user.
 *
 * @param {object} currentData - submission.data
 * @param {object} user - current user object (from sessionService)
 * @param {object} settings - form.settings.revisionTracking
 * @returns {object} revision entry
 */
export function buildRevisionEntry(currentData, user, settings) {
    const trackedFields = settings?.trackedFields || ['copy'];
    const primaryField = trackedFields[0] || 'copy';

    return {
        revisionDate: new Date().toISOString(),
        author: user?.data?.email || user?.data?.name || user?._id || 'unknown',
        copySnapshot: currentData[primaryField] || '',
        status: currentData.status || 'draft',
        approvals: settings?.trackApprovals ? getApprovalSnapshot(currentData) : {}
    };
}

/**
 * Generate an HTML diff between two HTML strings.
 *
 * @param {string} oldHtml
 * @param {string} newHtml
 * @returns {string} HTML with <ins> and <del> tags
 */
export function generateHtmlDiff(oldHtml, newHtml) {
    const old = normalizeHtml(oldHtml || '');
    const cur = normalizeHtml(newHtml || '');
    if (old === cur) return cur;

    const diff = new HtmlDiff(old, cur);
    return diff.Build();
}

/**
 * Normalize HTML for comparison: trim whitespace, collapse runs of spaces.
 */
function normalizeHtml(html) {
    return (html || '').trim().replace(/\s+/g, ' ');
}

export { APPROVAL_LEVELS };
