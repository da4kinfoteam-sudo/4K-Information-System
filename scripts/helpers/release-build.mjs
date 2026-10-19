import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { validateReleaseCatalog, parseBuildManifest } from '../../lib/releaseMetadata.ts';

export function createReleaseBuild({ root, env = process.env, now = new Date(), nonce = randomUUID(), catalog: providedCatalog = null }) {
    const catalog = validateReleaseCatalog(providedCatalog || JSON.parse(readFileSync(new URL('../../releases/catalog.json', import.meta.url), 'utf8')));
    const current = catalog.releases[0];
    let commit = env.VERCEL_GIT_COMMIT_SHA;
    if (!commit) { try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { commit = 'local'; } }
    const environment = env.VERCEL_ENV || 'development';
    const project = env.VERCEL_PROJECT_ID;
    const knownProductionProject = 'prj_Bf1RGjcI06RWOaSlAlacJU6aG7o3';
    // Never silently identify another Vercel project as the production 4KIS app.
    const channel = env.FOURKIS_RELEASE_CHANNEL || (project === knownProductionProject || !env.VERCEL ? '4kis' : '');
    if (env.VERCEL && !channel) throw new Error('Set FOURKIS_RELEASE_CHANNEL explicitly for this Vercel project.');
    if (channel === '4kis' && env.VERCEL && project !== knownProductionProject) throw new Error('Production 4KIS project identity does not match.');
    const manifest = parseBuildManifest({ schemaVersion: 1, product: '4kis', channel, environment,
        version: current.version, releaseId: current.id, buildId: `${commit.slice(0, 12)}-${now.getTime()}-${nonce.slice(0, 8)}`,
        commit, builtAt: now.toISOString(), releaseDate: current.releaseDate, pr: current.pr });
    return { manifest, catalog };
}

export function releaseBuildPlugin(build) {
    const body = JSON.stringify(build.manifest);
    return {
        name: '4kis-release-manifest',
        configureServer(server) {
            server.middlewares.use('/release-manifest.json', (_req, res) => {
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Cache-Control', 'no-store');
                res.end(body);
            });
        },
        generateBundle() { this.emitFile({ type: 'asset', fileName: 'release-manifest.json', source: body }); },
    };
}
