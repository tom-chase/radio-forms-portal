# Underwriting/Sponsorship Workflow Documentation

**Version:** 2.0  
**Last Updated:** February 25, 2026

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Resources & Forms](#resources--forms)
4. [Data Flow](#data-flow)
5. [Approval Workflows](#approval-workflows)
6. [Donation Tracking](#donation-tracking)
7. [FCC Compliance](#fcc-compliance)
8. [Access Control](#access-control)
9. [Spot Revision Tracking](#spot-revision-tracking)
10. [Future Enhancements](#future-enhancements)
11. [Troubleshooting](#troubleshooting)
12. [Support & Maintenance](#support--maintenance)

---

## Overview

The Underwriting Workflow is a comprehensive Form.io-based system for managing community radio station sponsorships, from prospecting to contract execution, spot production, aircheck logging, and payment tracking. It integrates CRM functionality for contacts and donors with underwriting-specific workflows.

### Key Features

- **Unified CRM**: Single contact database for sponsors, members, donors, and partners
- **Donation Tracking**: Automatic major donor flagging based on 365-day giving history
- **Approval Workflows**: 3-level approval process for contracts and spots
- **Campaign Management**: Both sponsor-specific and station-wide campaign tracking
- **Aircheck Logging**: Manual entry with future automation/upload support
- **Activity Logging**: Polymorphic note linking to any record type
- **Spot Revision Tracking**: Full revision history for spot copy via `revisionTracking`
- **FCC Compliance**: Built-in review gates to prevent prohibited promotional language
- **Group-Based Access**: Department-scoped permissions via `groupPermissions`

---

## System Architecture

### Resource Hierarchy

```
┌──────────────┐       ┌─────────────┐       ┌─────────────┐
│ organization │◀──N:1─┤   contact   │       │    user     │
│ (companies)  │       │  (people)   │──N:1──▶  (logins)   │
└──────┬───────┘       └─────────────┘       └─────────────┘
       │
       │ 1:N
       ▼
┌────────────────────┐   ┌─────────────────────┐   ┌──────────────────┐
│ underwritingContract│──1:N──▶underwritingCampaign│──1:N──▶underwritingSpot│
│    (agreements)     │   │      (periods)       │   │   (messages)     │
└────────────────────┘   └──────────┬──────────┘   └────────┬─────────┘
                                    │                        │
                                    │ 1:N                    │
                                    ▼                        │
                          ┌──────────────────┐               │
                          │ underwritingLog  │◀──────────────┘
                          │   (airchecks)    │
                          └──────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  note (activity)  ◀── linked from any of the above records  │
│                       and from event records                 │
└──────────────────────────────────────────────────────────────┘
```

### File Structure

```
config/bootstrap/form_templates/
├── organization.json          # Organizations resource
├── contact.json               # Contacts resource (with donation tracking)
├── contactIntake.json         # Public intake form
├── underwritingContract.json  # Contracts resource (with approval workflow)
├── underwritingCampaign.json  # Campaigns resource (with station-wide field)
├── underwritingSpot.json      # Spots resource (with approval + revision tracking)
├── underwritingLog.json       # Aircheck log entries resource
└── note.json                  # Notes resource (with polymorphic parentRef)
```

---

## Resources & Forms

### 1. Organizations (`organization`)

**Path:** `/organization`  
**Type:** Resource  
**Purpose:** Master organization records for sponsors, partners, and vendors

#### Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | textfield | Organization name (required) |
| `orgType` | select | Underwriter/Sponsor, Community Partner, Vendor/Supplier, Other |
| `taxStatus` | select | For-Profit, Non-Profit |
| `nonprofitType` | select | 501(c)(3), 501(c)(4), 501(c)(6), Other (shown when taxStatus = nonprofit) |
| `ein` | textfield | Federal Tax ID / EIN (XX-XXXXXXX format, IRS prefix validation) |
| `onAirName` | textfield | How to announce on-air (if different from legal name) |
| `status` | select | Prospect, Active, Inactive, Do Not Contact |
| `phone` | phoneNumber | Primary phone |
| `website` | url | Website URL |
| `physicalAddress` | textarea | Physical address |
| `billingAddress` | textarea | Billing address (leave blank if same as physical) |
| `billingEmail` | email | Invoice email |
| `billingContactName` | textfield | Name of billing contact |
| `notes` | textarea (ckeditor) | Internal notes (not visible to organization) |

#### EIN Validation

The `ein` field uses an input mask (`99-9999999`) and custom validation against all valid IRS two-digit prefixes. Empty values are accepted (EIN is optional).

#### Tabulator Columns

- **Name** (responsive: 0, always visible, headerFilter)
- **Type** (responsive: 1, tablets+)
- **Status** (responsive: 1, tablets+)
- **Phone** (responsive: 2, desktop only)
- **Website** (responsive: 3, hidden by default)

---

### 2. Contacts (`contact`)

**Path:** `/contact`  
**Type:** Resource  
**Purpose:** Unified person records for sponsor contacts, members, donors, volunteers

#### Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `firstName` | textfield | First name (required) |
| `lastName` | textfield | Last name (required) |
| `email` | email | Email address |
| `phone` | phoneNumber | Phone number |
| `organization` | select (resource: organization) | Linked organization |
| `roleAtOrg` | textfield | Title/role at organization |
| `contactType` | selectboxes | Sponsor Contact, Member/Donor, Community Partner, Vendor, Volunteer Prospect, Other |
| `status` | select | Active, Pending Review, Inactive |
| `source` | select | Website, Referral, Event, Cold Call, Other |
| `linkedUser` | select (resource: user) | Portal login (optional) |
| `givingHistory` | datagrid | Donation records (conditional on Member/Donor type) |
| `majorDonor` | checkbox (calculated) | Auto-calculated: $1,000+ in past 365 days |
| `notes` | textarea (ckeditor) | Internal notes |

#### Donation History Fields (Datagrid)

| Field | Type | Description |
|-------|------|-------------|
| `donationDate` | datetime | Date of donation (required) |
| `amount` | number | Amount in USD (required) |
| `campaign` | textfield | Campaign/fund name |
| `paymentMethod` | select | Cash, Check, Credit Card, Online, Other |
| `donationNotes` | textfield | Notes about donation |

#### Major Donor Calculation

The `majorDonor` checkbox is automatically calculated using:

```javascript
value = (function() {
  const history = data.givingHistory || [];
  const now = new Date();
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const recentTotal = history.reduce((sum, donation) => {
    const donationDate = new Date(donation.donationDate);
    if (donationDate >= oneYearAgo && donationDate <= now) {
      return sum + (parseFloat(donation.amount) || 0);
    }
    return sum;
  }, 0);
  return recentTotal >= 1000;
})();
```

**Threshold:** $1,000 USD in past 365 days  
**Updates:** Recalculates on form load/save

#### Tabulator Columns

- **First** (responsive: 0, always visible, headerFilter)
- **Last** (responsive: 0, always visible, headerFilter)
- **Email** (responsive: 1, tablets+, headerFilter)
- **Org** (responsive: 1, tablets+)
- **Status** (responsive: 2, desktop only)

---

### 3. Contact Intake (`contactIntake`)

**Path:** `/contactintake`  
**Type:** Form (not resource)  
**Purpose:** Public-facing form for anonymous prospect submissions

#### Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `firstName` | textfield | First name (required) |
| `lastName` | textfield | Last name (required) |
| `email` | email | Email (required) |
| `phone` | phoneNumber | Phone number |
| `organization` | textfield | Free-text organization name |
| `message` | textarea | Message/inquiry |
| `source` | hidden | Auto-set to "website" |
| `honeypot` | textfield (hidden via CSS) | Spam protection — must remain blank |

#### Access

- **Anonymous:** `create_own` (can submit)
- **Authenticated/Staff/Management/Admin:** `read_all` (can review)
- **Underwriting department** (via `groupPermissions`): `read_all`

#### Future Enhancement

A custom action will be added to automatically create a `contact` resource submission with `status: pending_review` when this form is submitted.

---

### 4. Underwriting Contracts (`underwritingContract`)

**Path:** `/underwritingcontract`  
**Type:** Resource  
**Purpose:** Sponsorship agreements and contracts

#### Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `contractName` | textfield | Contract name (required) |
| `organization` | select (resource: organization) | Sponsor org (required) |
| `primaryContact` | select (resource: contact) | Primary contact |
| `startDate` | datetime | Contract start (required) |
| `endDate` | datetime | Contract end (required) |
| `totalValue` | number | Total value USD |
| `billingFrequency` | select | One-time, Monthly, Quarterly, Custom |
| `billingNotes` | textarea | Payment details |
| `copySummary` | textarea (ckeditor) | Messaging summary |
| `attachments` | datagrid | File attachments (name, URL, description) |
| `status` | select | Draft, Pending Approval, Active, Expired, Cancelled |

#### Approval Workflow Fields

Each approval level has:
- `[level]Approved` (checkbox)
- `[level]Approver` (select: user, conditional on approved)
- `[level]ApprovalDate` (datetime, conditional on approved)

**Approval Levels:**
1. Program Manager (`programManager`)
2. General Manager (`generalManager`)
3. Compliance Officer (`complianceOfficer`)

#### Status Flow

```
Draft → Pending Approval → Active → Expired/Cancelled
```

#### Tabulator Columns

- **Contract** (responsive: 0, always visible, headerFilter)
- **Sponsor** (responsive: 0, always visible)
- **Value** (responsive: 1, tablets+, money formatter)
- **Status** (responsive: 1, tablets+)
- **End Date** (responsive: 2, desktop only, datetime formatter)

---

### 5. Underwriting Campaigns (`underwritingCampaign`)

**Path:** `/underwritingcampaign`  
**Type:** Resource  
**Purpose:** Sponsor-specific campaign periods within broader station campaigns

#### Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `campaignName` | textfield | Campaign name (required) — sponsor-specific |
| `organization` | select (resource: organization) | Sponsor org (required) |
| `contract` | select (resource: underwritingContract) | Linked contract (optional) |
| `primaryContact` | select (resource: contact) | Campaign contact |
| `stationCampaign` | textfield | **Station-wide campaign** (e.g., "Fall Fund Drive 2025") |
| `onAirName` | textfield | Short on-air label |
| `startDate` | datetime | Campaign start |
| `endDate` | datetime | Campaign end |
| `spotsPerWeek` | number | Target spots/week |
| `notes` | textarea | Scheduling instructions |
| `status` | select | Planned, Active, Paused, Completed, Cancelled |

#### Campaign Hierarchy

- **Station-Wide Campaign:** Broad fundraising/promotion period (e.g., "Spring Pledge Drive 2026")
- **Sponsor Campaign:** Individual sponsor's participation within that period (e.g., "Acme Hardware Spring 2026")

#### Tabulator Columns

- **Campaign** (responsive: 0, always visible, headerFilter)
- **Sponsor** (responsive: 0, always visible)
- **Station Campaign** (responsive: 1, tablets+)
- **Status** (responsive: 1, tablets+)
- **Start** (responsive: 2, desktop only, datetime formatter)

---

### 6. Underwriting Spots (`underwritingSpot`)

**Path:** `/underwritingspot`  
**Type:** Resource  
**Purpose:** Individual underwriting messages/promos

#### Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `spotName` | textfield | Spot name (required) |
| `campaign` | select (resource: underwritingCampaign) | Parent campaign (required) |
| `lengthSeconds` | number | Duration in seconds |
| `copy` | textarea (ckeditor) | Script/copy text (revision-tracked) |
| `audioUrl` | url | Audio file link (for future upload/serving) |
| `attachments` | datagrid | File attachments (name, URL, description) |
| `status` | select | Draft, Pending Approval, Approved, Deprecated |

#### Approval Workflow Fields

Same structure as contracts but with a different first-level approver:
1. Program Director (`programDirector`)
2. General Manager (`generalManager`)
3. Compliance Officer (`complianceOfficer`)

Each level has: `[level]Approved`, `[level]Approver`, `[level]ApprovalDate`

> **Note:** Contracts use `programManager`; Spots use `programDirector`. These are different roles reflecting different approval chains.

#### Status Flow

```
Draft → Pending Approval → Approved → Deprecated
```

#### Tabulator Columns

- **Spot** (responsive: 0, always visible, headerFilter)
- **Campaign** (responsive: 0, always visible)
- **Length** (responsive: 1, tablets+)
- **Status** (responsive: 1, tablets+)

---

### 7. Underwriting Logs (`underwritingLog`)

**Path:** `/underwritinglog`  
**Type:** Resource  
**Purpose:** Track actual airings (airchecks) for billing and reporting

#### Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `airDateTime` | datetime | Air date/time (required) |
| `campaign` | select (resource: underwritingCampaign) | Campaign |
| `spot` | select (resource: underwritingSpot) | Spot aired |
| `programName` | textfield | Show name |
| `positionNotes` | textfield | Break position |
| `source` | select | Manual Entry, Automation Import, Digital Upload |
| `audioFileUrl` | url | URL to served audio (future) |
| `fileHash` | textfield | File checksum (future) |
| `notes` | textarea | Additional notes |

#### Source Types

- **Manual Entry:** Staff manually logs the airing
- **Automation Import:** Future integration with automation system
- **Digital Upload:** Future integration with audio file serving

#### Future Automation

The `audioFileUrl` and `fileHash` fields are prepared for:
- Automated POST entries from broadcast automation systems
- Digital audio file upload and serving
- Verification and deduplication via checksums

#### Tabulator Columns

- **Air Date/Time** (responsive: 0, always visible, datetime formatter with timezone)
- **Campaign** (responsive: 0, always visible)
- **Spot** (responsive: 1, tablets+)
- **Program** (responsive: 1, tablets+)
- **Source** (responsive: 2, desktop only)

---

### 8. Notes (`note`)

**Path:** `/note`  
**Type:** Resource  
**Purpose:** Activity/interaction logs with polymorphic linking

#### Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | textfield | Brief summary (required) |
| `content` | textarea (ckeditor) | Note content |
| `author` | textfield (calculated) | Auto-populated from user.data.email |
| `parentType` | select | Organization, Contact, Contract, Campaign, Spot, Event |
| `parentId` | hidden (calculated) | Consolidated record ID (from conditional fields below) |
| `sharePublic` | checkbox | Share with public |
| `shareRoles` | select (multiple) | Share with roles |
| `shareDepartments` | select (multiple) | Share with departments |
| `shareCommittees` | select (multiple) | Share with committees |
| `shareUsers` | select (multiple) | Share with users |

#### Polymorphic Linking

Notes can be linked to any record type via `parentRef` container:
- **parentType:** Specifies the resource (`organization`, `contact`, `underwritingcontract`, `underwritingcampaign`, `underwritingspot`, `event`)
- **parentId:** Hidden calculated field — consolidates the value from the matching conditional select

#### Dynamic Record Selection

The note form uses **conditional resource fields** to provide proper record selection:
- Six separate select fields: `parentId_orgs`, `parentId_contact`, `parentId_uwContracts`, `parentId_uwCampaigns`, `parentId_uwSpots`, `parentId_event`
- Each field uses `dataSrc: "resource"` with proper resource reference
- Each field has `customConditional` to show only when matching `parentType` is selected
- The hidden `parentId` field uses `calculateValue` to consolidate the selected value

**Benefits:**
- Proper Form.io resource integration with "Add Resource" buttons
- Save as reference functionality works correctly
- Better data integrity and validation
- Searchable dropdowns with appropriate display templates

#### Inline Notes Display

When viewing or editing any submission, a **Notes section** automatically appears below the form with:

**Features:**
- **Notes List:** Displays all notes linked to the current record, sorted by most recent
- **Add Note Button:** Opens inline note creation form
- **Auto-Population:** Parent reference fields are automatically populated and hidden
- **Real-time Display:** Shows author, timestamp, note type badge, and content
- **Follow-up Tracking:** Displays follow-up dates if set
- **Relative Timestamps:** "Just now", "2 hours ago", "Yesterday", etc.

**Note Type Badges:**
- General (gray)
- Follow-up (yellow)
- Important (red)
- Meeting (blue)
- Phone (primary blue)
- Email (green)

#### Frontend Integration

The notes system is integrated via `notesUI.js` module:
1. **Automatic Display:** Notes section renders when viewing/editing any submission with an `_id`
2. **Permission Checks:** Respects note form permissions before allowing creation
3. **Filtered Queries:** Only loads notes matching the parent record
4. **Inline Creation:** Note form appears in a card below the notes list
5. **Auto-refresh:** Notes list refreshes after successful submission

---

## Data Flow

### Prospect to Contract Flow

```
1. Anonymous Submission
   ↓
   contactIntake form (public website)
   ↓
2. Staff Review
   ↓
   Create contact record (status: pending_review)
   ↓
3. Qualification
   ↓
   Update contact (status: active)
   Link to organization (create if needed)
   ↓
4. Contract Creation
   ↓
   Create underwritingContract (status: draft)
   Link to organization and contact
   ↓
5. Contract Approval
   ↓
   Program Manager → General Manager → Compliance Officer
   Update status: active
   ↓
6. Campaign Creation
   ↓
   Create underwritingCampaign
   Link to contract and organization
   Set station-wide campaign name
   ↓
7. Spot Production
   ↓
   Create underwritingSpot
   Link to campaign
   Program Director → General Manager → Compliance Officer
   Update status: approved
   ↓
8. Aircheck Logging
   ↓
   Create underwritingLog entries
   Link to campaign and spot
   ↓
9. Activity Tracking
   ↓
   Create note entries at any step
   Link via parentRef to the relevant record
```

---

## Approval Workflows

### 3-Level Approval Process

Both **contracts** and **spots** use the same 3-level structure, but the first level differs between the two.

#### Approval Levels — Contracts (`underwritingContract`)

1. **Program Manager** (`programManager`)
   - Reviews content alignment with programming
   - Checks scheduling feasibility
   - Validates messaging appropriateness

2. **General Manager** (`generalManager`)
   - Reviews business terms
   - Approves financial commitments
   - Final operational sign-off

3. **Compliance Officer** (`complianceOfficer`)
   - Ensures FCC compliance
   - Validates non-commercial nature
   - Checks legal requirements

#### Approval Levels — Spots (`underwritingSpot`)

1. **Program Director** (`programDirector`)
   - Reviews copy for FCC compliance and messaging appropriateness
   - Checks spot length and scheduling fit

2. **General Manager** (`generalManager`)
   - Reviews business terms and approves production

3. **Compliance Officer** (`complianceOfficer`)
   - Final FCC compliance check before spot is approved to air

#### Approval Fields (per level)

```json
{
  "[level]Approved": false,           // Checkbox
  "[level]Approver": null,            // User ID (conditional)
  "[level]ApprovalDate": null         // Datetime (conditional)
}
```

#### Conditional Display

The `Approver` and `ApprovalDate` fields only appear when the corresponding `Approved` checkbox is checked.

#### Status Transitions

**Contracts:**
```
Draft → Pending Approval → Active → Expired/Cancelled
```

**Spots:**
```
Draft → Pending Approval → Approved → Deprecated
```

#### Future Email Notifications

When email credentials are configured, add Form.io actions to trigger notifications on status changes:
- Draft → Pending: Notify approvers
- Each approval: Notify next approver in chain
- Final approval: Notify contract owner and underwriting coordinator

---

## Donation Tracking

### Giving History Datagrid

The `contact` resource includes a donation tracking system for member/donor contacts.

#### Conditional Display

The donation history panel only appears when the **Member/Donor** checkbox is selected in `contactType`:

```javascript
customConditional: "show = data.contactType && data.contactType.member === true;"
```

#### Major Donor Flag

Automatically calculated based on 365-day rolling window:

**Criteria:** Total donations ≥ $1,000 in past 365 days

**Calculation Logic:**
1. Iterate through `givingHistory` datagrid
2. Filter donations within past 365 days from current date
3. Sum the `amount` field
4. Return `true` if sum ≥ 1000, else `false`

**Field Properties:**
- Type: Checkbox
- Disabled: Yes (read-only)
- Recalculates: On form load and save

#### Use Cases

- **Segmentation:** Filter contacts by major donor status
- **Reporting:** Track major donor retention
- **Stewardship:** Identify high-value relationships
- **Campaign Planning:** Target major donors for special appeals

---

## Access Control

### Role Hierarchy

The system uses a simplified five-level role hierarchy (roles `programmer`, `underwriting`, and `volunteer` were removed in February 2026 and replaced by department-based scoping):

```
anonymous → authenticated → staff → management → administrator
```

### Group-Based Department Scoping

Underwriting-specific CRUD access is controlled via `groupPermissions` on each form's settings, not via roles. Users must be members of the **Underwriting** department group to access the underwriting forms in the sidebar and perform CRUD operations.

```json
"groupPermissions": [
  {
    "resource": "UNDERWRITING_DEPT_PLACEHOLDER",
    "fieldName": "departments",
    "access": ["read_all", "create_all", "update_all", "delete_all"],
    "_groupName": "Underwriting"
  }
]
```

The placeholder ID (`UNDERWRITING_DEPT_PLACEHOLDER`) is resolved to the real department submission ID at bootstrap time by `scripts/post-bootstrap.js`.

### Permissions by Resource

| Resource | Anonymous | Authenticated | Staff | Mgmt/Admin | Underwriting dept |
|----------|-----------|---------------|-------|------------|-------------------|
| `organization` | — | read | read | CRUD | CRUD |
| `contact` | — | read | CRUD_own | CRUD_all | CRUD |
| `underwritingContract` | — | — | read | CRUD | CRUD |
| `underwritingCampaign` | — | — | read | CRUD | CRUD |
| `underwritingSpot` | — | — | read | CRUD | CRUD |
| `underwritingLog` | — | — | read | CRUD | CRUD |
| `note` | — | CRUD_own | CRUD_own | CRUD_all | CRUD_own |
| `contactIntake` | create | read | read/update | CRUD | read |

### Row-Level Security (Share Settings)

The `contact`, `book`, and `note` resources use a client-side share-settings model for row-level security. Each submission can be shared with:
- **Specific roles** (`shareRoles`)
- **Departments** (`shareDepartments`)
- **Committees** (`shareCommittees`)
- **Individual users** (`shareUsers`)
- **Public** (`sharePublic: true`)

If a submission has share settings defined but none match the current user, access is restricted to the submission owner and administrators. This is enforced in `rbacService.js` via `checkSubmissionRowAccess()`.

---

## Implementation Guide

The underwriting forms are bootstrapped automatically via the standard project setup workflow. See the `/local-dev-setup` workflow for full instructions. Key bootstrap steps:

### Step 1: Bootstrap Forms

```bash
node scripts/bootstrap.js
node scripts/post-bootstrap.js
```

`post-bootstrap.js` resolves all `UNDERWRITING_DEPT_PLACEHOLDER` references in `groupPermissions` to the real Underwriting department submission ID.

### Step 2: Verify Resource Paths

Confirm all resources are available at their correct paths:
- `/organization`
- `/contact`
- `/contactintake`
- `/underwritingcontract`
- `/underwritingcampaign`
- `/underwritingspot`
- `/underwritinglog`
- `/note`

### Step 3: Verify Underwriting Department Group

Confirm that the Underwriting department exists and that the intended staff users have their `departments` field set to include Underwriting. Users without this group membership will not see the underwriting forms in the sidebar.

### Step 4: Test Data Flow

1. **Create Organization:** Type = Underwriter/Sponsor, Status = Active
2. **Create Contact:** Link to organization, Type = Sponsor Contact
3. **Create Contract:** Link org and contact, test 3-level approval workflow
4. **Create Campaign:** Link contract, set station-wide campaign name
5. **Create Spot:** Link campaign, test Program Director → GM → Compliance Officer workflow
6. **Create Log Entry:** Link campaign and spot
7. **Create Note:** From any record detail view — verify parentRef auto-populates

### Step 5: Configure Email Notifications (Future)

When email credentials are available:
1. Add Email action to `underwritingContract` on status change
2. Add Email action to `underwritingSpot` on status change
3. Configure notification templates for each approval step

---

## FCC Compliance

### What Is Underwriting?

Non-commercial educational (NCE) radio stations may receive funding from sponsors through **underwriting** — a form of sponsorship acknowledgment that differs fundamentally from commercial advertising. Under FCC rules (47 C.F.R. §§ 73.503, 73.621), NCE stations may identify their sponsors but **may not air promotional material**.

### What Makes a Valid Underwriting Acknowledgment

A valid underwriting spot:
- Identifies the sponsor by name
- May describe the business, products, or services in a value-neutral way
- May include a value-neutral slogan or tag line (if not promotional)
- May include location, phone number, and/or website
- May include a brief description of the organization's mission (for non-profits)

### Prohibited Content

The following are **not permitted** in underwriting acknowledgments:

| Category | Examples |
|----------|---------|
| Calls to action | "Visit us today!", "Call now!", "Buy online at..." |
| Comparative claims | "the best", "number one", "better than our competitors" |
| Price information | "only $9.99", "free with purchase", "starting at $X" |
| Inducements | "sale", "discount", "special offer", "limited time" |
| Superlatives | "the finest", "unbeatable quality", "the most trusted" |
| Direct solicitation | Any language urging a listener to take a commercial action |

### Safe-Harbor Language Examples

Valid:
> "Support for this program comes from Acme Hardware — tools and building supplies serving the community since 1978. acmehardware.com"

Valid:
> "This program is underwritten by Green Valley Food Co-op — a member-owned natural grocery at 123 Main Street."

Valid:
> "Funding provided by Riverside Law Group, serving individuals and families in estate planning and elder law."

Invalid (call to action + price):
> "Visit Acme Hardware this weekend for our best prices of the year — sale ends Sunday!"

Invalid (comparative + superlative):
> "Green Valley Co-op — the best natural foods in the region. Come taste the difference!"

### Enforcement Context

The FCC has levied fines against NCE stations for airing promotional content. The **3-level approval workflow** built into both `underwritingContract` and `underwritingSpot` is specifically designed to catch FCC violations before a spot airs. The **Compliance Officer** sign-off at level 3 is the final FCC compliance gate.

### Spot Copy Review Checklist

Before approving a spot, reviewers should confirm:
- No calls to action
- No price information
- No comparative or superlative claims
- No inducement language (sale, discount, offer)
- Sponsor name is clearly identified
- Content is factual and value-neutral
- Length is appropriate (typically 15–30 seconds)

---

## Spot Revision Tracking

The `underwritingSpot` resource has revision tracking enabled on the `copy` field:

```json
"settings": {
  "revisionTracking": {
    "enabled": true,
    "trackedFields": ["copy"]
  }
}
```

### What This Means

- Every time the `copy` field is saved with a new value, the previous version is stored in Form.io's built-in revision history.
- Revisions can be retrieved via the Form.io API at `GET /underwritingspot/{id}/v/{revision}`.
- This provides an audit trail of all copy changes throughout the approval process.

### Use Cases

- **Approval audit trail:** Track exactly what copy was approved at each stage.
- **Rollback:** Restore a previous version of copy if a new revision introduces compliance issues.
- **Legal records:** Maintain a timestamped history of all spot copy for FCC record-keeping.

### Future UI Integration

A revision history viewer is planned for the spot detail view, allowing staff to compare versions and restore prior copy without leaving the portal.

---

## Future Enhancements

### Phase 1: Automation Integration

**Aircheck Automation**
- API endpoint for automation systems to POST log entries
- Automatic spot detection and logging
- Integration with broadcast automation (e.g., WideOrbit, NexGen)

**Audio File Management**
- S3/cloud storage integration for spot audio files
- Upload interface in `uwSpots`
- Serve audio files via `audioUrl` field
- Checksum verification for deduplication

### Phase 2: Reporting & Analytics

**Dashboard Creation**
- Revenue by sponsor
- Spots aired vs. contracted
- Campaign performance metrics
- Major donor retention rates

**Calculated Fields**
- Total revenue per contract
- Spots remaining in campaign
- Fulfillment percentage
- Average donation per donor

### Phase 3: Public Intake Automation

**Custom Action Implementation**
- Auto-create `contact` from `contactIntake` submission
- Set status: `pending_review`
- Store reference to intake submission
- Email notification to underwriting coordinator

### Phase 4: Advanced Workflows

**Contract Renewal**
- Automatic renewal reminders
- Clone contract for renewal
- Track renewal history

**Spot Rotation**
- Automatic spot rotation scheduling
- Load balancing across programs
- Preferred time slot management

**Invoice Generation**
- Automatic invoice creation based on billing frequency
- Track payment status
- Aging reports

### Phase 5: Integration

**CRM Integration**
- Sync with external CRM systems
- Bidirectional contact updates
- Donation import from fundraising platforms

**Accounting Integration**
- Export to QuickBooks/Xero
- Payment tracking
- Revenue recognition

---

## Troubleshooting

### Donation History Not Showing

**Issue:** Donation history panel doesn't appear when Member/Donor is selected.

**Solution:** Verify the `customConditional` is set correctly:
```javascript
show = data.contactType && data.contactType.member === true;
```

### Major Donor Flag Not Calculating

**Issue:** Major donor checkbox remains unchecked despite qualifying donations.

**Solution:** 
1. Ensure `calculateValue` is set on the field
2. Check that donation dates are valid ISO format
3. Verify amounts are numeric (not strings)
4. Save and reload the form to trigger recalculation

### Approval Fields Not Appearing

**Issue:** Approver and date fields don't show when checkbox is checked.

**Solution:** Verify conditional settings:
```json
{
  "conditional": {
    "show": true,
    "when": "[level]Approved",
    "eq": true
  }
}
```

### Tabulator Columns Not Hiding on Small Screens

**Issue:** Columns don't hide on smaller screens.

**Solution:** Ensure `responsiveLayout: "hide"` is set in `tabulatorList` settings and that each column has a `responsive` integer (0 = always visible; higher numbers hide first).

### Underwriting Forms Not Appearing in Sidebar

**Issue:** A staff user cannot see the underwriting forms (Contracts, Campaigns, Spots, Logs) in the sidebar.

**Solution:**
1. Verify the user's `departments` field includes the **Underwriting** department.
2. Confirm `post-bootstrap.js` ran successfully and resolved `UNDERWRITING_DEPT_PLACEHOLDER` to a real ID.
3. Check the form's `settings.groupPermissions` array contains the correct department submission ID (not the placeholder string).

### Notes Not Linking to Records

**Issue:** Notes created but not associated with parent record.

**Solution:** 
1. Verify `parentType` and `parentId` are populated
2. Check that frontend is pre-populating these fields
3. Ensure container structure is correct in note.json

---

## Support & Maintenance

### Regular Maintenance Tasks

**Weekly:**
- Review pending contact intake submissions
- Check for contracts nearing expiration
- Verify aircheck log accuracy

**Monthly:**
- Audit major donor calculations
- Review approval workflow bottlenecks
- Clean up deprecated spots

**Quarterly:**
- Archive expired contracts
- Generate revenue reports
- Review and update station-wide campaigns

### Data Integrity Checks

**Orphaned Records:**
- Campaigns without contracts
- Spots without campaigns
- Logs without spots

**Incomplete Approvals:**
- Contracts in "Pending" status > 30 days
- Spots in "Pending" status > 14 days

**Missing Links:**
- Contacts without organizations
- Contracts without primary contacts

---

## Glossary

**Aircheck:** Verification that a spot actually aired as scheduled

**Campaign (Sponsor-Specific):** Individual sponsor's participation period (e.g., "Acme Spring 2025")

**Campaign (Station-Wide):** Broader station fundraising/promotion period (e.g., "Fall Fund Drive 2025")

**Contract:** Legal agreement between station and sponsor

**Major Donor:** Contact with $1,000+ in donations over past 365 days

**Spot:** Individual underwriting message/promo (typically 15-60 seconds)

**Underwriting:** Non-commercial sponsorship acknowledgment (FCC compliant)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Feb 5, 2026 | Initial implementation with all 8 resources/forms |
| 2.0 | Feb 25, 2026 | Corrected all resource names/paths; replaced obsolete role table with group-permissions model; added missing Organization fields (taxStatus, nonprofitType, ein, billingContactName); fixed approval level naming for Spots (programDirector); added note polymorphic link to event; documented Spot Revision Tracking; added FCC Compliance section; updated Implementation Guide for current bootstrap workflow |

---

## Contact

For questions or issues with this workflow, contact the system administrator or refer to the main project documentation.
