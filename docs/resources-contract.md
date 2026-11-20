# Resources Contract

Local implementation for the approved Documentary Repository and Submit Ticket goal. No migration, Edge Function deployment, production scoring activation or promotion is authorized by this document.

## Identity

Main uses a custom user session. New resource endpoints exchange an existing account's identifier and credential for a random, short-lived resource session; they never authenticate from user_id, a role label, localStorage or an anonymous Supabase key. Resource session tokens stay in memory. SQL stores only their hashes, an expiry and a credential fingerprint. Every operation checks the current user, credential fingerprint and current module permissions before reading data, mutating it or returning an idempotent receipt.

Only service_role may execute the new SQL API. Edge Functions verify the opaque resource session through the database API. Existing Login.tsx/AuthContext.tsx, old Drive endpoints, roles and unrelated tables remain unchanged. This bridge supports the existing Main credential representation; it is not a global auth migration. Rate-limit credential exchange by normalized account identifier, return a generic failure and never log credentials/tokens.

## API

- resource_start_session(identifier, password): exchange verified account credentials; returns token, expiry and safe actor fields. Never returns a password or stored credential fingerprint.
- resource_read(session, resource, args): fixed allowlist of list/detail/deadline/reportorial/ticket queries, with server pagination and bounded projections.
- resource_mutate(session, action, data, request_id, expected_version): fixed mutation allowlist, current authorization, durable actor/request identity, exact-payload retry checks and optimistic concurrency.
- Internal file registration requires the same verified actor/session and a reserved file intent. Only the storage endpoint, not ordinary browser mutation payloads, can record Drive IDs and completed content checks.

External transport must not expose service_role credentials. Opaque session proofs are never treated as trusted merely because they appear in a request header: the stored token hash, expiry, credential fingerprint and permissions are checked on every request.

## Business Rules

- Both links follow Gender and Development under Resources. Published repository content supports authorized cross-OU reads; only assigned-own-OU users or explicit administrator on-behalf actions can submit. Draft files remain restricted. Tickets are requester-only or administrator-managed, independent of broad OU visibility.
- Required folders snapshot assignments on publication. Server-confirmed explicit Submit, not draft uploads, creates a versioned receipt. Original files and previous receipts are retained. One requirement/OU contributes at most one credit unit.
- Deadline dates become inclusive Asia/Manila end-of-day instants. Scores use 1 on time, 0.5 late and 0 missing/invalid. Denominator contains due, published/non-cancelled/non-waived assignments only.
- Reportorial source is Manual by default. New Repository modes are explicit per reporting year/quarter. Finalization freezes only reportorial evidence; reopening is reasoned and preserves old snapshots. Nothing updates award_manual_scores or existing deadlines.
- Repository-backed Program Management with positive report credit must not lose all rank points solely from zero physical completion. Other guards/formulas remain unchanged.
- Subject/code columns are compact and single-line. Instructions, comments and previews may wrap. Reuse the shared Edit Table chooser and existing main.css patterns.

## Storage Gate

Use an isolated private Drive branch, inspect inherited ACLs and never call the old anyone-reader preview grant for repository content. Required formats are DOCX/XLSX/XLS/PDF/JPG/JPEG/PNG. Original bytes remain in Drive. Protected previews use an authorized stream or safe renderer, never a public Office viewer. Choose and test explicit upload/chunk/batch/concurrency limits before enabling uploads. An incomplete storage operation cannot finalize a submission.

The local storage adapter uses a separate My Drive root identified by appProperties and a database folder lease. It does not inherit the existing master-storage root. Only the connected account's owner permission is accepted across the file/ancestor chain; shared drives, anyone/domain/group grants and additional user grants fail closed. Each access rechecks current permissions, identity and the original checksum. There are no browser-facing Drive credentials or resumable session URLs.

Local limits: 10 MiB per original, 10 files per explicit submission, 1 MiB sequential resumable chunks, one active request per upload intent (120-second renewable operation lease). Office packages have at most 5,000 ZIP entries/40 MiB declared expanded bytes and no encrypted/ZIP64/macro packages. Signature/directory validation is not antivirus or a claim that a document is safe to execute. Preview must stay static and sandboxed. Deployment preflight must verify hosted limits and a disposable private Drive account before enabling this path.

Drive uses preallocated IDs and durable upload intent/session metadata. Status reconciliation finds a committed original after a lost completion response. Cleanup only addresses the current unregistered intent's matching appProperties and is a no-op for Ready originals. Final registration checks lease ownership/expiry, active assignment/permissions, identity, type, size and SHA-256.

