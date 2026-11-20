# Resources Rollout Gate

Prepared locally for the combined1.9.0 Documentary Repository and Submit Ticket release. This document is not authorization to apply SQL, deploy an Edge Function, activate scoring or promote the frontend. No production test records or file uploads are permitted by this checklist.

## Local Preparation

- Preserve the unrelated Login/AuthContext overrides and existing published catalog history. The single1.9.0 feature entry has no PR/release date until the authorized promotion workflow supplies verified values.
- Run `npm run test:resources-suite`, `npm run lint`, `npm run build` and `npx --yes deno check supabase/functions/resources/index.ts`. The suite is sequential and records source hashes before/after, logs and results under TEMP.
- The native race test uses a generated TEMP cluster, random loopback port, explicit fixture credentials and mandatory shutdown. It never reads a database environment URL. Native runtime and `pg` are test-only dependencies outside the checkout, not production dependencies. Existing helper defaults remain compatible; Resources can use `NATIVE_PG_DRIVER_RUNTIME` for its separate runtime.
- Native fixture setup on Windows: install `pg@8.16.3` and `@embedded-postgres/windows-x64@17.7.0-beta.16` into a disposable test runtime with npm. The Resources runner defaults to `%TEMP%/4kis-resources-native-driver`. Do not install into or prune another project's runtime. A partially retained binary cache without its DLLs/share files is not a runnable server.
- Review the four additive migrations in order: `202611200001_resources_foundation`, `202611200002_resources_workflows`, `202611200003_resources_reads`, `202611200004_resources_storage`. They introduce new Resources tables/functions/indexes/strict grants and seed only missing rows for the two module keys. They do not rewrite existing business rows, deadlines, manual scores or Drive originals.

## Disposable Hosted Preflight

Use a separately authorized disposable Supabase project and private test Drive account/tree. A production connection is not an acceptable implicit substitute. Local PGlite/native PostgreSQL and simulated Drive do not certify hosted limits, OAuth scope/account compatibility or real inherited ACLs.

1. Record the disposable project/account identity without logging keys, credentials or tokens. Verify the baseline users/role configuration schema matches the expected quoted fields. Inventory existing data and grants before applying only the four new migrations.
2. Verify browser roles cannot directly read/write new protected tables or execute service-only helpers. Verify actual credential exchange, expiry, permission revocation, same-OU/cross-OU draft versus submitted reads, direct-ID spoofing and cached retries.
3. Configure exact HTTPS origins using `RESOURCE_ALLOWED_ORIGINS` (no wildcard), server-only Supabase service credentials and the established Drive connection. The new `resources` Edge Function intentionally disables gateway JWT checking because Main uses a separate server-verified credential/session bridge; this does not authorize anonymous data access. An anon key or supplied user ID is not identity proof.
4. Use the isolated private My Drive root identified by immutable appProperties, outside the existing master tree. Verify owner-only ACLs on every ancestor and file. Shared drives, public/domain/group and additional-user grants must fail closed. Do not change old IPO/GAD/DCF ACLs to make the test pass.
5. Verify a10MiB original through sequential1MiB resumable chunks, supported file formats,10-file submission manifest, lease contention, interrupted chunks, uncertain final response and safe reconciliation. Confirm type/SHA/fingerprint/size checks and bounded actual streamed bytes. Cleanup must never delete a Ready original or a previous submitted version.
6. Preview/download every supported format through protected access. Confirm static Office output, no external viewer/macro/formula/script execution, nonblank PDF canvas, bounded parsing/rendering and exact original download bytes. Scan/restrict test documents appropriately; directory/signature validation is not antivirus or signature verification.
7. Verify explicit Submit/server receipt, Philippine end-of-day boundary, on-behalf reason, return/correction/withdrawal/waivers and lifecycle. Confirm one OU credit per requirement,100/50/0 and future/N=0 cases; no draft upload credit.
8. Verify native concurrency scenarios on the hosted engine as well: duplicate UUID, stale ticket edits, submit/finalize order, finalization-first late submission, return/re-submit, upload lease contention and permission revocation during request/row lock waits. Failed authorization must roll back the new mutation and request receipt, not expose a cached result.

## Authorized Production Sequence

Only after explicit authorization, use the promote skill and verified target identities. Do not push a partial module release.

1. Review the exact PR/file scope, additive SQL and backup/recovery plan. Exclude local auth overrides and4KISTest-specific differences. Fill actual promotion PR and approved release date for the single1.9.0 entry; never guess a PR number or commit.
2. Apply/verify only the required migrations through the approved migration process, preserving business rows and prior role rows. Record exact applied versions and resulting protected grants. Do not run transfers, backfills, historical imports or automated submissions.
3. Deploy the protected endpoint/configuration and verify private account/origin/identity access before the dependent frontend. A frontend deployed before the new endpoint can make Awards reportorial verification unavailable; do not silently fall back to Manual.
4. Promote both Resources modules plus their scoped integrations as one release. Verify exact served build/alias, no-store manifest, permissions, direct routes and safe failure states. Ordinary production testing must use real authorized workflows, not invented test submissions/tickets.
5. Keep existing periods Manual. Activate Repository scoring only for explicitly selected authorized year/quarter through the reasoned control. Finalization freezes reportorial evidence only; it does not freeze other financial/physical history. Leave existing manual integer counts and national-attendance settings unchanged.
6. Record promotion/migration/environment/verification evidence in Obsidian and the sync ledger. No4KISTest adaptation is included without separate authorization.

## Recovery

Prefer a frontend/endpoint rollback or disable the affected new workflow while retaining new private originals, audit records, requests and snapshots. Do not reset the database, drop populated new tables, delete files or rewrite manual scores as compensation. A frontend rollback to a Manual-only Awards build changes which reportorial source it can display; communicate that limitation and preserve the configured source/evidence rather than automatically rewriting historical periods. Any reopen/source change remains a new authorized reasoned action.
