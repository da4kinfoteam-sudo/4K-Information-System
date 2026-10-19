import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { ChevronRight, RefreshCw, RotateCw } from 'lucide-react';
import { bundledReleases, loadedBuild } from '../../lib/buildInformation';
import { formatReleaseNotes } from '../../lib/releaseMetadata';
import { createSystemUpdateChecker, requestBuildRefresh } from '../../lib/systemUpdateCheck';

const checker = createSystemUpdateChecker(loadedBuild);
const dateLabel = (value: string | null) => value ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not yet released';
const statusLabels = { idle: 'Checking', checking: 'Checking', current: 'Up to date', outdated: 'Refresh required', unavailable: 'Unable to check' };

export default function SystemInformationTab() {
    const state = useSyncExternalStore(checker.subscribe, checker.getSnapshot);
    const [expandedReleases, setExpandedReleases] = useState(() => new Set([bundledReleases.currentReleaseId]));
    const toggleRelease = (id: string) => setExpandedReleases(previous => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    useEffect(() => {
        void checker.check(true);
        const checkWhenActive = () => { void checker.check(); };
        const offline = () => checker.markOffline();
        window.addEventListener('focus', checkWhenActive);
        window.addEventListener('online', checkWhenActive);
        window.addEventListener('offline', offline);
        document.addEventListener('visibilitychange', checkWhenActive);
        return () => {
            window.removeEventListener('focus', checkWhenActive);
            window.removeEventListener('online', checkWhenActive);
            window.removeEventListener('offline', offline);
            document.removeEventListener('visibilitychange', checkWhenActive);
        };
    }, []);
    const latest = state.latest;
    return <div className="system-information">
        <section aria-labelledby="system-information-title">
            <div className="system-information__toolbar">
                <h2 id="system-information-title">System Information</h2>
                <div className="system-information__actions">
                    <button type="button" className="btn btn-secondary" disabled={state.status === 'checking'} onClick={() => void checker.check(true)}>
                        <RefreshCw size={16} aria-hidden="true" /> Check for Updates
                    </button>
                    {state.status === 'outdated' && <button type="button" className="btn btn-primary" onClick={() => requestBuildRefresh(message => window.confirm(message), () => window.location.reload())}>
                        <RotateCw size={16} aria-hidden="true" /> Refresh to Update
                    </button>}
                </div>
            </div>
            <dl className="system-information__fields">
                <div><dt>Your loaded version</dt><dd>v{loadedBuild.version}</dd></div>
                <div><dt>Latest available version</dt><dd>{latest ? `v${latest.version}` : 'Not verified'}</dd></div>
                <div><dt>Loaded build</dt><dd title={loadedBuild.buildId}>{loadedBuild.buildId}</dd></div>
                <div><dt>Latest available build</dt><dd title={latest?.buildId}>{latest?.buildId || 'Not verified'}</dd></div>
                <div><dt>Release date</dt><dd>{dateLabel(loadedBuild.releaseDate)}</dd></div>
                <div><dt>Latest release date</dt><dd>{latest ? dateLabel(latest.releaseDate) : 'Not verified'}</dd></div>
                <div><dt>Build time</dt><dd>{new Date(loadedBuild.builtAt).toLocaleString()}</dd></div>
                <div><dt>Environment</dt><dd>{loadedBuild.channel === '4kistest' ? '4KISTest' : '4KIS'} / {loadedBuild.environment}</dd></div>
                <div><dt>Update status</dt><dd className={`system-information__status system-information__status--${state.status}`} role="status">{statusLabels[state.status]}</dd></div>
                <div><dt>Last successful check</dt><dd>{state.lastSuccessfulCheck ? new Date(state.lastSuccessfulCheck).toLocaleString() : 'Not yet checked'}</dd></div>
            </dl>
            {state.message && <p className="system-information__message" role="alert">{state.message}</p>}
        </section>
        <section className="system-information__history" aria-labelledby="system-information-history">
            <h2 id="system-information-history">Patch History</h2>
            <div className="data-table-scroll system-information__history-scroll" role="region" aria-label="Patch history" tabIndex={0}>
                <table className="data-table system-information__table" aria-label="Patch history">
                    <colgroup><col className="system-information__expand-column" /><col className="system-information__version-column" /><col /><col className="system-information__date-column" /><col className="system-information__pr-column" /></colgroup>
                    <thead><tr><th scope="col"><span className="sr-only">Details</span></th><th scope="col">Version</th><th scope="col">Patch</th><th scope="col">Release Date</th><th scope="col">PR</th></tr></thead>
                    <tbody>{bundledReleases.releases.map(entry => {
                        const expanded = expandedReleases.has(entry.id);
                        const notes = formatReleaseNotes(entry);
                        const detailId = `patch-details-${entry.id}`;
                        return <React.Fragment key={entry.id}>
                            <tr className="system-information__patch-row" onClick={() => toggleRelease(entry.id)}>
                                <td><button type="button" className="system-information__expand" aria-label={`${expanded ? 'Collapse' : 'Expand'} patch ${entry.version}`} aria-expanded={expanded} aria-controls={detailId} onClick={event => { event.stopPropagation(); toggleRelease(entry.id); }}>
                                    <ChevronRight className={expanded ? 'system-information__chevron is-open' : 'system-information__chevron'} size={16} aria-hidden="true" />
                                </button></td>
                                <td>v{entry.version}</td>
                                <td><span className="system-information__release-title" title={entry.title}>{entry.title}</span></td>
                                <td>{entry.releaseDate ? dateLabel(entry.releaseDate) : '-'}</td>
                                <td>{entry.pr ? `#${entry.pr}` : '-'}</td>
                            </tr>
                            <tr hidden={!expanded} id={detailId} className="system-information__detail-row"><td colSpan={5}>
                                {expanded && <textarea className="form-control system-information__notes" readOnly value={notes} rows={Math.min(16, Math.max(5, notes.split('\n').length))} aria-label={`Patch notes for version ${entry.version}`} spellCheck={false} />}
                            </td></tr>
                        </React.Fragment>;
                    })}</tbody>
                </table>
            </div>
        </section>
    </div>;
}
