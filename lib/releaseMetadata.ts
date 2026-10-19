export type ReleaseKind = 'baseline' | 'fix' | 'feature' | 'major';
export interface ReleaseEntry {
    id: string;
    version: string;
    kind: ReleaseKind;
    title: string;
    releaseDate: string | null;
    pr: number | null;
    commit?: string;
    sections: Partial<Record<'Added' | 'Improved' | 'Fixed' | 'Affected Pages', string[]>>;
}
export interface ReleaseCatalog {
    schemaVersion: 1;
    product: '4kis';
    currentReleaseId: string;
    releases: ReleaseEntry[];
}
export interface BuildManifest {
    schemaVersion: 1;
    product: '4kis';
    channel: '4kis' | '4kistest';
    environment: 'production' | 'preview' | 'development';
    version: string;
    releaseId: string;
    buildId: string;
    commit: string;
    builtAt: string;
    releaseDate: string | null;
    pr: number | null;
}

const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max = 300) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x08\x0b-\x1f<>]/.test(value);
const date = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value).toISOString().slice(0, 10) === value;
export const compareReleaseVersions = (left: string, right: string) => {
    if (!versionPattern.test(left) || !versionPattern.test(right)) throw new Error('Invalid release version.');
    const a = left.split('.').map(Number), b = right.split('.').map(Number);
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
};

export function validateReleaseCatalog(value: unknown): ReleaseCatalog {
    if (!isRecord(value) || value.schemaVersion !== 1 || value.product !== '4kis' || !Array.isArray(value.releases) || !value.releases.length) throw new Error('Invalid release catalog.');
    const ids = new Set<string>(), versions = new Set<string>(), prs = new Set<number>();
    for (const item of value.releases) {
        if (!isRecord(item) || !text(item.id, 100) || !/^[a-z0-9-]+$/.test(String(item.id)) || !versionPattern.test(String(item.version)) || !text(item.title) || !['baseline', 'fix', 'feature', 'major'].includes(String(item.kind))) throw new Error('Invalid release entry.');
        if (ids.has(String(item.id)) || versions.has(String(item.version))) throw new Error('Duplicate release identity/version.');
        ids.add(String(item.id)); versions.add(String(item.version));
        if (item.releaseDate !== null && !date(item.releaseDate)) throw new Error('Invalid release date.');
        if (item.pr !== null && (!Number.isSafeInteger(item.pr) || Number(item.pr) <= 0 || prs.has(Number(item.pr)))) throw new Error('Invalid or duplicate release PR.');
        if (item.pr !== null) prs.add(Number(item.pr));
        if (item.commit !== undefined && !/^[a-f0-9]{40}$/.test(String(item.commit))) throw new Error('Invalid release commit.');
        if (!isRecord(item.sections) || !Object.keys(item.sections).length) throw new Error('Release notes are required.');
        for (const [name, lines] of Object.entries(item.sections)) {
            if (!['Added', 'Improved', 'Fixed', 'Affected Pages'].includes(name) || !Array.isArray(lines) || !lines.length || lines.some(line => !text(line, 2000))) throw new Error('Invalid release note section.');
        }
    }
    const releases = value.releases as unknown as ReleaseEntry[];
    if (value.currentReleaseId !== releases[0].id || releases.at(-1)?.kind !== 'baseline') throw new Error('Catalog must start with the current release and end with its tracking baseline.');
    for (let i = 0; i < releases.length - 1; i++) {
        const current = releases[i], previous = releases[i + 1];
        const [major, minor, patch] = previous.version.split('.').map(Number);
        const expected = current.kind === 'fix' ? `${major}.${minor}.${patch + 1}` : current.kind === 'feature' ? `${major}.${minor + 1}.0` : `${major + 1}.0.0`;
        if (current.kind === 'baseline' || current.version !== expected) throw new Error('Release increment does not match its fix/feature/major classification.');
        if (!previous.releaseDate || !previous.pr || (current.releaseDate && current.releaseDate < previous.releaseDate)) throw new Error('Historical releases require ordered dates and PR references.');
    }
    return value as unknown as ReleaseCatalog;
}

export function parseBuildManifest(value: unknown): BuildManifest {
    if (!isRecord(value) || value.schemaVersion !== 1 || value.product !== '4kis' || !['4kis', '4kistest'].includes(String(value.channel)) || !['production', 'preview', 'development'].includes(String(value.environment)) || !versionPattern.test(String(value.version)) || !text(value.releaseId, 100) || !text(value.buildId, 200) || !/^(?:[a-f0-9]{40}|local)$/.test(String(value.commit)) || typeof value.builtAt !== 'string' || !Number.isFinite(Date.parse(value.builtAt)) || (value.releaseDate !== null && !date(value.releaseDate)) || (value.pr !== null && (!Number.isSafeInteger(value.pr) || Number(value.pr) <= 0))) throw new Error('The update information is invalid.');
    if (value.environment === 'production' && (!value.releaseDate || !value.pr || value.commit === 'local')) throw new Error('Production release metadata is incomplete.');
    return value as unknown as BuildManifest;
}

export function compareBuilds(loaded: BuildManifest, latest: BuildManifest): 'current' | 'outdated' {
    if (loaded.channel !== latest.channel || loaded.environment !== latest.environment) throw new Error('The update information belongs to another environment.');
    return ['buildId', 'commit', 'version', 'releaseId'].every(key => loaded[key] === latest[key]) ? 'current' : 'outdated';
}

export function formatReleaseNotes(entry: ReleaseEntry) {
    return (['Added', 'Improved', 'Fixed', 'Affected Pages'] as const).filter(name => entry.sections[name]?.length)
        .map(name => `${name}\n${entry.sections[name]!.map(line => `- ${line}`).join('\n')}`).join('\n\n');
}
