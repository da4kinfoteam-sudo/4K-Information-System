# Fund Source Reference Rollout

Fund Sources use immutable reference UIDs. Subprojects retain their legacy
`fundSource` text and use `fundSourceUid` for current label resolution. Existing
blank values remain valid on edit; new records default to the active FS-000001.

## Production Access Fix (2026-09-28)

Production uses the custom application login in AuthContext, not Supabase Auth.
The initial authenticated-only reference policies therefore hid the six seeded
choices and rejected writes, including those from Super Admin users.

- Migration 202609280002 restores global dictionary reads to the application role.
- Migration 202609280003 adds `save_fund_source_reference`, which validates the
  existing app credentials and reads the actor's References permissions from the
  database. Anonymous direct table mutations remain blocked.
- The References page uses the function for create, rename, and activation changes.
- Subproject editing preserves the saved option while references load and persists
  a resolved UID when the legacy label can be matched.
- Neither access migration updates existing reference or subproject records.
- Migration 202609280004 fills missing UID links for unambiguous labels that
  arrived after the original backfill. A compatibility trigger links label-only
  writes from older clients. Existing UIDs and legacy text are preserved; blank
  or unrecognized labels are never assigned an arbitrary source.

Validation includes lint/build, schema lint, a live REST read, a rejected invalid
save request, and `supabase/tests/fund_source_direct_client_access.sql`. That SQL
checks application-role reads, authorized mutations, Guest/invalid credential
denials, duplicate labels, and UID preservation in a rolled-back transaction.

## Later 4kistest Sync

Port the reference feature and all four 20260928 migrations together, preserving
4kistest's independent activity-title and ID-join changes. Confirm its login model
before applying access policies. Do not remove legacy text or backfill blank
sources. Re-run the access checks using the test project's actual client role.
