# Group Permissions (Resource-Based Access Control)

In addition to standard Role-Based Access Control (RBAC), the Radio Forms Portal supports **Group Permissions** (also known as Resource-Based Access). This allows you to restrict access to forms based on a user's membership in a specific group (e.g., Department or Committee), rather than just their global role.

## Overview

Group Permissions work by checking if a user's profile contains a reference to a specific Resource ID. If the user is linked to that Resource, they are granted the permissions defined for that group on the form.

**Key Components:**
1.  **Group Resources**: Resources that represent the groups (e.g., `Department`, `Committee`).
2.  **User Profile**: The User resource must have a field (e.g., `departments`) that links to the Group Resources.
3.  **Form Configuration**: Forms are configured to check for membership in these groups.

## Configuration

To enable Group Permissions for a specific form, you must add a `groupPermissions` object to the form's **Custom Properties** or **Settings**.

### ⚠️ Critical: Resource ID is a Submission ID

**IMPORTANT**: The `resource` field must contain the `_id` of the specific **Submission** (e.g., the "Engineering" department entry), **NOT** the `_id` of the Department **Form** definition.
*   **Correct**: `507f1f77...` (The ID of the submission where `name` = "Engineering")
*   **Incorrect**: `64a1b2c3...` (The ID of the "Department" Form)

### 1. Form Settings JSON

In the Form Builder, you can manually edit the form JSON or use a "Custom Property" if supported by your builder UI. The configuration is stored in `form.settings`.

**Single Group:**
```json
"settings": {
  "groupPermissions": {
    "resource": "64a1b2c3d4e5f67890123456",
    "fieldName": "departments",
    "access": ["read_all", "create_all", "read_own", "update_own"]
  }
}
```

**Multiple Groups:**
You can also provide an array of group configurations. This is useful if you want to grant access to multiple different Departments or Committees (e.g., "Engineering" AND "Management").

```json
"settings": {
  "groupPermissions": [
    {
      "resource": "64a1b2c3d4e5f67890123456", // Engineering Dept ID
      "fieldName": "departments",
      "access": ["read_all", "create_all"]
    },
    {
      "resource": "77b2c3d4e5f6789012345678", // Management Committee ID
      "fieldName": "committees",
      "access": ["read_all", "create_all", "delete_all"]
    }
  ]
}
```

### Configuration Options

| Property | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `resource` | String (ID) | **Yes** | The `_id` of the specific Resource document that represents the group (e.g., the ID of the "Engineering" Department submission). |
| `fieldName` | String | No | The key of the field in the User Profile that contains the group links. Defaults to checking `departments` and `committees` if not specified. |
| `access` | Array[String] | **Yes** | The list of permissions to grant to members of this group. Common values: `read_all`, `create_all`, `update_all`, `delete_all`, `read_own`. |

## Example Scenario: Engineering Department Access

**Goal**: Only members of the "Engineering" department should be able to see and submit the "Server Maintenance Log".

1.  **Find the Group ID**:
    *   Go to the **Department** resource.
    *   Find the submission for "Engineering".
    *   Copy its `_id` (e.g., `507f1f77bcf86cd799439011`).

2.  **Configure the Form**:
    *   Edit the "Server Maintenance Log" form.
    *   Add the following to the form settings:
        ```json
        "groupPermissions": {
          "resource": "507f1f77bcf86cd799439011",
          "fieldName": "departments",
          "access": ["read_all", "create_all"]
        }
        ```

3.  **Assign Users**:
    *   Edit a User's profile.
    *   In the "Departments" field, select "Engineering".

4.  **Result**:
    *   When this user logs in, the system detects they are a member of the group `507f1f77bcf86cd799439011` (Engineering).
    *   Because the form requires membership in that group for `read_all` and `create_all`, the user is granted access.
    *   Users who are NOT in Engineering will not see the form in their list (unless they have a global Admin role).

## Technical Implementation

### Permission Check (`rbacService.js`)

The logic is handled in `app/js/services/rbacService.js` -> `getSubmissionPermissions`.

It performs the following check:
1.  Does the user have a standard **Role** that grants access? (OR)
2.  Does the form have `groupPermissions` configured?
    *   If yes, does `user.data[fieldName]` contain the `resource` ID configured on the form?
    *   If yes, grant the permissions listed in `access`.

This allows for a hybrid model where Admins can access everything via Roles, but regular users are restricted by Department/Committee.

### Sidebar Visibility (`forms.js`)

Forms with `groupPermissions` use a **stricter sidebar filter**. Because all forms include `authenticated` in `access.read_all` (to prevent 401 logout), the standard form-definition read check would make every form visible to every logged-in user. For group-gated forms, the sidebar filter checks **only group membership** — it passes a synthetic formMeta (with only `settings`, no `submissionAccess`) to `getSubmissionPermissions`, so the broad `authenticated` role doesn't grant sidebar visibility.

