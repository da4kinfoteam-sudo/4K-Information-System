// Author: 4K
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { IPO, LodAssessment, philippineRegions, ouToRegionMap, filterYears } from '../../constants';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { usePagination, useUserAccess } from '../mainfunctions/TableHooks';
import { useLogAction } from '../../hooks/useLogAction';

interface LODPageProps {
    ipos: IPO[];
    onSelectIpo: (ipo: IPO) => void;
}

const LODPage: React.FC<LODPageProps> = ({ ipos, onSelectIpo }) => {
    const { currentUser } = useAuth();
    const { logAction } = useLogAction();
    const { canEdit } = useUserAccess('Level of Development');
    const isAdmin = canEdit;
    const [assessments, setAssessments] = useState<LodAssessment[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterRegion, setFilterRegion] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchAssessments();
    }, []);

    const fetchAssessments = async () => {
        if (!supabase) return;
        const { data, error } = await supabase.from('lod_assessments').select('*');
        if (error) {
            console.error('Error fetching assessments:', error);
        } else if (data) {
            setAssessments(data);
        }
        setLoading(false);
    };

    // Determine Years to Display
    const years = useMemo(() => {
        if (assessments.length === 0) return [new Date().getFullYear()];
        const distinctYears: number[] = Array.from(new Set(assessments.map(a => a.year)));
        const currentYear = new Date().getFullYear();
        if (!distinctYears.includes(currentYear)) distinctYears.push(currentYear);
        return distinctYears.sort((a, b) => b - a); // Descending
    }, [assessments]);

    // Filter IPOs
    const filteredIPOs = useMemo(() => {
        let filtered = [...ipos];

        // OU Permission Filter
        if (currentUser?.role === 'User') {
            const userRegion = ouToRegionMap[currentUser.operatingUnit];
            if (userRegion) {
                filtered = filtered.filter(i => i.region === userRegion);
            }
        }

        if (filterRegion) {
            filtered = filtered.filter(i => i.region === filterRegion);
        }

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            filtered = filtered.filter(i => 
                i.name.toLowerCase().includes(lower) || 
                i.location.toLowerCase().includes(lower)
            );
        }

        return filtered;
    }, [ipos, searchTerm, filterRegion, currentUser]);

    const { 
        currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData 
    } = usePagination(filteredIPOs, [searchTerm, filterRegion]);

    const getLodForIpoYear = (ipoId: number, year: number) => {
        const assessment = assessments.find(a => a.ipo_id === ipoId && a.year === year);
        if (!assessment) return '-';
        return assessment.manual_level ?? assessment.computed_level ?? '-';
    };

    const handleExport = () => {
        const XLSX = (window as any).XLSX;
        if (!XLSX) {
            alert('Excel library not loaded. Please refresh the page.');
            return;
        }

        // Use filterYears for columns, sorted ascending (2019 -> 2028)
        const exportYears = [...filterYears].sort((a, b) => parseInt(a) - parseInt(b));

        const data = filteredIPOs.map(ipo => {
            const row: any = {
                'ID': ipo.id,
                'IPO Name': ipo.name,
                'Region': ipo.region
            };
            exportYears.forEach(yearStr => {
                const year = parseInt(yearStr);
                const assessment = assessments.find(a => a.ipo_id === ipo.id && a.year === year);
                // Only export manual level to avoid confusion during import
                row[year] = assessment?.manual_level ?? ''; 
            });
            return row;
        });

        // Explicitly define headers to ensure order: ID, IPO Name, Region, then Years
        const headers = ['ID', 'IPO Name', 'Region', ...exportYears];

        const ws = XLSX.utils.json_to_sheet(data, { header: headers });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "LOD Data");
        XLSX.writeFile(wb, "LOD_Assessments_Template.xlsx");
        logAction('Exported LOD Data', `Count: ${filteredIPOs.length}`);
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !supabase) return;

        const XLSX = (window as any).XLSX;
        if (!XLSX) {
            alert('Excel library not loaded. Please refresh the page.');
            return;
        }

        setLoading(true);
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const data = new Uint8Array(evt.target?.result as ArrayBuffer);
                const wb = XLSX.read(data, { type: 'array' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const jsonData = XLSX.utils.sheet_to_json(ws);

                let updatedCount = 0;

                for (const row of jsonData as any[]) {
                    const ipoId = row['ID'];
                    if (!ipoId) continue;

                    // Find year columns (keys that are numbers)
                    const rowKeys = Object.keys(row).filter(k => !['ID', 'IPO Name', 'Region'].includes(k));
                    
                    for (const yearStr of rowKeys) {
                        const year = parseInt(yearStr);
                        if (isNaN(year)) continue;

                        const val = row[yearStr];
                        let manualLevel: number | null = null;
                        
                        if (val !== '' && val !== null && val !== undefined) {
                            const num = parseInt(val);
                            if (!isNaN(num) && num >= 1 && num <= 5) {
                                manualLevel = num;
                            } else {
                                // If invalid number, treat as null (clear it) or skip?
                                // "if it is blank then just make it null"
                                // If it's not blank but invalid, let's assume user wants to clear or made a mistake.
                                // Safest is to skip if invalid, but prompt implies blank -> null.
                                // Let's treat explicit invalid input as null too for safety? 
                                // Or just skip. Let's skip invalid numbers to be safe.
                                continue;
                            }
                        }

                        const payload = {
                            ipo_id: ipoId,
                            year: year,
                            manual_level: manualLevel,
                            updated_at: new Date().toISOString()
                        };

                        const { error } = await supabase
                            .from('lod_assessments')
                            .upsert(payload, { onConflict: 'ipo_id, year' });

                        if (!error) updatedCount++;
                    }
                }
                
                logAction('Imported LOD Data', `Rows processed: ${jsonData.length}`);
                await fetchAssessments();
                alert(`Import completed successfully! Updated assessments.`);
            } catch (err) {
                console.error('Import error:', err);
                alert('Error importing file. Please check the format.');
            } finally {
                setLoading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Level of Development</h2>
                {currentUser?.role === 'Administrator' && (
                    <div className="flex gap-2">
                        <button 
                            onClick={handleExport}
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium flex items-center gap-2 shadow-sm"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Download Template
                        </button>
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 text-sm font-medium flex items-center gap-2 shadow-sm"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            Import Assessments
                        </button>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept=".xlsx, .xls" 
                            onChange={handleImport} 
                        />
                    </div>
                )}
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                <div className="flex flex-wrap gap-4 mb-6">
                    <input 
                        type="text" 
                        placeholder="Search IPO..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white w-full md:w-64"
                    />
                    <select
                        value={filterRegion}
                        onChange={(e) => setFilterRegion(e.target.value)}
                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                    >
                        <option value="">All Regions</option>
                        {philippineRegions.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                </div>

                {loading ? (
                    <div className="text-center py-12 text-gray-500">Loading assessments...</div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-700">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">IPO Name</th>
                                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Region</th>
                                        {years.map(year => (
                                            <th key={year} className="px-6 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                                {year}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                    {paginatedData.map(ipo => (
                                        <tr key={ipo.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <button 
                                                    onClick={() => onSelectIpo(ipo)}
                                                    className="text-emerald-600 dark:text-emerald-400 font-medium hover:underline text-left"
                                                >
                                                    {ipo.name}
                                                </button>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                {ipo.region}
                                            </td>
                                            {years.map(year => {
                                                const level = getLodForIpoYear(ipo.id, year);
                                                return (
                                                    <td key={year} className="px-6 py-4 whitespace-nowrap text-center">
                                                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold
                                                            ${level === '-' ? 'bg-gray-100 text-gray-400 dark:bg-gray-700' : 
                                                              level >= 4 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' :
                                                              level >= 3 ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                                                              level >= 2 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                                              'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                                            }
                                                        `}>
                                                            {level}
                                                        </span>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        <div className="py-4 flex items-center justify-between border-t border-gray-200 dark:border-gray-700 mt-4">
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-gray-700 dark:text-gray-300">Show</span>
                                <select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1 pl-2 pr-8 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm">
                                    {[10, 20, 50, 100].map(size => ( <option key={size} value={size}>{size}</option> ))}
                                </select>
                                <span className="text-gray-700 dark:text-gray-300">entries</span>
                            </div>
                             <div className="flex items-center gap-4 text-sm">
                                <span className="text-gray-700 dark:text-gray-300">Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredIPOs.length)} to {Math.min(currentPage * itemsPerPage, filteredIPOs.length)} of {filteredIPOs.length} entries</span>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">Previous</button>
                                    <span className="px-2 font-medium">{currentPage} / {totalPages}</span>
                                    <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default LODPage;
