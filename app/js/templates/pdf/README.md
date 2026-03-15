# PDF Templates

Custom PDF layout templates for specific forms.

Each file is an ES module with a default export function that receives
`{ submission, formMeta, user }` and returns an HTML string.

To enable a template for a form, set `form.settings.ui.pdfTemplate` to the
filename (without `.js`). For example, if the template file is
`incidentReport.js`, set `pdfTemplate: "incidentReport"`.

If no template is configured, the PDF service captures the rendered Form.io
form HTML as-is.