- **Group members** see the form via group permissions.
- **Admins** see all forms via admin mode (bypasses the filter entirely).
- **Non-members** (even staff) do not see group-gated forms unless they are in the group or use admin mode.

### Placeholder Pattern for Templates

Form templates in `config/bootstrap/form_templates/` use placeholder IDs (e.g., `PROGRAMMING_DEPT_PLACEHOLDER`) and a `_groupName` hint field. The `post-bootstrap.js` script resolves these to real submission IDs at deploy time by matching `_groupName` against the `groupSubmissions` map.

## Three-Layer Access Model

| Layer | Mechanism | Enforced by | Controls |
|---|---|---|---|
| **1. Roles** | `form.access` / `form.submissionAccess` | Form.io server | Form definition loading (401 if denied) + submission CRUD |
| **2. Groups** | `form.settings.groupPermissions` | Client (`rbacService.js` + `forms.js`) | Sidebar visibility, create/read gating by department |
| **3. Shares** | `shareSettings` panel on form | Client (`checkSubmissionRowAccess`) | Per-submission row visibility |

**Critical interaction**: Layer 1 must include `authenticated` in `access.read_all` for all forms to prevent 401 logout. Layer 2 gates sidebar visibility for dept-scoped forms. Layer 3 filters individual submissions.

## Current Departments and Committees

| Group | Type | Forms |
|---|---|---|
| Engineering | Department | `engineeringSchedule`, `incidentReport` |
| Underwriting | Department | `uwContracts`, `uwCampaigns`, `uwSpots`, `uwLogs`, `contactIntake` |
| Programming | Department | `programmingShow`, `programmingRundown` |
| Technology | Committee | `engineeringSchedule`, `incidentReport`, `programmingRundown` (elevated: includes `delete_all`) |

## Architecture Decision: Embedded Arrays vs Join Resources

**Current Implementation**: Embedded Arrays (Field-Based Access)
We store group memberships directly on the User resource as arrays of IDs (e.g., `user.data.departments = [ID1, ID2]`).

**Alternative Considered**: Join Resources
The standard Form.io pattern for "Teams" often uses a separate "Join" resource (e.g., `DepartmentMember`) that links a User to a Department.
Reference: [Form.io Group Permissions](https://help.form.io/developers/roles-and-permissions/group-permissions)

**Decision**:
We opted for the **Embedded Array** approach for the following reasons:
1.  **Performance**: Permissions can be calculated synchronously from the User object already in memory. "Join Resources" would require asynchronous API calls to fetch memberships on every login/page load.
2.  **Simplicity**: The implementation in `rbacService.js` is significantly simpler and easier to debug.
3.  **Scale**: Our use case assumes users belong to a relatively small number of groups (< 20).

**Trade-offs & Future Considerations**:
*   **User Object Size**: If a user belongs to hundreds of groups, the User object size could become an issue.
*   **Membership Metadata**: We cannot store metadata about the membership itself (e.g., "Date Joined", "Role within Committee") using the array approach. If this metadata becomes a requirement in the future, we will need to refactor to the Join Resource pattern.

## Frontend Features

### Group Permissions Management
- **Manage Groups Modal**: Allows privileged users to assign users to Departments and Committees.
- **Implementation**: `app/js/features/groupMgmt.js`
- **Prepopulation**: Modal pre-fills with existing user group assignments.
- **Permissions**: Only users with role management permissions can access the modal.
- **Backend**: Uses FormioRequest with `data` option for PUT updates.

### Tabulator Data Display
- **Transforms**: `userRolesTransform` formats user data for display including roles, departments, and committees.
- **Columns**: Configured via `form.settings.tabulatorList.columns`.
- **Decoupling**: Table columns are independent of form component definitions; data can be displayed even if not defined as form components.

## Technical Notes

### Form.io Request Pattern
- **Usage**: Always use `formioRequest()` from `formioService.js`.
- **Payload**: Send request body in `data` option, not `body`.
- **Example**: `formioRequest('/user/submission/123', { method: 'PUT', data: updatedData })`

## Troubleshooting

### Issue: Users cannot see a form despite being in the group
1.  **Check User Profile**: Does the user have the Department/Committee assigned in their profile?
2.  **Verify IDs**:
    *   Inspect `form.settings.groupPermissions` in the database.
    *   Compare the `resource` ID against the **Submission ID** of the Department/Committee.
    *   **Common Error**: Pointing `resource` to the Form ID instead of the Submission ID.
3.  **Check Field Name**: Ensure `fieldName` matches the property on the user object (e.g., `departments` vs `committees`).
