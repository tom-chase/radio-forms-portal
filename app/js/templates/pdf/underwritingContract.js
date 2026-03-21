// app/js/templates/pdf/underwritingContract.js
//
// PDF template for the Underwriting Contract resource.
// Renders a formal sponsorship agreement document suitable for
// printing and physical signature.
//
// Receives: { submission, formMeta, user }
// Returns:  HTML string (inline CSS only — no external stylesheets)

import { CONFIG } from '../../config.js';

function esc(str) {
    if (str === null || str === undefined) return '';
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
}

function fmtDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function fmtMoney(val) {
    if (val === null || val === undefined || val === '') return '';
    const n = parseFloat(val);
    if (isNaN(n)) return String(val);
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function billingLabel(val) {
    const map = {
        one_time:  'One-time',
        monthly:   'Monthly',
        quarterly: 'Quarterly',
        custom:    'Custom'
    };
    return map[val] || esc(val) || '—';
}

function statusLabel(val) {
    const map = {
        draft:     'Draft',
        pending:   'Pending Approval',
        active:    'Active',
        expired:   'Expired',
        cancelled: 'Cancelled'
    };
    return map[val] || esc(val) || '—';
}

// Resolve reference field: Form.io saves referenced resources as either
// a plain ID string or a full object when reference:true + populated.
function refData(field) {
    if (!field) return null;
    if (typeof field === 'object' && field.data) return field.data;
    return null;
}

export default function renderContract({ submission, formMeta, user }) {
    const d = submission.data || {};
    const station = CONFIG.STATION || {};

    const stationName    = station.NAME      || 'Your Radio Station';
    const stationCall    = station.CALL_SIGN  || '';
    const stationAddress = station.ADDRESS    || '';
    const stationLogo    = station.LOGO_URL   || '';

    // Resolve referenced resources
    const orgData     = refData(d.organization);
    const contactData = refData(d.primaryContact);

    const sponsorName    = orgData    ? esc(orgData.name)    : '(Sponsor name not resolved — open and resave contract)';
    const sponsorAddress = orgData    ? esc(orgData.physicalAddress || orgData.billingAddress || '') : '';
    const contactName    = contactData
        ? esc((contactData.firstName || '') + ' ' + (contactData.lastName || '')).trim()
        : '';
    const contactEmail   = contactData ? esc(contactData.email  || '') : '';
    const contactPhone   = contactData ? esc(contactData.phone  || '') : '';

    // Contract metadata
    const contractName = esc(d.contractName || '');
    const startDate    = fmtDate(d.startDate);
    const endDate      = fmtDate(d.endDate);
    const totalValue   = fmtMoney(d.totalValue);
    const billingFreq  = billingLabel(d.billingFrequency);
    const billingNotes = esc(d.billingNotes || '');
    const status       = statusLabel(d.status);

    // Content sections (HTML from ckeditor fields — already trusted internal data)
    const recitals   = d.recitals   || '';
    const terms      = d.terms      || '';
    const copySummary = d.copySummary || '';

    // Approval levels
    function approvalRow(label, approved, approver, date) {
        const approverName = refData(approver)
            ? esc(refData(approver).email || refData(approver).name || '')
            : esc(typeof approver === 'string' ? approver : '');
        return `
        <tr>
            <td style="padding:6px 8px;border:1px solid #dee2e6;">${label}</td>
            <td style="padding:6px 8px;border:1px solid #dee2e6;text-align:center;">
                ${approved ? '<span style="color:#198754;font-weight:600;">&#10003; Approved</span>' : '<span style="color:#adb5bd;">Pending</span>'}
            </td>
            <td style="padding:6px 8px;border:1px solid #dee2e6;">${approverName || '—'}</td>
            <td style="padding:6px 8px;border:1px solid #dee2e6;">${date ? fmtDate(date) : '—'}</td>
        </tr>`;
    }

    const pmApproval  = d.programManagerApproval  || {};
    const gmApproval  = d.generalManagerApproval  || {};
    const coApproval  = d.complianceOfficerApproval || {};

    // Signature block data
    const stationRepSig       = d.stationRepSignature || '';  // base64 data URL from Form.io signature component
    const stationRepName      = esc(d.stationRepName      || '');
    const stationRepTitle     = esc(d.stationRepTitle     || '');
    const sponsorSignName     = esc(d.sponsorSignatoryName  || '');
    const sponsorSignTitle    = esc(d.sponsorSignatoryTitle || '');
    const contractSignedDate  = fmtDate(d.contractSignedDate);

    // Generated date
    const generatedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const contractId    = submission._id ? submission._id.slice(-8).toUpperCase() : 'DRAFT';

    const logoHtml = stationLogo
        ? `<img src="${esc(stationLogo)}" alt="${esc(stationName)} logo" style="max-height:60px;max-width:200px;object-fit:contain;display:block;margin-bottom:6px;" />`
        : '';

    return `
<div style="font-family:'Times New Roman',Times,serif;font-size:11pt;line-height:1.5;color:#212529;background:#fff;padding:0;">

    <!-- ===== HEADER ===== -->
    <div style="border-bottom:2px solid #0d6efd;padding-bottom:12px;margin-bottom:20px;">
        <table style="width:100%;border-collapse:collapse;">
            <tr>
                <td style="vertical-align:middle;">
                    ${logoHtml}
                    <div style="font-size:15pt;font-weight:700;color:#0d6efd;">${esc(stationName)}${stationCall ? ' &mdash; ' + esc(stationCall) : ''}</div>
                    ${stationAddress ? `<div style="font-size:9pt;color:#6c757d;margin-top:2px;">${esc(stationAddress)}</div>` : ''}
                </td>
                <td style="vertical-align:top;text-align:right;">
                    <div style="font-size:14pt;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#212529;">Underwriting Agreement</div>
                    <div style="font-size:9pt;color:#6c757d;margin-top:4px;">Contract #: ${contractId}</div>
                    <div style="font-size:9pt;color:#6c757d;">Status: <strong>${status}</strong></div>
                </td>
            </tr>
        </table>
    </div>

    <!-- ===== PARTIES ===== -->
    <div style="margin-bottom:20px;">
        <div style="font-size:10pt;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#0d6efd;border-bottom:1px solid #dee2e6;padding-bottom:4px;margin-bottom:10px;">Parties</div>
        <table style="width:100%;border-collapse:collapse;">
            <tr>
                <td style="width:50%;vertical-align:top;padding-right:16px;">
                    <div style="font-weight:700;margin-bottom:4px;">Station</div>
                    <div>${esc(stationName)}</div>
                    ${stationCall ? `<div>${esc(stationCall)}</div>` : ''}
                    ${stationAddress ? `<div style="white-space:pre-line;">${esc(stationAddress)}</div>` : ''}
                    <div style="margin-top:6px;font-style:italic;font-size:9.5pt;color:#495057;">Non-Commercial Educational Broadcaster</div>
                </td>
                <td style="width:50%;vertical-align:top;padding-left:16px;border-left:1px solid #dee2e6;">
                    <div style="font-weight:700;margin-bottom:4px;">Sponsor / Underwriter</div>
                    <div>${sponsorName}</div>
                    ${sponsorAddress ? `<div style="white-space:pre-line;">${sponsorAddress}</div>` : ''}
                    ${contactName ? `<div style="margin-top:6px;"><em>Primary Contact:</em> ${contactName}</div>` : ''}
                    ${contactEmail ? `<div>${contactEmail}</div>` : ''}
                    ${contactPhone ? `<div>${contactPhone}</div>` : ''}
                </td>
            </tr>
        </table>
    </div>

    <!-- ===== CONTRACT DETAILS ===== -->
    <div style="margin-bottom:20px;">
        <div style="font-size:10pt;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#0d6efd;border-bottom:1px solid #dee2e6;padding-bottom:4px;margin-bottom:10px;">Contract Details</div>
        <table style="width:100%;border-collapse:collapse;">
            <tr>
                <td style="width:25%;padding:5px 8px;font-weight:600;background:#f8f9fa;border:1px solid #dee2e6;">Contract Name</td>
                <td style="width:75%;padding:5px 8px;border:1px solid #dee2e6;" colspan="3">${contractName || '—'}</td>
            </tr>
            <tr>
                <td style="padding:5px 8px;font-weight:600;background:#f8f9fa;border:1px solid #dee2e6;">Contract Period</td>
                <td style="padding:5px 8px;border:1px solid #dee2e6;">${startDate || '—'} &ndash; ${endDate || '—'}</td>
                <td style="padding:5px 8px;font-weight:600;background:#f8f9fa;border:1px solid #dee2e6;">Total Value</td>
                <td style="padding:5px 8px;border:1px solid #dee2e6;">${totalValue || '—'}</td>
            </tr>
            <tr>
                <td style="padding:5px 8px;font-weight:600;background:#f8f9fa;border:1px solid #dee2e6;">Billing</td>
                <td style="padding:5px 8px;border:1px solid #dee2e6;">${billingFreq}</td>
                <td style="padding:5px 8px;font-weight:600;background:#f8f9fa;border:1px solid #dee2e6;">Billing Notes</td>
                <td style="padding:5px 8px;border:1px solid #dee2e6;">${billingNotes || '—'}</td>
            </tr>
        </table>
    </div>

    <!-- ===== BACKGROUND & PURPOSE ===== -->
    ${recitals ? `
    <div style="margin-bottom:20px;">
        <div style="font-size:10pt;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#0d6efd;border-bottom:1px solid #dee2e6;padding-bottom:4px;margin-bottom:10px;">Background &amp; Purpose</div>
        <div style="font-size:10.5pt;">${recitals}</div>
    </div>` : ''}

    <!-- ===== TERMS & CONDITIONS ===== -->
    ${terms ? `
    <div style="margin-bottom:20px;">
        <div style="font-size:10pt;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#0d6efd;border-bottom:1px solid #dee2e6;padding-bottom:4px;margin-bottom:10px;">Terms &amp; Conditions</div>
        <div style="font-size:10.5pt;">${terms}</div>
    </div>` : ''}

    <!-- ===== APPROVED COPY / MESSAGING SUMMARY ===== -->
    ${copySummary ? `
    <div style="margin-bottom:20px;">
        <div style="font-size:10pt;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#0d6efd;border-bottom:1px solid #dee2e6;padding-bottom:4px;margin-bottom:10px;">Approved Messaging Summary</div>
        <div style="font-size:10.5pt;padding:10px 12px;background:#f8f9fa;border-left:3px solid #0d6efd;">${copySummary}</div>
    </div>` : ''}

    <!-- ===== APPROVAL RECORD ===== -->
    <div style="margin-bottom:20px;">
        <div style="font-size:10pt;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#0d6efd;border-bottom:1px solid #dee2e6;padding-bottom:4px;margin-bottom:10px;">Internal Approval Record</div>
        <table style="width:100%;border-collapse:collapse;font-size:10pt;">
            <thead>
                <tr style="background:#f8f9fa;">
                    <th style="padding:6px 8px;border:1px solid #dee2e6;text-align:left;">Level</th>
                    <th style="padding:6px 8px;border:1px solid #dee2e6;text-align:center;">Status</th>
                    <th style="padding:6px 8px;border:1px solid #dee2e6;text-align:left;">Approver</th>
                    <th style="padding:6px 8px;border:1px solid #dee2e6;text-align:left;">Date</th>
                </tr>
            </thead>
            <tbody>
                ${approvalRow('1 &mdash; Program Manager',   pmApproval.programManagerApproved,    pmApproval.programManagerApprover,    pmApproval.programManagerApprovalDate)}
                ${approvalRow('2 &mdash; General Manager',   gmApproval.generalManagerApproved,    gmApproval.generalManagerApprover,    gmApproval.generalManagerApprovalDate)}
                ${approvalRow('3 &mdash; Compliance Officer', coApproval.complianceOfficerApproved, coApproval.complianceOfficerApprover, coApproval.complianceOfficerApprovalDate)}
            </tbody>
        </table>
    </div>

    <!-- ===== SIGNATURE BLOCK ===== -->
    <div style="margin-bottom:24px;">
        <div style="font-size:10pt;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#0d6efd;border-bottom:1px solid #dee2e6;padding-bottom:4px;margin-bottom:14px;">Signatures</div>
        <p style="font-size:10pt;margin-bottom:14px;">By signing below, both parties agree to the terms of this Underwriting Agreement.</p>
        <table style="width:100%;border-collapse:collapse;">
            <tr>
                <!-- Station signature column -->
                <td style="width:48%;vertical-align:top;padding-right:12px;">
                    <div style="font-weight:700;margin-bottom:10px;">For the Station</div>
                    ${stationRepSig
                        ? `<div style="border-bottom:1px solid #212529;min-height:32px;margin-bottom:4px;padding-bottom:2px;"><img src="${stationRepSig}" alt="Station Representative Signature" style="max-height:48px;max-width:200px;object-fit:contain;display:block;" /></div>`
                        : `<div style="border-bottom:1px solid #212529;min-height:32px;margin-bottom:4px;"></div>`
                    }
                    <div style="font-size:9pt;color:#6c757d;">Signature</div>
                    <div style="margin-top:10px;">
                        <div style="border-bottom:1px solid #adb5bd;min-height:22px;padding-bottom:2px;">${stationRepName}</div>
                        <div style="font-size:9pt;color:#6c757d;">Printed Name</div>
                    </div>
                    <div style="margin-top:10px;">
                        <div style="border-bottom:1px solid #adb5bd;min-height:22px;padding-bottom:2px;">${stationRepTitle}</div>
                        <div style="font-size:9pt;color:#6c757d;">Title</div>
                    </div>
                    <div style="margin-top:10px;">
                        <div style="border-bottom:1px solid #adb5bd;min-height:22px;padding-bottom:2px;">${contractSignedDate || ''}</div>
                        <div style="font-size:9pt;color:#6c757d;">Date</div>
                    </div>
                </td>
                <td style="width:4%;"></td>
                <!-- Sponsor signature column -->
                <td style="width:48%;vertical-align:top;padding-left:12px;border-left:1px solid #dee2e6;">
                    <div style="font-weight:700;margin-bottom:10px;">For the Sponsor</div>
                    <div style="border-bottom:1px solid #212529;min-height:32px;margin-bottom:4px;"></div>
                    <div style="font-size:9pt;color:#6c757d;">Signature</div>
                    <div style="margin-top:10px;">
                        <div style="border-bottom:1px solid #adb5bd;min-height:22px;padding-bottom:2px;">${sponsorSignName}</div>
                        <div style="font-size:9pt;color:#6c757d;">Printed Name</div>
                    </div>
                    <div style="margin-top:10px;">
                        <div style="border-bottom:1px solid #adb5bd;min-height:22px;padding-bottom:2px;">${sponsorSignTitle}</div>
                        <div style="font-size:9pt;color:#6c757d;">Title</div>
                    </div>
                    <div style="margin-top:10px;">
                        <div style="border-bottom:1px solid #adb5bd;min-height:22px;padding-bottom:2px;"></div>
                        <div style="font-size:9pt;color:#6c757d;">Date</div>
                    </div>
                </td>
            </tr>
        </table>
    </div>

    <!-- ===== FOOTER ===== -->
    <div style="border-top:1px solid #dee2e6;padding-top:10px;font-size:8.5pt;color:#6c757d;">
        <table style="width:100%;border-collapse:collapse;">
            <tr>
                <td>Contract ID: ${contractId} &bull; Generated: ${generatedDate}</td>
                <td style="text-align:right;">${esc(stationName)} &bull; Non-Commercial Educational Broadcaster (FCC 47 C.F.R. &sect;&sect;&nbsp;73.503, 73.621)</td>
            </tr>
        </table>
        <div style="margin-top:4px;font-style:italic;">
            This document was generated from the Radio Forms Portal. The executed (signed) copy supersedes this draft for all legal purposes.
        </div>
    </div>

</div>`;
}
