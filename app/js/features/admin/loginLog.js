// app/js/features/admin/loginLog.js

import { formioRequest } from '../../services/formioService.js';

function $(id) { return document.getElementById(id); }

let _loaded = false;

/**
 * Load and render the login log table into #loginLogHost.
 * @param {boolean} force - If true, bypasses the already-loaded guard.
 */
export async function loadLoginLog(force = false) {
    const host = $('loginLogHost');
    if (!host) return;

    if (_loaded && !force) return;

    host.innerHTML = '<div class="text-center py-2"><div class="spinner-border spinner-border-sm text-secondary" role="status"></div></div>';

    try {
        const records = await formioRequest('/loginlog/submission', {
            method: 'GET',
            query: { limit: 500, sort: '-created', select: '_id,created,data' }
        });

        if (!Array.isArray(records) || !records.length) {
            host.innerHTML = '<div class="text-muted small mb-0">No login events recorded yet.</div>';
            _loaded = true;
            return;
        }

        renderLoginLogTable(records, host);
        _loaded = true;
    } catch (e) {
        console.error('loadLoginLog error', e);
        host.innerHTML = '<div class="alert alert-danger small mb-0">Error loading login log.</div>';
    }
}

function renderLoginLogTable(records, hostEl) {
    let html = `<div class="table-responsive">
        <table class="table table-sm table-hover align-middle mb-0">
            <thead class="table-light">
                <tr>
                    <th>Date / Time</th>
                    <th>Email</th>
                    <th>IP Address</th>
                    <th class="d-none d-md-table-cell">User Agent</th>
                </tr>
            </thead>
            <tbody>`;

    for (const rec of records) {
        const d = rec.data || {};
        const dateStr = rec.created
            ? new Date(rec.created).toLocaleString()
            : '—';
        const email = escapeHtml(d.userEmail || '—');
        const ip = escapeHtml(d.ipAddress || '—');
        const ua = escapeHtml(d.userAgent || '—');

        html += `<tr>
            <td class="text-nowrap">${dateStr}</td>
            <td>${email}</td>
            <td>${ip}</td>
            <td class="d-none d-md-table-cell text-truncate" style="max-width:280px;" title="${ua}">${ua}</td>
        </tr>`;
    }

    html += `</tbody></table></div>
        <div class="text-muted mt-1" style="font-size:0.8em;">${records.length} event${records.length !== 1 ? 's' : ''}</div>`;

    hostEl.innerHTML = html;
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
