import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { validateReleaseCatalog } from '../lib/releaseMetadata.ts';

export function validateReleaseChange(catalog, previous, pr) {
    validateReleaseCatalog(catalog);
    const current = catalog.releases[0];
    if (!Number.isSafeInteger(pr) || pr <= 0 || current.pr !== pr || !current.releaseDate) throw new Error('The current release must record this PR number and its approved release date.');
    if (!previous) return;
    validateReleaseCatalog(previous);
    if (catalog.currentReleaseId === previous.currentReleaseId) throw new Error('Each promotion PR requires a new release entry.');
    if (catalog.releases.length !== previous.releases.length + 1 || JSON.stringify(catalog.releases.slice(1)) !== JSON.stringify(previous.releases)) throw new Error('Keep published release history unchanged and prepend exactly one release.');
}

if (process.argv[1]?.endsWith('validate-release-catalog.mjs')) {
    const base = process.argv[process.argv.indexOf('--base') + 1];
    if (!process.argv.includes('--base') || !/^[\w/.-]+$/.test(base)) throw new Error('Supply a trusted git base ref with --base.');
    const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) : null;
    const pr = Number(process.argv.includes('--pr') ? process.argv[process.argv.indexOf('--pr') + 1] : event?.number);
    const catalog = JSON.parse(readFileSync('releases/catalog.json', 'utf8'));
    let previous = null;
    const files = execFileSync('git', ['ls-tree', '--name-only', base, '--', 'releases/catalog.json'], { encoding: 'utf8' });
    if (files.trim()) previous = JSON.parse(execFileSync('git', ['show', `${base}:releases/catalog.json`], { encoding: 'utf8' }));
    validateReleaseChange(catalog, previous, pr);
    console.log(`PASS: version ${catalog.releases[0].version}, PR #${pr}, exactly one new release and unchanged published history.`);
}
