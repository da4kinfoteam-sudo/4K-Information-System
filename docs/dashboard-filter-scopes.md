# Homepage And Dashboard Filter Scopes

Implementation prepared 2026-10-21 on `feat/homepage-dashboard-multiselect`,
baseline main `7742e5ce883e4027e5a5aa2275740e17441a722e` (v1.1.1).
Release 1.2.0 is tracked by PR #95; verified deployment is recorded separately
in the project release notes. No migration, backfill or business-record writes.

## Ownership And Loading

- `DashboardScopeFilters` owns Homepage/dashboard typed All-or-values selections,
  draft/Apply state and versioned per-user preferences. Legacy scalar preferences
  are read without copying one account's state into another account.
- `DcfScopeFilters` retains its own single-select interface, storage keys,
  defaults and guarded Apply/Reset. Every request supplies its full scalar scope;
  no Homepage arrays or Fund Source subset are inherited. Module visibility is
  resolved separately for each DCF/ACF owner in `appDataScope.ts`.
- `App.ensureDataScope` forwards complete scopes, identifies the actually applied
  dataset before awaiting cache persistence and rejects superseded results after
  asynchronous boundaries. Consumers distinguish loading/error/empty results;
  DCF/ACF tables and new-record actions do not expose an old dataset as ready.
- Cache identity includes actor, visibility, owner, registry mode, every scalar
  and normalized array selection. `scope-v2` avoids treating old partial caches
  as complete new-scope data. Existing server authorization remains authoritative.
- Confirmed Activity/Subproject updates invalidate existing local cohorts when
  Fund Source UID or legacy label changes, in addition to the older scope fields.

## Query And Legacy Contract

OR within a dimension, AND between dimensions. Empty values are invalid, never
All. Own-OU selections are clamped; missing/invalid assigned OUs fail closed.
GAD intersects Dashboard and Gender and Development visibility.

Business queries use `.in` for selected sets, retaining `fundingYear` versus
Program Management `fundYear`. Fund Source choices use reference UIDs, include
inactive sources and resolve recognized legacy labels through `fundSources.ts`.
All Fund Sources includes historical blanks; Not specified matches missing/blank
labels without inferring 4K Fund. Unknown UIDs and nonblank unresolved labels keep
distinct fallback identities. New-record defaults are not changed.

For a source subset, each table has at most a UID branch and a null/empty-UID
legacy branch, both bounded by the same authorized OU/year/type/tier scope.
Results are canonically matched and ID-deduplicated. Pagination remains intact;
there are no Cartesian full-table requests or requests per checkbox. Broader
selections can legitimately increase returned data. Existing reference reads are
reused; All-source requests do not wait on reference loading before business reads.

## Consumer Exceptions

- Homepage program cards/map/calendar and Activity/Subproject media use the same
  cohort. Physical completion still counts later-CY completions in the funded FY.
  Standalone IPO map keeps registration/geography rules; IPO gallery keeps its
  geographic scope without inventing IPO funding data.
- Approved NPMO schedule reads remain a Homepage-only exception with all selected
  funding predicates. They never replace the main scoped dataset.
- Physical dashboard actuals use the selected actual-year union; All retains
  its existing behavior. Financial actual-date semantics and monthly schedules
  stay in the existing aggregation helpers. Rates use aggregate amounts/counts.
- GAD and Awards expose an Annual View for multiple/All Fund Years. Annual
  assessments, rankings and manual inputs are not silently combined. GAD source
  funding filters do not remove OUs just because an assessment has no funded item;
  HGDG 17.33 and missing-score behavior are unchanged.
- Awards comparisons/manual-row reads and writes are limited to selected OUs.
  Its existing annual OU manual scores have no Fund Source dimension; they are
  not reclassified. Quarterly cutoff/weight rules remain unchanged.
- LOD owns independent assessment-year/module scope. SCAD requests registry-only
  data and hides funding fields without overwriting saved program filters.
  Nutrition and Reports retain their existing controllers and date rules.

## Verification

- `npm run test:dashboard-scope`: real normalization/loader/matching helpers with
  read-only fake Supabase; UID/legacy/blank/renamed/inactive source coverage,
  correct Program Management year column, bounded queries, cache identity,
  module authorization, empty/Own-OU scopes, cross-year completion and Awards OUs.
- `npm run test:dashboard-scope-ui`: actual Homepage/dashboard/filter components
  with synthetic auth/data/map/Drive. Covers draft-only Apply, historical source
  choices, independent/guarded DCF preferences, refresh, out-of-order responses,
  error/retry, account changes, GAD intersection, NPMO isolation, annual views,
  SCAD preference retention, keyboard operation and 1440/814/390 layouts.
- Existing Activity/Subproject accomplishment browser checks exercise real helper
  and disposable SQL flows including ACF saves, draft retention and stable IDs.
- Existing GAD resilience/membership, attribution and financial hierarchy checks,
  TypeScript lint and Vite build are used as regression checks.

No authenticated live Supabase, production data reconciliation, real Drive,
real-role RLS, Vercel deployment or production egress measurement is claimed.
The safe `--serve` fixture is a UI preview, not a full authenticated application.
Promotion and adapted 4KISTest synchronization require separate authorization.
