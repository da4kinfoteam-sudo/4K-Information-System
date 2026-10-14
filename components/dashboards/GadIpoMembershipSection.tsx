import React, { useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { IPO } from '../../constants';
import type { GadMembershipData, GadMembershipRow } from '../../lib/gadIpoMembership';
import { DataTablePagination, LoadingState, SortableTableHeader } from '../ui/enterprise';

interface Props {
    data: GadMembershipData;
    scopeKey: string;
    loading?: boolean;
    error?: string | null;
    onSelectIpo?: (ipo: IPO) => void;
}
const formatCount = (value: number | null) => value === null ? '-' : value.toLocaleString('en-PH');
type SortKey = Exclude<keyof GadMembershipRow, 'ipo'> | 'name';
const columns: [SortKey, string][] = [
    ['name', 'IPO Name'], ['total', 'Total Members'], ['male', 'Male Members'], ['female', 'Female Members'],
    ['subprojectsLinked', 'Subprojects Linked'], ['subprojectsCompleted', 'Subprojects Completed'],
    ['trainingsLinked', 'Trainings Linked'], ['trainingsConducted', 'Trainings Conducted'], ['womenLed', 'Women-Led'],
];

export default function GadIpoMembershipSection({ data, scopeKey, loading, error, onSelectIpo }: Props) {
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [sort, setSort] = useState<{ key: SortKey; direction: 'ascending' | 'descending' }>({ key: 'name', direction: 'ascending' });
    const [selectedSex, setSelectedSex] = useState<string | null>(null);
    useEffect(() => { setPage(1); setSelectedSex(null); }, [scopeKey]);
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
    const sexTotal = (data.female.value || 0) + (data.male.value || 0);
    const sexData = [
        { name: 'Female', value: data.female.value || 0, color: '#168a55', reported: data.female.reported },
        { name: 'Male', value: data.male.value || 0, color: '#2f6fed', reported: data.male.reported },
    ];
    const diagnostics = `${data.diagnostics.unresolvedLinks} unresolved links (${data.diagnostics.ambiguousNames} ambiguous names); ${data.diagnostics.mismatchedTotals} IPO totals differ from reported Male + Female.`;
    const coverage = `Current IPO registry membership, not historical membership. ${diagnostics}`;
    const sexValue = (item: typeof sexData[number]) => item.reported ? `${formatCount(item.value)} (${sexTotal ? (item.value / sexTotal * 100).toFixed(1) : '0.0'}%)` : 'No Data';
    const sexLabel = (item: typeof sexData[number]) => `${item.name}: ${sexValue(item)}; ${item.reported} of ${data.rows.length} IPOs reported. ${coverage}`;
    const activeSex = sexData.find(item => item.name === selectedSex);
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
        <article className="dashboard-panel gad-dashboard-chart gad-membership-chart" aria-labelledby="gad-membership-chart-title">
            <h3 id="gad-membership-chart-title" title={coverage}>IPO Membership by Sex</h3>
            {sexTotal > 0 ? <div className="gad-membership-chart__body">
                <div className="gad-membership-chart__plot" role="img" aria-label={sexData.map(sexLabel).join(' ')}>
                    <ResponsiveContainer width="100%" height={260}>
                        <PieChart accessibilityLayer>
                            <Pie data={sexData.filter(item => item.value > 0)} dataKey="value" nameKey="name" outerRadius="82%" isAnimationActive={false}
                                onMouseEnter={item => setSelectedSex(item.name)} onMouseLeave={() => setSelectedSex(null)} onClick={item => setSelectedSex(item.name)}>
                                {sexData.filter(item => item.value > 0).map(item => <Cell key={item.name} fill={item.color} />)}
                            </Pie>
                            <Tooltip formatter={(value, name) => [`${formatCount(Number(value))} (${(Number(value) / sexTotal * 100).toFixed(1)}%)`, name]} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="gad-membership-chart__legend">
                    {sexData.map(item => <button key={item.name} type="button" className="gad-membership-sex" title={sexLabel(item)} aria-label={sexLabel(item)}
                        aria-pressed={selectedSex === item.name} onFocus={() => setSelectedSex(item.name)} onBlur={() => setSelectedSex(null)}
                        onClick={() => setSelectedSex(item.name)}>
                        <span className="gad-membership-swatch" style={{ backgroundColor: item.color }} aria-hidden="true" />
                        <span>{item.name}</span><strong>{item.reported ? formatCount(item.value) : 'No Data'}</strong>
                        <span>{item.reported ? `${(item.value / sexTotal * 100).toFixed(1)}%` : '-'}</span>
                    </button>)}
                    <output className="gad-membership-chart__selection" aria-live="polite" title={coverage}>
                        {activeSex ? `${activeSex.name}: ${sexValue(activeSex)}` : ''}
                    </output>
                </div>
            </div> : <p className="dashboard-empty">{data.male.value === null && data.female.value === null ? 'No reported sex-disaggregated membership.' : 'No reported members to chart.'}</p>}
        </article>
        <section className="dashboard-panel gad-dashboard-table-card data-table-card--seamless gad-membership-table-card" aria-labelledby="gad-membership-table-title">
            <h3 id="gad-membership-table-title" title={coverage}>Targeted IPOs</h3>
            <div className="data-table-scroll custom-scrollbar" tabIndex={0} role="region" aria-label="Targeted IPO table">
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
