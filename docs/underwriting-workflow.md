# Underwriting/Sponsorship Workflow Documentation

**Version:** 1.0  
**Last Updated:** February 5, 2026

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Resources & Forms](#resources--forms)
4. [Data Flow](#data-flow)
5. [Approval Workflows](#approval-workflows)
6. [Donation Tracking](#donation-tracking)
7. [Access Control](#access-control)
8. [Implementation Guide](#implementation-guide)
9. [Future Enhancements](#future-enhancements)

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
- **Responsive Design**: Mobile-friendly Tabulator lists with priority-based column hiding

---

## System Architecture

### Resource Hierarchy

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    orgs     │◀──N:1─┤   contact   │       │    user     │
│ (companies) │       │  (people)   │──N:1──▶  (logins)   │
└──────┬──────┘       └─────────────┘       └─────────────┘
       │                                           
       │ 1:N                                       
       ▼                                           
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│ uwContracts │──1:N──▶│ uwCampaigns │──1:N──▶│  uwSpots    │
│ (agreements)│       │  (periods)  │       │ (messages)  │
└──────┬──────┘       └──────┬──────┘       └──────┬──────┘
       │                     │                     │
       │                     │ 1:N                 │
       │                     ▼                     │
       │              ┌─────────────┐              │
       │              │   uwLogs    │◀─────────────┘
       │              │ (airchecks) │
       │              └─────────────┘
       │
       │ 1:N (via parentRef)
       ▼
┌─────────────┐
│    note     │ ◀── Also linked from contact, campaign, spot
│ (activity)  │
└─────────────┘
```

### File Structure

```
config/bootstrap/form_templates/
├── orgs.json              # Organizations resource
├── contact.json           # Contacts resource (with donation tracking)
├── contactIntake.json     # Public intake form
├── uwContracts.json       # Contracts resource (with approval workflow)
├── uwCampaigns.json       # Campaigns resource (with station-wide field)
├── uwSpots.json           # Spots resource (with approval workflow)
├── uwLogs.json            # Aircheck log entries resource
└── note.json              # Notes resource (with parentRef linking)
```

---

## Resources & Forms

### 1. Organizations (`orgs`)

**Path:** `/orgs`  
**Type:** Resource  
**Purpose:** Master organization records for sponsors, partners, and vendors

#### Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | textfield | Organization name (required) |
| `orgType` | select | Underwriter, Partner, Vendor, Other |
| `onAirName` | textfield | How to announce on-air |
| `phone` | phoneNumber | Primary phone |
| `website` | url | Website URL |
| `billingAddress` | textarea | Billing address |
| `billingEmail` | email | Invoice email |
| `status` | select | Prospect, Active, Inactive, Do Not Contact |
| `notes` | textarea (ckeditor) | Internal notes |

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
| `organization` | select (resource: orgs) | Linked organization |
| `roleAtOrg` | textfield | Title/role at organization |
| `contactType` | selectboxes | Sponsor, Member/Donor, Partner, Vendor, Volunteer, Other |
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

**Path:** `/contact-intake`  
**Type:** Form (not resource)  
**Purpose:** Public-facing form for anonymous prospect submissions

#### Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `firstName` | textfield | First name (required) |
| `lastName` | textfield | Last name (required) |
| `email` | email | Email (required) |
| `phone` | phoneNumber | Phone number |
| `organization` | textfield | Organization name |
| `message` | textarea | Message/inquiry |
| `source` | hidden | Auto-set to "website" |
| `honeypot` | hidden | Spam protection |

#### Access

- **Anonymous:** `create_own` (can submit)
- **Staff/Management:** `read_all` (can review)

#### Future Enhancement

A custom action will be added to automatically create a `contact` resource submission with `status: pending_review` when this form is submitted.

---

### 4. Underwriting Contracts (`uwContracts`)

**Path:** `/uw-contracts`  
**Type:** Resource  
**Purpose:** Sponsorship agreements and contracts

#### Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `contractName` | textfield | Contract name (required) |
| `organization` | select (resource: orgs) | Sponsor org (required) |
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
1. Program Manager
2. General Manager
3. Compliance Officer

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

### 5. Underwriting Campaigns (`uwCampaigns`)

**Path:** `/uw-campaigns`  
**Type:** Resource  
**Purpose:** Sponsor-specific campaign periods within broader station campaigns

#### Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `campaignName` | textfield | Campaign name (required) - sponsor-specific |
| `organization` | select (resource: orgs) | Sponsor org (required) |
| `contract` | select (resource: uwContracts) | Linked contract (optional) |
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

### 6. Underwriting Spots (`uwSpots`)

**Path:** `/uw-spots`  
**Type:** Resource  
**Purpose:** Individual underwriting messages/promos

#### Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `spotName` | textfield | Spot name (required) |
| `campaign` | select (resource: uwCampaigns) | Parent campaign (required) |
| `lengthSeconds` | number | Duration in seconds |
| `copy` | textarea (ckeditor) | Script/copy text |
| `audioUrl` | url | Audio file link (for future upload/serving) |
| `attachments` | datagrid | File attachments (name, URL, description) |
| `status` | select | Draft, Pending Approval, Approved, Deprecated |

#### Approval Workflow Fields

Same structure as contracts:
1. Program Manager
2. General Manager
3. Compliance Officer

Each level has: `[level]Approved`, `[level]Approver`, `[level]ApprovalDate`

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

### 7. Underwriting Logs (`uwLogs`)

**Path:** `/uw-logs`  
**Type:** Resource  
**Purpose:** Track actual airings (airchecks) for billing and reporting

#### Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `airDateTime` | datetime | Air date/time (required) |
| `campaign` | select (resource: uwCampaigns) | Campaign |
| `spot` | select (resource: uwSpots) | Spot aired |
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
| `parentType` | select | Organization, Contact, Contract, Campaign, Spot |
| `parentId` | textfield | Record ID (auto-populated) |
| `sharePublic` | checkbox | Share with public |
| `shareRoles` | select (multiple) | Share with roles |
| `shareDepartments` | select (multiple) | Share with departments |
| `shareCommittees` | select (multiple) | Share with committees |
| `shareUsers` | select (multiple) | Share with users |

#### Polymorphic Linking

Notes can be linked to any record type via `parentRef` container:
- **parentType:** Specifies the resource (orgs, contact, uwContracts, uwCampaigns, uwSpots)
- **parentId:** The `_id` of the linked record

#### Frontend Pattern

When viewing a record (e.g., organization detail):
1. "Add Note" button pre-populates `parentType` and `parentId`
2. Notes list filtered by `parentType` and `parentId`
3. Notes appear in context of the parent record

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
   Create uwContracts (status: draft)
   Link to organization and contact
   ↓
5. Approval Process
   ↓
   Program Manager → General Manager → Compliance Officer
   ↓
6. Contract Activation
   ↓
   Update status: active
   ↓
7. Campaign Creation
   ↓
   Create uwCampaigns
   Link to contract and organization
   Set station-wide campaign
   ↓
8. Spot Production
   ↓
   Create uwSpots
   Link to campaign
   Go through approval workflow
   ↓
9. Aircheck Logging
   ↓
   Create uwLogs entries
   Link to campaign and spot
   ↓
10. Activity Tracking
    ↓
    Create note entries at any step
    Link via parentRef to relevant records
```

---

## Approval Workflows

### 3-Level Approval Process

Both **contracts** and **spots** use the same approval workflow structure.

#### Approval Levels

1. **Program Manager**
   - Reviews content alignment with programming
   - Checks scheduling feasibility
   - Validates messaging appropriateness

2. **General Manager**
   - Reviews business terms
   - Approves financial commitments
   - Final operational sign-off

3. **Compliance Officer**
   - Ensures FCC compliance
   - Validates non-commercial nature
   - Checks legal requirements

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

### Role-Based Permissions

| Resource | Anonymous | Authenticated | Programmer | Staff | Underwriting | Management | Admin |
|----------|-----------|---------------|------------|-------|--------------|------------|-------|
| `orgs` | - | - | read | read | CRUD | CRUD | CRUD |
| `contact` | - | read_own | read | read | CRUD | CRUD | CRUD |
| `uwContracts` | - | - | read* | read | CRUD | CRUD | CRUD |
| `uwCampaigns` | - | - | read | read | CRUD | CRUD | CRUD |
| `uwSpots` | - | - | read | read | CRUD | CRUD | CRUD |
| `uwLogs` | - | - | CRUD | read | CRUD | CRUD | CRUD |
| `note` | - | CRUD_own | CRUD_own | CRUD_own | CRUD_own | CRUD_all | CRUD |
| `contactIntake` | create | - | - | - | - | - | - |

*Programmers see active campaigns/spots for scheduling purposes

### Notes on Permissions

- **Anonymous:** Can only submit to `contactIntake` form
- **Programmers:** Need read access to campaigns/spots for show scheduling, can create log entries
- **Staff:** Read-only access to underwriting resources
- **Underwriting Role:** Full CRUD on all underwriting resources
- **Management:** Full CRUD on all resources
- **Admin:** Full system access

### Share Settings

The `note` resource includes row-level security via share settings:
- Share with specific roles
- Share with departments
- Share with committees
- Share with individual users
- Share publicly (optional)

---

## Implementation Guide

### Step 1: Import Form Templates

Import the following files via Form.io bootstrap or admin interface:

```bash
config/bootstrap/form_templates/
├── orgs.json
├── contact.json
├── contactIntake.json
├── note.json              # Update existing
├── uwContracts.json
├── uwCampaigns.json
├── uwSpots.json
└── uwLogs.json
```

### Step 2: Verify Resource Creation

Check that all resources are created with correct paths:
- `/orgs`
- `/contact`
- `/contact-intake`
- `/note`
- `/uw-contracts`
- `/uw-campaigns`
- `/uw-spots`
- `/uw-logs`

### Step 3: Configure Roles

Ensure the following roles exist:
- `programmer`
- `staff`
- `underwriting`
- `management`
- `administrator`

### Step 4: Test Data Flow

1. **Create Organization:**
   - Navigate to Organizations
   - Create test sponsor org
   - Set type: Underwriter
   - Set status: Active

2. **Create Contact:**
   - Navigate to Contacts
   - Create test contact
   - Link to organization
   - Set type: Sponsor Contact
   - Test donation history (if Member/Donor type)

3. **Create Contract:**
   - Navigate to Contracts
   - Create test contract
   - Link to organization and contact
   - Test approval workflow

4. **Create Campaign:**
   - Navigate to Campaigns
   - Create test campaign
   - Link to contract
   - Set station-wide campaign name

5. **Create Spot:**
   - Navigate to Spots
   - Create test spot
   - Link to campaign
   - Test approval workflow

6. **Create Log Entry:**
   - Navigate to Aircheck Logs
   - Create test log entry
   - Link to campaign and spot

7. **Create Note:**
   - From any record detail view
   - Create note linked to that record
   - Verify parentRef fields populate

### Step 5: Configure Public Intake

Update `app/contact.html` to point to the new intake form:

```javascript
// Change formUrl from:
formUrl: '/contact'

// To:
formUrl: '/contact-intake'
```

### Step 6: Test Responsive Design

Test Tabulator lists on different screen sizes:
- Desktop: All columns visible
- Tablet: responsive: 0-1 visible
- Mobile: responsive: 0 only

### Step 7: Configure Email Notifications (Future)

When email credentials are available:
1. Add Email action to `uwContracts` on status change
2. Add Email action to `uwSpots` on status change
3. Configure notification templates
4. Test approval notification flow

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

### Tabulator Columns Not Responsive

**Issue:** Columns don't hide on smaller screens.

**Solution:** Ensure `responsiveLayout: "hide"` is set in `tabulatorList` settings.

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

---

## Contact

For questions or issues with this workflow, contact the system administrator or refer to the main project documentation.
