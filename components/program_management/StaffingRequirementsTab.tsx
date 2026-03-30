
// Author: 4K 
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MonthYearPicker } from '../ui/MonthYearPicker';
import { StaffingRequirement, StaffingExpense, operatingUnits, fundTypes, tiers, objectTypes, FundType, Tier, ObjectType, otherActivityComponents, ActivityComponentType } from '../../constants';
import { formatCurrency } from '../reports/ReportUtils';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection, getUserPermissions, usePagination } from '../mainfunctions/TableHooks';
import { supabase } from '../../supabaseClient';
import { resolveOperatingUnit, resolveTier } from '../mainfunctions/ImportExportService';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import { Search, Filter, ArrowUpDown, ArrowUp, ArrowDown, X } from 'lucide-react';

declare const XLSX: any;

const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const DuplicateIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
    </svg>
);

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm";

const getHiringStatusBadge = (status: StaffingRequirement['hiringStatus']) => {
    const baseClasses = "px-2 py-0.5 text-xs font-medium rounded-full";
    switch (status) {
        case 'Filled': return `${baseClasses} bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200`;
        case 'Proposed': return `${baseClasses} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`;
        case 'Unfilled': return `${baseClasses} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`;
        default: return `${baseClasses} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200`;
    }
}

export const parseStaffingRequirementRow = (row: any, commonData: any): StaffingRequirement => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let calculatedAnnual = 0;
    months.forEach(m => { calculatedAnnual += (Number(row[`disbursement${m}`]) || 0); });
    const finalAnnualSalary = calculatedAnnual > 0 ? calculatedAnnual : (Number(row.annualSalary) || 0);

    const result: any = {
        ...commonData,
        personnelPosition: row.personnelPosition || '',
        component: row.component || 'Program Management',
        status: row.status || 'Contractual',
        salaryGrade: Number(row.salaryGrade) || 1,
        annualSalary: finalAnnualSalary,
        personnelType: row.personnelType || 'Technical',
        expenses: row.expenses || [],
        hiringStatus: row.hiringStatus || 'Proposed'
    };

    months.forEach(m => {
        result[`disbursement${m}`] = Number(row[`disbursement${m}`]) || 0;
        result[`actualDisbursement${m}`] = Number(row[`actualDisbursement${m}`]) || 0;
    });

    return result as StaffingRequirement;
};

interface StaffingRequirementsTabProps {
    items: StaffingRequirement[];
    setItems: React.Dispatch<React.SetStateAction<StaffingRequirement[]>>;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    onSelect: (item: StaffingRequirement) => void;
}

const FilterIcon = () => (
    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
    </svg>
);

// StaffingRequirementColumnHeader component
interface StaffingRequirementColumnHeaderProps {
    label: string;
    columnKey: keyof StaffingRequirement;
    sortConfig: { key: string; direction: 'ascending' | 'descending' } | null;
    onSort: (key: any, direction: 'ascending' | 'descending') => void;
    filters: string[];
    onFilterChange: (values: string[]) => void;
    uniqueValues: string[];
    isNumeric?: boolean;
}

