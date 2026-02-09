// Author: 4K 
import React, { useState, useMemo, useEffect } from 'react';
import { Subproject, Activity, OfficeRequirement, StaffingRequirement, OtherProgramExpense, operatingUnits } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';
import { getUserPermissions } from '../mainfunctions/TableHooks';

interface Props {
    subprojects: Subproject[];
    setSubprojects: React.Dispatch<React.SetStateAction<Subproject[]>>;
    activities: Activity[];
    setActivities: React.Dispatch<React.SetStateAction<Activity[]>>;
    officeReqs: OfficeRequirement[];
    setOfficeReqs: React.Dispatch<React.SetStateAction<OfficeRequirement[]>>;
    staffingReqs: StaffingRequirement[];
    setStaffingReqs: React.Dispatch<React.SetStateAction<StaffingRequirement[]>>;
    otherProgramExpenses: OtherProgramExpense[];
    setOtherProgramExpenses: React.Dispatch<React.SetStateAction<OtherProgramExpense[]>>;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    onSelectSubproject: (subproject: Subproject) => void;
    onSelectActivity: (activity: Activity) => void;
    onSelectOfficeReq: (item: OfficeRequirement) => void;
    onSelectStaffingReq: (item: StaffingRequirement) => void;
    onSelectOtherExpense: (item: OtherProgramExpense) => void;
}

interface FinancialItem {
    uniqueId: string;
    sourceType: 'Subproject' | 'Activity' | 'Office' | 'Staffing' | 'Other';
    sourceId: number;
    detailId?: number; // For subprojects and activity expenses
    
    // Identifiers
    uacsCode: string;
    objectType: string;
    expenseParticular: string; // The group name basically
    
    // Display Info
    sourceName: string; // Project Name, Activity Name, etc.
    
    // Financials
    targetObligationMonth: string;
    targetObligationAmount: number;
    targetDisbursementMonth: string;
    targetDisbursementAmount: number;
    
    actualObligationMonth: string;
    actualObligationAmount: number;
    actualDisbursementMonth: string;
    actualDisbursementAmount: number;

    // Monthly breakdown for actuals (specific to Staffing/Other)
    actualDisbursementJan: number;
    actualDisbursementFeb: number;
    actualDisbursementMar: number;
    actualDisbursementApr: number;
    actualDisbursementMay: number;
    actualDisbursementJun: number;
    actualDisbursementJul: number;
    actualDisbursementAug: number;
    actualDisbursementSep: number;
    actualDisbursementOct: number;
    actualDisbursementNov: number;
    actualDisbursementDec: number;

    isConfirmed: boolean; // Just a UI state for this session (or could map to 'status')
}

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Helper to get month index from YYYY-MM-DD
const getMonthFromDateStr = (dateStr: string | undefined) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length > 1) return (parseInt(parts[1]) - 1).toString();
    return '';
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
}

