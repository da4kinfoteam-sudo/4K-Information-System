import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { filterYears, operatingUnits } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import { supabase } from '../../supabaseClient';
import { getGadPimmeListStatus } from '../../lib/gadPimmeScoring';
import { getVisibleGadPimmeOperatingUnits } from '../../lib/gadPimmeAccess';
import { DataTablePagination, KpiCard, LoadingState } from '../ui/enterprise';

export interface GadPimmeAssessmentRecord {
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

interface ListState {
    search: string;
    status: '' | 'Completed' | 'Incomplete' | 'For Assessment';
    page: number;
    pageSize: number;
}

const DEFAULT_STATE: ListState = { search: '', status: '', page: 1, pageSize: 10 };

const GadPimmePage: React.FC<GadPimmePageProps> = ({ onSelectAssessment }) => {
    const { currentUser, getVisibilityScope } = useAuth();
    const visibilityScope = getVisibilityScope('Gender and Development');
    const [state, setState] = useLocalStorageState<ListState>(`gad-pimme-list:${currentUser?.id ?? 'anonymous'}`, DEFAULT_STATE);
    const [assessments, setAssessments] = useState<GadPimmeAssessmentRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const currentYear = new Date().getFullYear();
    const years = useMemo(() => filterYears.map(Number).filter(year => year <= currentYear), [currentYear]);
    const visibleOus = useMemo(() => getVisibleGadPimmeOperatingUnits(
        operatingUnits,
        visibilityScope,
        currentUser?.operatingUnit,
    ), [visibilityScope, currentUser?.operatingUnit]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setError('');
            if (!supabase || !currentUser) {
                setError('GAD PIMME data is unavailable because the database or user session is not ready.');
                setLoading(false);
                return;
            }
            if (!visibleOus.length) {
                setAssessments([]);
                setLoading(false);
                return;
            }
            const result = await supabase.from('gad_pimme_assessments').select('*')
                .in('operating_unit', visibleOus).lte('year', currentYear);
            if (cancelled) return;
            if (result.error) setError(result.error.message || 'Unable to load GAD PIMME assessments.');
            else setAssessments((result.data || []) as GadPimmeAssessmentRecord[]);
            setLoading(false);
        };
        load();
        const refresh = () => load();
        window.addEventListener('gad-pimme-data-changed', refresh);
        window.addEventListener('focus', refresh);
        return () => {
            cancelled = true;
            window.removeEventListener('gad-pimme-data-changed', refresh);
            window.removeEventListener('focus', refresh);
        };
    }, [currentUser?.id, currentYear, visibleOus.join('|')]);

    const byOuYear = useMemo(() => new Map(assessments.map(item => [`${item.operating_unit}:${item.year}`, item])), [assessments]);
    const statusFor = (ou: string, year: number) => getGadPimmeListStatus(byOuYear.get(`${ou}:${year}`));
    const currentRecords = visibleOus.map(ou => byOuYear.get(`${ou}:${currentYear}`)).filter(Boolean) as GadPimmeAssessmentRecord[];
    const filteredOus = visibleOus.filter(ou => {
        if (state.search && !ou.toLowerCase().includes(state.search.trim().toLowerCase())) return false;
        if (state.status && statusFor(ou, currentYear) !== state.status) return false;
        return true;
    });
    const totalPages = Math.max(1, Math.ceil(filteredOus.length / state.pageSize));
    const page = Math.min(Math.max(1, state.page), totalPages);
    const pageOus = filteredOus.slice((page - 1) * state.pageSize, page * state.pageSize);
    const updateState = (patch: Partial<ListState>, resetPage = false) => setState(previous => ({ ...previous, ...patch, ...(resetPage ? { page: 1 } : {}) }));

    return (
        <div className="data-list-page lod-list-page gad-pimme-list-page">
            <header className="data-list-header lod-list-header">
                <h2 className="data-list-title">Gender and Development</h2>
            </header>
            <section className="lod-list-kpis" aria-label={`GAD PIMME summary for ${currentYear}`}>
                <KpiCard label="Operating Units" value={visibleOus.length} supporting="In configured visibility" />
                <KpiCard label={`Completed (${currentYear})`} value={currentRecords.filter(item => item.status === 'Completed').length} supporting="All 22 questions answered" />
                <KpiCard label="Incomplete" value={currentRecords.filter(item => item.status === 'Incomplete').length} supporting="Assessment saved in progress" />
                <KpiCard label="For Assessment" value={visibleOus.length - currentRecords.length} supporting="Not yet started" />
            </section>
            <section className="data-table-card major-table-card lod-list-table-card">
                <div className="major-table-toolbar gad-pimme-toolbar">
                    <label className="major-table-search">
                        <Search aria-hidden="true" />
                        <input type="search" value={state.search} onChange={event => updateState({ search: event.target.value }, true)} placeholder="Search operating units..." aria-label="Search operating units" />
                    </label>
                    <label className="form-field gad-pimme-status-filter">
                        <span className="sr-only">Current year status</span>
                        <select className="form-control" value={state.status} onChange={event => updateState({ status: event.target.value as ListState['status'] }, true)}>
                            <option value="">All statuses</option>
                            <option value="Completed">Completed</option>
                            <option value="Incomplete">Incomplete</option>
                            <option value="For Assessment">For Assessment</option>
                        </select>
                    </label>
                </div>
                {error && <div className="notice notice--error" role="alert"><p>{error}</p></div>}
                {loading ? <LoadingState title="Loading GAD PIMME assessments" message="Preparing annual Operating Unit records." /> : (
                    <>
                        <div className="data-table-scroll gad-pimme-table-scroll">
                            <table className="data-table lod-major-table gad-pimme-table">
                                <thead><tr><th className="gad-pimme-ou-column">Operating Unit</th>{years.map(year => <th key={year} className="data-table__numeric">{year}</th>)}</tr></thead>
                                <tbody>
                                    {pageOus.map(ou => (
                                        <tr key={ou} className="data-table__row--interactive" tabIndex={0} role="link"
                                            aria-label={`Open ${ou} GAD PIMME assessment for ${currentYear}`}
                                            onClick={() => onSelectAssessment(ou, currentYear)}
                                            onKeyDown={event => {
                                                if (event.key === 'Enter' || event.key === ' ') {
                                                    event.preventDefault();
                                                    onSelectAssessment(ou, currentYear);
                                                }
                                            }}>
                                            <td className="data-table__cell--primary gad-pimme-ou-column">{ou}</td>
                                            {years.map(year => {
                                                const assessment = byOuYear.get(`${ou}:${year}`);
                                                return <td key={year} className="data-table__numeric" onClick={event => event.stopPropagation()}>
                                                    <button type="button" className="lod-assessment-link" onClick={() => onSelectAssessment(ou, year)}>
                                                        {assessment?.status === 'Completed' ? `${Number(assessment.total_score).toFixed(2)} / 20` : assessment?.status || 'For Assessment'}
                                                    </button>
                                                </td>;
                                            })}
                                        </tr>
                                    ))}
                                    {!pageOus.length && <tr><td className="data-table__empty-cell" colSpan={years.length + 1}>No Operating Units match the current filters.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                        <DataTablePagination currentPage={page} totalPages={totalPages} totalItems={filteredOus.length} itemsPerPage={state.pageSize}
                            onPageChange={next => updateState({ page: next })} onItemsPerPageChange={pageSize => updateState({ pageSize }, true)} />
                    </>
                )}
            </section>
        </div>
    );
};

export default GadPimmePage;
