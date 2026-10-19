import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createReleaseBuild } from './helpers/release-build.mjs';
import { validateReleaseCatalog, parseBuildManifest, compareBuilds, formatReleaseNotes } from '../lib/releaseMetadata.ts';
import { createSystemUpdateChecker, requestBuildRefresh } from '../lib/systemUpdateCheck.ts';
import { validateReleaseChange } from './validate-release-catalog.mjs';

const catalog = JSON.parse(await readFile('releases/catalog.json', 'utf8'));
validateReleaseCatalog(catalog);
const build = createReleaseBuild({ root: process.cwd(), env: {}, nonce: 'fixture', now: new Date('2026-10-16T06:00:00Z') });
const loaded = build.manifest;
assert.equal(loaded.version, '1.1.0');
assert.equal(loaded.environment, 'development');
assert.equal(catalog.releases.at(-1).version, '1.0.0');
assert.equal(compareBuilds(loaded, { ...loaded }), 'current');
for (const latest of [{ ...loaded, version: '1.0.0' }, { ...loaded, buildId: 'rebuilt' }, { ...loaded, commit: 'a'.repeat(40) }]) assert.equal(compareBuilds(loaded, latest), 'outdated');
for (const latest of [{ ...loaded, channel: '4kistest' }, { ...loaded, environment: 'preview' }]) assert.throws(() => compareBuilds(loaded, latest));
for (const bad of [{}, { ...loaded, version: '1.01.0' }, { ...loaded, releaseDate: '2026-02-30' }, { ...loaded, environment: 'production', releaseDate: null, pr: null }, { ...loaded, product: 'other' }, { ...loaded, buildId: '<script>' }]) assert.throws(() => parseBuildManifest(bad));
for (const edit of [value => value.releases.push(value.releases[0]), value => value.releases[0].version = '1.0.1', value => value.releases[0].sections['Action Required'] = ['Refresh'], value => value.releases[0].pr = 92, value => value.releases.reverse()]) {
    const value = structuredClone(catalog); edit(value); assert.throws(() => validateReleaseCatalog(value));
}
for (const [kind, version] of [['fix', '1.0.1'], ['feature', '1.1.0'], ['major', '2.0.0']]) {
    const value = structuredClone(catalog); Object.assign(value.releases[0], { kind, version }); validateReleaseCatalog(value);
}
assert(!formatReleaseNotes(catalog.releases[0]).includes('Action Required'));
const pendingCatalog = structuredClone(catalog); Object.assign(pendingCatalog.releases[0], { releaseDate: null, pr: null });
assert.throws(() => createReleaseBuild({ root: process.cwd(), env: { VERCEL: '1', VERCEL_ENV: 'production', VERCEL_PROJECT_ID: 'prj_Bf1RGjcI06RWOaSlAlacJU6aG7o3', VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40) }, catalog: pendingCatalog }), /incomplete/);
assert.throws(() => createReleaseBuild({ root: process.cwd(), env: { VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: 'unrecognized' } }), /explicitly/);
const readyCatalog = structuredClone(catalog); Object.assign(readyCatalog.releases[0], { releaseDate: '2026-10-16', pr: 999 });
const production = createReleaseBuild({ root: process.cwd(), env: { VERCEL: '1', VERCEL_ENV: 'production', VERCEL_PROJECT_ID: 'prj_Bf1RGjcI06RWOaSlAlacJU6aG7o3', VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40) }, catalog: readyCatalog });
assert.equal(production.manifest.environment, 'production');
assert.equal(production.manifest.pr, 999);
validateReleaseChange(readyCatalog, null, 999);
assert.throws(() => validateReleaseChange(readyCatalog, null, 998));
assert.throws(() => validateReleaseChange(pendingCatalog, null, 999));
const next = structuredClone(readyCatalog);
next.currentReleaseId = 'next-fix';
next.releases.unshift({ ...structuredClone(readyCatalog.releases[0]), id: 'next-fix', version: '1.1.1', kind: 'fix', pr: 1000 });
validateReleaseChange(next, readyCatalog, 1000);
assert.throws(() => validateReleaseChange(readyCatalog, readyCatalog, 999));
const rewrittenHistory = structuredClone(next); rewrittenHistory.releases[1].title = 'Changed history';
assert.throws(() => validateReleaseChange(rewrittenHistory, readyCatalog, 1000));
const testBuild = createReleaseBuild({ root: process.cwd(), env: { VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: 'test-project', FOURKIS_RELEASE_CHANNEL: '4kistest' } });
assert.equal(testBuild.manifest.channel, '4kistest');

