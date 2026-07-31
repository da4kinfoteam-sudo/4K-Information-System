// Author: 4K
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { IPO, LodAssessment, filterYears, ouToRegionMap, philippineRegions } from '../../constants';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useLogAction } from '../../hooks/useLogAction';
import { usePagination } from '../mainfunctions/TableHooks';
import { DataTablePagination, LoadingState, SortableTableHeader } from '../ui/enterprise';
import { ColumnFilterDialog, MajorTableToolbar, TruncatedTableCell } from '../ui/MajorDataTable';
import { getLodEffectiveState } from '../../lib/lodScoring';
import { notifyLodDataChanged, subscribeToLodDataChanges } from '../../lib/lodDataSync';

interface LODPageProps {
    ipos: IPO[];
    onSelectIpo: (ipo: IPO, year?: number) => void;
}

type SortConfig = { key: string; direction: 'ascending' | 'descending' } | null;

const getStateClassName = (kind: ReturnType<typeof getLodEffectiveState>['kind']) => (
    `lod-table-state lod-table-state--${kind}`
);

const parseImportedLevel = (value: unknown) => {
    if (value === '' || value === null || value === undefined) return null;
    const match = String(value).match(/[1-5]/);
    return match ? Number(match[0]) : null;
};

const parseImportedBoolean = (value: unknown) => {
    const normalized = String(value ?? '').trim().toLowerCase();
    return ['yes', 'true', '1', 'dropped'].includes(normalized);
};

