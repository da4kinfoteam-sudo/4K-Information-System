# Program Management Delete Conflict Correction

## Cause And Scope

The Program Management lists receive financial display projections from App, not
raw parent rows. In the verified hosted schema all three parent tables lack a
`disbursements` column. Comparing the projected row with the stored row creates a
false conflict even when nothing changed. The old delete RPC raises SQLSTATE
`40001` for this deterministic conflict. Hosted PostgREST can repeatedly retry
that code until the gateway times out.

The correction prepares a permission-checked `read_dcf_state` snapshot for each
explicitly selected record before opening bulk confirmation. Display hydration
is never submitted as a stored baseline. The delete transaction still validates
the raw record and, for these new clients, the complete snapshot hash, including
financial/related state. Changes after preparation require a new confirmation.
No background reads, widened queries or stored-data normalization are introduced.

An uncertain reply retains the same in-memory snapshot and request key for retry.
A confirmed SQL rejection cannot silently refresh the baseline from the open
dialog; close and reopen it. Successfully confirmed bulk items are removed once;
remaining items can be retried without re-deleting the successful subset.

## Database Rollout

1. Separately authorize the Main production migration and frontend promotion.
2. Review/apply `202611270001_dcf_delete_conflict_response.sql` through the existing
   migration workflow. It replaces only `delete_dcf_record`, retaining its
   signature, owner, security settings and grants. It uses `PT409` for explicit
   stale conflicts, preserves old raw-parent clients, and adds the optional full
   snapshot check. No business-row DML, backfill, reset, table or column change.
3. Verify the deployed function and privileges before deploying the dependent
   frontend. Do not remove stale checks or increase global timeouts.
4. Review currently active PostgREST requests. A previously started retry loop
   may survive function replacement. If intervention is separately authorized,
   re-identify the exact looping delete backends from current diagnostics/logs
   before terminating only those sessions. Do not reuse old PID observations,
   terminate unrelated sessions or restart the entire database as a default.
5. Verify exact production commit/alias/manifest, then have users refresh after
   preserving drafts. Do not delete real records as deployment test fixtures.

The UI fix alone does not install SQL or clear already-running server requests.
Other RPCs using custom `40001` conflict exceptions are a separate follow-up;
this migration changes only the delete function, not actuals/target writers.

Reference: [Supabase retry-loop advisory](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).

## Verification

- `npm run test:program-management-delete-ui`: uses actual App enrichment,
  hosted-shaped missing columns, real UI/adapters/disposable SQL, archive capture,
  delayed response, stale parent/financial changes, uncertain retry and permissions.
- `npm run test:dcf-delete-conflict`: isolated native PostgreSQL; unchanged
  security/data on installation, all-five DCF deletion/archive/recovery/receipt
  safety and a real concurrent financial-change/request-lock wait.
- Existing Program Management save/import/revision checks, lint and build.
- Native test prerequisites: install `pg@8.16.3` and
  `@embedded-postgres/windows-x64@17.7.0-beta.16` in a separate test-only runtime.
  The new native runner uses `%TEMP%/4kis-delete-native-runtime` or
  `NATIVE_PG_DRIVER_RUNTIME`. It creates a TEMP cluster, binds a random loopback
  port, and shuts down in `finally`; it never reads a production database URL.

Local fixtures are not a hosted authenticated-delete or PostgREST-runtime test.
No production test record, financial edit, archive, deletion or session termination
is authorized merely by running these checks.
