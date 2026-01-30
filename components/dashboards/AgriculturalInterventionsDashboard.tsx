
// Author: 4K
import React, { useState, useMemo } from 'react';
import { Subproject } from '../../constants';

interface Props {
    subprojects: Subproject[];
}

const AgriculturalInterventionsDashboard: React.FC<Props> = ({ subprojects }) => {
    const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());

    const data = useMemo(() => {
        const groups: Record<string, Record<string, { target: number, actual: number, units: Set<string> }>> = {};

        subprojects.forEach(sp => {
            if (sp.details) {
                sp.details.forEach(d => {
                    const type = d.type || 'Unspecified';
                    const particular = d.particulars || 'Unspecified';
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
            Object.values(data[type]).forEach(val => {
                t += val.target;
                a += val.actual;
            });
            totals[type] = { target: t, actual: a };
        });
        return totals;
    }, [data]);

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Intervention Breakdown by Item Type</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-200 uppercase font-medium">
                            <tr>
                                <th className="px-6 py-3">Item Type / Particulars</th>
                                <th className="px-6 py-3 text-right">Target Qty</th>
                                <th className="px-6 py-3 text-right">Actual Delivered</th>
                                <th className="px-6 py-3 text-right">Delivery Rate</th>
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
                                            className="bg-gray-50 dark:bg-gray-700/50 font-semibold cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                                            onClick={() => toggleExpand(type)}
                                        >
                                            <td className="px-6 py-4 flex items-center gap-2 text-gray-800 dark:text-gray-200">
                                                <span className="text-xs text-gray-500">{isExpanded ? '▼' : '▶'}</span>
                                                {type}
                                            </td>
                                            <td className="px-6 py-4 text-right text-gray-800 dark:text-gray-200">{totals.target.toLocaleString()}</td>
                                            <td className="px-6 py-4 text-right text-gray-800 dark:text-gray-200">{totals.actual.toLocaleString()}</td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <div className="w-16 bg-gray-200 rounded-full h-1.5 dark:bg-gray-600">
                                                        <div className={`h-1.5 rounded-full ${rate >= 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(rate, 100)}%` }}></div>
                                                    </div>
                                                    <span className="text-gray-600 dark:text-gray-400">{rate.toFixed(0)}%</span>
                                                </div>
                                            </td>
                                        </tr>
                                        {isExpanded && Object.entries(data[type]).sort((a,b) => a[0].localeCompare(b[0])).map(([name, stats]) => {
                                            const itemRate = stats.target > 0 ? (stats.actual / stats.target) * 100 : 0;
                                            const units = Array.from(stats.units).join(', ');
                                            return (
                                                <tr key={name} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                                    <td className="px-6 py-3 pl-12 text-gray-700 dark:text-gray-300">
                                                        {name} <span className="text-xs text-gray-400">({units})</span>
                                                    </td>
                                                    <td className="px-6 py-3 text-right text-gray-600 dark:text-gray-400">{stats.target.toLocaleString()}</td>
                                                    <td className="px-6 py-3 text-right text-gray-600 dark:text-gray-400">{stats.actual.toLocaleString()}</td>
                                                    <td className="px-6 py-3 text-right text-gray-600 dark:text-gray-400 text-xs">
                                                        {itemRate.toFixed(1)}%
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </React.Fragment>
                                );
                            })}
                            {Object.keys(data).length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500 italic">No intervention data found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AgriculturalInterventionsDashboard;
