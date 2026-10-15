import React, { useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import type { IPO } from '../../constants';
import type { GadMembershipData, GadMembershipRow } from '../../lib/gadIpoMembership';
import { DataTablePagination, LoadingState, SortableTableHeader } from '../ui/enterprise';
import { useFixedPageTableViewport } from '../../hooks/useFixedPageTableViewport';
import GadSexPieChart, { type GadSexChartValues } from './GadSexPieChart';

interface Props {
    data: GadMembershipData;
    scopeKey: string;
    loading?: boolean;
    error?: string | null;
    onSelectIpo?: (ipo: IPO) => void;
    subprojectInclusion: GadSexChartValues;
    trainingInclusion: GadSexChartValues;
}
const formatCount = (value: number | null) => value === null ? '-' : value.toLocaleString('en-PH');
type SortKey = Exclude<keyof GadMembershipRow, 'ipo'> | 'name';
const columns: [SortKey, string][] = [
    ['name', 'IPO Name'], ['total', 'Total Members'], ['male', 'Male Members'], ['female', 'Female Members'],
    ['subprojectsLinked', 'Subprojects Linked'], ['subprojectsCompleted', 'Subprojects Completed'],
    ['trainingsLinked', 'Trainings Linked'], ['trainingsConducted', 'Trainings Conducted'], ['womenLed', 'Women-Led'],
];

export default function GadIpoMembershipSection({ data, scopeKey, loading, error, onSelectIpo, subprojectInclusion, trainingInclusion }: Props) {
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [sort, setSort] = useState<{ key: SortKey; direction: 'ascending' | 'descending' }>({ key: 'name', direction: 'ascending' });
    useEffect(() => { setPage(1); }, [scopeKey]);
    const { scrollRef, viewportStyle } = useFixedPageTableViewport(!loading && !error);
    const sortedRows = useMemo(() => [...data.rows].sort((a, b) => {
        const av = sort.key === 'name' ? a.ipo.name : a[sort.key];
        const bv = sort.key === 'name' ? b.ipo.name : b[sort.key];
        if (av === null || bv === null) return av === bv ? 0 : av === null ? 1 : -1;
        const comparison = typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv) : Number(av) - Number(bv);
        return (sort.direction === 'ascending' ? comparison : -comparison) || Number(a.ipo.id) - Number(b.ipo.id);
    }), [data.rows, sort]);
    const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    useEffect(() => { setPage(value => Math.min(value, totalPages)); }, [totalPages]);
    const pageRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const diagnostics = `${data.diagnostics.unresolvedLinks} unresolved links (${data.diagnostics.ambiguousNames} ambiguous names); ${data.diagnostics.mismatchedTotals} IPO totals differ from reported Male + Female.`;
    const coverage = `Current IPO registry membership, not historical membership. ${diagnostics}`;
    const cards = [
        { label: 'Total IPO Members', metric: data.total },
        { label: 'Total Female Members', metric: data.female },
        { label: 'Total Male Members', metric: data.male },
    ];
    if (loading) return <LoadingState title="Loading IPO membership" message="Preparing scoped program and IPO records." />;
    if (error) return <div className="notice notice--warning" role="alert"><p>IPO membership data could not be loaded: {error}</p></div>;
    return <section className="gad-membership" aria-label="IPO membership SDD">
        <div className="gad-dashboard-kpis gad-membership-kpis">
            {cards.map(({ label, metric }) => {
                const title = `${label}: ${metric.value === null ? 'No Data' : formatCount(metric.value)}; ${metric.reported} of ${data.rows.length} IPOs reported. ${coverage}`;
                return <article className="dashboard-panel gad-dashboard-kpi" key={label} title={title} aria-label={title}>
                    <div className="gad-dashboard-kpi__heading"><span>{label}</span><Users aria-hidden="true" /></div>
                    <strong>{metric.value === null ? 'No Data' : formatCount(metric.value)}</strong>
                </article>;
            })}
        </div>
        <div className="gad-dashboard-grid gad-dashboard-grid--three" aria-label="Sex-disaggregated charts">
            <GadSexPieChart title="IPO Membership by Sex" female={data.female.value} male={data.male.value}
                context={`Female reported by ${data.female.reported} and Male by ${data.male.reported} of ${data.rows.length} IPOs. ${coverage}`} />
            <GadSexPieChart title="Subprojects Inclusion Male/Female" {...subprojectInclusion} />
            <GadSexPieChart title="Trainings Inclusion Male/Female" {...trainingInclusion} />
        </div>
        <section className="dashboard-panel gad-dashboard-table-card data-table-card--seamless gad-membership-table-card" aria-labelledby="gad-membership-table-title">
            <h3 id="gad-membership-table-title" title={coverage}>Targeted IPOs</h3>
            <div ref={scrollRef} style={viewportStyle} className="data-table-scroll data-table-scroll--fixed-page custom-scrollbar" tabIndex={0} role="region" aria-label="Targeted IPO table">
                <table className="data-table gad-dashboard-table gad-membership-table">
                    <thead><tr>{columns.map(([key, label]) => <SortableTableHeader key={key} label={label} columnKey={key} sortConfig={sort}
                        onSort={() => { setSort(previous => ({ key, direction: previous.key === key && previous.direction === 'ascending' ? 'descending' : 'ascending' })); setPage(1); }} />)}</tr></thead>
                    <tbody>{pageRows.map(row => <tr key={row.ipo.id}>
                        <td><span className="gad-membership-name" title={row.ipo.name}>{onSelectIpo
                            ? <button className="table-action-link" type="button" title={row.ipo.name} onClick={() => onSelectIpo(row.ipo)}>{row.ipo.name}</button>
                            : row.ipo.name}</span></td>
                        <td>{formatCount(row.total)}</td><td>{formatCount(row.male)}</td><td>{formatCount(row.female)}</td>
                        <td>{formatCount(row.subprojectsLinked)}</td><td>{formatCount(row.subprojectsCompleted)}</td>
                        <td>{formatCount(row.trainingsLinked)}</td><td>{formatCount(row.trainingsConducted)}</td>
                        <td>{row.womenLed === null ? '-' : row.womenLed ? 'Yes' : 'No'}</td>
                    </tr>)}{!pageRows.length && <tr><td colSpan={9} className="data-table__empty-cell">No targeted IPOs match the current filters.</td></tr>}</tbody>
                    <tfoot><tr title={`Unique IPO and parent totals across all pages. Per-IPO program relationships are not additive. ${coverage}`}>
                        <td>Unique totals</td><td>{formatCount(data.total.value)}</td><td>{formatCount(data.male.value)}</td><td>{formatCount(data.female.value)}</td>
                        <td>{formatCount(data.programs.subprojectsLinked)}</td><td>{formatCount(data.programs.subprojectsCompleted)}</td>
                        <td>{formatCount(data.programs.trainingsLinked)}</td><td>{formatCount(data.programs.trainingsConducted)}</td><td>-</td>
                    </tr></tfoot>
                </table>
            </div>
            <DataTablePagination currentPage={currentPage} totalPages={totalPages} totalItems={data.rows.length} itemsPerPage={pageSize}
                onPageChange={setPage} onItemsPerPageChange={size => { setPageSize(size); setPage(1); }} />
        </section>
    </section>;
}
