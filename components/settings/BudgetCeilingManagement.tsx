import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { operatingUnits, Subproject, Activity, OfficeRequirement, StaffingRequirement } from '../../constants';

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

    // Calculate available years from data
    const years = useMemo(() => {
        const yearSet = new Set<number>();
        const currentYear = new Date().getFullYear();
        yearSet.add(currentYear);
        yearSet.add(currentYear + 1);

        subprojects.forEach(s => s.fundingYear && yearSet.add(s.fundingYear));
        activities.forEach(a => a.fundingYear && yearSet.add(a.fundingYear));
        officeReqs.forEach(o => o.fundYear && yearSet.add(o.fundYear));
        staffingReqs.forEach(s => s.fundYear && yearSet.add(s.fundYear));

        return Array.from(yearSet).sort((a, b) => a - b);
    }, [subprojects, activities, officeReqs, staffingReqs]);

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

    const calculateTotalBudget = (ou: string, year: number) => {
        let total = 0;

        // Subprojects
        subprojects.filter(s => s.operatingUnit === ou && s.fundingYear === year)
            .forEach(s => total += (s.amount || 0));

        // Activities
        activities.filter(a => a.operatingUnit === ou && a.fundingYear === year)
            .forEach(a => {
                a.expenses.forEach(e => total += (e.amount || 0));
            });

        // Office Requirements
        officeReqs.filter(o => o.operatingUnit === ou && o.fundYear === year)
            .forEach(o => total += (o.numberOfUnits * o.pricePerUnit));

        // Staffing Requirements
        staffingReqs.filter(s => s.operatingUnit === ou && s.fundYear === year)
            .forEach(s => total += (s.annualSalary || 0));

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

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
    };

    if (loading) return <div className="p-4 text-center">Loading budget data...</div>;

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg">
                <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider sticky left-0 bg-gray-50 dark:bg-gray-800 z-10">
                            Operating Unit
                        </th>
                        {years.map(year => (
                            <th key={year} className="px-6 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[200px]">
                                {year}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {operatingUnits.map(ou => (
                        <tr key={ou} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-gray-800 z-10 border-r border-gray-200 dark:border-gray-700">
                                {ou}
                            </td>
                            {years.map(year => {
                                const ceiling = getCeiling(ou, year);
                                const used = calculateTotalBudget(ou, year);
                                const diff = ceiling - used;
                                const isEditing = editingCell?.ou === ou && editingCell?.year === year;

                                return (
                                    <td key={`${ou}-${year}`} className="px-6 py-4 whitespace-nowrap text-sm text-right border-r border-gray-100 dark:border-gray-700">
                                        {isEditing ? (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    value={editValue}
                                                    onChange={(e) => setEditValue(e.target.value)}
                                                    className="w-24 px-2 py-1 text-sm border rounded focus:ring-emerald-500 focus:border-emerald-500 dark:bg-gray-700 dark:border-gray-600"
                                                    autoFocus
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleSave();
                                                        if (e.key === 'Escape') setEditingCell(null);
                                                    }}
                                                />
                                                <button onClick={handleSave} className="text-emerald-600 hover:text-emerald-700">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                </button>
                                            </div>
                                        ) : (
                                            <div 
                                                onClick={() => handleCellClick(ou, year, ceiling)}
                                                className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded transition-colors group"
                                            >
                                                <div className="font-bold text-gray-800 dark:text-gray-200 flex justify-between items-center">
                                                    <span className="text-xs text-gray-500 uppercase mr-2">Ceiling:</span>
                                                    {formatCurrency(ceiling)}
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                    </svg>
                                                </div>
                                                <div className="text-xs text-gray-500 mt-1 flex justify-between">
                                                    <span>Used:</span>
                                                    <span>{formatCurrency(used)}</span>
                                                </div>
                                                <div className={`text-xs font-semibold mt-1 flex justify-between ${diff < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                    <span>{diff < 0 ? 'Over:' : 'Remaining:'}</span>
                                                    <span>{formatCurrency(Math.abs(diff))}</span>
                                                </div>
                                            </div>
                                        )}
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
