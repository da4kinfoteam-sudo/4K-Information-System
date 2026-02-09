// Author: 4K 
import React, { useState, useMemo, useEffect } from 'react';
import { Subproject, Activity, OfficeRequirement, StaffingRequirement, OtherProgramExpense, operatingUnits, fundTypes, tiers, FundType, Tier } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';
import { getUserPermissions } from '../mainfunctions/TableHooks';
import useLocalStorageState from '../../hooks/useLocalStorageState';

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
  // Round up to nearest whole number
  const rounded = Math.ceil(amount);
  return new Intl.NumberFormat('en-PH', { 
      style: 'currency', 
      currency: 'PHP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0 
  }).format(rounded);
}

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm text-gray-900 dark:text-white";

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
    const { canEdit, canViewAll } = getUserPermissions(currentUser);

    // Filter States (Persistent)
    const [selectedYear, setSelectedYear] = useLocalStorageState<number | null>('fin_selectedYear', null);
    const [selectedOu, setSelectedOu] = useLocalStorageState<string>('fin_selectedOu', 'All');
    const [selectedTier, setSelectedTier] = useLocalStorageState<string>('fin_selectedTier', 'Tier 1');
    const [selectedFundType, setSelectedFundType] = useLocalStorageState<string>('fin_selectedFundType', 'Current');
    
    // Filter States (Form/Modal)
    const [formYear, setFormYear] = useState<string>(selectedYear ? selectedYear.toString() : new Date().getFullYear().toString());
    const [formOu, setFormOu] = useState<string>(selectedOu);
    const [formTier, setFormTier] = useState<string>(selectedTier);
    const [formFundType, setFormFundType] = useState<string>(selectedFundType);

    // Only open modal if no year is selected (first load or cleared)
    const [isYearModalOpen, setIsYearModalOpen] = useState(!selectedYear);
    
    const [items, setItems] = useState<FinancialItem[]>([]);
    
    // Persistent Expansion States (Stored as Arrays in localStorage)
    const [expandedObjectTypes, setExpandedObjectTypes] = useLocalStorageState<string[]>('fin_expandedObjectTypes', ['MOOE', 'CO']);
    const [expandedGroups, setExpandedGroups] = useLocalStorageState<string[]>('fin_expandedGroups', []);
    const [expandedSubGroups, setExpandedSubGroups] = useLocalStorageState<string[]>('fin_expandedSubGroups', []);
    const [expandedRows, setExpandedRows] = useLocalStorageState<string[]>('fin_expandedRows', []);

    // Initialize User OU lock
    useEffect(() => {
        if (currentUser && currentUser.role === 'User') {
            setFormOu(currentUser.operatingUnit);
            setSelectedOu(currentUser.operatingUnit);
        }
    }, [currentUser]);

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

        // General Filter Check
        const matchesFilters = (item: any) => {
            const itemYear = item.fundingYear || item.fundYear;
            // Year check
            if (itemYear !== selectedYear) return false;
            // OU check
            if (selectedOu !== 'All' && item.operatingUnit !== selectedOu) return false;
            // Tier check
            if (selectedTier !== 'All' && item.tier !== selectedTier) return false;
            // Fund Type check
            if (selectedFundType !== 'All' && item.fundType !== selectedFundType) return false;

            return true;
        };

        // Subprojects
        subprojects.filter(matchesFilters).forEach(sp => {
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
        activities.filter(matchesFilters).forEach(act => {
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
        officeReqs.filter(matchesFilters).forEach(o => {
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
        staffingReqs.filter(matchesFilters).forEach(s => {
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
        otherProgramExpenses.filter(matchesFilters).forEach(ope => {
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
    }, [selectedYear, selectedOu, selectedTier, selectedFundType, subprojects, activities, officeReqs, staffingReqs, otherProgramExpenses]);


    // --- 2. Grouping Logic ---
    const groupedItems = useMemo(() => {
        const typeGroups: { [key: string]: { uacsMap: { [code: string]: { items: FinancialItem[], description: string, totalTargetObli: number, totalActualObli: number } } } } = {};

        items.forEach(item => {
            const type = item.objectType || 'Unspecified';
            const code = item.uacsCode || 'No Code';

            if (!typeGroups[type]) {
                typeGroups[type] = { uacsMap: {} };
            }

            if (!typeGroups[type].uacsMap[code]) {
                // Find description from UACS Codes prop
                let desc = '';
                if (uacsCodes[type]) {
                    for (const part in uacsCodes[type]) {
                        if (uacsCodes[type][part][code]) {
                            desc = uacsCodes[type][part][code];
                            break;
                        }
                    }
                }
                
                typeGroups[type].uacsMap[code] = {
                    items: [],
                    description: desc,
                    totalTargetObli: 0,
                    totalActualObli: 0
                };
            }

            const group = typeGroups[type].uacsMap[code];
            group.items.push(item);
            group.totalTargetObli += item.targetObligationAmount;
            group.totalActualObli += item.actualObligationAmount;
        });

        // Convert to array structure for rendering
        return Object.entries(typeGroups).map(([type, data]) => ({
            objectType: type,
            uacsGroups: Object.entries(data.uacsMap).map(([code, groupData]) => ({
                uacsCode: code,
                description: groupData.description,
                key: `${type}-${code}`,
                items: groupData.items,
                totalTargetObli: groupData.totalTargetObli,
                totalActualObli: groupData.totalActualObli,
                subGroups: {
                    'Subprojects': groupData.items.filter(i => i.sourceType === 'Subproject'),
                    'Activities': groupData.items.filter(i => i.sourceType === 'Activity'),
                    'Program Management': groupData.items.filter(i => ['Office', 'Staffing', 'Other'].includes(i.sourceType))
                }
            })).sort((a, b) => a.uacsCode.localeCompare(b.uacsCode))
        })).sort((a, b) => a.objectType.localeCompare(b.objectType));
    }, [items, uacsCodes]);

    // --- 2.1 Grand Total Calculation ---
    const grandTotals = useMemo(() => {
        return items.reduce((acc, item) => ({
            targetObli: acc.targetObli + (item.targetObligationAmount || 0),
            actualObli: acc.actualObli + (item.actualObligationAmount || 0),
            targetDisb: acc.targetDisb + (item.targetDisbursementAmount || 0),
            actualDisb: acc.actualDisb + (item.actualDisbursementAmount || 0)
        }), { targetObli: 0, actualObli: 0, targetDisb: 0, actualDisb: 0 });
    }, [items]);


    // --- 3. Handlers ---

    const handleLoadData = () => {
        const y = parseInt(formYear);
        if (!isNaN(y) && y > 2000 && y < 2100) {
            setSelectedYear(y);
            setSelectedOu(formOu);
            setSelectedTier(formTier);
            setSelectedFundType(formFundType);
            setIsYearModalOpen(false);
        } else {
            alert("Please enter a valid year.");
        }
    };

    const toggleObjectType = (type: string) => {
        setExpandedObjectTypes(prev => {
            if (prev.includes(type)) return prev.filter(t => t !== type);
            return [...prev, type];
        });
    };

    const toggleGroup = (key: string) => {
        setExpandedGroups(prev => {
            if (prev.includes(key)) return prev.filter(k => k !== key);
            return [...prev, key];
        });
    };

    const toggleSubGroup = (key: string) => {
        setExpandedSubGroups(prev => {
            if (prev.includes(key)) return prev.filter(k => k !== key);
            return [...prev, key];
        });
    };

    const toggleRowExpansion = (uniqueId: string) => {
        setExpandedRows(prev => {
            if (prev.includes(uniqueId)) return prev.filter(id => id !== uniqueId);
            return [...prev, uniqueId];
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
        
        let targetGroupItems: FinancialItem[] = [];
        for (const typeGroup of groupedItems) {
            const found = typeGroup.uacsGroups.find(ug => ug.key === groupKey);
            if (found) {
                targetGroupItems = found.items;
                break;
            }
        }
        if (targetGroupItems.length === 0) return;

        setItems(prev => prev.map(item => {
            if (targetGroupItems.some(gi => gi.uniqueId === item.uniqueId)) {
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
             {/* Load Data Modal */}
            {isYearModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fadeIn">
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-2xl max-w-md w-full relative">
                        {selectedYear && (
                             <button 
                                onClick={() => setIsYearModalOpen(false)}
                                className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                        <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-6 border-b pb-2 dark:border-gray-700">Filter Financial Data</h3>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fund Year</label>
                                <input 
                                    type="number" 
                                    value={formYear} 
                                    onChange={(e) => setFormYear(e.target.value)} 
                                    className={commonInputClasses}
                                    placeholder="Enter Year (e.g. 2024)"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Operating Unit</label>
                                <select 
                                    value={formOu} 
                                    onChange={(e) => setFormOu(e.target.value)} 
                                    disabled={currentUser?.role === 'User'}
                                    className={`${commonInputClasses} disabled:opacity-70 disabled:cursor-not-allowed`}
                                >
                                    <option value="All">All OUs</option>
                                    {operatingUnits.map(ou => (
                                        <option key={ou} value={ou}>{ou}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tier</label>
                                <select 
                                    value={formTier} 
                                    onChange={(e) => setFormTier(e.target.value)} 
                                    className={commonInputClasses}
                                >
                                    <option value="All">All Tiers</option>
                                    {tiers.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fund Type</label>
                                <select 
                                    value={formFundType} 
                                    onChange={(e) => setFormFundType(e.target.value)} 
                                    className={commonInputClasses}
                                >
                                    <option value="All">All Fund Types</option>
                                    {fundTypes.map(f => <option key={f} value={f}>{f}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="mt-8 flex justify-end">
                            <button onClick={handleLoadData} className="w-full bg-emerald-600 text-white py-2 rounded-md font-semibold hover:bg-emerald-700 transition-colors">
                                Load Data
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Financial Accomplishment Collection Form</h2>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex gap-2">
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">Year: {selectedYear || 'None'}</span>
                        <span>|</span>
                        <span>OU: {selectedOu}</span>
                        <span>|</span>
                        <span>Tier: {selectedTier}</span>
                        <span>|</span>
                        <span>Fund: {selectedFundType}</span>
                    </div>
                </div>
                <button onClick={() => setIsYearModalOpen(true)} className="text-sm text-gray-500 hover:text-emerald-600 underline">Change Filter</button>
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
                        {groupedItems.map((typeGroup) => {
                            const isTypeExpanded = expandedObjectTypes.includes(typeGroup.objectType);
                            return (
                                <React.Fragment key={typeGroup.objectType}>
                                    {/* Level 1: Object Type Header (Container) */}
                                    <tr className="bg-emerald-200/80 dark:bg-gray-700/80 border-b-2 border-emerald-300 dark:border-gray-600">
                                        <td colSpan={10} className="px-4 py-3">
                                            <button onClick={() => toggleObjectType(typeGroup.objectType)} className="flex items-center gap-2 text-md font-bold text-emerald-900 dark:text-white focus:outline-none group w-full">
                                                 <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-emerald-700 dark:text-emerald-400 transition-transform duration-200 ${isTypeExpanded ? 'transform rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                                {typeGroup.objectType}
                                            </button>
                                        </td>
                                    </tr>

                                    {/* Level 2: UACS Groups */}
                                    {isTypeExpanded && typeGroup.uacsGroups.map((group) => {
                                        const isExpanded = expandedGroups.includes(group.key);
                                        // Determine if all items have same month to display in group header
                                        const commonObliMonth = group.items.every(i => i.actualObligationMonth === group.items[0].actualObligationMonth) ? group.items[0].actualObligationMonth : '';
                                        const commonDisbMonth = group.items.every(i => i.actualDisbursementMonth === group.items[0].actualDisbursementMonth) ? group.items[0].actualDisbursementMonth : '';

                                        return (
                                            <React.Fragment key={group.key}>
                                                {/* Group Header Row (UACS) */}
                                                <tr className="bg-emerald-50 dark:bg-gray-700/40 hover:bg-emerald-100 dark:hover:bg-gray-700 transition-colors border-b border-gray-200 dark:border-gray-700 border-l-4 border-l-emerald-400 dark:border-l-emerald-600">
                                                    <td className="px-4 py-3 pl-8">
                                                        <button onClick={() => toggleGroup(group.key)} className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200 focus:outline-none group text-left w-full">
                                                             <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-emerald-500 transition-transform duration-200 ${isExpanded ? 'transform rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                            </svg>
                                                            <span>
                                                                <span className="font-mono text-gray-500 dark:text-gray-400 mr-2">{group.uacsCode}</span>
                                                                {group.description}
                                                            </span>
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

                                                {/* Expanded Content (Subgroups) */}
                                                {isExpanded && Object.entries(group.subGroups).map(([subKey, items]) => {
                                                    if (items.length === 0) return null;
                                                    const subId = `${group.key}-${subKey}`;
                                                    const isSubExpanded = expandedSubGroups.includes(subId);

                                                    return (
                                                        <React.Fragment key={subId}>
                                                            <tr className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
                                                                <td colSpan={10} className="px-4 py-2 pl-12">
                                                                     <button onClick={() => toggleSubGroup(subId)} className="flex items-center gap-2 text-xs font-bold uppercase text-gray-500 dark:text-gray-400 tracking-wider hover:text-emerald-600 transition-colors">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 transition-transform duration-200 ${isSubExpanded ? 'transform rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                                        </svg>
                                                                        {subKey} ({items.length})
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                            {isSubExpanded && items.map(item => {
                                                                const isBreakdownExpanded = expandedRows.includes(item.uniqueId);
                                                                const supportsMonthly = item.sourceType === 'Staffing' || item.sourceType === 'Other';

                                                                return (
                                                                <React.Fragment key={item.uniqueId}>
                                                                    <tr className="hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors border-b border-gray-100 dark:border-gray-800">
                                                                        <td className="px-4 py-2 pl-16 text-sm text-gray-700 dark:text-gray-300">
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
                                                                                    className={`px-3 py-1 rounded text-xs font-bold transition-all flex items-center justify-center gap-1 w-full ${
                                                                                        item.isConfirmed 
                                                                                            ? 'bg-gray-100 text-gray-500 cursor-not-allowed border border-gray-300' 
                                                                                            : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                                                                                    }`}
                                                                                >
                                                                                    {item.isConfirmed ? (
                                                                                        <>
                                                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                                            </svg>
                                                                                            Saved
                                                                                        </>
                                                                                    ) : 'Save'}
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
                                </React.Fragment>
                            )
                        })}
                        {groupedItems.length === 0 && (
                            <tr>
                                <td colSpan={10} className="px-6 py-8 text-center text-gray-500 italic">No financial items found for the selected criteria.</td>
                            </tr>
                        )}
                    </tbody>
                    <tfoot className="bg-emerald-100 dark:bg-emerald-900 border-t-2 border-emerald-300 dark:border-emerald-700 font-bold">
                        <tr>
                            <td className="px-4 py-3 text-right text-emerald-900 dark:text-emerald-100">GRAND TOTAL</td>
                            <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300 border-l border-emerald-200 dark:border-emerald-800">{formatCurrency(grandTotals.targetObli)}</td>
                            <td className="px-4 py-3"></td>
                            <td className="px-4 py-3 text-center text-emerald-800 dark:text-emerald-300 border-l border-emerald-200 dark:border-emerald-800">{formatCurrency(grandTotals.actualObli)}</td>
                            <td className="px-4 py-3"></td>
                            <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300 border-l border-emerald-200 dark:border-emerald-800">{formatCurrency(grandTotals.targetDisb)}</td>
                            <td className="px-4 py-3"></td>
                            <td className="px-4 py-3 text-center text-emerald-800 dark:text-emerald-300 border-l border-emerald-200 dark:border-emerald-800">{formatCurrency(grandTotals.actualDisb)}</td>
                            <td className="px-4 py-3"></td>
                            <td className="px-4 py-3"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

export default FinancialAccomplishment;