let now = 1_792_130_000_000, online = true, visible = true, calls = 0, mode = 'match', deferred;
const response = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const checker = createSystemUpdateChecker(loaded, { now: () => now, origin: 'https://fixture.invalid', isOnline: () => online, isVisible: () => visible,
    fetcher: async (url, options) => {
        calls++; assert.equal(new URL(url).origin, 'https://fixture.invalid'); assert.equal(new URL(url).pathname, '/release-manifest.json');
        assert.equal(options.cache, 'no-store'); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
        if (mode === 'deferred') return new Promise(resolve => { deferred = resolve; });
        if (mode === 'invalid') return response({});
        if (mode === 'html') return new Response('<html>Fallback</html>', { headers: { 'Content-Type': 'text/html' } });
        if (mode === 'failed') return new Response('', { status: 503 });
        if (mode === 'mismatch') return response({ ...loaded, channel: '4kistest' });
        return response(mode === 'match' ? loaded : { ...loaded, buildId: mode });
    } });
await checker.check(); assert.equal(checker.getSnapshot().status, 'current');
const successTime = checker.getSnapshot().lastSuccessfulCheck;
await checker.check(); assert.equal(calls, 1);
now += 300_001; visible = false; await checker.check(); assert.equal(calls, 1);
visible = true; mode = 'new'; await checker.check(); assert.equal(checker.getSnapshot().status, 'outdated');
assert.equal(loaded.buildId, build.manifest.buildId, 'Fetched identity never replaces loaded identity');
for (mode of ['invalid', 'html', 'failed', 'mismatch']) { await checker.check(true); assert.equal(checker.getSnapshot().status, 'unavailable'); }
online = false; const offlineCalls = calls; await checker.check(true); assert.equal(calls, offlineCalls); assert.equal(checker.getSnapshot().status, 'unavailable');
online = true; mode = 'deferred'; const first = checker.check(true); const second = checker.check(true); assert.equal(first, second);
online = false; checker.markOffline(); deferred(response(loaded)); await first; assert.equal(checker.getSnapshot().status, 'unavailable');
online = true; mode = 'match'; await checker.check(true); assert.equal(checker.getSnapshot().status, 'current');
assert.notEqual(checker.getSnapshot().lastSuccessfulCheck, successTime);
let reloads = 0;
assert.equal(requestBuildRefresh(() => false, () => reloads++), false); assert.equal(reloads, 0);
assert.equal(requestBuildRefresh(message => { assert.match(message, /Unsaved changes/); return true; }, () => reloads++), true); assert.equal(reloads, 1);
const timedOut = createSystemUpdateChecker(loaded, { origin: 'https://fixture.invalid', isOnline: () => true, isVisible: () => true, timeout: 5,
    fetcher: async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Timeout')))) });
await timedOut.check(true); assert.equal(timedOut.getSnapshot().status, 'unavailable');
const headers = JSON.parse(await readFile('vercel.json', 'utf8')).headers;
assert.equal(headers.length, 1); assert.equal(headers[0].source, '/release-manifest.json');
assert(headers[0].headers.every(header => header.value.includes('no-store')));
console.log('PASS: release catalog/increments, environment/build identity, promotion metadata gate, exact-build/rollback checks, cache controls, offline/invalid failures, cooldown/visibility/deduplication and explicit refresh confirmation.');
