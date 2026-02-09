// app/js/features/revisionHistory.js

import { generateHtmlDiff, APPROVAL_LEVELS } from '../services/revisionService.js';

/**
 * Render the revision history section below the form.
 * Called from forms.js when viewing a submission that has revisionTracking enabled.
 *
 * @param {object} submission - full submission object (with _id, data, etc.)
 * @param {object} formMeta - form definition (with settings)
 * @param {HTMLElement} container - DOM element to render into
 */
export async function renderRevisionHistory(submission, formMeta, container) {
    if (!container) return;

    const revisions = Array.isArray(submission?.data?.copyRevisions)
        ? submission.data.copyRevisions
        : [];

    if (revisions.length === 0) {
        container.innerHTML = '';
        return;
    }

    const uid = `revhist-${Date.now()}`;

    container.innerHTML = `
        <div class="card mt-3 rfp-revision-history">
            <div class="card-header py-2 d-flex align-items-center gap-2">
                <i class="bi bi-clock-history"></i>
                <span class="fw-semibold small">Revision History</span>
                <span class="badge bg-secondary rounded-pill ms-auto">${revisions.length}</span>
            </div>
            <div class="card-body p-0">
                <ul class="nav nav-tabs px-3 pt-2" role="tablist">
                    <li class="nav-item" role="presentation">
                        <button class="nav-link active small py-1 px-3" id="${uid}-current-tab"
                            data-bs-toggle="tab" data-bs-target="#${uid}-current" type="button"
                            role="tab" aria-controls="${uid}-current" aria-selected="true">
                            Current
                        </button>
                    </li>
                    <li class="nav-item" role="presentation">
                        <button class="nav-link small py-1 px-3" id="${uid}-changes-tab"
                            data-bs-toggle="tab" data-bs-target="#${uid}-changes" type="button"
                            role="tab" aria-controls="${uid}-changes" aria-selected="false">
                            Changes
                        </button>
                    </li>
                </ul>
                <div class="tab-content">
                    <div class="tab-pane fade show active p-3" id="${uid}-current"
                        role="tabpanel" aria-labelledby="${uid}-current-tab">
                        <div class="rfp-revision-current-copy">
                            ${revisions[revisions.length - 1].copySnapshot || '<em class="text-muted">No copy content.</em>'}
                        </div>
                    </div>
                    <div class="tab-pane fade p-3" id="${uid}-changes"
                        role="tabpanel" aria-labelledby="${uid}-changes-tab">
                        <div id="${uid}-changes-list"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const changesList = container.querySelector(`#${uid}-changes-list`);
    if (changesList) {
        renderChangesList(revisions, changesList);
    }
}

/**
 * Render the list of revisions with expandable diff views.
 */