const LODPage: React.FC<LODPageProps> = ({ ipos, onSelectIpo }) => {
    const { currentUser } = useAuth();
    const { logAction } = useLogAction();
    const isLodAdmin = currentUser?.role === 'Super Admin' || currentUser?.role === 'Administrator';
    const [assessments, setAssessments] = useState<LodAssessment[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterRegion, setFilterRegion] = useState('');
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'name', direction: 'ascending' });
    const [loadError, setLoadError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchAssessments = async () => {
        if (!supabase) {
            setLoading(false);
            return;
        }
        setLoadError('');
        const { data, error } = await supabase.from('lod_assessments').select('*');
        if (error) {
            console.error('Error fetching assessments:', error);
            setLoadError(error.message || 'Unable to load LOD assessments.');
        } else {
            setAssessments(data || []);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchAssessments();
        const unsubscribe = subscribeToLodDataChanges(() => fetchAssessments());
        const refreshOnFocus = () => fetchAssessments();
        window.addEventListener('focus', refreshOnFocus);
        return () => {
            unsubscribe();
            window.removeEventListener('focus', refreshOnFocus);
        };
    }, []);

    const years = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const distinctYears: number[] = Array.from(new Set<number>(
            assessments.map(assessment => Number(assessment.year)).filter(Number.isFinite)
        ));
        if (!distinctYears.includes(currentYear)) distinctYears.push(currentYear);
        return distinctYears.sort((left, right) => right - left);
    }, [assessments]);

    const assessmentsByIpoYear = useMemo(() => {
        const map = new Map<string, LodAssessment>();
        assessments.forEach(assessment => {
            map.set(`${Number(assessment.ipo_id)}:${Number(assessment.year)}`, assessment);
        });
        return map;
    }, [assessments]);

    const getAssessment = (ipoId: number, year: number) =>
        assessmentsByIpoYear.get(`${Number(ipoId)}:${Number(year)}`) || null;

    const filteredAndSortedIPOs = useMemo(() => {
        let filtered = [...ipos];
        if (currentUser?.role === 'User') {
            const userRegion = ouToRegionMap[currentUser.operatingUnit];
            if (userRegion) filtered = filtered.filter(ipo => ipo.region === userRegion);
        }
        if (filterRegion) filtered = filtered.filter(ipo => ipo.region === filterRegion);
        if (searchTerm.trim()) {
            const query = searchTerm.trim().toLowerCase();
            filtered = filtered.filter(ipo =>
                ipo.name.toLowerCase().includes(query)
                || ipo.location.toLowerCase().includes(query)
                || ipo.region.toLowerCase().includes(query)
            );
        }

        if (!sortConfig) return filtered;
        return filtered.sort((left, right) => {
            let leftValue: string | number = '';
            let rightValue: string | number = '';
            if (sortConfig.key === 'name') {
                leftValue = left.name;
                rightValue = right.name;
            } else if (sortConfig.key === 'region') {
                leftValue = left.region;
                rightValue = right.region;
            } else if (sortConfig.key.startsWith('year:')) {
                const year = Number(sortConfig.key.split(':')[1]);
                leftValue = getLodEffectiveState(getAssessment(left.id, year)).level ?? -1;
                rightValue = getLodEffectiveState(getAssessment(right.id, year)).level ?? -1;
            }
            const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
                ? leftValue - rightValue
                : String(leftValue).localeCompare(String(rightValue));
            return sortConfig.direction === 'ascending' ? comparison : -comparison;
        });
    }, [ipos, currentUser, filterRegion, searchTerm, sortConfig, assessmentsByIpoYear]);

    const {
        currentPage,
        setCurrentPage,
        itemsPerPage,
        setItemsPerPage,
        totalPages,
        paginatedData,
    } = usePagination(filteredAndSortedIPOs, [searchTerm, filterRegion, sortConfig]);

    const requestSort = (key: string) => {
        setSortConfig(previous => previous?.key === key
            ? { key, direction: previous.direction === 'ascending' ? 'descending' : 'ascending' }
            : { key, direction: 'ascending' });
    };

    const handleExport = () => {
        if (!isLodAdmin) return;
        const XLSX = (window as any).XLSX;
        if (!XLSX) {
            setLoadError('Excel library not loaded. Please refresh the page.');
            return;
        }

        const exportYears = Array.from(new Set([
            ...filterYears.map(Number),
            ...years,
        ])).sort((left, right) => left - right);
        const rows = filteredAndSortedIPOs.map(ipo => {
            const row: Record<string, string | number> = {
                ID: ipo.id,
                'IPO Name': ipo.name,
                Region: ipo.region,
            };
            exportYears.forEach(year => {
                const assessment = getAssessment(ipo.id, year);
                row[`${year} Display`] = getLodEffectiveState(assessment).label;
                row[`${year} Manual Override`] = assessment?.manual_level ?? '';
                row[`${year} Dropped`] = assessment?.is_dropped ? 'Yes' : 'No';
            });
            return row;
        });
        const headers = [
            'ID',
            'IPO Name',
            'Region',
            ...exportYears.flatMap(year => [
                `${year} Display`,
                `${year} Manual Override`,
                `${year} Dropped`,
            ]),
        ];
        const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'LOD Import and Summary');
        XLSX.writeFile(workbook, 'LOD_Assessments_Template.xlsx');
        logAction('Exported LOD Data', `Count: ${filteredAndSortedIPOs.length}`);
    };

    const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!isLodAdmin || !supabase) return;
        const file = event.target.files?.[0];
        const XLSX = (window as any).XLSX;
        if (!file || !XLSX) return;

        setLoading(true);
        setLoadError('');
        try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const workbook = XLSX.read(bytes, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as Record<string, unknown>[];
            const headerRows = XLSX.utils.sheet_to_json(worksheet, {
                header: 1,
                range: 0,
                blankrows: false,
            }) as unknown[][];
            const availableHeaders = new Set<string>(
                worksheet['!ref']
                    ? (headerRows[0] || []).map(value => String(value))
                    : []
            );
            let updatedCount = 0;

            for (const row of rows) {
                const ipoId = Number(row.ID);
                if (!Number.isFinite(ipoId)) continue;
                const detectedYears = new Set<number>();
                availableHeaders.forEach(header => {
                    const match = header.match(/^(\d{4})(?:\s+(?:Display|Manual Override|Dropped))?$/);
                    if (match) detectedYears.add(Number(match[1]));
                });

                for (const year of detectedYears) {
                    const manualHeader = `${year} Manual Override`;
                    const droppedHeader = `${year} Dropped`;
                    const isNewFormat = availableHeaders.has(manualHeader) || availableHeaders.has(droppedHeader);
                    const legacyHeader = String(year);
                    const manualLevel = parseImportedLevel(
                        isNewFormat ? row[manualHeader] : row[legacyHeader]
                    );
                    const isDropped = isNewFormat && availableHeaders.has(droppedHeader)
                        ? parseImportedBoolean(row[droppedHeader])
                        : getAssessment(ipoId, year)?.is_dropped ?? false;
                    const existing = getAssessment(ipoId, year);
                    if (!existing && manualLevel === null && !isDropped) continue;
                    const payload = {
                        ipo_id: ipoId,
                        year,
                        ...(existing ? {} : {
                            total_score: 0,
                            computed_level: 0,
                            is_complete: false,
                            answered_question_count: 0,
                            required_question_count: 0,
                        }),
                        manual_level: manualLevel,
                        manual_override_reason: manualLevel === null
                            ? null
                            : `Imported by ${currentUser?.fullName || currentUser?.email || 'administrator'}`,
                        is_dropped: isDropped,
                        updated_at: new Date().toISOString(),
                    };
                    const { error } = await supabase
                        .from('lod_assessments')
                        .upsert(existing ? { id: existing.id, ...payload } : payload, { onConflict: 'ipo_id, year' });
                    if (error) throw error;
                    updatedCount += 1;
                }
            }

            await fetchAssessments();
            notifyLodDataChanged({ reason: 'import' });
            logAction('Imported LOD Data', `Rows: ${rows.length}; assessments updated: ${updatedCount}`);
        } catch (error: any) {
            console.error('LOD import error:', error);
            setLoadError(error?.message || 'Unable to import the LOD workbook.');
        } finally {
            setLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="data-list-page">
            <ColumnFilterDialog
                open={isFilterOpen}
                title="Filter Level of Development"
                fields={[{ key: 'region', label: 'Region', values: philippineRegions }]}
                filters={filterRegion ? { region: [filterRegion] } : {}}
                onApply={filters => setFilterRegion(filters.region?.[0] || '')}
                onClose={() => setIsFilterOpen(false)}
            />
            <div className="data-list-header">
                <h2 className="data-list-title">Level of Development</h2>
            </div>

            <div className="data-table-card major-table-card">
                <MajorTableToolbar
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    searchPlaceholder="Search IPOs..."
                    activeFilterCount={filterRegion ? 1 : 0}
                    onOpenFilters={() => setIsFilterOpen(true)}
                    actions={isLodAdmin ? (
                        <>
                            <button type="button" onClick={handleExport} className="btn btn-secondary">
                                <Download aria-hidden="true" />
                                Export / Template
                            </button>
                            <button type="button" onClick={() => fileInputRef.current?.click()} className="btn btn-primary">
                                <Upload aria-hidden="true" />
                                Import
                            </button>
                            <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.xls" onChange={handleImport} />
                        </>
                    ) : undefined}
                />

                {loadError && <div className="notice notice--error" role="alert"><p>{loadError}</p></div>}
                {loading ? (
                    <LoadingState title="Loading assessments" message="Preparing Level of Development records." />
                ) : (
                    <>
                        <div className="data-table-scroll">
                            <table className="data-table lod-major-table">
                                <thead>
                                    <tr>
                                        <SortableTableHeader label="IPO Name" columnKey="name" sortConfig={sortConfig} onSort={requestSort} />
                                        <SortableTableHeader label="Region" columnKey="region" sortConfig={sortConfig} onSort={requestSort} />
                                        {years.map(year => (
                                            <SortableTableHeader
                                                key={year}
                                                label={String(year)}
                                                columnKey={`year:${year}`}
                                                sortConfig={sortConfig}
                                                onSort={requestSort}
                                                className="data-table__numeric"
                                            />
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedData.map(ipo => (
                                        <tr
                                            key={ipo.id}
                                            className="data-table__row--interactive"
                                            tabIndex={0}
                                            onClick={() => onSelectIpo(ipo)}
                                            onKeyDown={event => {
                                                if (event.key === 'Enter' || event.key === ' ') {
                                                    event.preventDefault();
                                                    onSelectIpo(ipo);
                                                }
                                            }}
                                        >
                                            <td className="data-table__cell--primary"><TruncatedTableCell value={ipo.name} /></td>
                                            <td><TruncatedTableCell value={ipo.region} /></td>
                                            {years.map(year => {
                                                const state = getLodEffectiveState(getAssessment(ipo.id, year));
                                                return (
                                                    <td key={year} className="data-table__numeric">
                                                        <button
                                                            type="button"
                                                            className={getStateClassName(state.kind)}
                                                            onClick={event => {
                                                                event.stopPropagation();
                                                                onSelectIpo(ipo, year);
                                                            }}
                                                        >
                                                            {state.label}
                                                        </button>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                    {paginatedData.length === 0 && (
                                        <tr><td className="data-table__empty-cell" colSpan={years.length + 2}>No IPOs match the current filters.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <DataTablePagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={filteredAndSortedIPOs.length}
                            itemsPerPage={itemsPerPage}
                            onPageChange={setCurrentPage}
                            onItemsPerPageChange={setItemsPerPage}
                            pageSizeOptions={[10, 20, 50, 100]}
                        />
                    </>
                )}
            </div>
        </div>
    );
};

export default LODPage;
