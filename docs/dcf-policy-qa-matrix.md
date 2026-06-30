# DCF Policy QA Matrix

This checklist verifies DCF status-based editing rules and monthly accomplishment locking.

## Runtime Defaults

- Policy row: `dcf_policy_settings.settings_key = dcf_editing_policy`
- Date source: `get_app_current_date()` using Asia/Manila business date
- Grace period: 5 days for the previous month
- Override roles: Super Admin, Administrator
- Override audit path: `user_logs.action_metadata`
- Permission model: module permission is checked first, then DCF status/month policy is applied

## Roles

| Role group | Expected behavior |
|---|---|
| Super Admin | Can use override paths. Override reason is required when enabled. |
| Administrator | Can use override paths. Override reason is required when enabled. |
| Management | Follows module permission plus DCF policy matrix. |
| Focal - User / RFO - User / User | Follows module permission plus DCF policy matrix. |
| Guest | Write actions are blocked. |

## Status and Action Matrix

Run this matrix for Subprojects, Activities, Office Requirements, and Other Program Expenses.

| Status | Edit Details | Edit Budget / Expenses | Edit Physical Accomplishment | Edit Financial Accomplishment | Delete |
|---|---:|---:|---:|---:|---:|
| Proposed | Allowed when module permission allows | Allowed when module permission allows | Blocked | Blocked | Allowed when module permission allows |
| Ongoing | Blocked | Blocked | Allowed when module permission allows | Allowed when module permission allows | Blocked |
| Completed | Blocked for ordinary roles | Blocked for ordinary roles | Blocked for ordinary roles | Blocked for ordinary roles | Blocked for ordinary roles |
| Cancelled | Blocked for ordinary roles | Blocked for ordinary roles | Blocked for ordinary roles | Blocked for ordinary roles | Blocked for ordinary roles |

Run this matrix for Staffing Requirements.

| Staffing status | Edit Details | Edit Budget / Expenses | Edit Physical Accomplishment | Edit Financial Accomplishment | Delete |
|---|---:|---:|---:|---:|---:|
| Proposed | Allowed when module permission allows | Allowed when module permission allows | Blocked | Blocked | Allowed when module permission allows |
| Filled | Blocked for ordinary roles | Blocked for ordinary roles | Blocked for ordinary roles | Blocked for ordinary roles | Blocked for ordinary roles |
| Unfilled | Blocked for ordinary roles | Blocked for ordinary roles | Blocked for ordinary roles | Blocked for ordinary roles | Blocked for ordinary roles |

## Month Lock Matrix

Use Physical Accomplishment, Financial Accomplishment, direct Activity accomplishment editing, direct Subproject accomplishment editing, and Program Management accomplishment editing.

| Target month | Ordinary user result | Admin/Super Admin result |
|---|---|---|
| Current month | Allowed | Allowed |
| Previous month within grace period | Allowed | Allowed |
| Previous month after grace period | Blocked | Override allowed with reason |
| Older past month | Blocked | Override allowed with reason |
| Future month | Blocked | Override allowed with reason |

## Save-Handler Checks

- A disabled edit button must match the save-handler decision.
- Direct URLs to edit pages must not bypass a blocked save.
- Bulk delete should skip blocked records and should not repeatedly prompt for override reasons.
- Admin/Super Admin override prompts must require a non-empty reason when the policy requires reasons.
- Override logs must include module, item id/name, status, action or target month, decision message, override reason, server date, client timestamp, role, and source entity.

## User Control Center Checks

- DCF Editing Rules loads even when no settings row exists because defaults are seeded or normalized.
- Saving policy changes persists to `dcf_policy_settings`.
- Cancel restores the active saved policy.
- Reset Defaults restores the recommended default matrix.
- Policy Preview reflects status and month-lock behavior for selected role, module, status, action, and month.
- Super Admin cannot be fully locked out in the matrix.
- Guest write toggles remain disabled.

## Regression Smoke Tests

- Subproject details and edit pages respect status rules.
- Activity details and edit pages respect status rules.
- Office, Staffing, and Other Program Expense detail pages respect status rules.
- Physical Accomplishment blocks locked months.
- Financial Accomplishment blocks locked months for obligations and disbursements.
- Existing current-month accomplishment entry remains quick and does not ask ordinary users for override details.