function renderChangesList(revisions, container) {
    if (revisions.length === 0) {
        container.innerHTML = '<p class="text-muted small mb-0">No revisions recorded.</p>';
        return;
    }

    // Show revisions newest-first
    const reversed = [...revisions].reverse();
    const accordionId = `rev-acc-${Date.now()}`;

    let html = `<div class="accordion accordion-flush" id="${accordionId}">`;

    reversed.forEach((rev, idx) => {
        const revIndex = revisions.length - 1 - idx; // original index
        const prevRev = revIndex > 0 ? revisions[revIndex - 1] : null;
        const itemId = `${accordionId}-item-${idx}`;
        const dateStr = formatRevisionDate(rev.revisionDate);
        const isFirst = idx === 0; // newest

        // Approval change badges
        const approvalBadges = buildApprovalBadges(rev, prevRev);

        html += `
            <div class="accordion-item">
                <h2 class="accordion-header">
                    <button class="accordion-button ${isFirst ? '' : 'collapsed'} py-2 small"
                        type="button" data-bs-toggle="collapse"
                        data-bs-target="#${itemId}" aria-expanded="${isFirst}"
                        aria-controls="${itemId}">
                        <div class="d-flex flex-wrap align-items-center gap-2 w-100">
                            <span class="text-muted">${dateStr}</span>
                            <span class="fw-semibold">${escapeHtml(rev.author || 'unknown')}</span>
                            <span class="badge bg-info text-dark">${escapeHtml(rev.status || 'draft')}</span>
                            ${approvalBadges}
                            ${revIndex === 0 ? '<span class="badge bg-secondary">Initial</span>' : ''}
                        </div>
                    </button>
                </h2>
                <div id="${itemId}" class="accordion-collapse collapse ${isFirst ? 'show' : ''}"
                    data-bs-parent="#${accordionId}">
                    <div class="accordion-body small p-2">
                        <div class="rfp-revision-diff-view" data-rev-index="${revIndex}"></div>
                    </div>
                </div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;

    // Render diffs lazily when accordion items are shown
    container.querySelectorAll('.accordion-collapse').forEach(collapseEl => {
        const diffView = collapseEl.querySelector('.rfp-revision-diff-view');
        if (!diffView) return;

        const revIdx = parseInt(diffView.dataset.revIndex, 10);
        const rev = revisions[revIdx];
        const prevRev = revIdx > 0 ? revisions[revIdx - 1] : null;

        // Render on first show
        let rendered = false;
        const renderDiff = () => {
            if (rendered) return;
            rendered = true;
            renderRevisionDiff(rev, prevRev, diffView);
        };

        // If already shown (first item), render immediately
        if (collapseEl.classList.contains('show')) {
            renderDiff();
        }

        collapseEl.addEventListener('shown.bs.collapse', renderDiff);
    });
}

/**
 * Render the diff content for a single revision.
 */
function renderRevisionDiff(rev, prevRev, container) {
    if (!prevRev) {
        // Initial revision — show full content
        container.innerHTML = `
            <div class="text-muted small mb-2"><em>Initial version — no previous revision to compare.</em></div>
            <div class="rfp-revision-snapshot border rounded p-2">${rev.copySnapshot || ''}</div>
        `;
        return;
    }

    const diffHtml = generateHtmlDiff(prevRev.copySnapshot || '', rev.copySnapshot || '');
    const hasCopyChange = (prevRev.copySnapshot || '').trim() !== (rev.copySnapshot || '').trim();

    let html = '';

    if (hasCopyChange) {
        html += `
            <div class="mb-2">
                <div class="fw-semibold small mb-1">Copy changes:</div>
                <div class="rfp-revision-diff border rounded p-2">${diffHtml}</div>
            </div>
        `;
    } else {
        html += '<div class="text-muted small mb-2"><em>No copy text changes in this revision.</em></div>';
    }

    // Show approval state changes
    const approvalChanges = getApprovalChanges(rev, prevRev);
    if (approvalChanges.length > 0) {
        html += '<div class="mt-2">';
        html += '<div class="fw-semibold small mb-1">Approval changes:</div>';
        html += '<div class="d-flex flex-wrap gap-1">';
        for (const change of approvalChanges) {
            html += `<span class="badge ${change.cssClass}">${escapeHtml(change.text)}</span>`;
        }
        html += '</div></div>';
    }

    // Show status change
    if (prevRev.status !== rev.status) {
        html += `
            <div class="mt-2 small">
                <span class="text-muted">Status:</span>
                <span class="badge bg-secondary">${escapeHtml(prevRev.status || 'draft')}</span>
                <i class="bi bi-arrow-right mx-1"></i>
                <span class="badge bg-primary">${escapeHtml(rev.status || 'draft')}</span>
            </div>
        `;
    }

    container.innerHTML = html;
}

/**
 * Build compact approval badge HTML for the revision header.
 */
function buildApprovalBadges(rev, prevRev) {
    if (!rev.approvals) return '';
    let badges = '';

    for (const level of APPROVAL_LEVELS) {
        const curr = rev.approvals[level.key];
        const prev = prevRev?.approvals?.[level.key];

        if (!curr) continue;

        if (curr.approved && (!prev || !prev.approved)) {
            badges += `<span class="badge bg-success">${level.label}: ✓</span>`;
        } else if (!curr.approved && prev?.approved) {
            badges += `<span class="badge bg-danger">${level.label}: ✗</span>`;
        }
    }

    return badges;
}

/**
 * Get detailed approval change descriptions.
 */
function getApprovalChanges(rev, prevRev) {
    const changes = [];
    if (!rev.approvals) return changes;

    for (const level of APPROVAL_LEVELS) {
        const curr = rev.approvals[level.key] || {};
        const prev = prevRev?.approvals?.[level.key] || {};

        if (curr.approved && !prev.approved) {
            const approver = curr.approver || 'unknown';
            changes.push({
                text: `${level.label}: Approved by ${approver}`,
                cssClass: 'bg-success'
            });
        } else if (!curr.approved && prev.approved) {
            changes.push({
                text: `${level.label}: Approval removed`,
                cssClass: 'bg-danger'
            });
        } else if (curr.approved && prev.approved && String(curr.approver) !== String(prev.approver)) {
            changes.push({
                text: `${level.label}: Approver changed to ${curr.approver || 'unknown'}`,
                cssClass: 'bg-warning text-dark'
            });
        }
    }

    return changes;
}

/**
 * Format a revision date for display.
 */
function formatRevisionDate(dateStr) {
    if (!dateStr) return '—';
    try {
        if (typeof luxon !== 'undefined' && luxon.DateTime) {
            return luxon.DateTime.fromISO(dateStr).toFormat('yyyy-MM-dd HH:mm');
        }
        return new Date(dateStr).toLocaleString();
    } catch {
        return dateStr;
    }
}

/**
 * Escape HTML entities for safe display in text contexts.
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
