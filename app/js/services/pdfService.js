// app/js/services/pdfService.js
//
// Client-side PDF generation for submission data.
// Default: captures the rendered Form.io form HTML.
// Template mode: uses a custom HTML template from app/js/templates/pdf/{key}.js
// when form.settings.ui.pdfTemplate is set.

import { getAppBridge } from './appBridge.js';
import { getCurrentUserWithRoles } from './sessionService.js';

const PDF_OPTIONS = {
    margin:      [10, 10, 14, 10], // mm: top, left, bottom, right (extra bottom for page numbers)
    filename:    'submission.pdf',
    image:       { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, logging: false, scrollX: 0, scrollY: 0 },
    jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' }
};

/**
 * Show a backdrop overlay while the PDF is being generated.
 * Returns a cleanup function to remove the backdrop.
 */
function showPdfBackdrop() {
    const backdrop = document.createElement('div');
    backdrop.className = 'rfp-pdf-backdrop';
    backdrop.textContent = 'Generating PDF\u2026';
    document.body.appendChild(backdrop);
    return () => { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); };
}

/**
 * Build a sanitised filename from form title and submission ID.
 */
function buildFilename(formMeta, submission) {
    const title = (formMeta?.title || formMeta?.name || 'submission')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .substring(0, 40);
    const shortId = (submission?._id || 'draft').slice(-8);
    return `${title}-${shortId}.pdf`;
}

/**
 * Strip non-data UI from a cloned form container for clean PDF output.
 */
function cleanFormClone(clone) {
    // Remove Form.io submit/action button components (not all buttons — some display content)
    clone.querySelectorAll('.formio-component-button').forEach(el => el.remove());

    // Remove notes section appended below the form
    const notes = clone.querySelector('#submissionNotesContainer');
    if (notes) notes.remove();

    // Remove revision history section
    const rev = clone.querySelector('#revisionHistoryContainer');
    if (rev) rev.remove();

    // Remove hidden formio components (conditional logic hides)
    clone.querySelectorAll('.formio-hidden').forEach(el => el.remove());

    // Remove any alerts / error messages
    clone.querySelectorAll('.alert, .formio-errors, .has-error .help-block').forEach(el => el.remove());

    // Remove file upload drop zones (they render as big empty boxes)
    clone.querySelectorAll('.fileSelector, .formio-component-file .browse').forEach(el => el.remove());

    return clone;
}

/**
 * Build a header element for the PDF.
 */
