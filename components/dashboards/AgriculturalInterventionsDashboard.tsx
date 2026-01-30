// Author: 4K
import React, { useState, useMemo } from 'react';
import { Subproject } from '../../constants';

interface Props {
    subprojects: Subproject[];
}

const toTitleCase = (str: string) => {
    return str.replace(
        /\w\S*/g,
        text => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
    );
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

    const data = useMemo(() => {
        // Structure: Type -> Particular (Normalized) -> Data
        const groups: Record<string, Record<string, { target: number, actual: number, units: Set<string> }>> = {};

        subprojects.forEach(sp => {
            if (sp.details) {
                sp.details.forEach(d => {
                    const type = d.type || 'Unspecified';
                    
                    // Normalize particular name (trim and title case to merge "Okra", "okra", "OKRA")
                    const rawParticular = d.particulars || 'Unspecified';
                    const particular = toTitleCase(rawParticular.trim());

                    const target = Number(d.numberOfUnits) || 0;
                    const actual = Number(d.actualNumberOfUnits) || 0;
                    const unit = d.unitOfMeasure;

                    if (!groups[type]) groups[type] = {};
                    if (!groups[type][particular]) groups[type][particular] = { target: 0, actual: 0, units: new Set() };

                    groups[type][particular].target += target;
                    groups[type][particular].actual += actual;
                    if(unit) groups[type][particular].units.add(unit);
                });
            }
        });

        return groups;
    }, [subprojects]);

    const toggleExpand = (type: string) => {
        const newSet = new Set(expandedTypes);
        if (newSet.has(type)) newSet.delete(type);
        else newSet.add(type);
        setExpandedTypes(newSet);
    };

    const typeTotals = useMemo(() => {
        const totals: Record<string, { target: number, actual: number }> = {};
        Object.keys(data).forEach(type => {
            let t = 0; 
            let a = 0;
            Object.values(data[type]).forEach((val: { target: number; actual: number }) => {
                t += val.target;
                a += val.actual;
            });
            totals[type] = { target: t, actual: a };
        });
        return totals;
    }, [data]);

    // Calculate formatting for units
    const formatUnitString = (units: Set<string>) => {
        const arr = Array.from(units);
        if (arr.length === 0) return '';
        if (arr.length > 2) return `${arr[0]} + others`;
        return arr.join('/');
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                    <span className="w-2 h-6 bg-emerald-500 rounded-full"></span>
                    Intervention Breakdown by Item Type
                </h3>
                
                {/* Scrollable Container with Fixed Height */}
                <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
                    <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                        <table className="min-w-full text-sm text-left relative">
                            <thead className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-200 uppercase font-medium sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-6 py-4 w-1/3">Item Type / Particulars</th>
                                    <th className="px-6 py-4 text-right">Target Qty</th>
                                    <th className="px-6 py-4 text-right">Actual Delivered</th>
                                    <th className="px-6 py-4 text-right w-1/4">Delivery Rate</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {Object.keys(data).sort().map(type => {
                                    const isExpanded = expandedTypes.has(type);
                                    const totals = typeTotals[type];
                                    const rate = totals.target > 0 ? (totals.actual / totals.target) * 100 : 0;

                                    return (
                                        <React.Fragment key={type}>
                                            <tr 
                                                className="bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer group"
                                                onClick={() => toggleExpand(type)}
                                            >
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3 font-semibold text-gray-800 dark:text-gray-100">
                                                        <ChevronIcon expanded={isExpanded} />
                                                        {type}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right font-medium text-gray-600 dark:text-gray-300">
                                                    {totals.target.toLocaleString()}
                                                </td>
                                                <td className="px-6 py-4 text-right font-medium text-gray-800 dark:text-gray-100">
                                                    {totals.actual.toLocaleString()}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center justify-end gap-3">
                                                        <div className="w-full max-w-[140px] bg-gray-200 rounded-full h-2 dark:bg-gray-700">
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
                                            {isExpanded && Object.entries(data[type]).sort((a,b) => a[0].localeCompare(b[0])).map(([name, stats]: [string, { target: number; actual: number; units: Set<string> }]) => {
                                                const itemRate = stats.target > 0 ? (stats.actual / stats.target) * 100 : 0;
                                                const unitStr = formatUnitString(stats.units);
                                                
                                                return (
                                                    <tr key={`${type}-${name}`} className="border-b border-gray-100 dark:border-gray-800 hover:bg-emerald-50 dark:hover:bg-gray-700/30 transition-colors bg-white dark:bg-gray-900">
                                                        <td className="px-6 py-3 pl-14 text-gray-700 dark:text-gray-300">
                                                            <span className="w-2 h-2 inline-block rounded-full bg-emerald-200 dark:bg-emerald-800 mr-2"></span>
                                                            {name}
                                                        </td>
                                                        <td className="px-6 py-3 text-right text-gray-500 dark:text-gray-400 text-sm">
                                                            <span className="font-semibold text-gray-700 dark:text-gray-300">{stats.target.toLocaleString()}</span>
                                                            <span className="text-xs ml-1 opacity-70">{unitStr}</span>
                                                        </td>
                                                        <td className="px-6 py-3 text-right text-gray-500 dark:text-gray-400 text-sm">
                                                            <span className="font-semibold text-gray-900 dark:text-gray-100">{stats.actual.toLocaleString()}</span>
                                                            <span className="text-xs ml-1 opacity-70">{unitStr}</span>
                                                        </td>
                                                        <td className="px-6 py-3 text-right">
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
                                {Object.keys(data).length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400 italic">
                                            No intervention data found in records.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="mt-2 text-right text-xs text-gray-400 dark:text-gray-500 italic">
                    * Items normalized by name. Case variations (e.g. "Okra", "okra") are merged.
                </div>
            </div>
        </div>
    );
};

export default AgriculturalInterventionsDashboard;