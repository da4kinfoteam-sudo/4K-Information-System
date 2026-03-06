// Author: 4K
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { operatingUnits, Subproject, Activity, OfficeRequirement, StaffingRequirement, filterYears } from '../../constants';

interface BudgetCeilingManagementProps {
    subprojects: Subproject[];
    activities: Activity[];
    officeReqs: OfficeRequirement[];
    staffingReqs: StaffingRequirement[];
}

interface BudgetCeiling {
    id: number;
    operating_unit: string;
    year: number;
    amount: number;
}

const BudgetCeilingManagement: React.FC<BudgetCeilingManagementProps> = ({
    subprojects, activities, officeReqs, staffingReqs
}) => {
    const [ceilings, setCeilings] = useState<BudgetCeiling[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingCell, setEditingCell] = useState<{ ou: string, year: number } | null>(null);
    const [editValue, setEditValue] = useState<string>('');
    const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());

    // Use filterYears from constants, converted to numbers for logic
    const years = useMemo(() => filterYears.map(y => parseInt(y)), []);

    useEffect(() => {
        fetchCeilings();
    }, []);

    const fetchCeilings = async () => {
        if (!supabase) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('budget_ceilings')
                .select('*');
            
            if (error) throw error;
            setCeilings(data || []);
        } catch (error) {
            console.error("Error fetching budget ceilings:", error);
        } finally {
            setLoading(false);
        }
    };

    const getCeiling = (ou: string, year: number) => {
        return ceilings.find(c => c.operating_unit === ou && c.year === year)?.amount || 0;
    };

    const calculateTotalBudget = (ou: string, year: number, tier?: string, fundType?: string) => {
        let total = 0;

        // Subprojects
        subprojects.filter(s => 
            s.operatingUnit === ou && 
            s.fundingYear === year &&
            (!tier || s.tier === tier) &&
            (!fundType || s.fundType === fundType)
        ).forEach(s => total += (s.amount || 0));

        // Activities
        activities.filter(a => 
            a.operatingUnit === ou && 
            a.fundingYear === year &&
            (!tier || a.tier === tier) &&
            (!fundType || a.fundType === fundType)
        ).forEach(a => {
            a.expenses.forEach(e => total += (e.amount || 0));
        });

        // Office Requirements
        officeReqs.filter(o => 
            o.operatingUnit === ou && 
            o.fundYear === year &&
            (!tier || o.tier === tier) &&
            (!fundType || o.fundType === fundType)
        ).forEach(o => total += (o.numberOfUnits * o.pricePerUnit));

        // Staffing Requirements
        staffingReqs.filter(s => 
            s.operatingUnit === ou && 
            s.fundYear === year &&
            (!tier || s.tier === tier) &&
            (!fundType || s.fundType === fundType)
        ).forEach(s => total += (s.annualSalary || 0));

        return total;
    };

    const handleCellClick = (ou: string, year: number, currentAmount: number) => {
        setEditingCell({ ou, year });
        setEditValue(currentAmount.toString());
    };

    const handleSave = async () => {
        if (!editingCell || !supabase) return;

        const { ou, year } = editingCell;
        const amount = parseFloat(editValue) || 0;

        try {
            // Check if exists
            const existing = ceilings.find(c => c.operating_unit === ou && c.year === year);

            if (existing) {
                const { error } = await supabase
                    .from('budget_ceilings')
                    .update({ amount })
                    .eq('id', existing.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('budget_ceilings')
                    .insert([{ operating_unit: ou, year, amount }]);
                if (error) throw error;
            }

            await fetchCeilings();
            setEditingCell(null);
        } catch (error) {
            console.error("Error saving budget ceiling:", error);
            alert("Failed to save budget ceiling.");
        }
    };

    const toggleDetails = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedCells(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(amount);
    };

    if (loading) return <div className="p-4 text-center">Loading budget data...</div>;

    return (
        <div className="overflow-x-auto relative">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg border-collapse">
                <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider sticky left-0 bg-gray-50 dark:bg-gray-800 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                            Operating Unit
                        </th>
                        {years.map(year => (
                            <th key={year} className="px-6 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[280px]">
                                {year}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {operatingUnits.map(ou => (
                        <tr key={ou} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-gray-800 z-20 border-r border-gray-200 dark:border-gray-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                {ou}
                            </td>
                            {years.map(year => {
                                const ceiling = getCeiling(ou, year);
                                
                                // Tier 1 Current (Main Focus)
                                const usedTier1Current = calculateTotalBudget(ou, year, 'Tier 1', 'Current');
                                const diff = ceiling - usedTier1Current;
                                
                                // Other Breakdowns
                                const usedTier2Current = calculateTotalBudget(ou, year, 'Tier 2', 'Current');
                                const totalUsedAll = calculateTotalBudget(ou, year);
                                const usedOthers = totalUsedAll - (usedTier1Current + usedTier2Current);
                                
                                const isEditing = editingCell?.ou === ou && editingCell?.year === year;
                                const cellId = `${ou}-${year}`;
                                const isExpanded = expandedCells.has(cellId);

                                return (
                                    <td key={cellId} className="px-4 py-4 whitespace-nowrap text-sm text-right border-r border-gray-100 dark:border-gray-700 align-top">
                                        <div className="flex flex-col gap-2">
                                            {/* Main Focus: Tier 1 Current */}
                                            <div className="bg-emerald-50 dark:bg-emerald-900/20 p-2 rounded border border-emerald-100 dark:border-emerald-800">
                                                <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase mb-1 text-center">Tier 1 (Current)</div>
                                                
                                                {isEditing ? (
                                                    <div className="flex items-center gap-1 justify-end mb-1">
                                                        <span className="text-xs text-gray-500">Ceiling:</span>
                                                        <input
                                                            type="number"
                                                            value={editValue}
                                                            onChange={(e) => setEditValue(e.target.value)}
                                                            className="w-24 px-1 py-0.5 text-sm border rounded focus:ring-emerald-500 focus:border-emerald-500 dark:bg-gray-700 dark:border-gray-600 text-right"
                                                            autoFocus
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') handleSave();
                                                                if (e.key === 'Escape') setEditingCell(null);
                                                            }}
                                                        />
                                                        <button onClick={handleSave} className="text-emerald-600 hover:text-emerald-700">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div 
                                                        onClick={() => handleCellClick(ou, year, ceiling)}
                                                        className="flex justify-between items-center cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded px-1 transition-colors group"
                                                        title="Click to edit ceiling"
                                                    >
                                                        <span className="text-xs text-gray-500">Ceiling:</span>
                                                        <div className="flex items-center gap-1 font-bold text-gray-800 dark:text-gray-200">
                                                            {formatCurrency(ceiling)}
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                            </svg>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="flex justify-between items-center px-1 mt-1">
                                                    <span className="text-xs text-gray-500">Used:</span>
                                                    <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(usedTier1Current)}</span>
                                                </div>
                                                
                                                <div className={`flex justify-between items-center px-1 mt-1 font-bold text-xs border-t border-emerald-200 dark:border-emerald-800 pt-1 ${diff < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                    <span>{diff < 0 ? 'Over:' : 'Rem:'}</span>
                                                    <span>{formatCurrency(Math.abs(diff))}</span>
                                                </div>
                                            </div>

                                            {/* Details Toggle */}
                                            <button 
                                                onClick={(e) => toggleDetails(cellId, e)}
                                                className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center justify-center gap-1 w-full py-1"
                                            >
                                                {isExpanded ? 'Hide Details' : 'Show All Funds'}
                                                <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>

                                            {/* Collapsible Details */}
                                            {isExpanded && (
                                                <div className="text-xs space-y-1 bg-gray-50 dark:bg-gray-700/30 p-2 rounded animate-fadeIn">
                                                    <div className="flex justify-between text-gray-500">
                                                        <span>Tier 2 (Current):</span>
                                                        <span>{formatCurrency(usedTier2Current)}</span>
                                                    </div>
                                                    <div className="flex justify-between text-gray-500">
                                                        <span>Other Funds:</span>
                                                        <span>{formatCurrency(usedOthers)}</span>
                                                    </div>
                                                    <div className="flex justify-between font-bold text-gray-700 dark:text-gray-300 border-t border-gray-200 dark:border-gray-600 pt-1 mt-1">
                                                        <span>Grand Total:</span>
                                                        <span>{formatCurrency(totalUsedAll)}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default BudgetCeilingManagement;
