// Author: 4K
import React, { useState, useMemo } from 'react';
import { Subproject } from '../../constants';
import { XLSX } from '../reports/ReportUtils';

interface Props {
    subprojects: Subproject[];
}

interface InterventionStats {
    target: number;
    actual: number;
    units: Set<string>;
    allocation: number;
    obligated: number;
    disbursed: number;
}

const toTitleCase = (str: string) => {
    return str.replace(
        /\w\S*/g,
        text => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
    );
};

const normalizeQuantity = (qty: number, unit: string): { qty: number, unit: string } => {
    const u = (unit || '').toLowerCase().trim();
    // Convert Grams to Kilograms
    if (['g', 'gram', 'grams'].includes(u)) {
        return { qty: qty / 1000, unit: 'kg' };
    }
    // Normalize Kg variants
    if (['kg', 'kgs', 'kilogram', 'kilograms'].includes(u)) {
        return { qty: qty, unit: 'kg' };
    }
    return { qty: qty, unit: unit || 'unspecified' };
};

const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
    <svg 
        xmlns="http://www.w3.org/2000/svg" 
        className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${expanded ? 'transform rotate-90' : ''}`} 
        fill="none" 
        viewBox="0 0 24 24" 
        stroke="currentColor"
    >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
);

const AgriculturalInterventionsDashboard: React.FC<Props> = ({ subprojects }) => {
    const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');

    const data = useMemo<Record<string, Record<string, InterventionStats>>>(() => {
        // Structure: Type -> Particular (Normalized) -> Data
        const groups: Record<string, Record<string, InterventionStats>> = {};

        subprojects.forEach(sp => {
            if (sp.details) {
                sp.details.forEach(d => {
                    const type = d.type || 'Unspecified';
                    
                    // Normalize particular name (trim and title case to merge "Okra", "okra", "OKRA")
                    const rawParticular = d.particulars || 'Unspecified';
                    const particular = toTitleCase(rawParticular.trim());

                    const rawTarget = Number(d.numberOfUnits) || 0;
                    const rawActual = Number(d.actualNumberOfUnits) || 0;
                    const rawUnit = d.unitOfMeasure;

                    // Normalize Units (Handle g to kg conversion)
                    const targetNorm = normalizeQuantity(rawTarget, rawUnit);
                    const actualNorm = normalizeQuantity(rawActual, rawUnit);

                    const allocation = (Number(d.numberOfUnits) || 0) * (Number(d.pricePerUnit) || 0);
                    const obligated = Number(d.actualObligationAmount) || 0;
                    const disbursed = Number(d.actualDisbursementAmount) || 0;

                    if (!groups[type]) groups[type] = {};
                    if (!groups[type][particular]) groups[type][particular] = { target: 0, actual: 0, units: new Set(), allocation: 0, obligated: 0, disbursed: 0 };

                    groups[type][particular].target += targetNorm.qty;
                    groups[type][particular].actual += actualNorm.qty;
                    groups[type][particular].units.add(targetNorm.unit);
                    groups[type][particular].allocation += allocation;
                    groups[type][particular].obligated += obligated;
                    groups[type][particular].disbursed += disbursed;
                });
            }
        });

        return groups;
    }, [subprojects]);

    const filteredData = useMemo(() => {
        if (!searchTerm.trim()) return data;
        
        const filtered: Record<string, Record<string, InterventionStats>> = {};
        const term = searchTerm.toLowerCase().trim();

        Object.entries(data).forEach(([type, particulars]) => {
            const matchingParticulars: Record<string, InterventionStats> = {};
            
            Object.entries(particulars).forEach(([name, stats]) => {
                if (name.toLowerCase().includes(term) || type.toLowerCase().includes(term)) {
                    matchingParticulars[name] = stats;
                }
            });

            if (Object.keys(matchingParticulars).length > 0) {
                filtered[type] = matchingParticulars;
            }
        });

        return filtered;
    }, [data, searchTerm]);

    const toggleExpand = (type: string) => {
        const newSet = new Set(expandedTypes);
        if (newSet.has(type)) newSet.delete(type);
        else newSet.add(type);
        setExpandedTypes(newSet);
    };

    const typeTotals = useMemo<Record<string, { target: number, actual: number, allocation: number, obligated: number, disbursed: number }>>(() => {
        const totals: Record<string, { target: number, actual: number, allocation: number, obligated: number, disbursed: number }> = {};
        Object.keys(filteredData).forEach(type => {
            let t = 0; 
            let a = 0;
            let al = 0;
            let ob = 0;
            let di = 0;
            // Explicit cast for Object.values return because TS might infer as unknown[] in some configs
            const items = Object.values(filteredData[type]) as InterventionStats[];
            items.forEach((val) => {
                t += val.target;
                a += val.actual;
                al += val.allocation;
                ob += val.obligated;
                di += val.disbursed;
            });
            totals[type] = { target: t, actual: a, allocation: al, obligated: ob, disbursed: di };
        });
        return totals;
    }, [filteredData]);

    const grandTotals = useMemo(() => {
        let allocation = 0;
        let obligated = 0;
        let disbursed = 0;

        Object.values(filteredData).forEach(particulars => {
            Object.values(particulars).forEach(stats => {
                allocation += stats.allocation;
                obligated += stats.obligated;
                disbursed += stats.disbursed;
            });
        });

        return { allocation, obligated, disbursed };
    }, [filteredData]);

    // Calculate formatting for units
    const formatUnitString = (units: Set<string>) => {
        const arr = Array.from(units);
        if (arr.length === 0) return '';
        // If we have 'kg', prefer showing that cleanly if it's the only one
        if (arr.length === 1) return arr[0];
        if (arr.length > 2) return `${arr[0]} + others`;
        return arr.join('/');
    };

    const handleDownloadExcel = () => {
        const flatData: any[] = [];
        
        Object.keys(filteredData).sort().forEach(type => {
            Object.entries(filteredData[type]).sort((a, b) => a[0].localeCompare(b[0])).forEach(([name, rawStats]) => {
                const stats = rawStats as InterventionStats;
                const deliveryRate = stats.target > 0 ? (stats.actual / stats.target) : 0;
                flatData.push({
                    'Item Type': type,
                    'Particulars': name,
                    'Unit': Array.from(stats.units).join('/'),
                    'Target Quantity': stats.target,
                    'Total Allocation': stats.allocation,
                    'Actual Delivered': stats.actual,
                    'Total Obligated': stats.obligated,
                    'Total Disbursed': stats.disbursed,
                    'Delivery Rate': deliveryRate
                });
            });
        });

        if (flatData.length === 0) {
            alert("No data to download.");
            return;
        }

        const ws = XLSX.utils.json_to_sheet(flatData);
        
        // Format percentage column (Index 8 / Column I)
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let R = 1; R <= range.e.r; ++R) { // Start from row 1 (skip header)
            const cellRef = XLSX.utils.encode_cell({c: 8, r: R});
            if (ws[cellRef]) {
                ws[cellRef].t = 'n';
                ws[cellRef].z = '0%';
            }
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Interventions");
        XLSX.writeFile(wb, `Agricultural_Interventions_Breakdown_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                <div className="flex flex-wrap items-center justify-between mb-2 gap-4">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        <span className="w-2 h-6 bg-emerald-500 rounded-full"></span>
                        Intervention Breakdown by Item Type
                    </h3>
                    <button 
                        onClick={handleDownloadExcel}
                        className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 flex items-center gap-2 shadow-sm"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download Excel
                    </button>
                </div>

                {/* Search Bar */}
                <div className="mb-6 relative max-w-md">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        placeholder="Search intervention (e.g. fertilizer)..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm transition-colors"
                    />
                </div>
                
                {/* Scrollable Container with Fixed Height */}
                <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
                    <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                        <table className="min-w-full text-sm text-left relative">
                            <thead className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-200 uppercase font-medium sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-4 py-4 w-1/4">Item Type / Particulars</th>
                                    <th className="px-4 py-4 text-right">Target Qty</th>
                                    <th className="px-4 py-4 text-right">Total Allocation</th>
                                    <th className="px-4 py-4 text-right">Actual Delivered</th>
                                    <th className="px-4 py-4 text-right">Total Obligated</th>
                                    <th className="px-4 py-4 text-right">Total Disbursed</th>
                                    <th className="px-4 py-4 text-right">Delivery Rate</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {Object.keys(filteredData).sort().map(type => {
                                    const isExpanded = expandedTypes.has(type) || searchTerm.trim() !== '';
                                    const totals = typeTotals[type] || { target: 0, actual: 0, allocation: 0, obligated: 0, disbursed: 0 };
                                    const rate = totals.target > 0 ? (totals.actual / totals.target) * 100 : 0;

                                    return (
                                        <React.Fragment key={type}>
                                            <tr 
                                                className="bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer group"
                                                onClick={() => toggleExpand(type)}
                                            >
                                                <td className="px-4 py-4">
                                                    <div className="flex items-center gap-3 font-semibold text-gray-800 dark:text-gray-100">
                                                        <ChevronIcon expanded={isExpanded} />
                                                        {type}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 text-right font-medium text-gray-600 dark:text-gray-300">
                                                    {totals.target.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-4 text-right font-medium text-gray-600 dark:text-gray-300">
                                                    ₱{totals.allocation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-4 text-right font-medium text-gray-800 dark:text-gray-100">
                                                    {totals.actual.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-4 text-right font-medium text-gray-600 dark:text-gray-300">
                                                    ₱{totals.obligated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-4 text-right font-medium text-gray-600 dark:text-gray-300">
                                                    ₱{totals.disbursed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="flex items-center justify-end gap-3">
                                                        <div className="w-full max-w-[100px] bg-gray-200 rounded-full h-2 dark:bg-gray-700">
                                                            <div 
                                                                className={`h-2 rounded-full transition-all duration-500 ${rate >= 100 ? 'bg-emerald-500' : 'bg-teal-500'}`} 
                                                                style={{ width: `${Math.min(rate, 100)}%` }}
                                                            ></div>
                                                        </div>
                                                        <span className={`text-xs font-bold w-10 text-right ${rate >= 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-teal-600 dark:text-teal-400'}`}>
                                                            {rate.toFixed(0)}%
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                            
                                            {/* Child Rows */}
                                            {isExpanded && Object.entries(filteredData[type]).sort((a,b) => a[0].localeCompare(b[0])).map(([name, rawStats]) => {
                                                const stats = rawStats as InterventionStats;
                                                const itemRate = stats.target > 0 ? (stats.actual / stats.target) * 100 : 0;
                                                const unitStr = formatUnitString(stats.units);
                                                
                                                return (
                                                    <tr key={`${type}-${name}`} className="border-b border-gray-100 dark:border-gray-800 hover:bg-emerald-50 dark:hover:bg-gray-700/30 transition-colors bg-white dark:bg-gray-900">
                                                        <td className="px-4 py-3 pl-14 text-gray-700 dark:text-gray-300">
                                                            <span className="w-2 h-2 inline-block rounded-full bg-emerald-200 dark:bg-emerald-800 mr-2"></span>
                                                            {name}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400 text-sm">
                                                            <span className="font-semibold text-gray-700 dark:text-gray-300">{stats.target.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                                                            <span className="text-xs ml-1 opacity-70">{unitStr}</span>
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400 text-sm">
                                                            ₱{stats.allocation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400 text-sm">
                                                            <span className="font-semibold text-gray-900 dark:text-gray-100">{stats.actual.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                                                            <span className="text-xs ml-1 opacity-70">{unitStr}</span>
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400 text-sm">
                                                            ₱{stats.obligated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400 text-sm">
                                                            ₱{stats.disbursed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                                                                itemRate >= 100 
                                                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' 
                                                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                                                            }`}>
                                                                {itemRate.toFixed(1)}%
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </React.Fragment>
                                    );
                                })}
                                {Object.keys(filteredData).length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400 italic">
                                            {searchTerm ? `No results found for "${searchTerm}"` : 'No intervention data found in records.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            {/* Grand Total Row */}
                            {Object.keys(filteredData).length > 0 && (
                                <tfoot className="bg-gray-100 dark:bg-gray-700 font-bold text-gray-800 dark:text-white sticky bottom-0 z-10 shadow-[0_-2px_4px_rgba(0,0,0,0.05)]">
                                    <tr>
                                        <td className="px-4 py-4 uppercase tracking-wider">Grand Total</td>
                                        <td className="px-4 py-4 text-right text-gray-400 italic font-normal text-xs">N/A</td>
                                        <td className="px-4 py-4 text-right">
                                            ₱{grandTotals.allocation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-4 py-4 text-right text-gray-400 italic font-normal text-xs">N/A</td>
                                        <td className="px-4 py-4 text-right">
                                            ₱{grandTotals.obligated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            ₱{grandTotals.disbursed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-4 py-4 text-right text-gray-400 italic font-normal text-xs">N/A</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
                <div className="mt-2 text-right text-xs text-gray-400 dark:text-gray-500 italic">
                    * Items normalized by name. Grams are auto-converted to Kilograms (1000g = 1kg).
                </div>
            </div>
        </div>
    );
};

export default AgriculturalInterventionsDashboard;