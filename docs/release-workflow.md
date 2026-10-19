# Release Metadata And Promotion

## Source Of Truth

`releases/catalog.json` owns user-facing versions and notes. `package.json` is the internal package version, not the displayed application version. Build metadata is generated once per Vite process from that catalog and the actual commit, environment and a fresh build identity. The identical manifest is embedded into JavaScript and emitted as `/release-manifest.json`; it is not copied into the ignored `public` folder.

The initial tracking baseline is v1.0.0 at verified PR #92/main `23d44b1` (2026-10-16). This names the start of tracking, not a retrospective numbering of prior releases. The System Information feature is v1.1.0 in PR #93 with approved release date 2026-10-19; deployment verification is recorded separately. Patch history uses a compact expandable table; missing dates/PRs display a dash, without promotion/baseline status labels. The build-information block retains the actual environment and release-date state.

## Version Rules

- Defect/urgent fix: increment PATCH (`1.0.0` to `1.0.1`).
- Planned new feature: increment MINOR and reset PATCH (`1.0.3` to `1.1.0`).
- Explicitly approved major overhaul: increment MAJOR, reset MINOR/PATCH (`1.4.2` to `2.0.0`).
- Mixed release: highest applicable increment. Every promoted PR has one entry and its actual PR number, independent of the version sequence. Retrying/redeploying a release does not allocate a new version or history entry. Build identity still changes so open browsers can detect a rebuild.
- Keep existing entries immutable and prepend exactly one release for each subsequent promotion PR. No Action Required section; only applicable Added, Improved, Fixed and Affected Pages. Use reviewed plain text, not raw PR bodies, secrets, private data or sensitive implementation details.

## Promotion Checklist

1. Follow the established promote skill. Review scope and unrelated local edits as usual. Include the current feature/fix release entry, version, classification, reviewed notes and approved release date in the same PR as its code. Do not invent the PR number before GitHub assigns it.
2. After creating the PR, set the current entry's `pr` to that actual PR number and `releaseDate` to the approved production release calendar date (YYYY-MM-DD). Push the small metadata update to the same branch/PR. Preview builds allow incomplete promotion fields; production builds fail if either is missing. If the release date changes before deployment, correct it before merging. Release date is not Vite build time or an invented deployment timestamp.
3. Run `npm run test:system-information`, `npm run test:system-information-ui`, lint/build and relevant feature checks. Run `node --experimental-strip-types scripts/validate-release-catalog.mjs --base origin/main --pr NUMBER`. The release-metadata PR workflow checks this using the actual GitHub event number and compares the complete historical catalog. Configure it as a required branch check through a separately authorized repository-settings change if needed; adding the workflow alone does not change branch protection.
4. Apply/verify any separately authorized database migration before deploying dependent code. A frontend refresh never installs a migration. Do not perform production business-data saves to test release metadata.
5. Merge only when required checks pass. A Git merge, passing preview or completed local build is not a verified production release. Preview/local identity remains distinct through the environment metadata, not a patch-row promotion label. The new manifest becomes available on the primary production alias only when the matching deployment is successfully activated; failed builds retain the previous production manifest.
6. Verify production READY, exact main SHA, the primary alias, HTTP 200 and no-store manifest response headers. Confirm the served manifest matches the deployment's commit/version/channel and the loaded application bundle. Record actual deployment verification/time, migration status and any limitations in the Obsidian release note and sync ledger before reporting promoted. The app's checks compare the build served by that same origin, not GitHub main or an unverified preview.
7. Future releases preserve the just-verified entry as history. Do not renumber historical versions after rollback. A rollback serves its own old manifest; identity comparison correctly requests refresh even if the readable version decreases.

## Database-Only Promotions

Each database-only PR also receives its own appropriately classified catalog entry. After the authorized migration is applied and verified, deploy that PR's matching metadata/application artifact through the normal promotion workflow even if application code is unchanged. This makes the release visible without a separate Supabase publication table, extra business queries or a second metadata-only PR. Explain backend changes in user-facing terms; never claim refreshing the browser applies SQL. Redeployment of that same release retains its version and PR mapping.

## Environment And Caching

- Known Main Vercel project `prj_Bf1RGjcI06RWOaSlAlacJU6aG7o3` maps to channel `4kis`. Enable Vercel system environment variables at build time. Other Vercel projects must explicitly configure `FOURKIS_RELEASE_CHANNEL=4kistest`; do not copy Main's project identity or authentication. Unknown projects fail rather than masquerade as Main.
- Local default is `4kis` / `development`; use `FOURKIS_RELEASE_CHANNEL=4kistest` for the test checkout. `VERCEL_ENV` distinguishes production/preview/development. No secrets are embedded in release metadata. Only non-sensitive commit/project/environment values are read by the build helper.
- The manifest alone has browser/CDN no-store headers in `vercel.json`. Hashed assets retain existing caching. Checks use same-origin GET with no-store, a fresh query token, no credentials, no redirects and a ten-second timeout. No Supabase/GitHub/Vercel API calls occur in the browser.
- Check on tab entry/manual request; focus/visibility checks only while the tab is mounted and visible, online and outside a five-minute cooldown. Requests are deduplicated. No timers poll business data, no cross-tab storage synchronization is introduced, and unavailable/mismatched responses never claim Up to date. Bundled notes and loaded identity remain usable offline.

## Refresh Safety And Verification

The existing application navigation event and beforeunload protection are implemented selectively (not globally across every DCF/profile draft). System Information therefore always requires an explicit unsaved-work confirmation before its normal reload. It never automatically refreshes, clears storage, signs users out or changes data-sync requests. This feature does not claim to add universal draft persistence or fix unrelated tab-switch draft behavior.

Use synthetic metadata and the isolated UI harness for failures, rollback, rebuild, role gates, tab routes, browser history and responsive layouts. `node --experimental-strip-types scripts/run-system-information-ui-check.mjs --serve` starts a safe, mocked Settings preview on port 3021 (override with FOURKIS_PREVIEW_PORT if occupied). It contains no production session or Supabase client. Production runtime verification and 4KISTest sync require separate authorization.
