import React, { useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, Clock3, Columns3, Search, TriangleAlert } from 'lucide-react';
import { operatingUnits, ouToRegionMap } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import { supabase } from '../../supabaseClient';
import { getGadPimmeListStatus } from '../../lib/gadPimmeScoring';
import { getVisibleGadPimmeOperatingUnits } from '../../lib/gadPimmeAccess';
import { DataTablePagination, LoadingState } from '../ui/enterprise';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { getGadPimmeListYears, getGadPimmeSummaryYears, normalizeGadPimmeListState, scopeGadPimmeListAssessments, summarizeGadPimmeList, type GadPimmeListState } from '../../lib/gadPimmeList';
import type { GadPimmeStoredSignatories } from '../../lib/gadPimmeSignatories';

export interface GadPimmeAssessmentRecord extends GadPimmeStoredSignatories {
    id: number;
    operating_unit: string;
    year: number;
    checklist_version: string;
    box16_score: number;
    box17_score: number;
    total_score: number;
    answered_count: number;
    status: 'Incomplete' | 'Completed';
    created_by: number | null;
    created_by_name: string | null;
    updated_by: number | null;
    updated_by_name: string | null;
    created_at: string;
    updated_at: string;
}

interface GadPimmePageProps {
    onSelectAssessment: (operatingUnit: string, year: number) => void;
}

const getOuDescription = (operatingUnit: string) => operatingUnit === 'NPMO'
    ? 'National Program Management Office'
    : ouToRegionMap[operatingUnit] || '';

const GadPimmePage: React.FC<GadPimmePageProps> = ({ onSelectAssessment }) => {
    const { currentUser, getVisibilityScope } = useAuth();
    const visibilityScope = getVisibilityScope('Gender and Development');
    const visibleOus = useMemo(() => getVisibleGadPimmeOperatingUnits(
        operatingUnits,
        visibilityScope,
        currentUser?.operatingUnit,
    ), [visibilityScope, currentUser?.operatingUnit]);

    // Remount scoped data/preferences before rendering another account or visibility scope.
    return <GadPimmeList key={JSON.stringify([currentUser?.id, visibilityScope, currentUser?.operatingUnit])}
        userId={currentUser?.id} visibleOus={visibleOus} onSelectAssessment={onSelectAssessment} />;
};

