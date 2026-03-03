// Author: 4K
import React, { useState, useEffect, useMemo } from 'react';
import { IPO, LodAssessment, philippineRegions, ouToRegionMap } from '../../constants';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { usePagination } from '../mainfunctions/TableHooks';

interface LODPageProps {
    ipos: IPO[];
    onSelectIpo: (ipo: IPO) => void;
}

const LODPage: React.FC<LODPageProps> = ({ ipos, onSelectIpo }) => {
    const { currentUser } = useAuth();
    const [assessments, setAssessments] = useState<LodAssessment[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterRegion, setFilterRegion] = useState('');

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

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Level of Development</h2>
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
            </div>
        </div>
    );
};

export default LODPage;
