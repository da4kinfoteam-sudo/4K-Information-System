# Budget Item Transfers

Activity and Subproject detail pages allow permitted users to select active budget lines and create a same-type destination. Activity/Training subtype is retained. Cancelled or superseded lines and cancelled sources are ineligible; completed sources are eligible.

Super Admin is enabled by default. Other roles require the dedicated `can_transfer_budget_items` module capability and existing edit permission. OU visibility scope remains enforced. This production implementation uses Main's custom user credentials; it must be adapted before integration into 4KISTest's Supabase Auth/central authorization model.

## Atomic Persistence

`submit_budget_item_transfer` creates the destination, snapshots the source, and records a retry key. When approval is required, the source remains unchanged until `resolve_budget_item_transfer` approves the request. Approval rejects stale source snapshots. Rejection preserves the source.

Applying a transfer removes only selected nested lines, reparents their central obligations/disbursements and item physical accomplishments, and records transfer-in/out history. Beneficiary/participant counts are allocated between the source remainder and destination, preserving the total and blank legacy values. Both direct transfer and list approval refresh local financial ownership without issuing a second database mutation.

Destinations are excluded from target measures but approved actuals remain eligible. Existing unmarked records retain their prior behavior. No gallery files, Drive objects, or unrelated parent records are moved.

## Migration Safety

`202610090001_activity_subproject_budget_item_transfers.sql` adds classification columns, a protected transfer log, permission capability, RPCs, and destination guards. It does not execute transfers or backfill business data. Existing Super Admin permission rows receive only the new transfer capability.

Within the migration transaction, write locks and pre/post counts/checksums verify that existing Subprojects, Activities, financial actuals, item physical actuals, and adjustment history remain unchanged. New classification columns are excluded from comparison. Lock acquisition times out after five seconds; statements time out after sixty seconds. Any mismatch fails the transaction.

An application rollback may retain the additive schema. Do not reset the database or remove applied transfer records to roll back a frontend deployment.

## Verification

- `npm run lint`
- `npm run build`
- `npm run test:budget-item-transfer`
- `npm run test:subproject-budget-lifecycle`
- `npm run test:financial-obligation-sync`
- `npm run test:signed-obligations`

For isolated SQL integration checks, install `@electric-sql/pglite` into a separate local runtime directory, then run:

```powershell
node scripts/run-budget-item-transfer-sql-check.mjs <runtime-directory> <linked-schema-checkout>
```

The SQL runner reads only the linked database's column metadata. All synthetic records and transfer executions are local and disposable. It checks migration preservation, both source types, selected actual ownership, null counts, retry idempotency, approval/rejection, permissions, cancellation, and classification guards. It does not perform a production transfer.