const GadPimmeList: React.FC<GadPimmePageProps & { userId?: number; visibleOus: string[] }> = ({ userId, visibleOus, onSelectAssessment }) => {
    const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
    const [storedState, setStoredState] = useLocalStorageState<unknown>(`gad-pimme-list:${userId ?? 'anonymous'}`, () => normalizeGadPimmeListState(null, currentYear));
    const state = useMemo(() => normalizeGadPimmeListState(storedState, currentYear), [storedState, currentYear]);
    const [data, setData] = useState({ rows: [] as GadPimmeAssessmentRecord[], loading: true, loaded: false, error: '' });
    const [columnsOpen, setColumnsOpen] = useState(false);
    const years = useMemo(() => getGadPimmeListYears(currentYear), [currentYear]);
    const visibleYears = useMemo(() => [currentYear, ...state.additionalYears].sort((a, b) => b - a), [currentYear, state.additionalYears]);
    const assessments = useMemo(() => scopeGadPimmeListAssessments(data.rows, visibleOus, currentYear), [data.rows, visibleOus, currentYear]);
    const summaryYears = getGadPimmeSummaryYears(assessments, currentYear);
    const summaryYear = data.loaded && !summaryYears.includes(state.summaryYear) ? currentYear : state.summaryYear;
    const summaryOptions = [...new Set([...summaryYears, summaryYear])].sort((a, b) => b - a);
    const { loading, error } = data;

    useEffect(() => {
        let cancelled = false;
        let request = 0;
        const load = async () => {
            const id = ++request;
            setData(previous => ({ ...previous, loading: true, error: '' }));
            if (!supabase || userId == null) {
                setData({ rows: [], loading: false, loaded: false, error: 'GAD PIMME data is unavailable because the database or user session is not ready.' });
                return;
            }
            if (!visibleOus.length) {
                setData({ rows: [], loading: false, loaded: true, error: '' });
                return;
            }
            try {
                const result = await supabase.from('gad_pimme_assessments').select('id,operating_unit,year,box16_score,box17_score,total_score,answered_count,status,updated_at')
                    .in('operating_unit', visibleOus).lte('year', currentYear);
                if (cancelled || id !== request) return;
                if (result.error) throw result.error;
                setData({ rows: (result.data || []) as GadPimmeAssessmentRecord[], loading: false, loaded: true, error: '' });
            } catch (failure) {
                if (cancelled || id !== request) return;
                setData(previous => ({ ...previous, loading: false, error: failure instanceof Error ? failure.message : (failure as { message?: string })?.message || 'Unable to load GAD PIMME assessments.' }));
            }
        };
        load();
        const refresh = () => {
            const year = new Date().getFullYear();
            if (year !== currentYear) setCurrentYear(year);
            else void load();
        };
        window.addEventListener('gad-pimme-data-changed', refresh);
        window.addEventListener('focus', refresh);
        return () => {
            cancelled = true;
            window.removeEventListener('gad-pimme-data-changed', refresh);
            window.removeEventListener('focus', refresh);
        };
    }, [userId, currentYear, visibleOus]);

    const byOuYear = useMemo(() => new Map(assessments.map(item => [`${item.operating_unit}:${item.year}`, item])), [assessments]);
    const statusFor = (ou: string, year: number) => getGadPimmeListStatus(byOuYear.get(`${ou}:${year}`));
    const filteredOus = visibleOus.filter(ou => {
        if (state.search && !ou.toLowerCase().includes(state.search.trim().toLowerCase())) return false;
        if (state.status && statusFor(ou, summaryYear) !== state.status) return false;
        return true;
    });
    const totalPages = Math.max(1, Math.ceil(filteredOus.length / state.pageSize));
    const page = state.summaryYear !== summaryYear ? 1 : Math.min(state.page, totalPages);
    const pageOus = filteredOus.slice((page - 1) * state.pageSize, page * state.pageSize);
    const updateState = (patch: Partial<GadPimmeListState>, resetPage = false) => setStoredState(previous => ({ ...normalizeGadPimmeListState(previous, currentYear), ...patch, ...(resetPage ? { page: 1 } : {}) }));
    useEffect(() => {
        const next = { ...state, summaryYear, page: data.loaded ? page : state.page };
        if (JSON.stringify(next) !== JSON.stringify(storedState)) setStoredState(next);
    }, [state, summaryYear, page, data.loaded, storedState, setStoredState]);
    const counts = summarizeGadPimmeList(visibleOus, byOuYear, summaryYear);
    const count = (status: keyof typeof counts) => data.loaded ? counts[status] : '\u2014';

    const summaryCards = [
        { label: 'Operating Units', value: visibleOus.length, supporting: 'In configured visibility', tone: 'neutral', icon: Building2 },
        { label: `Completed (${summaryYear})`, value: count('Completed'), supporting: 'All 22 questions answered', note: 'On track', tone: 'success', icon: CheckCircle2 },
        { label: 'Incomplete', value: count('Incomplete'), supporting: 'Assessment saved in progress', note: 'Follow up', tone: 'warning', icon: TriangleAlert },
        { label: 'For Assessment', value: count('For Assessment'), supporting: 'Not yet started', tone: 'info', icon: Clock3 },
    ] as const;

    return (
        <div className="data-list-page gad-pimme-list-page">
            <header className="gad-pimme-list-header">
                <h1>Gender and Development</h1>
                <p>GAD PIMME checklist status per operating unit. Select a year to open the assessment detail.</p>
                <div className="gad-pimme-list-meta">
                    <span>{visibleOus.length} operating units</span>
                    <span aria-hidden="true">&bull;</span>
                    <span>Assessment cycle {years.at(-1)} - {years[0]}</span>
                </div>
            </header>
            <div className="gad-pimme-summary-controls">
                <label className="gad-pimme-year-select">
                    <span className="form-label">Summary Year</span>
                    <select value={summaryYear} aria-label="Summary Year" disabled={!data.loaded || loading} onChange={event => updateState({ summaryYear: Number(event.target.value) }, true)}>
                        {summaryOptions.map(year => <option key={year} value={year}>{year}</option>)}
                    </select>
                </label>
            </div>
            <section className="gad-pimme-list-kpis" aria-label={`GAD PIMME summary for ${summaryYear}`} aria-busy={loading}>
                {summaryCards.map(card => {
                    const Icon = card.icon;
                    return <article className={`gad-pimme-list-kpi gad-pimme-list-kpi--${card.tone}`} key={card.label}>
                        <div className="gad-pimme-list-kpi__heading">
                            <span className="gad-pimme-list-kpi__icon"><Icon aria-hidden="true" /></span>
                            <span>{card.label}</span>
                        </div>
                        <strong>{card.value}</strong>
                        <div className="gad-pimme-list-kpi__support">
                            <span>{card.supporting}</span>
                            {'note' in card && card.note && <span className="gad-pimme-list-kpi__note"><i aria-hidden="true" />{card.note}</span>}
                        </div>
                    </article>;
                })}
            </section>
            <section className="gad-pimme-list-table-card">
                <div className="gad-pimme-toolbar">
                    <label className="gad-pimme-search">
                        <Search aria-hidden="true" />
                        <input type="search" value={state.search} onChange={event => updateState({ search: event.target.value }, true)} placeholder="Search operating units..." aria-label="Search operating units" />
                    </label>
                    <label className="gad-pimme-status-filter">
                        <span className="sr-only">Status for {summaryYear}</span>
                        <select value={state.status} onChange={event => updateState({ status: event.target.value as GadPimmeListState['status'] }, true)}>
                            <option value="">All statuses</option>
                            <option value="Completed">Completed</option>
                            <option value="Incomplete">Incomplete</option>
                            <option value="For Assessment">For Assessment</option>
                        </select>
                    </label>
                    <Popover open={columnsOpen} onOpenChange={setColumnsOpen}>
                        <PopoverTrigger asChild><button type="button" className="btn btn-secondary gad-pimme-column-control" title="Year columns" aria-label="Year columns"><Columns3 size={16} aria-hidden="true" /></button></PopoverTrigger>
                        <PopoverContent align="end" collisionPadding={8} className="gad-pimme-year-columns-menu" aria-label="Year columns">
                            <div className="gad-pimme-year-columns-menu__options" role="group" aria-label="Visible year columns">
                                {years.map(year => <label key={year}>
                                    <input type="checkbox" className="form-checkbox" aria-label={`Show ${year}`} checked={visibleYears.includes(year)} disabled={year === currentYear}
                                        onChange={event => updateState({ additionalYears: event.target.checked ? [...state.additionalYears, year] : state.additionalYears.filter(value => value !== year) })} />
                                    <span>{year}</span>
                                </label>)}
                            </div>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => updateState({ additionalYears: [] })}>Reset Columns</button>
                        </PopoverContent>
                    </Popover>
                </div>
                {error && <div className="notice notice--error" role="alert"><p>{error}</p></div>}
                {loading && !data.loaded ? <LoadingState title="Loading GAD PIMME assessments" message="Preparing annual Operating Unit records." /> : data.loaded ? (
                    <>
                        <div className="gad-pimme-table-scroll" aria-busy={loading}>
                            <table className="gad-pimme-table" style={{ '--gad-pimme-year-count': visibleYears.length } as React.CSSProperties}>
                                <colgroup><col className="gad-pimme-ou-column" />{visibleYears.map(year => <col key={year} className="gad-pimme-year-column" />)}</colgroup>
                                <thead><tr><th className="gad-pimme-ou-column">Operating Unit</th>{visibleYears.map(year => <th key={year}>{year}</th>)}</tr></thead>
                                <tbody>
                                    {pageOus.map(ou => (
                                        <tr key={ou} className="data-table__row--interactive" tabIndex={0} role="link"
                                            aria-label={`Open ${ou} GAD PIMME assessment for ${summaryYear}`}
                                            onClick={() => onSelectAssessment(ou, summaryYear)}
                                            onKeyDown={event => {
                                                if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                                                    event.preventDefault();
                                                    onSelectAssessment(ou, summaryYear);
                                                }
                                            }}>
                                            <td className="gad-pimme-ou-column">
                                                <strong title={ou}>{ou}</strong>
                                                {getOuDescription(ou) && <span title={getOuDescription(ou)}>{getOuDescription(ou)}</span>}
                                            </td>
                                            {visibleYears.map(year => {
                                                const assessment = byOuYear.get(`${ou}:${year}`);
                                                const cellStatus = getGadPimmeListStatus(assessment);
                                                return <td key={year} onClick={event => event.stopPropagation()}>
                                                    <button type="button" aria-label={`Open ${ou} GAD PIMME assessment for ${year}`} className={`gad-pimme-year-link gad-pimme-year-link--${cellStatus.toLowerCase().replaceAll(' ', '-')}`} onClick={() => onSelectAssessment(ou, year)}>
                                                        {cellStatus === 'Completed' ? `${Number(assessment.total_score).toFixed(2)} / 20` : cellStatus}
                                                    </button>
                                                </td>;
                                            })}
                                        </tr>
                                    ))}
                                    {!pageOus.length && <tr><td className="gad-pimme-table__empty" colSpan={visibleYears.length + 1}>No Operating Units match the current filters.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                        <DataTablePagination currentPage={page} totalPages={totalPages} totalItems={filteredOus.length} itemsPerPage={state.pageSize}
                            onPageChange={next => updateState({ page: next })} onItemsPerPageChange={pageSize => updateState({ pageSize }, true)} />
                    </>
                ) : null}
            </section>
        </div>
    );
};

export default GadPimmePage;