function buildPdfHeader(formMeta, submission) {
    const header = document.createElement('div');
    header.style.cssText = 'margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #0d6efd;';

    const title = formMeta?.settings?.ui?.alternateTitle || formMeta?.title || formMeta?.name || 'Submission';
    const dateStr = submission?.created
        ? new Date(submission.created).toLocaleString()
        : '';

    header.innerHTML = `
        <div style="font-size:18px;font-weight:700;color:#0d6efd;margin-bottom:4px;">${escapeHtml(title)}</div>
        ${dateStr ? `<div style="font-size:11px;color:#6c757d;">Submitted: ${escapeHtml(dateStr)}</div>` : ''}
    `;
    return header;
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

/**
 * Try to load a custom PDF template module for the given key.
 * Returns null if not found or on error (falls back to default).
 */
async function loadPdfTemplate(templateKey) {
    if (!templateKey) return null;
    try {
        const mod = await import(`../templates/pdf/${templateKey}.js`);
        if (typeof mod.default === 'function') return mod.default;
        console.warn(`[pdfService] Template '${templateKey}' has no default export function.`);
    } catch (e) {
        console.warn(`[pdfService] Could not load PDF template '${templateKey}', falling back to default.`, e);
    }
    return null;
}

/**
 * Generate and download a PDF for the given submission.
 *
 * @param {object}      submission   - Full submission object (with _id, data, created, etc.)
 * @param {object}      formMeta     - Form definition (title, path, settings, etc.)
 * @param {HTMLElement}  [formRenderEl] - The currently-rendered Form.io container (optional).
 *                                       If not provided, an off-screen render is done.
 */
export async function downloadSubmissionPdf(submission, formMeta, formRenderEl) {
    const { actions } = getAppBridge();

    if (typeof html2pdf === 'undefined') {
        actions.showToast?.('PDF library not loaded. Please refresh and try again.', 'danger');
        return;
    }

    actions.showToast?.('Generating PDF…', 'info');

    const removeBackdrop = showPdfBackdrop();
    let tempHeader = null;   // header injected into formRenderEl (default mode)
    let container = null;    // standalone container (template / kebab mode)

    try {
        const templateKey = formMeta?.settings?.ui?.pdfTemplate || null;
        const templateFn = await loadPdfTemplate(templateKey);
        const filename = buildFilename(formMeta, submission);
        let captureTarget;

        if (templateFn) {
            // ---- Template mode ----
            const user = await getCurrentUserWithRoles();
            const htmlStr = await templateFn({ submission, formMeta, user });
            container = document.createElement('div');
            container.style.cssText = 'width:190mm;background:#fff;box-sizing:border-box;';
            container.innerHTML = htmlStr;
            document.body.appendChild(container);
            captureTarget = container;

        } else if (formRenderEl) {
            // ---- Default mode: capture the live form element directly ----
            // Temporarily inject a header before the form content
            tempHeader = buildPdfHeader(formMeta, submission);
            formRenderEl.insertBefore(tempHeader, formRenderEl.firstChild);
            captureTarget = formRenderEl;

        } else {
            // ---- Off-screen render mode (kebab menu, no visible form) ----
            // Use a normal-flow element (no position:fixed/absolute) so
            // html2canvas can capture it reliably.
            container = document.createElement('div');
            container.style.cssText = 'width:210mm;background:#fff;padding:10mm;';
            document.body.appendChild(container);

            const header = buildPdfHeader(formMeta, submission);
            container.appendChild(header);

            const renderDiv = document.createElement('div');
            container.appendChild(renderDiv);

            const { buildUrl } = await import('./formioService.js');
            const formPath = String(formMeta.path || '').replace(/^\/+/, '');
            const formio = await Formio.createForm(renderDiv, buildUrl(`/${formPath}`), {
                readOnly: true
            });

            // Wait for submission data to render into the DOM
            await formio.setSubmission(submission);
            await new Promise(resolve => {
                formio.on('render', () => resolve());
                setTimeout(resolve, 1500);
            });

            cleanFormClone(renderDiv);
            container._cleanup = () => {
                try { formio.destroy(); } catch (_) { /* ignore */ }
            };
            captureTarget = container;
        }

        // Give the browser a frame to paint
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

        // Generate PDF from the capture target
        const pdfOpts = { ...PDF_OPTIONS, filename };
        if (templateFn) {
            // Two-pass: render to PDF object first, stamp page numbers, then save
            const worker = html2pdf().set(pdfOpts).from(captureTarget);
            const pdf = await worker.toPdf().get('pdf');
            const totalPages = pdf.internal.getNumberOfPages();
            const pageW = pdf.internal.pageSize.getWidth();
            const pageH = pdf.internal.pageSize.getHeight();
            for (let i = 1; i <= totalPages; i++) {
                pdf.setPage(i);
                pdf.setFontSize(8);
                pdf.setTextColor(150);
                pdf.text(`Page ${i} of ${totalPages}`, pageW / 2, pageH - 4, { align: 'center' });
            }
            await worker.save();
        } else {
            await html2pdf()
                .set(pdfOpts)
                .from(captureTarget)
                .save();
        }

        // Cleanup
        removeBackdrop();
        if (tempHeader) tempHeader.remove();
        if (container?._cleanup) container._cleanup();
        if (container?.parentNode) container.parentNode.removeChild(container);

        actions.showToast?.('PDF downloaded.', 'success');
    } catch (err) {
        console.error('[pdfService] PDF generation error:', err);
        removeBackdrop();
        if (tempHeader) tempHeader.remove();
        if (container?._cleanup) container._cleanup();
        if (container?.parentNode) container.parentNode.removeChild(container);
        actions.showToast?.('Error generating PDF.', 'danger');
    }
}
