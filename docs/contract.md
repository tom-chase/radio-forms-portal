# Underwriting Contract — Usage Guide

**Last Updated:** March 2026

This document describes the underwriting contract record in the Radio Forms Portal, how to prepare a contract for PDF output, and the end-to-end workflow from agreement creation to executed document storage.

---

## Table of Contents

1. [Overview](#overview)
2. [Station Identity Setup](#station-identity-setup)
3. [Contract Form Fields](#contract-form-fields)
4. [Generating the Contract PDF](#generating-the-contract-pdf)
5. [Signing Workflow](#signing-workflow)
6. [FCC Compliance Notes](#fcc-compliance-notes)

---

## Overview

The `underwritingContract` resource stores the full record of a sponsorship agreement between the station and an underwriter. When a contract is ready, staff can download a formatted PDF from the portal — a complete legal contract document including parties, terms, approval record, and signature lines.

The portal does **not** handle e-signatures. The workflow is:

```
Create contract → Get internal approvals → Download PDF → Sign physically → Upload executed copy
```

---

## Station Identity Setup

The contract PDF header pulls station name, call sign, address, and logo from environment variables. Set these in your `.env` before deploying:

```env
# Section 0 of .env.example
STATION_NAME=Your Station Name
STATION_CALL_SIGN=WXXX
STATION_ADDRESS=123 Main Street, City, State 00000
STATION_LOGO_URL=https://your-domain.com/logo.png
```

- **`STATION_LOGO_URL`** — must be a publicly accessible URL (not a local file path). PNG or SVG recommended. Leave blank to omit the logo.
- These variables are injected into `app/config.js` during each deployment by `scripts/deploy-production.sh`.
- For local development, set them in your local `.env` — they are available immediately via `CONFIG.STATION` in the frontend.

---

## Contract Form Fields

### Contract Information
| Field | Notes |
|-------|-------|
| **Contract Name** | Required. Descriptive name, e.g. "Acme Hardware Spring 2026 Underwriting" |
| **Organization** | Required. Select the sponsoring organization (creates one if needed). The sponsor's name and address appear in the PDF parties block. |
| **Primary Contact** | Select the contact person. Name, email, and phone appear in the PDF. |

### Contract Period
| Field | Notes |
|-------|-------|
| **Start Date** | Required. First day of the contract term. |
| **End Date** | Required. Last day of the contract term. |

### Financial Details
| Field | Notes |
|-------|-------|
| **Total Value (USD)** | Total dollar value of the sponsorship. Formatted with `$` and two decimal places in the PDF. |
| **Billing Frequency** | One-time, Monthly, Quarterly, or Custom. |
| **Billing Notes** | Payment schedule, invoice instructions, special arrangements. |

### Copy & Messaging
| Field | Notes |
|-------|-------|
| **Copy Summary** | Approved on-air messaging. Appears in the PDF under "Approved Messaging Summary" with a blue left border. |

### Background & Purpose
| Field | Notes |
|-------|-------|
| **Recitals** | Rich-text narrative describing the agreement context. A standard NCE underwriting recital is pre-filled as the default value. Edit per-contract as needed. Appears in the PDF under "Background & Purpose." |

### Terms & Conditions
| Field | Notes |
|-------|-------|
| **Terms** | Rich-text terms and FCC compliance guidelines. Pre-filled with the station's standard On-Air Underwriting Guidelines (all 8 items). Edit per-contract if special terms apply. Appears in the PDF under "Terms & Conditions." |

### Approval Workflow
Internal 3-level approval chain. Each level records who approved and when. The PDF displays all three levels in a table under "Internal Approval Record."

| Level | Approver | Responsibility |
|-------|----------|----------------|
| 1 | Program Manager | Content alignment and scheduling |
| 2 | General Manager | Business terms and financial approval |
| 3 | Compliance Officer | FCC compliance final gate |

### Signature & Execution
| Field | Notes |
|-------|-------|
| **Station Representative Name** | Name of the station signatory. Pre-fills the printed name line in the PDF signature block. |
| **Station Representative Title** | Title of the station signatory. |
| **Sponsor Signatory Name** | Name of the sponsor's authorized signer. Pre-fills the printed name line in the PDF. |
| **Sponsor Signatory Title** | Title of the sponsor signatory. |
| **Contract Signed Date** | Date the contract was executed (both parties signed). |
| **Executed Contract URL** | After physical signing, upload the signed PDF to cloud storage (e.g., Google Drive, Dropbox, S3) and paste the URL here for the permanent record. |

### Internal Notes
Free-form rich-text notes for internal use. Does **not** appear in the PDF.

---

## Generating the Contract PDF

The contract PDF uses a custom template that renders a formal legal document — not a raw form dump.

### What appears in the PDF

- **Header**: Station logo (if configured), station name + call sign, "Underwriting Agreement" title, contract ID, and status
- **Parties block**: Station identity (left) vs. Sponsor name/address/contact (right)
- **Contract Details**: Name, period, total value, billing frequency, billing notes
- **Background & Purpose**: From the Recitals field
- **Terms & Conditions**: From the Terms field
- **Approved Messaging Summary**: From the Copy Summary field (if filled)
- **Internal Approval Record**: All three approval levels with approver and date
- **Signature Block**: Station rep and sponsor signatory name/title lines with signature blanks
- **Footer**: Contract ID, generated date, FCC citation

### How to download

1. Open the contract submission in the portal (view or edit mode).
2. Click the **Download PDF** button in the edit banner, or use the **kebab menu → Download PDF** from the contracts list.
3. A "Generating PDF…" notice appears while html2pdf renders the document.
4. The file downloads as `Underwriting_Contract-[id].pdf`.

> **Note**: The `Organization` and `Primary Contact` fields must be resolved references (not just IDs) for the sponsor's name and contact info to appear in the PDF. If you see a placeholder message, open the contract, confirm the org is selected, and re-save before downloading.

---

## Signing Workflow

```
1. Fill all contract fields → save as Draft
2. Submit for approval → change status to "Pending Approval"
3. Program Manager approves → checks approval box, records name + date
4. General Manager approves
5. Compliance Officer approves → status changes to "Active"
6. Download PDF → review parties, terms, and messaging summary
7. Print or send PDF to sponsor → collect physical signatures
   (or use an external e-signature service such as DocuSign/HelloSign)
8. Receive executed copy → upload to cloud storage
9. Paste the URL into "Executed Contract URL" field → save
```

The portal record is the source of truth for the internal workflow. The executed PDF (with wet or e-signatures) is the legal instrument — store it reliably and link it back via `Executed Contract URL`.

---

## FCC Compliance Notes

This contract template is designed for **non-commercial educational (NCE)** radio stations operating under FCC rules (47 C.F.R. §§ 73.503, 73.621).

Key points built into the default Terms & Conditions:

- Acknowledgment spots are limited to **15–30 seconds**
- Spots air **between programs** — not during programming
- **Prohibited**: promotional language, calls to action, price references, comparative/superlative claims, inducements
- **Permitted**: sponsor name, address, website, phone, length of time in business, value-neutral product/service description, established slogans
- Non-profit status must be mentioned for non-profit underwriters
- The station reserves the right to refuse underwriting inconsistent with its mission

The **Compliance Officer** approval at Level 3 is the final FCC compliance gate before a contract becomes Active. Do not activate a contract without Compliance Officer sign-off.

See also: [`docs/underwriting-workflow.md`](./underwriting-workflow.md) for the full system architecture, and [`docs/terms.md`](./terms.md) for the source on-air guidelines.
