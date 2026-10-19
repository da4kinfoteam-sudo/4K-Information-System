import { compareBuilds, parseBuildManifest, type BuildManifest } from './releaseMetadata.ts';

export interface UpdateCheckState {
    status: 'idle' | 'checking' | 'current' | 'outdated' | 'unavailable';
    latest: BuildManifest | null;
    lastSuccessfulCheck: string | null;
    message: string | null;
}

export function createSystemUpdateChecker(loaded: BuildManifest, options: {
    fetcher?: typeof fetch; now?: () => number; isOnline?: () => boolean; isVisible?: () => boolean;
    origin?: string; cooldown?: number; timeout?: number;
} = {}) {
    const now = options.now || Date.now;
    const online = options.isOnline || (() => navigator.onLine);
    const visible = options.isVisible || (() => document.visibilityState === 'visible');
    const listeners = new Set<() => void>();
    let state: UpdateCheckState = { status: 'idle', latest: null, lastSuccessfulCheck: null, message: null };
    let pending: Promise<void> | null = null, lastAttempt: number | null = null;
    const publish = (next: UpdateCheckState) => { state = next; listeners.forEach(listener => listener()); };
    const check = (manual = false): Promise<void> => {
        if (pending) return pending;
        if (!manual && !visible()) return Promise.resolve();
        if (!online()) {
            publish({ ...state, status: 'unavailable', message: 'You are offline. The latest build could not be checked.' });
            return Promise.resolve();
        }
        if (!manual && lastAttempt !== null && now() - lastAttempt < (options.cooldown ?? 300_000)) return Promise.resolve();
        lastAttempt = now();
        publish({ ...state, status: 'checking', message: null });
        pending = (async () => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), options.timeout ?? 10_000);
            try {
                const origin = options.origin || window.location.origin;
                const url = new URL('/release-manifest.json', origin);
                url.searchParams.set('check', String(now()));
                const response = await (options.fetcher || fetch)(url.href, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal });
                if (!response.ok || !response.headers.get('Content-Type')?.includes('application/json')) throw new Error('The update information is unavailable.');
                const body = await response.text();
                if (body.length > 8192) throw new Error('The update information is invalid.');
                const latest = parseBuildManifest(JSON.parse(body));
                if (!online()) throw new Error('Offline');
                publish({ status: compareBuilds(loaded, latest), latest, lastSuccessfulCheck: new Date(now()).toISOString(), message: null });
            } catch {
                publish({ ...state, status: 'unavailable', message: 'The latest build could not be verified. Try checking again.' });
            } finally { clearTimeout(timeout); pending = null; }
        })();
        return pending;
    };
    return {
        check,
        getSnapshot: () => state,
        subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
        markOffline: () => publish({ ...state, status: 'unavailable', message: 'You are offline. The latest build could not be checked.' }),
    };
}

export function requestBuildRefresh(confirm: (message: string) => boolean, reload: () => void) {
    if (!confirm('Refresh the application? Unsaved changes may be lost. Save any work you want to keep before continuing.')) return false;
    reload();
    return true;
}