Official references reviewed 2026-11-20: [Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [inherited sharing](https://developers.google.com/workspace/drive/api/guides/manage-sharing), [Supabase Edge limits](https://supabase.com/docs/guides/functions/limits). Simulated local upload checks do not prove hosted throughput, resource limits or live-account ACL compatibility.

## Transport Configuration

The prepared `resources` Edge Function accepts POST only, no-store responses and explicitly allowlisted browser origins (`RESOURCE_ALLOWED_ORIGINS`, comma-separated exact origins; defaults to APP_BASE_URL/SITE_URL). Set the production exact origin rather than wildcard. Browser anon API keys identify the Supabase project only; all confidential operations require the server-verified opaque session. The function must be deployed with gateway JWT verification disabled for this custom credential bridge; doing so does not disable application-level SQL authentication. This endpoint is not deployed yet.

## Verification And Remaining Work

- `npm run test:resources-sql`: actual additive SQL in disposable PGlite, verified credential/permission/ownership/assignment/immutable receipt/history behavior, protected read paging, gateway-to-SQL writes, upload/folder leases and 100/50/0/frozen-evidence truth table.
- `npm run test:resources-protocol`: size/type/ZIP directory/body limits and safe HTTP error boundaries.
- `npm run test:resources-drive`: simulated Drive resumable/range/response-loss/ACL/checksum/cleanup behavior. No live Google account is used.
- `npm run test:resources-client`: strict module permissions, memory-only sessions, duplicate-click coalescing, same-request retries and account-switch response rejection.
- `npm run test:resources-tickets-ui`: real React ticket components through the HTTP gateway and disposable SQL, including response loss and desktop/tablet/mobile screenshots. No production test records.
- `npm run test:resources-repository-ui`: actual repository/folder/tracker/upload/correction/lifecycle controls, all seven supported file extensions, sandboxed Office previews, nonblank PDF canvas, exact original download bytes, private cross-OU draft denial and responsive dialogs. Private Drive is simulated, not live.
- `npm run test:resources-homepage-ui`: actual Homepage with typed legacy/repository deadlines, own-OU status, exact links/View All, pending-overdue query scope, explicit refresh/error recovery and immediate permission revocation.
- `npm run test:resources-awards`: legacy Manual equivalence, protected 100/50/0 input calculation, Program Management-only completion exception, unchanged financial/other physical formulas, dependent annual consistency, invalid-summary rejection and retained frozen evidence on correction/reopen.
- `npm run test:resources-awards-ui`: actual Awards controller/read-only computed fields, original manual count preservation, explicit reasoned source/finalize/reopen actions, evidence routes, Excel fractional-credit output, unavailable-not-zero failure/retry and bounded desktop/tablet/phone layouts.

SQL runtime uses PGLITE_RUNTIME or the existing disposable runtime cache; browser tests use PLAYWRIGHT_NODE_MODULES or the existing Codex runtime. Neither is a production dependency. Current focused evidence totals77 checks: SQL19, protocol5, Drive5, client5, ticket UI6, repository UI9, Homepage UI4, Awards calculation4, Awards UI7, navigation/role/Settings UI5 and native concurrency8. Lint, build and Deno entry-point checks pass; the build retains legacy large-chunk/dynamic-import advisories. Broader report-scope and dashboard-filter UI regressions pass; the latter explicitly stubs Resources Manual/empty-deadline responses because protected Resources behavior has its own real-SQL fixtures.

Native PostgreSQL17.7 tests use three genuinely independent loopback backends, not PGlite serialization. They prove duplicate-request identity, stale ticket rejection, submit/finalize order, finalization-first submission isolation, return/re-submit ordering, lease contention and permission revocation during both request and row lock waits. A failing native revocation case led to revalidation after request-lock waits and immediately before committing mutation/request receipts; unauthorized late writes roll back atomically. Existing native-helper defaults remain compatible; Resources uses a separate disposable runtime. The integrated runner is sequential and hashes Markdown too because a documentation-triggered Vite reload can interrupt a UI test despite unchanged application code.

Hosted Edge/private-Drive preflight is explicitly deferred by the user on2026-11-20. Keep all work local; the deferred checks are required before a later authorized rollout, not waived as proven. No production action or partial-release claim follows from local passes. Rollout prerequisites/order/recovery are in `docs/resources-rollout.md`.

## Homepage And Awards Consumers

The Homepage merges a typed, authorized five-row upcoming repository projection with unchanged legacy deadlines. It does not put repository IDs into Calendar, Gantt or BAR1. View All and pending/overdue repository filters retain discoverability; the Settings link edits repository deadlines at their source. A local Homepage menu wrapper avoids a render loop found in its prior focus wrapper without changing dropdown dependencies globally.

Awards independently requests reportorial inputs by the Annual View year and selected OUs, not Fund Type/Tier/Fund Source or linked DCF records. New periods are Manual without database inserts. A current Administrator with Repository view can read the protected aggregate; changing the source, finalizing or reopening still requires Repository manage. Ordinary users cannot read Awards reportorial aggregates. A missing/failed/invalid summary blocks the ranking/export rather than displaying a manual fallback or zero. Repository reportorial counts in the legacy controller are read-only; its ordinary save retains original manual counts, not fractional repository credit. Attendance/settings paths remain separate. Explicit refresh and relevant confirmed mutations update these inputs without polling.

Preview-only dependencies are pinned: docx-preview0.4.1, DOMPurify3.4.18, JSZip3.10.1, official SheetJS0.20.3 alias and pdfjs-dist6.5.438. Libraries are deferred; spreadsheet parsing runs in a bounded/terminable worker, DOCX is sanitized/static in a sandbox, PDF scripting/XFA is disabled. The old xlsx dependency remains unchanged for existing exports/imports and has a preexisting audit advisory; do not claim the whole app has no dependency vulnerabilities. Display limits/rendition differences do not alter the originals.

## Rollout Gate

Prepare additive SQL and Edge Functions locally, with disposable SQL/endpoint/browser verification. Publish no partial 1.9.0 release. Apply migrations, deploy endpoints, activate repository scoring or promote only after separate explicit authorization. Preserve test-build authentication/permission/activity differences during any later authorized adaptation.

The prepared catalog contains exactly one local1.9.0 feature entry with null PR/release date; existing published history is unchanged. Production manifest validation still rejects these incomplete promotion fields until the authorized workflow records actual values. No Action Required section is introduced.