const FinancialAccomplishment: React.FC<Props> = ({
    subprojects, setSubprojects,
    activities, setActivities,
    officeReqs, setOfficeReqs,
    staffingReqs, setStaffingReqs,
    otherProgramExpenses, setOtherProgramExpenses,
    uacsCodes,
    onSelectSubproject, onSelectActivity,
    onSelectOfficeReq, onSelectStaffingReq, onSelectOtherExpense
}) => {
    const { currentUser } = useAuth();
    const { canEdit } = getUserPermissions(currentUser);

    const [selectedYear, setSelectedYear] = useState<number | null>(null);
    const [yearInput, setYearInput] = useState<string>(new Date().getFullYear().toString());
    const [isYearModalOpen, setIsYearModalOpen] = useState(true);
    
    const [items, setItems] = useState<FinancialItem[]>([]);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [expandedSubGroups, setExpandedSubGroups] = useState<Set<string>>(new Set());
    // Track expanded rows for monthly breakdown
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    // --- 1. Load and Normalize Data ---
    useEffect(() => {
        if (!selectedYear) return;

        const loadedItems: FinancialItem[] = [];

        // Helper for default monthly object
        const defaultMonthly = {
             actualDisbursementJan: 0, actualDisbursementFeb: 0, actualDisbursementMar: 0,
             actualDisbursementApr: 0, actualDisbursementMay: 0, actualDisbursementJun: 0,
             actualDisbursementJul: 0, actualDisbursementAug: 0, actualDisbursementSep: 0,
             actualDisbursementOct: 0, actualDisbursementNov: 0, actualDisbursementDec: 0
        };

        // Subprojects
        subprojects.filter(s => s.fundingYear === selectedYear).forEach(sp => {
            sp.details.forEach(d => {
                loadedItems.push({
                    uniqueId: `sp-${sp.id}-${d.id}`,
                    sourceType: 'Subproject',
                    sourceId: sp.id,
                    detailId: d.id,
                    uacsCode: d.uacsCode,
                    objectType: d.objectType || 'MOOE',
                    expenseParticular: d.expenseParticular || 'Unspecified',
                    sourceName: sp.name,
                    targetObligationMonth: d.obligationMonth,
                    targetObligationAmount: d.pricePerUnit * d.numberOfUnits,
                    targetDisbursementMonth: d.disbursementMonth,
                    targetDisbursementAmount: d.pricePerUnit * d.numberOfUnits,
                    actualObligationMonth: d.actualObligationDate || '',
                    actualObligationAmount: d.actualObligationAmount || 0,
                    actualDisbursementMonth: d.actualDisbursementDate || '',
                    actualDisbursementAmount: d.actualDisbursementAmount || 0,
                    ...defaultMonthly, // Not used for SP currently
                    isConfirmed: false
                });
            });
        });

        // Activities
        activities.filter(a => a.fundingYear === selectedYear).forEach(act => {
            act.expenses.forEach(e => {
                loadedItems.push({
                    uniqueId: `act-${act.id}-${e.id}`,
                    sourceType: 'Activity',
                    sourceId: act.id,
                    detailId: e.id,
                    uacsCode: e.uacsCode,
                    objectType: e.objectType || 'MOOE',
                    expenseParticular: e.expenseParticular || 'Unspecified',
                    sourceName: act.name || `${act.type} (${act.component})`,
                    targetObligationMonth: e.obligationMonth,
                    targetObligationAmount: e.amount,
                    targetDisbursementMonth: e.disbursementMonth,
                    targetDisbursementAmount: e.amount,
                    actualObligationMonth: e.actualObligationDate || '',
                    actualObligationAmount: e.actualObligationAmount || 0,
                    actualDisbursementMonth: e.actualDisbursementDate || '',
                    actualDisbursementAmount: e.actualDisbursementAmount || 0,
                    ...defaultMonthly,
                    isConfirmed: false
                });
            });
        });

        // Office Requirements
        officeReqs.filter(o => o.fundYear === selectedYear).forEach(o => {
            loadedItems.push({
                uniqueId: `office-${o.id}`,
                sourceType: 'Office',
                sourceId: o.id,
                uacsCode: o.uacsCode,
                objectType: 'MOOE',
                expenseParticular: 'Office Requirements',
                sourceName: o.equipment,
                targetObligationMonth: o.obligationDate,
                targetObligationAmount: o.pricePerUnit * o.numberOfUnits,
                targetDisbursementMonth: o.disbursementDate,
                targetDisbursementAmount: o.pricePerUnit * o.numberOfUnits,
                actualObligationMonth: o.actualObligationDate || '',
                actualObligationAmount: o.actualObligationAmount || 0,
                actualDisbursementMonth: o.actualDisbursementDate || '',
                actualDisbursementAmount: o.actualDisbursementAmount || 0,
                ...defaultMonthly,
                isConfirmed: false
            });
        });

        // Staffing Requirements (Supports Monthly Breakdown)
        staffingReqs.filter(s => s.fundYear === selectedYear).forEach(s => {
             // If expense items exist, use them. Else use root.
             // Note: Currently assumes root usage for simplification or legacy
             // If complex expense items exist in `expenses`, logic would be nested.
             // Using root-level monthly actuals based on previous logic for `StaffingRequirement`.
            
             // Check if it has breakdown in DB (StaffingRequirementDetail implies yes for root)
             const hasMonthly = true;
             
             // Map Monthly Actuals
             const monthlyActuals: any = {};
             SHORT_MONTHS.forEach(m => {
                 monthlyActuals[`actualDisbursement${m}`] = (s as any)[`actualDisbursement${m}`] || 0;
             });

             loadedItems.push({
                uniqueId: `staff-${s.id}`,
                sourceType: 'Staffing',
                sourceId: s.id,
                uacsCode: s.uacsCode,
                objectType: 'MOOE',
                expenseParticular: 'Salaries & Wages',
                sourceName: s.personnelPosition,
                targetObligationMonth: s.obligationDate,
                targetObligationAmount: s.annualSalary,
                targetDisbursementMonth: 'Monthly',
                targetDisbursementAmount: s.annualSalary,
                actualObligationMonth: s.actualObligationDate || '',
                actualObligationAmount: s.actualObligationAmount || 0,
                actualDisbursementMonth: s.actualDisbursementDate || '',
                actualDisbursementAmount: s.actualDisbursementAmount || 0,
                ...defaultMonthly, // Default
                ...monthlyActuals, // Overwrite
                isConfirmed: false
            });
        });

        // Other Program Expenses (Supports Monthly Breakdown)
        otherProgramExpenses.filter(ope => ope.fundYear === selectedYear).forEach(ope => {
            const monthlyActuals: any = {};
             SHORT_MONTHS.forEach(m => {
                 monthlyActuals[`actualDisbursement${m}`] = (ope as any)[`actualDisbursement${m}`] || 0;
             });

            loadedItems.push({
                uniqueId: `other-${ope.id}`,
                sourceType: 'Other',
                sourceId: ope.id,
                uacsCode: ope.uacsCode,
                objectType: 'MOOE',
                expenseParticular: 'Other Expenses',
                sourceName: ope.particulars,
                targetObligationMonth: ope.obligationDate,
                targetObligationAmount: ope.amount,
                targetDisbursementMonth: ope.disbursementDate,
                targetDisbursementAmount: ope.amount,
                actualObligationMonth: ope.actualObligationDate || '',
                actualObligationAmount: ope.actualObligationAmount || 0,
                actualDisbursementMonth: ope.actualDisbursementDate || '',
                actualDisbursementAmount: ope.actualDisbursementAmount || 0,
                ...defaultMonthly,
                ...monthlyActuals,
                isConfirmed: false
            });
        });

        setItems(loadedItems);
    }, [selectedYear, subprojects, activities, officeReqs, staffingReqs, otherProgramExpenses]);


    // --- 2. Grouping Logic ---
    const groupedItems = useMemo(() => {
        const groups: { [key: string]: { items: FinancialItem[], totalTargetObli: number, totalActualObli: number } } = {};
        
        items.forEach(item => {
            const key = `${item.objectType} - ${item.uacsCode}`; 
            if (!groups[key]) groups[key] = { items: [], totalTargetObli: 0, totalActualObli: 0 };
            groups[key].items.push(item);
            groups[key].totalTargetObli += item.targetObligationAmount;
            groups[key].totalActualObli += item.actualObligationAmount;
        });

        return Object.entries(groups).map(([key, data]) => ({
            key,
            ...data,
            subGroups: {
                'Subprojects': data.items.filter(i => i.sourceType === 'Subproject'),
                'Activities': data.items.filter(i => i.sourceType === 'Activity'),
                'Program Management': data.items.filter(i => ['Office', 'Staffing', 'Other'].includes(i.sourceType))
            }
        }));
    }, [items]);


    // --- 3. Handlers ---

    const handleYearConfirm = () => {
        const y = parseInt(yearInput);
        if (!isNaN(y) && y > 2000 && y < 2100) {
            setSelectedYear(y);
            setIsYearModalOpen(false);
        } else {
            alert("Please enter a valid year.");
        }
    };

    const toggleGroup = (key: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const toggleSubGroup = (key: string) => {
        setExpandedSubGroups(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const toggleRowExpansion = (uniqueId: string) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(uniqueId)) next.delete(uniqueId);
            else next.add(uniqueId);
            return next;
        });
    }

    // Update Local State for any field
    const updateLocalItem = (uniqueId: string, updates: Partial<FinancialItem>) => {
        setItems(prev => prev.map(item => item.uniqueId === uniqueId ? { ...item, ...updates } : item));
    };

    // Special handler for monthly disbursement updates to auto-sum total
    const updateLocalMonthly = (uniqueId: string, month: string, value: number) => {
        setItems(prev => prev.map(item => {
            if (item.uniqueId === uniqueId) {
                // Construct new item state
                const newItem: any = { ...item, [`actualDisbursement${month}`]: value };
                // Recalculate total
                let total = 0;
                SHORT_MONTHS.forEach(m => {
                    total += (newItem[`actualDisbursement${m}`] || 0);
                });
                newItem.actualDisbursementAmount = total;
                return newItem;
            }
            return item;
        }));
    };

    // Group level month update
    const handleGroupMonthChange = (groupKey: string, field: 'actualObligationMonth' | 'actualDisbursementMonth', monthIndex: string) => {
        const newDateStr = monthIndex === '' ? '' : `${selectedYear}-${String(parseInt(monthIndex) + 1).padStart(2, '0')}-01`;
        
        const group = groupedItems.find(g => g.key === groupKey);
        if (!group) return;

        setItems(prev => prev.map(item => {
            if (group.items.some(gi => gi.uniqueId === item.uniqueId)) {
                return { ...item, [field]: newDateStr };
            }
            return item;
        }));
    };

    const handleTitleClick = (item: FinancialItem) => {
        if (item.sourceType === 'Subproject') {
            const sp = subprojects.find(s => s.id === item.sourceId);
            if (sp) onSelectSubproject(sp);
        } else if (item.sourceType === 'Activity') {
            const act = activities.find(a => a.id === item.sourceId);
            if (act) onSelectActivity(act);
        } else if (item.sourceType === 'Office') {
            const req = officeReqs.find(r => r.id === item.sourceId);
            if (req) onSelectOfficeReq(req);
        } else if (item.sourceType === 'Staffing') {
            const req = staffingReqs.find(r => r.id === item.sourceId);
            if (req) onSelectStaffingReq(req);
        } else if (item.sourceType === 'Other') {
            const req = otherProgramExpenses.find(r => r.id === item.sourceId);
            if (req) onSelectOtherExpense(req);
        }
    };

    // Save Logic (Commit to DB)
    const handleConfirmItem = async (item: FinancialItem) => {
        if (!canEdit) return;

        try {
            if (item.sourceType === 'Subproject') {
                const sp = subprojects.find(s => s.id === item.sourceId);
                if (!sp) throw new Error("Subproject not found");
                
                const updatedDetails = sp.details.map(d => {
                    if (d.id === item.detailId) {
                        return { 
                            ...d, 
                            actualObligationDate: item.actualObligationMonth,
                            actualObligationAmount: item.actualObligationAmount,
                            actualDisbursementDate: item.actualDisbursementMonth,
                            actualDisbursementAmount: item.actualDisbursementAmount
                        };
                    }
                    return d;
                });
                
                if (supabase) await supabase.from('subprojects').update({ details: updatedDetails }).eq('id', sp.id);
                setSubprojects(prev => prev.map(s => s.id === sp.id ? { ...s, details: updatedDetails } : s));

            } else if (item.sourceType === 'Activity') {
                const act = activities.find(a => a.id === item.sourceId);
                if (!act) throw new Error("Activity not found");

                const updatedExpenses = act.expenses.map(e => {
                     if (e.id === item.detailId) {
                        return { 
                            ...e, 
                            actualObligationDate: item.actualObligationMonth,
                            actualObligationAmount: item.actualObligationAmount,
                            actualDisbursementDate: item.actualDisbursementMonth,
                            actualDisbursementAmount: item.actualDisbursementAmount
                        };
                    }
                    return e;
                });

                if (supabase) await supabase.from('activities').update({ expenses: updatedExpenses }).eq('id', act.id);
                setActivities(prev => prev.map(a => a.id === act.id ? { ...a, expenses: updatedExpenses } : a));

            } else if (item.sourceType === 'Staffing' || item.sourceType === 'Other') {
                // Handles Staffing and Other Expenses which have separate monthly columns in DB
                const table = item.sourceType === 'Staffing' ? 'staffing_requirements' : 'other_program_expenses';
                const payload: any = {
                     actualObligationDate: item.actualObligationMonth,
                     actualObligationAmount: item.actualObligationAmount,
                     // We save the aggregated amount for quick access
                     actualDisbursementAmount: item.actualDisbursementAmount,
                     // But strictly relying on the breakdown
                };
                
                // Add monthly columns
                SHORT_MONTHS.forEach(m => {
                    // @ts-ignore
                    payload[`actualDisbursement${m}`] = (item as any)[`actualDisbursement${m}`];
                });

                if (supabase) await supabase.from(table).update(payload).eq('id', item.sourceId);
                
                if (item.sourceType === 'Staffing') {
                    setStaffingReqs(prev => prev.map(s => s.id === item.sourceId ? { ...s, ...payload } : s));
                } else {
                    setOtherProgramExpenses(prev => prev.map(o => o.id === item.sourceId ? { ...o, ...payload } : o));
                }

            } else if (item.sourceType === 'Office') {
                const payload = {
                     actualObligationDate: item.actualObligationMonth,
                     actualObligationAmount: item.actualObligationAmount,
                     actualDisbursementDate: item.actualDisbursementMonth,
                     actualDisbursementAmount: item.actualDisbursementAmount
                };
                if (supabase) await supabase.from('office_requirements').update(payload).eq('id', item.sourceId);
                setOfficeReqs(prev => prev.map(o => o.id === item.sourceId ? { ...o, ...payload } : o));
            }
            
            updateLocalItem(item.uniqueId, { isConfirmed: true });

        } catch (error: any) {
            console.error("Error saving accomplishment:", error);
            alert("Failed to save changes. " + error.message);
        }
    };

    // --- Render ---

    return (
        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg min-h-screen">
             {/* Year Selection Modal */}
            {isYearModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fadeIn">
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-2xl max-w-sm w-full relative">
                        <button 
                            onClick={() => setIsYearModalOpen(false)}
                            className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                        <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Select Fund Year</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">Enter the Fund Year to load financial accomplishments.</p>
                        <input 
                            type="number" 
                            value={yearInput} 
                            onChange={(e) => setYearInput(e.target.value)} 
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-emerald-500 focus:border-emerald-500 dark:bg-gray-700 dark:text-white mb-6 text-center text-lg font-bold"
                        />
                        <div className="flex justify-end">
                            <button onClick={handleYearConfirm} className="w-full bg-emerald-600 text-white py-2 rounded-md font-semibold hover:bg-emerald-700 transition-colors">
                                Load Data
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Financial Accomplishment Collection Form</h2>
                    <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium mt-1">Fund Year: {selectedYear || 'None'}</p>
                </div>
                <button onClick={() => setIsYearModalOpen(true)} className="text-sm text-gray-500 hover:text-emerald-600 underline">Change Year</button>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-emerald-50 dark:bg-emerald-900/20">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider w-1/4">Particulars / UACS</th>
                            {/* Target Obligation */}
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-l border-gray-200 dark:border-gray-700">Target Obli (Amt)</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Target Obli (Mo)</th>
                            
                            {/* Actual Obligation */}
                            <th className="px-4 py-3 text-center text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider border-l border-emerald-200 dark:border-emerald-800 bg-emerald-100/50 dark:bg-emerald-800/30">Actual Obli (Amt)</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider bg-emerald-100/50 dark:bg-emerald-800/30">Actual Obli (Mo)</th>
                            
                            {/* Target Disbursement */}
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-l border-gray-200 dark:border-gray-700">Target Disb (Amt)</th>
                             <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Target Disb (Mo)</th>
                            
                            {/* Actual Disbursement */}
                            <th className="px-4 py-3 text-center text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider border-l border-emerald-200 dark:border-emerald-800 bg-emerald-100/50 dark:bg-emerald-800/30">Actual Disb (Amt)</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider bg-emerald-100/50 dark:bg-emerald-800/30">Actual Disb (Mo)</th>
                            
                            <th className="px-4 py-3 text-right text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                        {groupedItems.map((group) => {
                            const isExpanded = expandedGroups.has(group.key);
                            // Determine if all items have same month to display in group header
                            const commonObliMonth = group.items.every(i => i.actualObligationMonth === group.items[0].actualObligationMonth) ? group.items[0].actualObligationMonth : '';
                            const commonDisbMonth = group.items.every(i => i.actualDisbursementMonth === group.items[0].actualDisbursementMonth) ? group.items[0].actualDisbursementMonth : '';

                            return (
                                <React.Fragment key={group.key}>
                                    {/* Group Header Row */}
                                    <tr className="bg-gray-50 dark:bg-gray-700/40 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                        <td className="px-4 py-3">
                                            <button onClick={() => toggleGroup(group.key)} className="flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-white focus:outline-none group">
                                                 <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-emerald-600 transition-transform duration-200 ${isExpanded ? 'transform rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                                {group.key}
                                            </button>
                                        </td>
                                        {/* Targets Total */}
                                        <td className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700">{formatCurrency(group.totalTargetObli)}</td>
                                        <td className="px-4 py-3 text-center text-xs text-gray-400">-</td>
                                        
                                        {/* Actual Obli Total & Batch */}
                                        <td className="px-4 py-3 text-center text-xs font-bold text-emerald-600 dark:text-emerald-400 border-l border-emerald-100 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10">
                                            {formatCurrency(group.totalActualObli)}
                                        </td>
                                        <td className="px-4 py-3 text-center bg-emerald-50/50 dark:bg-emerald-900/10">
                                            {isExpanded && canEdit && (
                                                <select 
                                                    value={getMonthFromDateStr(commonObliMonth)} 
                                                    onChange={(e) => handleGroupMonthChange(group.key, 'actualObligationMonth', e.target.value)}
                                                    className="text-[10px] p-1 border rounded bg-white dark:bg-gray-700 dark:border-gray-600 w-full"
                                                >
                                                    <option value="">{commonObliMonth ? 'Mixed' : 'Batch Set...'}</option>
                                                    {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                                                </select>
                                            )}
                                        </td>
                                        
                                        {/* Target Disb Total */}
                                        <td className="px-4 py-3 text-center text-xs text-gray-500 border-l border-gray-200 dark:border-gray-700">-</td>
                                        <td className="px-4 py-3 text-center text-xs text-gray-400">-</td>

                                        {/* Actual Disb Total & Batch */}
                                        <td className="px-4 py-3 text-center text-xs text-emerald-600 border-l border-emerald-100 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10">-</td>
                                        <td className="px-4 py-3 text-center bg-emerald-50/50 dark:bg-emerald-900/10">
                                            {isExpanded && canEdit && (
                                                <select 
                                                    value={getMonthFromDateStr(commonDisbMonth)} 
                                                    onChange={(e) => handleGroupMonthChange(group.key, 'actualDisbursementMonth', e.target.value)}
                                                    className="text-[10px] p-1 border rounded bg-white dark:bg-gray-700 dark:border-gray-600 w-full"
                                                >
                                                    <option value="">{commonDisbMonth ? 'Mixed' : 'Batch Set...'}</option>
                                                    {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                                                </select>
                                            )}
                                        </td>
                                        <td className="px-4 py-3"></td>
                                    </tr>

                                    {/* Expanded Content */}
                                    {isExpanded && Object.entries(group.subGroups).map(([subKey, items]) => {
                                        if (items.length === 0) return null;
                                        const subId = `${group.key}-${subKey}`;
                                        const isSubExpanded = expandedSubGroups.has(subId);

                                        return (
                                            <React.Fragment key={subId}>
                                                <tr className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
                                                    <td colSpan={10} className="px-4 py-2 pl-8">
                                                         <button onClick={() => toggleSubGroup(subId)} className="flex items-center gap-2 text-xs font-bold uppercase text-gray-500 dark:text-gray-400 tracking-wider hover:text-emerald-600 transition-colors">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 transition-transform duration-200 ${isSubExpanded ? 'transform rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                            </svg>
                                                            {subKey} ({items.length})
                                                        </button>
                                                    </td>
                                                </tr>
                                                {isSubExpanded && items.map(item => {
                                                    const isBreakdownExpanded = expandedRows.has(item.uniqueId);
                                                    const supportsMonthly = item.sourceType === 'Staffing' || item.sourceType === 'Other';

                                                    return (
                                                    <React.Fragment key={item.uniqueId}>
                                                        <tr className="hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors border-b border-gray-100 dark:border-gray-800">
                                                            <td className="px-4 py-2 pl-12 text-sm text-gray-700 dark:text-gray-300">
                                                                <button onClick={() => handleTitleClick(item)} className="text-left hover:text-emerald-600 hover:underline focus:outline-none">
                                                                    {item.sourceName}
                                                                </button>
                                                                {/* Breakdown Toggle */}
                                                                {supportsMonthly && (
                                                                    <button onClick={() => toggleRowExpansion(item.uniqueId)} className="ml-2 text-xs text-emerald-500 hover:text-emerald-700">
                                                                        {isBreakdownExpanded ? '(Hide Monthly)' : '(Show Monthly)'}
                                                                    </button>
                                                                )}
                                                            </td>
                                                            
                                                            {/* Target Obli */}
                                                            <td className="px-2 py-2 text-center text-xs text-gray-500 border-l border-gray-100 dark:border-gray-700">
                                                                {formatCurrency(item.targetObligationAmount)}
                                                            </td>
                                                            <td className="px-2 py-2 text-center text-[10px] text-gray-400">
                                                                {item.targetObligationMonth ? new Date(item.targetObligationMonth).toLocaleDateString(undefined, {month:'short'}) : '-'}
                                                            </td>

                                                            {/* Actual Obli */}
                                                            <td className="px-2 py-2 border-l border-emerald-100 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-900/5">
                                                                <input 
                                                                    type="number" 
                                                                    value={item.actualObligationAmount || ''} 
                                                                    onChange={(e) => updateLocalItem(item.uniqueId, { actualObligationAmount: parseFloat(e.target.value) || 0 })}
                                                                    disabled={!canEdit || item.isConfirmed}
                                                                    className="w-full text-xs text-right p-1 border rounded dark:bg-gray-700 dark:border-gray-600 focus:ring-emerald-500 focus:border-emerald-500"
                                                                    placeholder="0"
                                                                />
                                                            </td>
                                                            <td className="px-2 py-2 bg-emerald-50/30 dark:bg-emerald-900/5">
                                                                <select 
                                                                    value={getMonthFromDateStr(item.actualObligationMonth)} 
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        const dateStr = val ? `${selectedYear}-${String(parseInt(val) + 1).padStart(2, '0')}-01` : '';
                                                                        updateLocalItem(item.uniqueId, { actualObligationMonth: dateStr });
                                                                    }}
                                                                    disabled={!canEdit || item.isConfirmed}
                                                                    className="w-full text-[10px] p-1 border rounded dark:bg-gray-700 dark:border-gray-600"
                                                                >
                                                                    <option value="">Month</option>
                                                                    {SHORT_MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                                                                </select>
                                                            </td>

                                                            {/* Target Disb */}
                                                            <td className="px-2 py-2 text-center text-xs text-gray-500 border-l border-gray-100 dark:border-gray-700">
                                                                {formatCurrency(item.targetDisbursementAmount)}
                                                            </td>
                                                            <td className="px-2 py-2 text-center text-[10px] text-gray-400">
                                                                {item.targetDisbursementMonth ? (item.targetDisbursementMonth.includes('-') ? new Date(item.targetDisbursementMonth).toLocaleDateString(undefined, {month:'short'}) : 'Sched') : '-'}
                                                            </td>

                                                            {/* Actual Disb */}
                                                            <td className="px-2 py-2 border-l border-emerald-100 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-900/5">
                                                                {supportsMonthly ? (
                                                                     <span className="block text-right text-xs font-semibold px-2">{formatCurrency(item.actualDisbursementAmount)}</span>
                                                                ) : (
                                                                    <input 
                                                                        type="number" 
                                                                        value={item.actualDisbursementAmount || ''} 
                                                                        onChange={(e) => updateLocalItem(item.uniqueId, { actualDisbursementAmount: parseFloat(e.target.value) || 0 })}
                                                                        disabled={!canEdit || item.isConfirmed}
                                                                        className="w-full text-xs text-right p-1 border rounded dark:bg-gray-700 dark:border-gray-600 focus:ring-emerald-500 focus:border-emerald-500"
                                                                        placeholder="0"
                                                                    />
                                                                )}
                                                            </td>
                                                            <td className="px-2 py-2 bg-emerald-50/30 dark:bg-emerald-900/5">
                                                                {supportsMonthly ? (
                                                                    <span className="block text-center text-[10px] text-gray-500">See below</span>
                                                                ) : (
                                                                    <select 
                                                                        value={getMonthFromDateStr(item.actualDisbursementMonth)} 
                                                                        onChange={(e) => {
                                                                            const val = e.target.value;
                                                                            const dateStr = val ? `${selectedYear}-${String(parseInt(val) + 1).padStart(2, '0')}-01` : '';
                                                                            updateLocalItem(item.uniqueId, { actualDisbursementMonth: dateStr });
                                                                        }}
                                                                        disabled={!canEdit || item.isConfirmed}
                                                                        className="w-full text-[10px] p-1 border rounded dark:bg-gray-700 dark:border-gray-600"
                                                                    >
                                                                        <option value="">Month</option>
                                                                        {SHORT_MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                                                                    </select>
                                                                )}
                                                            </td>

                                                            <td className="px-4 py-2 text-right">
                                                                {canEdit && (
                                                                    <button 
                                                                        onClick={() => handleConfirmItem(item)}
                                                                        disabled={item.isConfirmed}
                                                                        className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                                                                            item.isConfirmed 
                                                                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                                                                : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                                                                        }`}
                                                                    >
                                                                        {item.isConfirmed ? 'Saved' : 'Save'}
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                        {/* Expandable Monthly Breakdown */}
                                                        {isBreakdownExpanded && supportsMonthly && (
                                                            <tr className="bg-gray-50 dark:bg-gray-700/30 animate-fadeIn">
                                                                <td colSpan={10} className="px-4 py-3">
                                                                    <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-2">
                                                                        {SHORT_MONTHS.map(m => (
                                                                            <div key={m} className="flex flex-col">
                                                                                <label className="text-[9px] uppercase font-bold text-gray-500 mb-1">{m}</label>
                                                                                <input 
                                                                                    type="number" 
                                                                                    // @ts-ignore
                                                                                    value={item[`actualDisbursement${m}`] || ''}
                                                                                    onChange={(e) => updateLocalMonthly(item.uniqueId, m, parseFloat(e.target.value) || 0)}
                                                                                    disabled={!canEdit || item.isConfirmed}
                                                                                    className="w-full text-xs p-1 border border-emerald-200 dark:border-emerald-800 rounded focus:ring-emerald-500"
                                                                                    placeholder="0"
                                                                                />
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                )})}
                                            </React.Fragment>
                                        );
                                    })}
                                </React.Fragment>
                            );
                        })}
                        {groupedItems.length === 0 && (
                            <tr>
                                <td colSpan={10} className="px-6 py-8 text-center text-gray-500 italic">No financial items found for the selected year.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default FinancialAccomplishment;