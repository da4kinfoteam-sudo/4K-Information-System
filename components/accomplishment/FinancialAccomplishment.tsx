
// Author: 4K 
import React, { useState, useMemo, useEffect } from 'react';
import { Subproject, Activity, OfficeRequirement, StaffingRequirement, OtherProgramExpense, operatingUnits, fundTypes, tiers, FundType, Tier } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';
import { useUserAccess } from '../mainfunctions/TableHooks';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import { MonthYearPicker } from '../ui/MonthYearPicker';
import { Undo2, Loader2, CheckCircle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

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
    budgetParticular?: string; // For subprojects, the specific item name
    
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

    status: string; // Added status field
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
    const { canEdit, canViewAll } = useUserAccess('Accomplishment Forms (Financial, Physical)');

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
    
    const [isLoading, setIsLoading] = useState(false);
    const [originalItems, setOriginalItems] = useState<FinancialItem[]>([]);
    const [items, setItems] = useState<FinancialItem[]>([]);
    const [changedItems, setChangedItems] = useState<Map<string, FinancialItem>>(new Map());
    const [isSavingAll, setIsSavingAll] = useState(false);
    const [isSaveConfirmOpen, setIsSaveConfirmOpen] = useState(false);
    const [saveSuccessMessage, setSaveSuccessMessage] = useState('');
    
    type SortKey = 'targetObligationAmount' | 'targetObligationMonth' | 'actualObligationAmount' | 'actualObligationMonth' | 'targetDisbursementAmount' | 'targetDisbursementMonth' | 'actualDisbursementAmount' | 'actualDisbursementMonth';
    const [sortConfig, setSortConfig] = useState<{ key: SortKey, direction: 'asc' | 'desc' } | null>(null);
    
    // Persistent Expansion States (Stored as Arrays in localStorage)
    const [expandedObjectTypes, setExpandedObjectTypes] = useLocalStorageState<string[]>('fin_expandedObjectTypes', ['MOOE', 'CO']);
    const [expandedGroups, setExpandedGroups] = useLocalStorageState<string[]>('fin_expandedGroups', []);
    const [expandedSubGroups, setExpandedSubGroups] = useLocalStorageState<string[]>('fin_expandedSubGroups', []);
    const [expandedRows, setExpandedRows] = useLocalStorageState<string[]>('fin_expandedRows', []);

    // Initialize User OU lock based on permissions
    useEffect(() => {
        if (!canViewAll && currentUser) {
            setFormOu(currentUser.operatingUnit);
            setSelectedOu(currentUser.operatingUnit);
        }
    }, [currentUser, canViewAll]);

    // --- 1. Load and Normalize Data ---
    useEffect(() => {
        if (!selectedYear) return;
        setIsLoading(true);

        const timer = setTimeout(() => {
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
        (subprojects || []).filter(matchesFilters).forEach(sp => {
            (sp.details || []).forEach(d => {
                loadedItems.push({
                    uniqueId: `sp-${sp.id}-${d.id}`,
                    sourceType: 'Subproject',
                    sourceId: sp.id,
                    detailId: d.id,
                    uacsCode: d.uacsCode,
                    objectType: d.objectType || 'MOOE',
                    expenseParticular: d.expenseParticular || 'Unspecified',
                    sourceName: sp.name,
                    budgetParticular: d.particulars,
                    targetObligationMonth: d.obligationMonth,
                    targetObligationAmount: d.pricePerUnit * d.numberOfUnits,
                    targetDisbursementMonth: d.disbursementMonth,
                    targetDisbursementAmount: d.pricePerUnit * d.numberOfUnits,
                    actualObligationMonth: d.actualObligationDate || '',
                    actualObligationAmount: d.actualObligationAmount || 0,
                    actualDisbursementMonth: d.actualDisbursementDate || '',
                    actualDisbursementAmount: d.actualDisbursementAmount || 0,
                    status: sp.status,
                    ...defaultMonthly, // Not used for SP currently
                    isConfirmed: false
                });
            });
        });

        // Activities
        (activities || []).filter(matchesFilters).forEach(act => {
            (act.expenses || []).forEach(e => {
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
                    status: act.status,
                    ...defaultMonthly,
                    isConfirmed: false
                });
            });
        });

        // Office Requirements
        (officeReqs || []).filter(matchesFilters).forEach(o => {
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
                status: o.status,
                ...defaultMonthly,
                isConfirmed: false
            });
        });

        // Staffing Requirements (Supports Monthly Breakdown)
        (staffingReqs || []).filter(matchesFilters).forEach(s => {
            if (s.expenses && s.expenses.length > 0) {
                (s.expenses || []).forEach(e => {
                    const monthlyActuals: any = {};
                    SHORT_MONTHS.forEach(m => {
                        monthlyActuals[`actualDisbursement${m}`] = (e as any)[`actualDisbursement${m}`] || 0;
                    });

                    loadedItems.push({
                        uniqueId: `staff-${s.id}-${e.id}`,
                        sourceType: 'Staffing',
                        sourceId: s.id,
                        detailId: e.id,
                        uacsCode: e.uacsCode,
                        objectType: e.objectType || 'MOOE',
                        expenseParticular: e.expenseParticular || 'Salaries & Wages',
                        sourceName: s.personnelPosition,
                        targetObligationMonth: e.obligationDate,
                        targetObligationAmount: e.amount,
                        targetDisbursementMonth: 'Monthly',
                        targetDisbursementAmount: e.amount,
                        actualObligationMonth: e.actualObligationDate || '',
                        actualObligationAmount: e.actualObligationAmount || 0,
                        actualDisbursementMonth: e.actualDisbursementDate || '',
                        actualDisbursementAmount: e.actualDisbursementAmount || 0,
                        status: s.hiringStatus,
                        ...defaultMonthly,
                        ...monthlyActuals,
                        isConfirmed: false
                    });
                });
            } else {
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
                    status: s.hiringStatus,
                    ...defaultMonthly, // Default
                    ...monthlyActuals, // Overwrite
                    isConfirmed: false
                });
            }
        });

        // Other Program Expenses (Supports Monthly Breakdown)
        (otherProgramExpenses || []).filter(matchesFilters).forEach(ope => {
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
                status: ope.status,
                ...defaultMonthly,
                ...monthlyActuals,
                isConfirmed: false
            });
        });

        setItems(loadedItems);
        setOriginalItems(loadedItems);
        setIsLoading(false);
        }, 10);
        return () => clearTimeout(timer);
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
        const groupItemsBySource = (items: FinancialItem[]) => {
            const map = new Map<number, { sourceId: number, sourceName: string, items: FinancialItem[], targetObligationAmount: number, actualObligationAmount: number, targetDisbursementAmount: number, actualDisbursementAmount: number }>();
            items.forEach(item => {
                if (!map.has(item.sourceId)) {
                    map.set(item.sourceId, {
                        sourceId: item.sourceId,
                        sourceName: item.sourceName,
                        items: [],
                        targetObligationAmount: 0,
                        actualObligationAmount: 0,
                        targetDisbursementAmount: 0,
                        actualDisbursementAmount: 0,
                    });
                }
                const g = map.get(item.sourceId)!;
                g.items.push(item);
                g.targetObligationAmount += item.targetObligationAmount || 0;
                g.actualObligationAmount += item.actualObligationAmount || 0;
                g.targetDisbursementAmount += item.targetDisbursementAmount || 0;
                g.actualDisbursementAmount += item.actualDisbursementAmount || 0;
            });
            return Array.from(map.values());
        };

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
                    'Subprojects': groupItemsBySource(groupData.items.filter(i => i.sourceType === 'Subproject')),
                    'Activities': groupItemsBySource(groupData.items.filter(i => i.sourceType === 'Activity')),
                    'Program Management': groupItemsBySource(groupData.items.filter(i => ['Office', 'Staffing', 'Other'].includes(i.sourceType)))
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
        setItems(prev => prev.map(item => {
            if (item.uniqueId === uniqueId) {
                const newItem = { ...item, ...updates };
                setChangedItems(prevMap => {
                    const newMap = new Map(prevMap);
                    newMap.set(uniqueId, newItem);
                    return newMap;
                });
                return newItem;
            }
            return item;
        }));
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
                
                setChangedItems(prevMap => {
                    const newMap = new Map(prevMap);
                    newMap.set(uniqueId, newItem);
                    return newMap;
                });
                
                return newItem;
            }
            return item;
        }));
    };

    // Group level month update
    const handleGroupMonthChange = (groupKey: string, field: 'actualObligationMonth' | 'actualDisbursementMonth', dateStr: string) => {
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
                const updated = { ...item, [field]: dateStr };
                setChangedItems(prevMap => {
                    const newMap = new Map(prevMap);
                    newMap.set(item.uniqueId, updated);
                    return newMap;
                });
                return updated;
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

    const saveItemToDB = async (item: FinancialItem) => {
        if (item.sourceType === 'Subproject') {
            const sp = subprojects.find(s => s.id === item.sourceId);
            if (!sp) throw new Error("Subproject not found");
            
            const updatedDetails = sp.details.map(d => {
                if (d.id === item.detailId) {
                    const updated = { 
                        ...d, 
                        actualObligationDate: item.actualObligationMonth,
                        actualObligationAmount: item.actualObligationAmount,
                        actualDisbursementDate: item.actualDisbursementMonth,
                        actualDisbursementAmount: item.actualDisbursementAmount
                    };
                    // Update targets if Proposed
                    if (item.status === 'Proposed') {
                        updated.obligationMonth = item.targetObligationMonth;
                        updated.disbursementMonth = item.targetDisbursementMonth;
                        updated.pricePerUnit = item.targetObligationAmount;
                        updated.numberOfUnits = 1;
                    }
                    return updated;
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
                    const updated = { 
                        ...e, 
                        actualObligationDate: item.actualObligationMonth,
                        actualObligationAmount: item.actualObligationAmount,
                        actualDisbursementDate: item.actualDisbursementMonth,
                        actualDisbursementAmount: item.actualDisbursementAmount
                    };
                    // Update targets if Proposed
                    if (item.status === 'Proposed') {
                        updated.obligationMonth = item.targetObligationMonth;
                        updated.disbursementMonth = item.targetDisbursementMonth;
                        updated.amount = item.targetObligationAmount;
                    }
                    return updated;
                }
                return e;
            });

            if (supabase) await supabase.from('activities').update({ expenses: updatedExpenses }).eq('id', act.id);
            setActivities(prev => prev.map(a => a.id === act.id ? { ...a, expenses: updatedExpenses } : a));

        } else if (item.sourceType === 'Staffing') {
            const s = staffingReqs.find(req => req.id === item.sourceId);
            if (!s) throw new Error("Staffing Requirement not found");

            let payload: any = {};
            let updatedExpenses = s.expenses || [];

            if (item.detailId) {
                updatedExpenses = updatedExpenses.map(e => {
                    if (e.id === item.detailId) {
                        const updatedExpense: any = {
                            ...e,
                            actualObligationDate: item.actualObligationMonth,
                            actualObligationAmount: item.actualObligationAmount,
                            actualDisbursementDate: item.actualDisbursementMonth,
                            actualDisbursementAmount: item.actualDisbursementAmount
                        };
                        SHORT_MONTHS.forEach(m => {
                            updatedExpense[`actualDisbursement${m}`] = (item as any)[`actualDisbursement${m}`];
                        });
                        // Update targets if Proposed
                        if (item.status === 'Proposed') {
                            updatedExpense.obligationDate = item.targetObligationMonth;
                            updatedExpense.amount = item.targetObligationAmount;
                        }
                        return updatedExpense;
                    }
                    return e;
                });

                // Aggregate totals for the root
                let totalActualObli = 0;
                let totalActualDisb = 0;
                const monthlyTotals: any = {};
                SHORT_MONTHS.forEach(m => monthlyTotals[`actualDisbursement${m}`] = 0);

                updatedExpenses.forEach(e => {
                    totalActualObli += (e.actualObligationAmount || 0);
                    totalActualDisb += (e.actualDisbursementAmount || 0);
                    SHORT_MONTHS.forEach(m => {
                        monthlyTotals[`actualDisbursement${m}`] += (e as any)[`actualDisbursement${m}`] || 0;
                    });
                });

                payload = {
                    expenses: updatedExpenses,
                    actualObligationAmount: totalActualObli,
                    actualDisbursementAmount: totalActualDisb,
                    ...monthlyTotals
                };
                
                if (item.actualObligationMonth && !s.actualObligationDate) {
                    payload.actualObligationDate = item.actualObligationMonth;
                }

                if (item.status === 'Proposed') {
                    payload.obligationDate = item.targetObligationMonth;
                    payload.annualSalary = item.targetObligationAmount;
                }

            } else {
                payload = {
                     actualObligationDate: item.actualObligationMonth,
                     actualObligationAmount: item.actualObligationAmount,
                     actualDisbursementAmount: item.actualDisbursementAmount,
                };
                SHORT_MONTHS.forEach(m => {
                    payload[`actualDisbursement${m}`] = (item as any)[`actualDisbursement${m}`];
                });
                if (item.status === 'Proposed') {
                    payload.obligationDate = item.targetObligationMonth;
                    payload.annualSalary = item.targetObligationAmount;
                }
            }

            if (supabase) await supabase.from('staffing_requirements').update(payload).eq('id', item.sourceId);
            setStaffingReqs(prev => prev.map(req => req.id === item.sourceId ? { ...req, ...payload } : req));

        } else if (item.sourceType === 'Other') {
            const payload: any = {
                 actualObligationDate: item.actualObligationMonth,
                 actualObligationAmount: item.actualObligationAmount,
                 actualDisbursementAmount: item.actualDisbursementAmount,
            };
            
            SHORT_MONTHS.forEach(m => {
                payload[`actualDisbursement${m}`] = (item as any)[`actualDisbursement${m}`];
            });

            if (item.status === 'Proposed') {
                payload.obligationDate = item.targetObligationMonth;
                payload.disbursementDate = item.targetDisbursementMonth;
                payload.amount = item.targetObligationAmount;
            }

            if (supabase) await supabase.from('other_program_expenses').update(payload).eq('id', item.sourceId);
            setOtherProgramExpenses(prev => prev.map(o => o.id === item.sourceId ? { ...o, ...payload } : o));
        } else if (item.sourceType === 'Office') {
            const payload: any = {
                 actualObligationDate: item.actualObligationMonth,
                 actualObligationAmount: item.actualObligationAmount,
                 actualDisbursementDate: item.actualDisbursementMonth,
                 actualDisbursementAmount: item.actualDisbursementAmount
            };
            if (item.status === 'Proposed') {
                payload.obligationDate = item.targetObligationMonth;
                payload.disbursementDate = item.targetDisbursementMonth;
                payload.pricePerUnit = item.targetObligationAmount;
                payload.numberOfUnits = 1;
            }
            if (supabase) await supabase.from('office_requirements').update(payload).eq('id', item.sourceId);
            setOfficeReqs(prev => prev.map(o => o.id === item.sourceId ? { ...o, ...payload } : o));
        }
    };

    const undoLocalItem = (uniqueId: string) => {
        const original = originalItems.find(i => i.uniqueId === uniqueId);
        if (original) {
            setItems(prev => prev.map(item => item.uniqueId === uniqueId ? original : item));
            setChangedItems(prev => {
                const next = new Map(prev);
                next.delete(uniqueId);
                return next;
            });
        }
    };

    const handleSort = (key: SortKey) => {
        setSortConfig(prev => {
            if (prev?.key === key) {
                if (prev.direction === 'asc') return { key, direction: 'desc' };
                return null; // clear sort
            }
            return { key, direction: 'asc' };
        });
    };

    const SortIcon = (key: SortKey) => {
        if (sortConfig?.key !== key) return <ArrowUpDown className="inline-block w-3 h-3 ml-1 text-gray-400" />;
        return sortConfig.direction === 'asc' ? <ArrowUp className="inline-block w-3 h-3 ml-1 text-emerald-500" /> : <ArrowDown className="inline-block w-3 h-3 ml-1 text-emerald-500" />;
    };

    const handleSaveAllClick = () => {
        if (!canEdit || changedItems.size === 0) return;
        setIsSaveConfirmOpen(true);
    };

    const confirmSaveAll = async () => {
        setIsSaveConfirmOpen(false);
        setIsSavingAll(true);
        try {
            const promises = Array.from(changedItems.values()).map((item: FinancialItem) => saveItemToDB(item));
            await Promise.all(promises);
            
            // Mark as saved and clear changes (but don't lock)
            setItems(prev => prev.map(item => {
                if (changedItems.has(item.uniqueId)) {
                    return { ...item, isConfirmed: false };
                }
                return item;
            }));
            setChangedItems(new Map());
            setSaveSuccessMessage('Changes saved successfully!');
            setTimeout(() => setSaveSuccessMessage(''), 3000);
        } catch (error: any) {
            console.error("Error saving all changes:", error);
            alert("Failed to save some changes. " + error.message);
        } finally {
            setIsSavingAll(false);
        }
    };

    const handleConfirmItem = async (item: FinancialItem) => {
        if (!canEdit) return;

        try {
            await saveItemToDB(item);
            
            updateLocalItem(item.uniqueId, { isConfirmed: false });
            setChangedItems(prev => {
                const newMap = new Map(prev);
                newMap.delete(item.uniqueId);
                return newMap;
            });

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
                                    disabled={!canViewAll}
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

            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-24">
                    <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
                    <p className="text-gray-500 dark:text-gray-400 font-medium">Loading financial data...</p>
                </div>
            ) : (
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-emerald-50 dark:bg-emerald-900/20">
                        <tr>
                            <th rowSpan={2} className="px-4 py-3 text-left text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider w-1/4 align-bottom">Particulars / UACS</th>
                            {/* Target Obligation */}
                            <th colSpan={2} className="px-4 py-2 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-l border-b border-gray-200 dark:border-gray-700">Target Obligation</th>
                            
                            {/* Actual Obligation */}
                            <th colSpan={2} className="px-4 py-2 text-center text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider border-l border-b border-emerald-200 dark:border-emerald-800 bg-emerald-100/50 dark:bg-emerald-800/30">Actual Obligation</th>
                            
                            {/* Target Disbursement */}
                            <th colSpan={2} className="px-4 py-2 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-l border-b border-gray-200 dark:border-gray-700">Target Disbursement</th>
                            
                            {/* Actual Disbursement */}
                            <th colSpan={2} className="px-4 py-2 text-center text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider border-l border-b border-emerald-200 dark:border-emerald-800 bg-emerald-100/50 dark:bg-emerald-800/30">Actual Disbursement</th>
                            
                            <th rowSpan={2} className="px-4 py-3 text-right text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider align-bottom">Action</th>
                        </tr>
                        <tr>
                            {/* Target Obligation */}
                            <th className="px-2 py-2 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-l border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => handleSort('targetObligationAmount')}>
                                Amount {SortIcon('targetObligationAmount')}
                            </th>
                            <th className="px-2 py-2 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => handleSort('targetObligationMonth')}>
                                Date {SortIcon('targetObligationMonth')}
                            </th>
                            
                            {/* Actual Obligation */}
                            <th className="px-2 py-2 text-center text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider border-l border-emerald-200 dark:border-emerald-800 bg-emerald-100/50 dark:bg-emerald-800/30 cursor-pointer hover:bg-emerald-200/50 dark:hover:bg-emerald-800/50" onClick={() => handleSort('actualObligationAmount')}>
                                Amount {SortIcon('actualObligationAmount')}
                            </th>
                            <th className="px-2 py-2 text-center text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider bg-emerald-100/50 dark:bg-emerald-800/30 cursor-pointer hover:bg-emerald-200/50 dark:hover:bg-emerald-800/50" onClick={() => handleSort('actualObligationMonth')}>
                                Date {SortIcon('actualObligationMonth')}
                            </th>
                            
                            {/* Target Disbursement */}
                            <th className="px-2 py-2 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-l border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => handleSort('targetDisbursementAmount')}>
                                Amount {SortIcon('targetDisbursementAmount')}
                            </th>
                            <th className="px-2 py-2 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => handleSort('targetDisbursementMonth')}>
                                Date {SortIcon('targetDisbursementMonth')}
                            </th>
                            
                            {/* Actual Disbursement */}
                            <th className="px-2 py-2 text-center text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider border-l border-emerald-200 dark:border-emerald-800 bg-emerald-100/50 dark:bg-emerald-800/30 cursor-pointer hover:bg-emerald-200/50 dark:hover:bg-emerald-800/50" onClick={() => handleSort('actualDisbursementAmount')}>
                                Amount {SortIcon('actualDisbursementAmount')}
                            </th>
                            <th className="px-2 py-2 text-center text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider bg-emerald-100/50 dark:bg-emerald-800/30 cursor-pointer hover:bg-emerald-200/50 dark:hover:bg-emerald-800/50" onClick={() => handleSort('actualDisbursementMonth')}>
                                Date {SortIcon('actualDisbursementMonth')}
                            </th>
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
                                                            <MonthYearPicker 
                                                                value={commonObliMonth} 
                                                                onChange={(val) => handleGroupMonthChange(group.key, 'actualObligationMonth', val)}
                                                                disabled={!canEdit}
                                                                className="h-7 text-[10px] py-0"
                                                                placeholder={commonObliMonth ? 'Mixed' : 'Batch Set...'}
                                                            />
                                                        )}
                                                    </td>
                                                    
                                                    {/* Target Disb Total */}
                                                    <td className="px-4 py-3 text-center text-xs text-gray-500 border-l border-gray-200 dark:border-gray-700">-</td>
                                                    <td className="px-4 py-3 text-center text-xs text-gray-400">-</td>

                                                    {/* Actual Disb Total & Batch */}
                                                    <td className="px-4 py-3 text-center text-xs text-emerald-600 border-l border-emerald-100 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10">-</td>
                                                    <td className="px-4 py-3 text-center bg-emerald-50/50 dark:bg-emerald-900/10">
                                                        {isExpanded && canEdit && (
                                                            <MonthYearPicker 
                                                                value={commonDisbMonth} 
                                                                onChange={(val) => handleGroupMonthChange(group.key, 'actualDisbursementMonth', val)}
                                                                disabled={!canEdit}
                                                                className="h-7 text-[10px] py-0"
                                                                placeholder={commonDisbMonth ? 'Mixed' : 'Batch Set...'}
                                                            />
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3"></td>
                                                </tr>

                                                {/* Expanded Content (Subgroups) */}
                                                {isExpanded && Object.entries(group.subGroups).map(([subKey, sourceGroups]) => {
                                                    // Fix: Explicitly cast items to FinancialItem[] to resolve unknown type errors (length, map, etc.)
                                                    const typedSourceGroups = sourceGroups as { sourceId: number, sourceName: string, items: FinancialItem[], targetObligationAmount: number, actualObligationAmount: number, targetDisbursementAmount: number, actualDisbursementAmount: number }[];
                                                    if (typedSourceGroups.length === 0) return null;
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
                                                                        {subKey} ({typedSourceGroups.length})
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                            {isSubExpanded && typedSourceGroups.map(sourceGroup => {
                                                                const sourceId = `${subId}-${sourceGroup.sourceId}`;
                                                                const isSourceExpanded = expandedRows.includes(sourceId);
                                                                
                                                                const sortedItems = sortConfig ? [...sourceGroup.items].sort((a, b) => {
                                                                    let valA = a[sortConfig.key];
                                                                    let valB = b[sortConfig.key];
                                                                    if (valA === valB) return 0;
                                                                    if (valA === undefined || valA === null) return 1;
                                                                    if (valB === undefined || valB === null) return -1;
                                                                    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                                                                    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                                                                    return 0;
                                                                }) : sourceGroup.items;

                                                                return (
                                                                    <React.Fragment key={sourceId}>
                                                                        <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700">
                                                                            <td className="px-3 py-1.5 pl-16 text-sm font-medium text-gray-700 dark:text-gray-300">
                                                                                <button onClick={() => toggleRowExpansion(sourceId)} className="flex items-center gap-2 hover:text-emerald-600 focus:outline-none">
                                                                                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 transition-transform duration-200 ${isSourceExpanded ? 'transform rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                                                    </svg>
                                                                                    {sourceGroup.sourceName}
                                                                                </button>
                                                                            </td>
                                                                            <td className="px-2 py-1.5 text-center text-xs text-gray-500 border-l border-gray-100 dark:border-gray-700">{formatCurrency(sourceGroup.targetObligationAmount)}</td>
                                                                            <td className="px-2 py-1.5 text-center text-[10px] text-gray-400">-</td>
                                                                            <td className="px-2 py-1.5 text-center text-xs text-emerald-600 border-l border-emerald-100 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-900/5">{formatCurrency(sourceGroup.actualObligationAmount)}</td>
                                                                            <td className="px-2 py-1.5 bg-emerald-50/30 dark:bg-emerald-900/5">-</td>
                                                                            <td className="px-2 py-1.5 text-center text-xs text-gray-500 border-l border-gray-100 dark:border-gray-700">{formatCurrency(sourceGroup.targetDisbursementAmount)}</td>
                                                                            <td className="px-2 py-1.5 text-center text-[10px] text-gray-400">-</td>
                                                                            <td className="px-2 py-1.5 text-center text-xs text-emerald-600 border-l border-emerald-100 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-900/5">{formatCurrency(sourceGroup.actualDisbursementAmount)}</td>
                                                                            <td className="px-2 py-1.5 bg-emerald-50/30 dark:bg-emerald-900/5">-</td>
                                                                            <td className="px-4 py-1.5 text-right"></td>
                                                                        </tr>
                                                                        {isSourceExpanded && sortedItems.map(item => {
                                                                            const isBreakdownExpanded = expandedRows.includes(item.uniqueId);
                                                                            const supportsMonthly = item.sourceType === 'Staffing' || item.sourceType === 'Other';
                                                                            const isChanged = changedItems.has(item.uniqueId);

                                                                            return (
                                                                            <React.Fragment key={item.uniqueId}>
                                                                                <tr className={`hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors border-b border-gray-100 dark:border-gray-800 ${isChanged ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''}`}>
                                                                                    <td className="px-3 py-1.5 pl-24 text-sm text-gray-600 dark:text-gray-400">
                                                                                        <button onClick={() => handleTitleClick(item)} className="text-left hover:text-emerald-600 hover:underline focus:outline-none">
                                                                                            {item.sourceType === 'Subproject' && item.budgetParticular ? item.budgetParticular : item.expenseParticular}
                                                                                        </button>
                                                                                        {/* Breakdown Toggle */}
                                                                                        {supportsMonthly && (
                                                                                            <button onClick={() => toggleRowExpansion(item.uniqueId)} className="ml-2 text-[10px] text-emerald-500 hover:text-emerald-700">
                                                                                                {isBreakdownExpanded ? '(Hide Monthly)' : '(Show Monthly)'}
                                                                                            </button>
                                                                                        )}
                                                                                    </td>
                                                                        
                                                                        {/* Target Obli */}
                                                                        <td className="px-2 py-1.5 text-center text-xs text-gray-500 border-l border-gray-100 dark:border-gray-700">
                                                                            {item.status === 'Proposed' ? (
                                                                                <input 
                                                                                    type="number" 
                                                                                    value={item.targetObligationAmount || ''} 
                                                                                    onChange={(e) => updateLocalItem(item.uniqueId, { targetObligationAmount: parseFloat(e.target.value) || 0 })}
                                                                                    disabled={!canEdit}
                                                                                    className="w-full text-xs text-right p-1 border rounded dark:bg-gray-700 dark:border-gray-600 focus:ring-emerald-500 focus:border-emerald-500"
                                                                                    placeholder="0"
                                                                                />
                                                                            ) : (
                                                                                formatCurrency(item.targetObligationAmount)
                                                                            )}
                                                                        </td>
                                                                        <td className="px-2 py-1.5 text-center text-[10px] text-gray-400">
                                                                            {item.targetObligationMonth === 'Monthly' ? (
                                                                                'Monthly'
                                                                            ) : item.status === 'Proposed' ? (
                                                                                <MonthYearPicker 
                                                                                    value={item.targetObligationMonth} 
                                                                                    onChange={(val) => updateLocalItem(item.uniqueId, { targetObligationMonth: val })}
                                                                                    disabled={!canEdit}
                                                                                    className="h-7 text-[10px] py-0"
                                                                                />
                                                                            ) : (
                                                                                item.targetObligationMonth ? new Date(item.targetObligationMonth).toLocaleDateString(undefined, {month:'long', year:'numeric'}) : '-'
                                                                            )}
                                                                        </td>

                                                                        {/* Actual Obli */}
                                                                        <td className="px-2 py-1.5 border-l border-emerald-100 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-900/5">
                                                                            <input 
                                                                                type="number" 
                                                                                value={item.actualObligationAmount || ''} 
                                                                                onChange={(e) => updateLocalItem(item.uniqueId, { actualObligationAmount: parseFloat(e.target.value) || 0 })}
                                                                                disabled={!canEdit}
                                                                                className="w-full text-xs text-right p-1 border rounded dark:bg-gray-700 dark:border-gray-600 focus:ring-emerald-500 focus:border-emerald-500"
                                                                                placeholder="0"
                                                                            />
                                                                        </td>
                                                                        <td className="px-2 py-1.5 bg-emerald-50/30 dark:bg-emerald-900/5">
                                                                            <MonthYearPicker 
                                                                                value={item.actualObligationMonth} 
                                                                                onChange={(val) => updateLocalItem(item.uniqueId, { actualObligationMonth: val })}
                                                                                disabled={!canEdit}
                                                                                className="h-7 text-[10px] py-0"
                                                                            />
                                                                        </td>

                                                                        {/* Target Disb */}
                                                                        <td className="px-2 py-1.5 text-center text-xs text-gray-500 border-l border-gray-100 dark:border-gray-700">
                                                                            {item.status === 'Proposed' ? (
                                                                                <input 
                                                                                    type="number" 
                                                                                    value={item.targetDisbursementAmount || ''} 
                                                                                    onChange={(e) => updateLocalItem(item.uniqueId, { targetDisbursementAmount: parseFloat(e.target.value) || 0 })}
                                                                                    disabled={!canEdit}
                                                                                    className="w-full text-xs text-right p-1 border rounded dark:bg-gray-700 dark:border-gray-600 focus:ring-emerald-500 focus:border-emerald-500"
                                                                                    placeholder="0"
                                                                                />
                                                                            ) : (
                                                                                formatCurrency(item.targetDisbursementAmount)
                                                                            )}
                                                                        </td>
                                                                        <td className="px-2 py-1.5 text-center text-[10px] text-gray-400">
                                                                            {item.targetDisbursementMonth === 'Monthly' ? (
                                                                                'Monthly'
                                                                            ) : item.status === 'Proposed' ? (
                                                                                <MonthYearPicker 
                                                                                    value={item.targetDisbursementMonth} 
                                                                                    onChange={(val) => updateLocalItem(item.uniqueId, { targetDisbursementMonth: val })}
                                                                                    disabled={!canEdit}
                                                                                    className="h-7 text-[10px] py-0"
                                                                                />
                                                                            ) : (
                                                                                item.targetDisbursementMonth ? (item.targetDisbursementMonth.includes('-') ? new Date(item.targetDisbursementMonth).toLocaleDateString(undefined, {month:'long', year:'numeric'}) : item.targetDisbursementMonth) : '-'
                                                                            )}
                                                                        </td>

                                                                        {/* Actual Disb */}
                                                                        <td className="px-2 py-1.5 border-l border-emerald-100 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-900/5">
                                                                            {supportsMonthly ? (
                                                                                 <span className="block text-right text-xs font-semibold px-2">{formatCurrency(item.actualDisbursementAmount)}</span>
                                                                            ) : (
                                                                                <input 
                                                                                    type="number" 
                                                                                    value={item.actualDisbursementAmount || ''} 
                                                                                    onChange={(e) => updateLocalItem(item.uniqueId, { actualDisbursementAmount: parseFloat(e.target.value) || 0 })}
                                                                                    disabled={!canEdit}
                                                                                    className="w-full text-xs text-right p-1 border rounded dark:bg-gray-700 dark:border-gray-600 focus:ring-emerald-500 focus:border-emerald-500"
                                                                                    placeholder="0"
                                                                                />
                                                                            )}
                                                                        </td>
                                                                        <td className="px-2 py-1.5 bg-emerald-50/30 dark:bg-emerald-900/5">
                                                                            {supportsMonthly ? (
                                                                                <span className="block text-center text-[10px] text-gray-500">See below</span>
                                                                            ) : (
                                                                                <MonthYearPicker 
                                                                                    value={item.actualDisbursementMonth} 
                                                                                    onChange={(val) => updateLocalItem(item.uniqueId, { actualDisbursementMonth: val })}
                                                                                    disabled={!canEdit}
                                                                                    className="h-7 text-[10px] py-0"
                                                                                />
                                                                            )}
                                                                        </td>

                                                                        <td className="px-4 py-1.5 text-right">
                                                                            {canEdit && (
                                                                                <div className="flex items-center gap-1 justify-end">
                                                                                    {isChanged && (
                                                                                        <button
                                                                                            onClick={() => undoLocalItem(item.uniqueId)}
                                                                                            className="p-1.5 rounded text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
                                                                                            title="Undo changes"
                                                                                        >
                                                                                            <Undo2 className="w-4 h-4" />
                                                                                        </button>
                                                                                    )}
                                                                                    <button 
                                                                                        onClick={() => handleConfirmItem(item)}
                                                                                        className="px-3 py-1 rounded text-xs font-bold transition-all flex items-center justify-center gap-1 bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                                                                                    >
                                                                                        Save
                                                                                    </button>
                                                                                </div>
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
                                                                                                disabled={!canEdit}
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
                                                                );
                                                            })}
                                                                    </React.Fragment>
                                                                );
                                                            })}
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
            )}

            {/* Global Save Bar */}
            {changedItems.size > 0 && (
                <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 p-4 shadow-[0_-4px_10px_rgba(0,0,0,0.1)] z-40 flex justify-between items-center animate-in slide-in-from-bottom duration-300">
                    <div className="flex items-center gap-4 ml-64"> {/* ml-64 to account for sidebar if present */}
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                            <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400 px-2.5 py-1 rounded-full text-xs font-bold mr-3">
                                {changedItems.size}
                            </span>
                            Unsaved changes in financial accomplishments
                        </span>
                    </div>
                    <div className="flex gap-3 mr-8">
                        <button 
                            onClick={() => {
                                setChangedItems(new Map());
                                // We don't reload items here to avoid losing all progress, 
                                // but we clear the highlight
                                setItems(prev => prev.map(item => ({ ...item }))); 
                            }}
                            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                        >
                            Discard Changes
                        </button>
                        <button 
                            onClick={handleSaveAllClick}
                            disabled={isSavingAll}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-2.5 rounded-lg text-sm font-bold shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSavingAll ? (
                                <>
                                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Saving Changes...
                                </>
                            ) : 'Save All Changes'}
                        </button>
                    </div>
                </div>
            )}

            {/* Save Confirmation Modal */}
            {isSaveConfirmOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Confirm Save</h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-6">
                            Are you sure you want to save {changedItems.size} changes? This action will update the database.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setIsSaveConfirmOpen(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmSaveAll}
                                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors"
                            >
                                Yes, Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Success Message Toast */}
            {saveSuccessMessage && (
                <div className="fixed bottom-24 right-8 bg-emerald-100 border border-emerald-200 text-emerald-800 dark:bg-emerald-900/50 dark:border-emerald-800 dark:text-emerald-300 px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom-5 z-50">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-medium">{saveSuccessMessage}</span>
                </div>
            )}
        </div>
    );
};

export default FinancialAccomplishment;