const StaffingRequirementColumnHeader: React.FC<StaffingRequirementColumnHeaderProps> = ({ 
    label, columnKey, sortConfig, onSort, filters, onFilterChange, uniqueValues, isNumeric 
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredValues = (uniqueValues || []).filter(v => String(v).toLowerCase().includes(searchTerm.toLowerCase()));
    const isSorted = sortConfig?.key === columnKey;
    const isFiltered = (filters || []).length > 0;

    const toggleFilter = (value: string) => {
        const currentFilters = filters || [];
        if (currentFilters.includes(value)) {
            onFilterChange(currentFilters.filter(f => f !== value));
        } else {
            onFilterChange([...currentFilters, value]);
        }
    };

    return (
        <th className={`px-6 py-3 text-left text-xs font-bold text-gray-600 dark:text-gray-300 relative group select-none whitespace-nowrap ${isNumeric ? 'text-right' : ''}`}>
            <div className={`flex items-center justify-between cursor-pointer ${isNumeric ? 'flex-row-reverse' : ''}`} onClick={() => setIsOpen(!isOpen)}>
                <div className="flex items-center gap-1">
                    {label}
                    {isSorted && (
                        <span className="text-emerald-600 dark:text-emerald-400">
                            {sortConfig?.direction === 'ascending' ? '▲' : '▼'}
                        </span>
                    )}
                </div>
                <div className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${isFiltered ? 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/50' : 'text-gray-400 opacity-0 group-hover:opacity-100'}`}>
                    <FilterIcon />
                </div>
            </div>

            {isOpen && (
                <div ref={menuRef} className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-gray-800 rounded-md shadow-xl border border-gray-200 dark:border-gray-700 z-50 text-sm normal-case font-normal text-gray-700 dark:text-gray-200">
                    <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex flex-col gap-1">
                        <button 
                            onClick={() => { onSort(columnKey, 'ascending'); setIsOpen(false); }}
                            className="w-full text-left px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center gap-2"
                        >
                            <span>▲</span> Sort Ascending
                        </button>
                        <button 
                            onClick={() => { onSort(columnKey, 'descending'); setIsOpen(false); }}
                            className="w-full text-left px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center gap-2"
                        >
                            <span>▼</span> Sort Descending
                        </button>
                    </div>

                    {!isNumeric && (
                        <>
                            <div className="p-2">
                                <input 
                                    type="text" 
                                    placeholder={`Search ${label}...`}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                    autoFocus
                                />
                            </div>
                            <div className="max-h-48 overflow-y-auto px-2 pb-2 custom-scrollbar">
                                <label className="flex items-center gap-2 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={filters.length === 0} 
                                        onChange={() => onFilterChange([])} 
                                        className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <span className="truncate italic text-gray-500">(Select All)</span>
                                </label>
                                {filteredValues.map(val => (
                                    <label key={val} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={filters.includes(String(val))} 
                                            onChange={() => toggleFilter(String(val))} 
                                            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                        />
                                        <span className="truncate">{val || '(Empty)'}</span>
                                    </label>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}
        </th>
    );
};

export const StaffingRequirementsTab: React.FC<StaffingRequirementsTabProps> = ({ items, setItems, uacsCodes, onSelect }) => {
    const { currentUser } = useAuth();
    const { canEdit, canViewAll } = getUserPermissions(currentUser);
    
    // Local State
    const [view, setView] = useState<'list' | 'form'>('list');
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<StaffingRequirement | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [selectionIntent, setSelectionIntent] = useState<'delete' | 'clone'>('delete');
    const [validationErrors, setValidationErrors] = useState<string[]>([]);

    const getInputClasses = (fieldName: string) => {
        const hasError = validationErrors.includes(fieldName);
        return `${commonInputClasses} ${hasError ? 'border-red-500 ring-1 ring-red-500' : ''}`;
    };

    // Filters - Persistent
    const [columnFilters, setColumnFilters] = useState<{ [key: string]: string[] }>({});

    // Search and Column Filtering/Sorting
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' }>({ key: 'id', direction: 'descending' });

    const { 
        isSelectionMode, selectedIds, setSelectedIds, 
        isMultiDeleteModalOpen, setIsMultiDeleteModalOpen, toggleSelectionMode, 
        handleSelectAll, handleSelectRow, resetSelection 
    } = useSelection<StaffingRequirement>();

    // Form State
    const initialFormState = {
        id: 0, uid: '', operatingUnit: '', uacsCode: '', obligationDate: '', disbursementDate: '', fundType: 'Current' as FundType, fundYear: new Date().getFullYear(), tier: 'Tier 1' as Tier, encodedBy: '',
        personnelPosition: '', component: 'Program Management' as ActivityComponentType, status: 'Contractual', salaryGrade: 1, annualSalary: 0, personnelType: 'Technical',
        disbursementJan: 0, disbursementFeb: 0, disbursementMar: 0, disbursementApr: 0, disbursementMay: 0, disbursementJun: 0,
        disbursementJul: 0, disbursementAug: 0, disbursementSep: 0, disbursementOct: 0, disbursementNov: 0, disbursementDec: 0,
        actualDate: '', actualAmount: 0, actualObligationDate: '', actualDisbursementDate: '', actualObligationAmount: 0, actualDisbursementAmount: 0,
        actualDisbursementJan: 0, actualDisbursementFeb: 0, actualDisbursementMar: 0, actualDisbursementApr: 0, actualDisbursementMay: 0, actualDisbursementJun: 0,
        actualDisbursementJul: 0, actualDisbursementAug: 0, actualDisbursementSep: 0, actualDisbursementOct: 0, actualDisbursementNov: 0, actualDisbursementDec: 0,
        hiringStatus: 'Proposed' as 'Proposed' | 'Filled' | 'Unfilled'
    };
    
    const [formData, setFormData] = useState(initialFormState);
    const [expensesList, setExpensesList] = useState<StaffingExpense[]>([]);
    
    // Temp State for adding expense
    const initialExpenseState = {
        objectType: 'MOOE' as ObjectType,
        expenseParticular: '',
        uacsCode: '',
        obligationDate: '',
        amount: 0,
        disbursementJan: 0, disbursementFeb: 0, disbursementMar: 0, disbursementApr: 0, disbursementMay: 0, disbursementJun: 0,
        disbursementJul: 0, disbursementAug: 0, disbursementSep: 0, disbursementOct: 0, disbursementNov: 0, disbursementDec: 0
    };
    const [currentExpense, setCurrentExpense] = useState(initialExpenseState);
    const [selectedParticular, setSelectedParticular] = useState('');
    const [isExpenseScheduleOpen, setIsExpenseScheduleOpen] = useState(false);

    useEffect(() => {
        if (formData.fundYear && !currentExpense.obligationDate) {
            setCurrentExpense(prev => ({ ...prev, obligationDate: `${formData.fundYear}-01-01` }));
        }
    }, [formData.fundYear, currentExpense.obligationDate]);

    const availableUacsCodes = useMemo(() => {
        const codes: { [key: string]: string } = {};
        const ot = currentExpense.objectType;
        
        if (selectedParticular) {
            if (uacsCodes[ot]?.[selectedParticular]) {
                Object.assign(codes, uacsCodes[ot][selectedParticular]);
            }
        } else if (uacsCodes[ot]) {
            Object.values(uacsCodes[ot]).forEach(particularCodes => {
                Object.assign(codes, particularCodes);
            });
        }
        return codes;
    }, [uacsCodes, currentExpense.objectType, selectedParticular]);

    const selectedUacsDesc = useMemo(() => {
        if (!currentExpense.uacsCode) return '';
        return availableUacsCodes[currentExpense.uacsCode] || '';
    }, [currentExpense.uacsCode, availableUacsCodes]);

    useEffect(() => {
        // Removed ouFilter dependency
    }, [currentUser, canViewAll]);

    // Initialize Form
    useEffect(() => {
        if (view === 'form') {
            setFormData({ ...initialFormState, operatingUnit: currentUser?.operatingUnit || (canViewAll ? 'NPMO' : currentUser?.operatingUnit || ''), encodedBy: currentUser?.fullName || '' });
            setExpensesList([]);
            setCurrentExpense(initialExpenseState);
            setSelectedParticular('');
        }
    }, [view, uacsCodes, currentUser, canViewAll]);

    const availableYears = useMemo(() => {
        const years = new Set<string>(); 
        items.forEach(i => {
            if (i.fundYear) years.add(i.fundYear.toString());
        }); 
        return Array.from(years).sort().reverse();
    }, [items]);

    const filteredItems = useMemo(() => {
        let filtered = items;

        // Global Search (UID or Position)
        if (searchTerm) {
            const lowSearch = searchTerm.toLowerCase();
            filtered = filtered.filter(item => 
                (item.uid || '').toLowerCase().includes(lowSearch) || 
                (item.personnelPosition || '').toLowerCase().includes(lowSearch)
            );
        }

        // Permissions Filter
        if (!canViewAll && currentUser) {
            filtered = filtered.filter(item => item.operatingUnit === currentUser.operatingUnit);
        }

        // Column Filters
        Object.keys(columnFilters).forEach(key => {
            const selectedValues = columnFilters[key];
            if (selectedValues && selectedValues.length > 0) {
                filtered = filtered.filter(item => {
                    const itemValue = String(item[key as keyof StaffingRequirement] || '');
                    return selectedValues.includes(itemValue);
                });
            }
        });

        // Sorting
        return [...filtered].sort((a, b) => {
            const aValue = a[sortConfig.key as keyof StaffingRequirement];
            const bValue = b[sortConfig.key as keyof StaffingRequirement];

            if (aValue === bValue) return 0;
            
            // Handle null/undefined
            if (aValue === null || aValue === undefined) return sortConfig.direction === 'ascending' ? -1 : 1;
            if (bValue === null || bValue === undefined) return sortConfig.direction === 'ascending' ? 1 : -1;

            const comparison = aValue < bValue ? -1 : 1;
            return sortConfig.direction === 'ascending' ? comparison : -comparison;
        });
    }, [items, canViewAll, currentUser, searchTerm, sortConfig, columnFilters]);

    const handleSort = (key: any, direction: 'ascending' | 'descending') => {
        setSortConfig({ key, direction });
    };

    const handleColumnFilterChange = (column: string, values: string[]) => {
        setColumnFilters(prev => ({ ...prev, [column]: values }));
    };

    const uniqueValues = useMemo(() => {
        const values: { [key: string]: string[] } = {
            uid: [],
            operatingUnit: [],
            hiringStatus: [],
            personnelPosition: [],
            personnelType: [],
            fundYear: [],
            fundType: []
        };

        items.forEach(item => {
            Object.keys(values).forEach(key => {
                const val = String(item[key as keyof StaffingRequirement] || '');
                if (!values[key].includes(val)) {
                    values[key].push(val);
                }
            });
        });

        Object.keys(values).forEach(key => {
            values[key].sort();
        });

        return values;
    }, [items]);

    const { currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData } = usePagination(filteredItems, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (validationErrors.includes(name)) {
            setValidationErrors(prev => prev.filter(err => err !== name));
        }
    };

    const handleExpenseChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setCurrentExpense(prev => ({ ...prev, [name]: value }));
        if (validationErrors.includes(name)) {
            setValidationErrors(prev => prev.filter(err => err !== name));
        }
    };

    const handleAddExpense = () => {
        const requiredFields = [
            { name: 'expenseParticular', label: 'Particular' },
            { name: 'uacsCode', label: 'UACS Code' },
            { name: 'obligationDate', label: 'Obligation Date' },
            { name: 'amount', label: 'Amount' }
        ];

        const missing = requiredFields.filter(f => !currentExpense[f.name as keyof typeof currentExpense]);
        if (missing.length > 0) {
            setValidationErrors(missing.map(f => f.name));
            alert(`The following financial fields are missing: ${missing.map(f => f.label).join(', ')}`);
            return;
        }

        const newExpense: StaffingExpense = {
            id: Date.now(),
            ...currentExpense,
            amount: Number(currentExpense.amount),
            // @ts-ignore dynamic month assignment
            disbursementJan: Number(currentExpense.disbursementJan), disbursementFeb: Number(currentExpense.disbursementFeb), disbursementMar: Number(currentExpense.disbursementMar),
            disbursementApr: Number(currentExpense.disbursementApr), disbursementMay: Number(currentExpense.disbursementMay), disbursementJun: Number(currentExpense.disbursementJun),
            disbursementJul: Number(currentExpense.disbursementJul), disbursementAug: Number(currentExpense.disbursementAug), disbursementSep: Number(currentExpense.disbursementSep),
            disbursementOct: Number(currentExpense.disbursementOct), disbursementNov: Number(currentExpense.disbursementNov), disbursementDec: Number(currentExpense.disbursementDec)
        };
        setExpensesList(prev => [...prev, newExpense]);
        setCurrentExpense({
            ...initialExpenseState,
            obligationDate: formData.fundYear ? `${formData.fundYear}-01-01` : ''
        });
        setSelectedParticular('');
        setIsExpenseScheduleOpen(false);
    };

    const handleRemoveExpense = (id: number) => {
        setExpensesList(prev => prev.filter(e => e.id !== id));
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const requiredFields = [
            { name: 'operatingUnit', label: 'Operating Unit' },
            { name: 'personnelPosition', label: 'Personnel Position' },
            { name: 'fundYear', label: 'Fund Year' }
        ];

        const missing = requiredFields.filter(f => !formData[f.name as keyof typeof formData]);
        if (missing.length > 0) {
            setValidationErrors(missing.map(f => f.name));
            alert(`The following required fields are missing: ${missing.map(f => f.label).join(', ')}`);
            return;
        }

        if (expensesList.length === 0) {
            alert("At least one financial requirement item is required.");
            return;
        }
        
        // Aggregate totals from expensesList
        const aggregatedTotals = {
            annualSalary: 0,
            disbursementJan: 0, disbursementFeb: 0, disbursementMar: 0, disbursementApr: 0, disbursementMay: 0, disbursementJun: 0,
            disbursementJul: 0, disbursementAug: 0, disbursementSep: 0, disbursementOct: 0, disbursementNov: 0, disbursementDec: 0
        };
        
        let primaryUacs = '';
        let primaryObligationDate = '';

        expensesList.forEach((exp, idx) => {
            if (idx === 0) {
                primaryUacs = exp.uacsCode;
                primaryObligationDate = exp.obligationDate;
            }
            aggregatedTotals.annualSalary += exp.amount;
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            months.forEach(m => {
                // @ts-ignore
                aggregatedTotals[`disbursement${m}`] += (exp[`disbursement${m}`] || 0);
            });
        });

        const submissionData: any = {
            ...formData,
            ...aggregatedTotals,
            uacsCode: primaryUacs, // Use first expense as main reference
            obligationDate: primaryObligationDate,
            salaryGrade: Number(formData.salaryGrade),
            fundYear: Number(formData.fundYear),
            expenses: expensesList, // Store detailed list
            actualAmount: 0, actualObligationAmount: 0, actualDisbursementAmount: 0,
            hiringStatus: formData.hiringStatus || 'Proposed',
            encodedBy: formData.encodedBy || currentUser?.fullName || 'System', 
            updated_at: new Date().toISOString()
        };

        delete submissionData.id;

        submissionData.uid = formData.uid || `SR-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
        submissionData.created_at = new Date().toISOString();

        if (supabase) {
            const { data, error } = await supabase.from('staffing_requirements').insert([submissionData]).select().single();
            if (error) { 
                console.error("Create error:", error); 
                alert(`Failed to create: ${error.message}`); 
                return; 
            }
            if (data) setItems(prev => [data, ...prev]);
        } else {
            const newItem = { ...submissionData, id: Date.now() } as StaffingRequirement;
            setItems(prev => [newItem, ...prev]);
        }
        setView('list');
    };

    const handleDelete = async () => {
        if (!itemToDelete) return;
        if (supabase) {
            try {
                const { error: archiveError } = await supabase.from('trash_bin').insert([{
                    entity_type: 'staffing_requirement',
                    original_id: itemToDelete.id,
                    data: itemToDelete,
                    deleted_by: currentUser?.email || currentUser?.fullName || 'Unknown',
                    deleted_at: new Date().toISOString()
                }]);
                if (archiveError) throw archiveError;

                const { error: deleteError } = await supabase.from('staffing_requirements').delete().eq('id', itemToDelete.id);
                if (deleteError) throw deleteError;

                setItems(prev => prev.filter(i => i.id !== itemToDelete.id));
            } catch (error: any) {
                console.error("Error archiving/deleting:", error);
                alert("Failed to delete: " + error.message);
                return;
            }
        } else {
            setItems(prev => prev.filter(i => i.id !== itemToDelete.id));
        }
        setIsDeleteModalOpen(false); setItemToDelete(null);
    };

    const handleMultiDelete = async () => {
        if (selectedIds.length === 0) return;
        const itemsToDelete = items.filter(i => selectedIds.includes(i.id));

        if (supabase) {
            try {
                const archivePayload = itemsToDelete.map(item => ({
                    entity_type: 'staffing_requirement',
                    original_id: item.id,
                    data: item,
                    deleted_by: currentUser?.email || currentUser?.fullName || 'Unknown',
                    deleted_at: new Date().toISOString()
                }));

                const { error: archiveError } = await supabase.from('trash_bin').insert(archivePayload);
                if (archiveError) throw archiveError;

                const { error: deleteError } = await supabase.from('staffing_requirements').delete().in('id', selectedIds);
                if (deleteError) throw deleteError;

                setItems(prev => prev.filter(i => !selectedIds.includes(i.id)));
            } catch (error: any) {
                console.error("Error archiving/deleting selected:", error);
                alert("Failed to delete selected: " + error.message);
                return;
            }
        } else {
            setItems(prev => prev.filter(i => !selectedIds.includes(i.id)));
        }
        setIsMultiDeleteModalOpen(false); setSelectedIds([]);
    };

    const handleClone = async () => {
        const itemsToClone = items.filter(i => selectedIds.includes(i.id));
        if (itemsToClone.length === 0) return;

        if (!window.confirm(`Are you sure you want to clone ${itemsToClone.length} staffing requirements? This will create new entries with the same targets but reset accomplishments.`)) return;

        const currentTimestamp = new Date().toISOString();
        const newItemsPayload = itemsToClone.map((item, index) => {
            const { id, uid, created_at, updated_at, ...rest } = item;
            const newUid = `SR-${item.fundYear}-${Date.now().toString().slice(-6)}${index}`;
            
            // Deep copy and reset expenses actuals
            const clonedExpenses = (item.expenses || []).map(exp => ({
                ...exp,
                id: Date.now() + Math.random(), // New ID for expense
                actualObligationAmount: 0,
                actualObligationDate: '',
                actualDisbursementAmount: 0,
                actualDisbursementDate: '',
                // Reset monthly actuals
                actualDisbursementJan: 0, actualDisbursementFeb: 0, actualDisbursementMar: 0, actualDisbursementApr: 0,
                actualDisbursementMay: 0, actualDisbursementJun: 0, actualDisbursementJul: 0, actualDisbursementAug: 0,
                actualDisbursementSep: 0, actualDisbursementOct: 0, actualDisbursementNov: 0, actualDisbursementDec: 0
            }));

            // Reset root actuals
            const resetActuals: any = {
                actualDate: '',
                actualAmount: 0,
                actualObligationDate: '',
                actualDisbursementDate: '',
                actualObligationAmount: 0,
                actualDisbursementAmount: 0,
                actualDisbursementJan: 0, actualDisbursementFeb: 0, actualDisbursementMar: 0, actualDisbursementApr: 0,
                actualDisbursementMay: 0, actualDisbursementJun: 0, actualDisbursementJul: 0, actualDisbursementAug: 0,
                actualDisbursementSep: 0, actualDisbursementOct: 0, actualDisbursementNov: 0, actualDisbursementDec: 0,
                hiringStatus: 'Proposed'
            };

            return {
                ...rest,
                ...resetActuals,
                uid: newUid,
                expenses: clonedExpenses,
                encodedBy: currentUser?.fullName || 'System Clone',
                created_at: currentTimestamp,
                updated_at: currentTimestamp,
            };
        });

        if (supabase) {
            const { data, error } = await supabase.from('staffing_requirements').insert(newItemsPayload).select();
            if (error) {
                alert('Failed to clone items: ' + error.message);
            } else if (data) {
                setItems(prev => [...data, ...prev]);
                resetSelection();
                alert(`Successfully cloned ${data.length} items.`);
            }
        } else {
            const newLocalItems = newItemsPayload.map((item, idx) => ({ ...item, id: Date.now() + idx }));
            setItems(prev => [...newLocalItems, ...prev]);
            resetSelection();
            alert(`Successfully cloned ${newLocalItems.length} items (Local).`);
        }
    };

    const handleToggleMode = (intent: 'delete' | 'clone') => {
        if (isSelectionMode && selectionIntent === intent) {
            toggleSelectionMode(); // Toggle off
        } else if (isSelectionMode && selectionIntent !== intent) {
            setSelectionIntent(intent); // Switch intent
        } else {
            setSelectionIntent(intent);
            toggleSelectionMode(); // Toggle on
        }
    };

    // Import/Export
    const handleDownloadReport = () => {
        const data = filteredItems.map(item => ({
            UID: item.uid, OU: item.operatingUnit, Position: item.personnelPosition, HiringStatus: item.hiringStatus, EmploymentStatus: item.status, 'Salary Grade': item.salaryGrade, 'Annual Salary': item.annualSalary, Type: item.personnelType, 'Fund Type': item.fundType, 'Fund Year': item.fundYear, Tier: item.tier, 'Obligation Date': item.obligationDate
        }));
        const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Staffing Requirements"); XLSX.writeFile(wb, "Staffing_Requirements_Report.xlsx");
    };

    const handleDownloadTemplate = () => {
        const monthHeaders = ['disbursementJan', 'disbursementFeb', 'disbursementMar', 'disbursementApr', 'disbursementMay', 'disbursementJun', 'disbursementJul', 'disbursementAug', 'disbursementSep', 'disbursementOct', 'disbursementNov', 'disbursementDec'];
        const headers = ['operatingUnit', 'fundYear', 'fundType', 'tier', 'obligationDate', 'uacsCode', 'personnelPosition', 'status', 'salaryGrade', 'personnelType', 'amount', 'hiringStatus', ...monthHeaders];
        const exampleData = [{ operatingUnit: 'NPMO', fundYear: 2024, fundType: 'Current', tier: 'Tier 1', obligationDate: '2024-01-15', uacsCode: '50100000-00', personnelPosition: 'PDO II', status: 'Contractual', salaryGrade: 15, personnelType: 'Technical', amount: 540000, hiringStatus: 'Proposed', disbursementJan: 45000, disbursementFeb: 45000, disbursementMar: 45000, disbursementApr: 45000, disbursementMay: 45000, disbursementJun: 45000, disbursementJul: 45000, disbursementAug: 45000, disbursementSep: 45000, disbursementOct: 45000, disbursementNov: 45000, disbursementDec: 45000 }];
        const ws = XLSX.utils.json_to_sheet(exampleData, { header: headers }); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Template"); XLSX.writeFile(wb, "Staffing_Req_Template.xlsx");
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file) return; setIsUploading(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = event.target?.result; const workbook = XLSX.read(data, { type: 'array' });
                const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as any[];
                const currentTimestamp = new Date().toISOString();
                
                const newItems = jsonData.map((row: any, index: number) => {
                    const fundYear = Number(row.fundYear) || new Date().getFullYear();
                    const uid = `SR-${fundYear}-${Date.now().toString().slice(-4)}${index}`;
                    const resolvedOU = row.operatingUnit ? resolveOperatingUnit(row.operatingUnit) : 'NPMO';
                    
                    // Create base object
                    const parsed = parseStaffingRequirementRow(row, {
                        uid, 
                        operatingUnit: resolvedOU, 
                        fundYear: fundYear, 
                        fundType: row.fundType || 'Current', 
                        tier: resolveTier(row.tier) || 'Tier 1', 
                        obligationDate: row.obligationDate || '', 
                        disbursementDate: '', 
                        uacsCode: row.uacsCode || '', 
                        encodedBy: currentUser?.fullName || 'Upload', 
                        created_at: currentTimestamp, 
                        updated_at: currentTimestamp
                    });

                    // Construct default expense object from flat row data for legacy support
                    const annualSalary = Number(row.amount || row.annualSalary) || 0;
                    const expense: StaffingExpense = {
                        id: Date.now() + index,
                        objectType: 'MOOE', // Default
                        expenseParticular: 'Salaries & Wages',
                        uacsCode: row.uacsCode || '',
                        obligationDate: row.obligationDate || '',
                        amount: annualSalary,
                        // Map monthly values from row
                        disbursementJan: Number(row.disbursementJan) || 0, disbursementFeb: Number(row.disbursementFeb) || 0, disbursementMar: Number(row.disbursementMar) || 0,
                        disbursementApr: Number(row.disbursementApr) || 0, disbursementMay: Number(row.disbursementMay) || 0, disbursementJun: Number(row.disbursementJun) || 0,
                        disbursementJul: Number(row.disbursementJul) || 0, disbursementAug: Number(row.disbursementAug) || 0, disbursementSep: Number(row.disbursementSep) || 0,
                        disbursementOct: Number(row.disbursementOct) || 0, disbursementNov: Number(row.disbursementNov) || 0, disbursementDec: Number(row.disbursementDec) || 0,
                        
                        // Initialize actuals
                        actualObligationAmount: 0, actualObligationDate: '', actualDisbursementAmount: 0, actualDisbursementDate: '',
                        actualDisbursementJan: 0, actualDisbursementFeb: 0, actualDisbursementMar: 0, actualDisbursementApr: 0,
                        actualDisbursementMay: 0, actualDisbursementJun: 0, actualDisbursementJul: 0, actualDisbursementAug: 0,
                        actualDisbursementSep: 0, actualDisbursementOct: 0, actualDisbursementNov: 0, actualDisbursementDec: 0
                    };

                    parsed.expenses = [expense];
                    parsed.annualSalary = annualSalary; // Ensure root salary matches

                    return parsed;
                });
                
                if (supabase) {
                    const { error } = await supabase.from('staffing_requirements').insert(newItems); if (error) throw error;
                    const { data } = await supabase.from('staffing_requirements').select('*').order('id', { ascending: true }); if (data) setItems(data as StaffingRequirement[]);
                } else { setItems(prev => [...newItems.map((i, idx) => ({ ...i, id: Date.now() + idx })), ...prev]); }
                alert(`${newItems.length} items imported.`);
            } catch (err: any) { alert(`Import failed: ${err.message}`); } finally { setIsUploading(false); if(e.target) e.target.value = ''; }
        };
        reader.readAsArrayBuffer(file);
    };

    if (view === 'form') {
        const monthFields = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md animate-fadeIn">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white">Add Staffing Requirement</h3>
                    <button onClick={() => { setView('list'); }} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Cancel</button>
                </div>
                <form onSubmit={handleFormSubmit} className="space-y-8">
                    {/* Group 1: Profile */}
                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                        <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Position Profile</legend>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Position Title <span className="text-red-500">*</span></label><input type="text" name="personnelPosition" value={formData.personnelPosition} onChange={handleInputChange} required className={getInputClasses('personnelPosition')} /></div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Component</label>
                                <select name="component" value={formData.component} onChange={handleInputChange} className={getInputClasses('component')}>
                                    {otherActivityComponents.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Hiring Status</label>
                                <select name="hiringStatus" value={formData.hiringStatus} onChange={handleInputChange} className={`${commonInputClasses} bg-gray-100 dark:bg-gray-600 cursor-not-allowed`} disabled>
                                    <option value="Proposed">Proposed</option>
                                    <option value="Filled">Filled</option>
                                    <option value="Unfilled">Unfilled</option>
                                </select>
                            </div>
                            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Employment Status</label><select name="status" value={formData.status} onChange={handleInputChange} className={getInputClasses('status')}><option value="Permanent">Permanent</option><option value="Contractual">Contractual</option><option value="COS">COS</option><option value="Job Order">Job Order</option></select></div>
                            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Salary Grade</label><input type="number" name="salaryGrade" value={formData.salaryGrade} onChange={handleInputChange} min="1" max="33" className={getInputClasses('salaryGrade')} /></div>
                            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Personnel Type</label><select name="personnelType" value={formData.personnelType} onChange={handleInputChange} className={getInputClasses('personnelType')}><option value="Technical">Technical</option><option value="Administrative">Administrative</option><option value="Support">Support</option></select></div>
                            <div className="md:col-span-1">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Operating Unit <span className="text-red-500">*</span></label>
                                <select name="operatingUnit" value={formData.operatingUnit} onChange={handleInputChange} disabled={!canViewAll && !!currentUser} className={`${getInputClasses('operatingUnit')} disabled:bg-gray-100 disabled:cursor-not-allowed`}><option value="">Select OU</option>{operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}</select>
                            </div>
                        </div>
                    </fieldset>

                    {/* Group 2: Funding */}
                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                        <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Funding Source</legend>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fund Year <span className="text-red-500">*</span></label><input type="number" name="fundYear" value={formData.fundYear} onChange={handleInputChange} className={getInputClasses('fundYear')} /></div>
                            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fund Type</label><select name="fundType" value={formData.fundType} onChange={handleInputChange} className={getInputClasses('fundType')}>{fundTypes.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tier</label><select name="tier" value={formData.tier} onChange={handleInputChange} className={getInputClasses('tier')}>{tiers.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                        </div>
                    </fieldset>

                    {/* Group 3: Financial Requirements (Multiple Objects) */}
                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md bg-gray-50 dark:bg-gray-700/30">
                        <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Financial Requirements</legend>
                        
                        {/* Expense List */}
                        <div className="space-y-3 mb-6">
                            {expensesList.map((expense, idx) => (
                                <div key={idx} className="bg-white dark:bg-gray-800 p-3 rounded-md border border-gray-200 dark:border-gray-600 flex justify-between items-start">
                                    <div>
                                        <p className="font-semibold text-gray-800 dark:text-white text-sm">{expense.expenseParticular || 'Unspecified Particular'}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{expense.uacsCode} | Obligated: {expense.obligationDate}</p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <p className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(expense.amount)}</p>
                                        <button type="button" onClick={() => handleRemoveExpense(expense.id)} className="text-red-500 hover:text-red-700">
                                            <TrashIcon />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {expensesList.length === 0 && <p className="text-sm text-gray-500 italic text-center py-4">No financial items added.</p>}
                            <div className="flex justify-end pt-2 border-t border-gray-300 dark:border-gray-600">
                                <span className="font-bold text-gray-700 dark:text-gray-300 mr-2">Total Annual Requirement:</span>
                                <span className="font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(expensesList.reduce((acc, curr) => acc + curr.amount, 0))}</span>
                            </div>
                        </div>

                        {/* Add Expense Form Area */}
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-md border border-emerald-200 dark:border-emerald-800">
                            <h4 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 border-b border-gray-100 dark:border-gray-700 pb-2">Add Financial Item</h4>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                                <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Object Type</label><select name="objectType" value={currentExpense.objectType} onChange={handleExpenseChange} className={getInputClasses('objectType')}>{objectTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Particular <span className="text-red-500">*</span></label><select value={selectedParticular} onChange={e => { setSelectedParticular(e.target.value); setCurrentExpense(prev => ({...prev, uacsCode: ''})); if (validationErrors.includes('expenseParticular')) setValidationErrors(prev => prev.filter(err => err !== 'expenseParticular')); }} className={getInputClasses('expenseParticular')}><option value="">Select</option>{uacsCodes[currentExpense.objectType] && Object.keys(uacsCodes[currentExpense.objectType]).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">UACS Code <span className="text-red-500">*</span></label>
                                    <input 
                                        list="uacs-codes-list"
                                        name="uacsCode" 
                                        value={currentExpense.uacsCode} 
                                        onChange={(e) => {
                                            const code = e.target.value;
                                            let part = selectedParticular;
                                            
                                            // Auto-select particular if a valid code is entered
                                            if (code && uacsCodes[currentExpense.objectType]) {
                                                const trimmedCode = code.trim();
                                                let foundParticular = '';

                                                // First check if the code exists in the CURRENT selected particular (optimization)
                                                if (selectedParticular && uacsCodes[currentExpense.objectType][selectedParticular] && uacsCodes[currentExpense.objectType][selectedParticular][trimmedCode]) {
                                                    foundParticular = selectedParticular;
                                                } else {
                                                    // Search all particulars
                                                    for (const [particular, codes] of Object.entries(uacsCodes[currentExpense.objectType])) {
                                                        if (codes[trimmedCode]) {
                                                            foundParticular = particular;
                                                            break;
                                                        }
                                                    }
                                                }

                                                if (foundParticular) {
                                                    part = foundParticular;
                                                    if (foundParticular !== selectedParticular) {
                                                        setSelectedParticular(foundParticular);
                                                    }
                                                }
                                            }
                                            
                                            setCurrentExpense(prev => ({ ...prev, uacsCode: code, expenseParticular: part }));
                                            if (validationErrors.includes('uacsCode')) {
                                                setValidationErrors(prev => prev.filter(err => err !== 'uacsCode'));
                                            }
                                        }} 
                                        className={getInputClasses('uacsCode')} 
                                        placeholder="Search or select UACS Code"
                                    />
                                    <datalist id="uacs-codes-list">
                                        {Object.entries(availableUacsCodes).map(([code, desc]) => (
                                            <option key={code} value={code}>{code} - {desc}</option>
                                        ))}
                                    </datalist>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Description</label>
                                    <input 
                                        type="text" 
                                        value={selectedUacsDesc} 
                                        readOnly 
                                        className="mt-1 block w-full px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none sm:text-sm cursor-not-allowed" 
                                    />
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Obligation Date <span className="text-red-500">*</span></label>
                                    <MonthYearPicker 
                                        value={currentExpense.obligationDate} 
                                        onChange={(val) => {
                                            setCurrentExpense(prev => ({ ...prev, obligationDate: val }));
                                            if (validationErrors.includes('obligationDate')) {
                                                setValidationErrors(prev => prev.filter(err => err !== 'obligationDate'));
                                            }
                                        }}
                                        className={validationErrors.includes('obligationDate') ? 'border-red-500 ring-1 ring-red-500' : ''}
                                    />
                                </div>
                                <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Amount <span className="text-red-500">*</span></label><input type="number" name="amount" value={currentExpense.amount} onChange={handleExpenseChange} className={getInputClasses('amount')} min="0" /></div>
                            </div>
                            
                            <div className="mb-3">
                                <button type="button" onClick={() => setIsExpenseScheduleOpen(!isExpenseScheduleOpen)} className="text-xs text-emerald-600 hover:underline flex items-center gap-1">
                                    {isExpenseScheduleOpen ? 'Hide' : 'Show'} Disbursement Schedule
                                </button>
                                {isExpenseScheduleOpen && (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mt-2 p-2 bg-gray-50 dark:bg-gray-900/50 rounded border border-gray-200 dark:border-gray-700">
                                        {monthFields.map(month => (
                                            <div key={`exp-${month}`}>
                                                <label className="block text-[10px] font-medium text-gray-500 uppercase">{month}</label>
                                                <input type="number" name={`disbursement${month}`} 
                                                // @ts-ignore
                                                value={currentExpense[`disbursement${month}`]} onChange={handleExpenseChange} className="w-full px-1 py-1 text-xs border rounded dark:bg-gray-700 dark:border-gray-600" />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <button type="button" onClick={handleAddExpense} className="w-full py-2 bg-emerald-600 text-white rounded-md text-sm hover:bg-emerald-700 transition-colors">Add Item to List</button>
                        </div>
                    </fieldset>
                    
                    <div className="flex justify-end gap-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                        <button type="button" onClick={() => { setView('list'); }} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm hover:bg-emerald-700 transition-colors">Save</button>
                    </div>
                </form>
            </div>
        );
    }

    // List View
    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md animate-fadeIn">
            {isDeleteModalOpen && (<div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"><div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl"><h3 className="text-lg font-bold text-gray-900 dark:text-white">Confirm Deletion</h3><p className="my-4 text-gray-600 dark:text-gray-300">Are you sure?</p><div className="flex justify-end gap-4"><button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 rounded-md text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button><button onClick={handleDelete} className="px-4 py-2 rounded-md text-sm bg-red-600 text-white hover:bg-red-700">Delete</button></div></div></div>)}
            {isMultiDeleteModalOpen && (<div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"><div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl"><h3 className="text-lg font-bold text-gray-900 dark:text-white">Confirm Bulk Deletion</h3><p className="my-4 text-gray-600 dark:text-gray-300">Delete {selectedIds.length} items?</p><div className="flex justify-end gap-4"><button onClick={() => setIsMultiDeleteModalOpen(false)} className="px-4 py-2 rounded-md text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button><button onClick={handleMultiDelete} className="px-4 py-2 rounded-md text-sm bg-red-600 text-white hover:bg-red-700">Delete All</button></div></div></div>)}

            <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="relative flex-1 md:flex-none">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-gray-400" />
                        </span>
                        <input 
                            type="text" 
                            placeholder="Search Staffing Requirements..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm transition-all"
                        />
                        {searchTerm && (
                            <button 
                                onClick={() => setSearchTerm('')}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {isSelectionMode && selectedIds.length > 0 && (
                        <button 
                            onClick={() => selectionIntent === 'delete' ? setIsMultiDeleteModalOpen(true) : handleClone()} 
                            className={`inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white ${selectionIntent === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-cyan-600 hover:bg-cyan-700'}`}
                        >
                            {selectionIntent === 'delete' ? `Delete Selected (${selectedIds.length})` : `Clone Selected (${selectedIds.length})`}
                        </button>
                    )}
                    {canEdit && (
                        <button 
                            onClick={() => { setView('form'); }} 
                            className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700"
                        >
                            + Add New
                        </button>
                    )}
                    <button onClick={handleDownloadReport} className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700">Download Report</button>
                    {canEdit && (
                        <>
                            <button onClick={handleDownloadTemplate} className="inline-flex items-center justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">Template</button>
                            <label className={`inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 ${isUploading ? 'bg-gray-400 cursor-not-allowed' : 'cursor-pointer'}`}>
                                {isUploading ? 'Uploading...' : 'Upload XLSX'}
                                <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleFileUpload} disabled={isUploading} />
                            </label>
                            <button 
                                onClick={() => handleToggleMode('clone')} 
                                className={`inline-flex items-center justify-center p-2 border border-gray-300 dark:border-gray-600 shadow-sm rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 ${isSelectionMode && selectionIntent === 'clone' ? 'bg-cyan-100 dark:bg-cyan-900 text-cyan-600' : 'bg-white dark:bg-gray-700 text-gray-500'}`} 
                                title="Toggle Clone Mode"
                            >
                                <DuplicateIcon />
                            </button>
                            <button 
                                onClick={() => handleToggleMode('delete')} 
                                className={`inline-flex items-center justify-center p-2 border border-gray-300 dark:border-gray-600 shadow-sm rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 ${isSelectionMode && selectionIntent === 'delete' ? 'bg-red-100 dark:bg-red-900 text-red-600' : 'bg-white dark:bg-gray-700 text-gray-500'}`} 
                                title="Toggle Multi-Delete Mode"
                            >
                                <TrashIcon />
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                        <tr>
                            <StaffingRequirementColumnHeader 
                                label="UID" 
                                columnKey="uid" 
                                sortConfig={sortConfig} 
                                onSort={handleSort} 
                                filters={columnFilters.uid || []} 
                                onFilterChange={(val) => handleColumnFilterChange('uid', val)} 
                                uniqueValues={uniqueValues.uid} 
                            />
                            <StaffingRequirementColumnHeader 
                                label="OU" 
                                columnKey="operatingUnit" 
                                sortConfig={sortConfig} 
                                onSort={handleSort} 
                                filters={columnFilters.operatingUnit || []} 
                                onFilterChange={(val) => handleColumnFilterChange('operatingUnit', val)} 
                                uniqueValues={uniqueValues.operatingUnit} 
                            />
                            <StaffingRequirementColumnHeader 
                                label="Status" 
                                columnKey="hiringStatus" 
                                sortConfig={sortConfig} 
                                onSort={handleSort} 
                                filters={columnFilters.hiringStatus || []} 
                                onFilterChange={(val) => handleColumnFilterChange('hiringStatus', val)} 
                                uniqueValues={uniqueValues.hiringStatus} 
                            />
                            <StaffingRequirementColumnHeader 
                                label="Position" 
                                columnKey="personnelPosition" 
                                sortConfig={sortConfig} 
                                onSort={handleSort} 
                                filters={columnFilters.personnelPosition || []} 
                                onFilterChange={(val) => handleColumnFilterChange('personnelPosition', val)} 
                                uniqueValues={uniqueValues.personnelPosition} 
                            />
                            <StaffingRequirementColumnHeader 
                                label="Type" 
                                columnKey="personnelType" 
                                sortConfig={sortConfig} 
                                onSort={handleSort} 
                                filters={columnFilters.personnelType || []} 
                                onFilterChange={(val) => handleColumnFilterChange('personnelType', val)} 
                                uniqueValues={uniqueValues.personnelType} 
                            />
                            <StaffingRequirementColumnHeader 
                                label="Annual Salary" 
                                columnKey="annualSalary" 
                                sortConfig={sortConfig} 
                                onSort={handleSort} 
                                filters={[]} 
                                onFilterChange={() => {}} 
                                uniqueValues={[]} 
                                isNumeric
                            />
                            <StaffingRequirementColumnHeader 
                                label="Fund Year" 
                                columnKey="fundYear" 
                                sortConfig={sortConfig} 
                                onSort={handleSort} 
                                filters={columnFilters.fundYear || []} 
                                onFilterChange={(val) => handleColumnFilterChange('fundYear', val)} 
                                uniqueValues={uniqueValues.fundYear} 
                            />
                            <StaffingRequirementColumnHeader 
                                label="Fund Type" 
                                columnKey="fundType" 
                                sortConfig={sortConfig} 
                                onSort={handleSort} 
                                filters={columnFilters.fundType || []} 
                                onFilterChange={(val) => handleColumnFilterChange('fundType', val)} 
                                uniqueValues={uniqueValues.fundType} 
                            />
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                {isSelectionMode ? "Select" : "Actions"}
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {paginatedData.map((item) => (
                            <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500 dark:text-gray-400">{item.uid}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{item.operatingUnit}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-xs"><span className={getHiringStatusBadge(item.hiringStatus)}>{item.hiringStatus}</span></td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                    {item.personnelPosition}
                                    <div className="text-xs text-gray-400">SG-{item.salaryGrade}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.personnelType}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(item.annualSalary)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{item.fundYear}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{item.fundType}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    {isSelectionMode ? (
                                        <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={(e) => { e.stopPropagation(); handleSelectRow(item.id); }} className="mr-3 h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"/>
                                    ) : (
                                        <div className="flex justify-end gap-3">
                                            <button onClick={() => onSelect(item)} className="text-emerald-600 hover:text-emerald-900">Edit</button>
                                            {canEdit && (
                                                <button onClick={() => { setItemToDelete(item); setIsDeleteModalOpen(true); }} className="text-red-600 hover:text-red-900">Delete</button>
                                            )}
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            <div className="py-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm"><span className="text-gray-700 dark:text-gray-300">Show</span><select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1 pl-2 pr-8 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm">{[10, 20, 50, 100].map(size => ( <option key={size} value={size}>{size}</option> ))}</select><span className="text-gray-700 dark:text-gray-300">entries</span></div>
                <div className="flex items-center gap-4 text-sm"><span className="text-gray-700 dark:text-gray-300">Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredItems.length)} to {Math.min(currentPage * itemsPerPage, filteredItems.length)} of {filteredItems.length} entries</span><div className="flex items-center gap-2"><button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">Previous</button><span className="px-2 font-medium">{currentPage} / {totalPages}</span><button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">Next</button></div></div>
            </div>
        </div>
    );
};
