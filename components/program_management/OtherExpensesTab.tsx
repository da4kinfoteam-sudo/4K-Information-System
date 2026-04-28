// Author: 4K 
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MonthYearPicker } from '../ui/MonthYearPicker';
import { OtherProgramExpense, operatingUnits, fundTypes, tiers, objectTypes, FundType, Tier, ObjectType } from '../../constants';
import { formatCurrency } from '../reports/ReportUtils';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection, useUserAccess, usePagination } from '../mainfunctions/TableHooks';
import { supabase } from '../../supabaseClient';
import { resolveOperatingUnit, resolveTier } from '../mainfunctions/ImportExportService';
import useLocalStorageState from '../../hooks/useLocalStorageState'; // Import for persistent state
import { Search, Filter, ArrowUpDown, ArrowUp, ArrowDown, X, Check, ChevronDown } from 'lucide-react';

const FilterIcon = () => (
    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
    </svg>
);

interface OtherExpenseColumnHeaderProps {
    label: string;
    columnKey: keyof OtherProgramExpense;
    sortConfig: { key: string; direction: 'ascending' | 'descending' } | null;
    onSort: (key: any, direction: 'ascending' | 'descending') => void;
    filters: string[];
    onFilterChange: (values: string[]) => void;
    uniqueValues: string[];
    isNumeric?: boolean;
}

const OtherExpenseColumnHeader: React.FC<OtherExpenseColumnHeaderProps> = ({ 
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
    const isFiltered = filters.length > 0;

    const toggleFilter = (value: string) => {
        if (filters.includes(value)) {
            onFilterChange(filters.filter(f => f !== value));
        } else {
            onFilterChange([...filters, value]);
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

declare const XLSX: any;

const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const DuplicateIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
    </svg>
);

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm transition-all";

export const parseOtherExpenseRow = (row: any, commonData: any): OtherProgramExpense => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Calculate totals from monthly columns if present for defaults, but prioritize row.amount
    let calculatedAmount = 0;
    months.forEach(m => { calculatedAmount += (Number(row[`disbursement${m}`]) || 0); });
    
    let calculatedActual = 0;
    months.forEach(m => { calculatedActual += (Number(row[`actualDisbursement${m}`]) || 0); });

    // Use row.amount if present (Target Obligation), otherwise fallback to calculated
    const finalAmount = Number(row.amount) || calculatedAmount || 0;
    const finalActualDisbursement = calculatedActual > 0 ? calculatedActual : (Number(row.actualDisbursementAmount) || 0);

    const result: any = {
        ...commonData,
        particulars: row.particulars || '',
        amount: finalAmount,
        obligatedAmount: Number(row.obligatedAmount) || finalAmount, // Default to amount if missing
        actualDisbursementAmount: finalActualDisbursement
    };

    months.forEach(m => {
        result[`disbursement${m}`] = Number(row[`disbursement${m}`]) || 0;
        result[`actualDisbursement${m}`] = Number(row[`actualDisbursement${m}`]) || 0;
    });

    return result as OtherProgramExpense;
};

interface OtherExpensesTabProps {
    items: OtherProgramExpense[];
    setItems: React.Dispatch<React.SetStateAction<OtherProgramExpense[]>>;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    onSelect: (item: OtherProgramExpense) => void;
}

export const OtherExpensesTab: React.FC<OtherExpensesTabProps> = ({ items, setItems, uacsCodes, onSelect }) => {
    const { currentUser } = useAuth();
    const { canEdit, canViewAll } = useUserAccess('Program Management');
    
    // Local State
    const [view, setView] = useState<'list' | 'form'>('list');
    const [editingItem, setEditingItem] = useState<OtherProgramExpense | null>(null);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [showErrorAlert, setShowErrorAlert] = useState(false);
    const [selectedObjectType, setSelectedObjectType] = useState<ObjectType>('MOOE');
    const [selectedParticular, setSelectedParticular] = useState('');
    const [uacsDescription, setUacsDescription] = useState('');
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<OtherProgramExpense | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [selectionIntent, setSelectionIntent] = useState<'delete' | 'clone'>('delete');

    // Search and Column Filtering/Sorting
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' }>({ key: 'id', direction: 'descending' });
    const [columnFilters, setColumnFilters] = useState<{ [key: string]: string[] }>({});

    const { 
        isSelectionMode, selectedIds, setSelectedIds, 
        isMultiDeleteModalOpen, setIsMultiDeleteModalOpen, toggleSelectionMode, 
        handleSelectAll, handleSelectRow, resetSelection 
    } = useSelection<OtherProgramExpense>();

    // Form State
    const initialFormState: OtherProgramExpense = {
        id: 0, uid: '', operatingUnit: '', uacsCode: '', obligationDate: '', disbursementDate: '', fundType: 'Current' as FundType, fundYear: new Date().getFullYear(), tier: 'Tier 1' as Tier, encodedBy: '',
        particulars: '', amount: 0, obligatedAmount: 0, status: 'Proposed',
        actualDate: '', actualAmount: 0, actualObligationDate: '', actualDisbursementDate: '', actualObligationAmount: 0, actualDisbursementAmount: 0,
        // Target Schedule
        disbursementJan: 0, disbursementFeb: 0, disbursementMar: 0, disbursementApr: 0, disbursementMay: 0, disbursementJun: 0,
        disbursementJul: 0, disbursementAug: 0, disbursementSep: 0, disbursementOct: 0, disbursementNov: 0, disbursementDec: 0,
        // Actual Schedule (Init to 0)
        actualDisbursementJan: 0, actualDisbursementFeb: 0, actualDisbursementMar: 0, actualDisbursementApr: 0, actualDisbursementMay: 0, actualDisbursementJun: 0,
        actualDisbursementJul: 0, actualDisbursementAug: 0, actualDisbursementSep: 0, actualDisbursementOct: 0, actualDisbursementNov: 0, actualDisbursementDec: 0
    };
    const [formData, setFormData] = useState<OtherProgramExpense>(initialFormState);

    const getInputClasses = (fieldName: string) => {
        const baseClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm transition-all";
        if (validationErrors.includes(fieldName)) {
            return `${baseClasses} border-red-500 ring-2 ring-red-200 dark:ring-red-900/30`;
        }
        return `${baseClasses} border-gray-300 dark:border-gray-600`;
    };

    const availableUacsCodes = useMemo(() => {
        let codes: { code: string, desc: string }[] = [];
        if (selectedParticular) {
            const ot = selectedObjectType;
            const ep = selectedParticular;
            if (uacsCodes[ot] && uacsCodes[ot][ep]) {
                Object.entries(uacsCodes[ot][ep]).forEach(([code, desc]) => {
                    codes.push({ code, desc: desc as string });
                });
            }
        } else {
             if (uacsCodes[selectedObjectType]) {
                 Object.entries(uacsCodes[selectedObjectType]).forEach(([ep, codesObj]) => {
                     Object.entries(codesObj).forEach(([code, desc]) => {
                         codes.push({ code, desc });
                     });
                 });
             }
        }
        return codes;
    }, [selectedParticular, selectedObjectType, uacsCodes]);

    const selectedUacsDesc = useMemo(() => {
        return availableUacsCodes.find(c => c.code === formData.uacsCode)?.desc || '';
    }, [formData.uacsCode, availableUacsCodes]);

    useEffect(() => {
        // Removed ouFilter dependency
    }, [currentUser, canViewAll]);

    useEffect(() => {
        if (view === 'form') {
            if (editingItem) {
                // Should technically not be reachable via Add New but keeping logic robust
                setFormData({ ...initialFormState, ...editingItem });
                let foundType: ObjectType = 'MOOE'; let foundParticular = '';
                outerLoop: for (const type of objectTypes) { if(uacsCodes[type]) { for (const part in uacsCodes[type]) { if (uacsCodes[type][part].hasOwnProperty(editingItem.uacsCode)) { foundType = type; foundParticular = part; break outerLoop; } } } }
                setSelectedObjectType(foundType); setSelectedParticular(foundParticular);
            } else {
                setFormData({ ...initialFormState, operatingUnit: currentUser?.operatingUnit || (canViewAll ? 'NPMO' : currentUser?.operatingUnit || ''), encodedBy: currentUser?.fullName || '' });
                setSelectedObjectType('MOOE'); setSelectedParticular('');
            }
        }
    }, [view, editingItem, uacsCodes, currentUser, canViewAll]);

    // Auto-calc totals from target schedules only
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const targetDisbursementTotal = months.reduce((sum, m) => sum + (Number((formData as any)[`disbursement${m}`]) || 0), 0);

    const availableYears = useMemo(() => {
        const years = new Set<string>(); 
        items.forEach(i => {
            if(i.fundYear) years.add(i.fundYear.toString());
        }); 
        return Array.from(years).sort().reverse();
    }, [items]);

    const uniqueValues = useMemo(() => {
        const values: { [key: string]: string[] } = {
            uid: [],
            operatingUnit: [],
            status: [],
            uacsCode: [],
            particulars: [],
            fundYear: [],
            fundType: []
        };

        items.forEach(item => {
            Object.keys(values).forEach(key => {
                const val = String(item[key as keyof OtherProgramExpense] || '');
                if (val && !values[key].includes(val)) {
                    values[key].push(val);
                }
            });
        });

        Object.keys(values).forEach(key => values[key].sort());
        return values;
    }, [items]);

    const filteredItems = useMemo(() => {
        let filtered = items;

        // Global Search (UID or UACs code or Particulars)
        if (searchTerm) {
            const lowSearch = searchTerm.toLowerCase();
            filtered = filtered.filter(item => 
                (item.uid || '').toLowerCase().includes(lowSearch) || 
                (item.uacsCode || '').toLowerCase().includes(lowSearch) ||
                (item.particulars || '').toLowerCase().includes(lowSearch)
            );
        }

        // Column Filters
        Object.keys(columnFilters).forEach(key => {
            const selectedValues = columnFilters[key];
            if (selectedValues && selectedValues.length > 0) {
                filtered = filtered.filter(item => {
                    const itemValue = String(item[key as keyof OtherProgramExpense] || '');
                    return selectedValues.includes(itemValue);
                });
            }
        });

        // Sorting
        return [...filtered].sort((a, b) => {
            const aValue = a[sortConfig.key as keyof OtherProgramExpense];
            const bValue = b[sortConfig.key as keyof OtherProgramExpense];

            if (aValue === bValue) return 0;
            
            // Handle null/undefined
            if (aValue === null || aValue === undefined) return sortConfig.direction === 'ascending' ? -1 : 1;
            if (bValue === null || bValue === undefined) return sortConfig.direction === 'ascending' ? 1 : -1;

            const comparison = aValue < bValue ? -1 : 1;
            return sortConfig.direction === 'ascending' ? comparison : -comparison;
        });
    }, [items, searchTerm, sortConfig, columnFilters]);

    const handleSort = (key: keyof OtherProgramExpense, direction: 'asc' | 'desc') => {
        setSortConfig({ key, direction });
    };

    const handleColumnFilterChange = (column: string, values: string[]) => {
        setColumnFilters(prev => ({ ...prev, [column]: values }));
    };

    const { currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData } = usePagination(filteredItems, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        
        if (name === 'uacsCode') {
            setFormData(prev => ({ ...prev, [name]: value }));
            
            // Auto-select particular if a valid code is entered
            if (value && uacsCodes[selectedObjectType]) {
                const trimmedValue = value.trim();
                let foundParticular = '';
                
                // First check if the code exists in the CURRENT selected particular (optimization)
                if (selectedParticular && uacsCodes[selectedObjectType][selectedParticular] && uacsCodes[selectedObjectType][selectedParticular][trimmedValue]) {
                    foundParticular = selectedParticular;
                } else {
                    // Search all particulars
                    for (const [particular, codes] of Object.entries(uacsCodes[selectedObjectType])) {
                        if (codes[trimmedValue]) {
                            foundParticular = particular;
                            break;
                        }
                    }
                }

                if (foundParticular && foundParticular !== selectedParticular) {
                    setSelectedParticular(foundParticular);
                }
            }
        } else {
            setFormData(prev => {
                const newData = { ...prev, [name]: value };
                // Sync Obligated Amount with Target Allocation (amount)
                if (name === 'amount') {
                    newData.obligatedAmount = Number(value);
                }
                return newData;
            });
        }
    };

    useEffect(() => {
        if (view === 'form' && !editingItem) {
            const currentYear = new Date().getFullYear();
            setFormData(prev => ({
                ...prev,
                fundYear: currentYear,
                obligationDate: `${currentYear}-01-01`
            }));
        }
    }, [view, editingItem]);

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const requiredFields = [
            { key: 'operatingUnit', label: 'Operating Unit' },
            { key: 'status', label: 'Status' },
            { key: 'uacsCode', label: 'UACS Code' },
            { key: 'particulars', label: 'Particular' },
            { key: 'obligationDate', label: 'Obligation Date' },
            { key: 'amount', label: 'Target Allocation Amount' }
        ];

        const disbursementFields = [
            'disbursementJan', 'disbursementFeb', 'disbursementMar', 'disbursementApr',
            'disbursementMay', 'disbursementJun', 'disbursementJul', 'disbursementAug',
            'disbursementSep', 'disbursementOct', 'disbursementNov', 'disbursementDec'
        ];

        const errors: string[] = [];
        const missingLabels: string[] = [];

        requiredFields.forEach(field => {
            if (!formData[field.key as keyof OtherProgramExpense]) {
                errors.push(field.key);
                missingLabels.push(field.label);
            }
        });

        disbursementFields.forEach(field => {
            if (formData[field as keyof OtherProgramExpense] === undefined || formData[field as keyof OtherProgramExpense] === null) {
                errors.push(field);
                if (!missingLabels.includes('Monthly Disbursements')) {
                    missingLabels.push('Monthly Disbursements');
                }
            }
        });

        if (errors.length > 0) {
            setValidationErrors(errors);
            alert(`Please fill in the following required fields:\n- ${missingLabels.join('\n- ')}`);
            return;
        }

        setValidationErrors([]);

        const workflow_status = currentUser?.role === 'RFO - User' ? 'PENDING' : 'APPROVED';

        const submissionData: any = {
            ...formData,
            amount: Number(formData.amount), 
            obligatedAmount: Number(formData.amount), // Set obligatedAmount equal to amount (allocation)
            fundYear: Number(formData.fundYear),
            // Default 0 for new accomplishments
            actualAmount: 0, actualObligationAmount: 0, actualDisbursementAmount: 0,
            encodedBy: formData.encodedBy || currentUser?.fullName || 'System', 
            workflow_status,
            updated_at: new Date().toISOString()
        };

        // Ensure monthly fields are numbers (Target)
        months.forEach(m => {
            // @ts-ignore
            submissionData[`disbursement${m}`] = Number(formData[`disbursement${m}`]);
            // @ts-ignore
            submissionData[`actualDisbursement${m}`] = 0; // Initialize actuals to 0
        });

        // Always remove ID from payload
        delete submissionData.id;
        delete submissionData.physicalDeliveryDate;

        submissionData.uid = formData.uid || `OE-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
        submissionData.created_at = new Date().toISOString();

        if (supabase) {
            const { data, error } = await supabase.from('other_program_expenses').insert([submissionData]).select().single();
            if (error) { 
                console.error("Create error:", error); 
                alert(`Failed to create: ${error.message}`); 
                return; 
            }
            if (data) setItems(prev => [data, ...prev]);
        } else {
            const newItem = { ...submissionData, id: Date.now() } as OtherProgramExpense;
            setItems(prev => [newItem, ...prev]);
        }
        setView('list'); setEditingItem(null);
    };

    const handleDelete = async () => {
        if (!itemToDelete) return;
        if (supabase) {
            try {
                const { error: archiveError } = await supabase.from('trash_bin').insert([{
                    entity_type: 'other_program_expense',
                    original_id: itemToDelete.id,
                    data: itemToDelete,
                    deleted_by: currentUser?.email || currentUser?.fullName || 'Unknown',
                    deleted_at: new Date().toISOString()
                }]);
                if (archiveError) throw archiveError;

                const { error: deleteError } = await supabase.from('other_program_expenses').delete().eq('id', itemToDelete.id);
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
                    entity_type: 'other_program_expense',
                    original_id: item.id,
                    data: item,
                    deleted_by: currentUser?.email || currentUser?.fullName || 'Unknown',
                    deleted_at: new Date().toISOString()
                }));

                const { error: archiveError } = await supabase.from('trash_bin').insert(archivePayload);
                if (archiveError) throw archiveError;

                const { error: deleteError } = await supabase.from('other_program_expenses').delete().in('id', selectedIds);
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

        if (!window.confirm(`Are you sure you want to clone ${itemsToClone.length} items?`)) return;

        const workflow_status = currentUser?.role === 'RFO - User' ? 'PENDING' : 'APPROVED';
        const currentTimestamp = new Date().toISOString();
        const newItemsPayload = itemsToClone.map((item, index) => {
            const { id, uid, created_at, updated_at, physicalDeliveryDate, ...rest } = item;
            // Generate new UID
            const newUid = `OE-${item.fundYear}-${Date.now().toString().slice(-6)}${index}`;
            
            // Reset actuals for new clone
            const resetActuals: any = {
                actualDate: '',
                actualAmount: 0,
                actualObligationDate: '',
                actualDisbursementDate: '',
                actualObligationAmount: 0,
                actualDisbursementAmount: 0,
                actualDisbursementJan: 0, actualDisbursementFeb: 0, actualDisbursementMar: 0, actualDisbursementApr: 0,
                actualDisbursementMay: 0, actualDisbursementJun: 0, actualDisbursementJul: 0, actualDisbursementAug: 0,
                actualDisbursementSep: 0, actualDisbursementOct: 0, actualDisbursementNov: 0, actualDisbursementDec: 0
            };

            return {
                ...rest,
                ...resetActuals,
                uid: newUid,
                workflow_status,
                encodedBy: currentUser?.fullName || 'System Clone',
                created_at: currentTimestamp,
                updated_at: currentTimestamp,
            };
        });

        if (supabase) {
            const { data, error } = await supabase.from('other_program_expenses').insert(newItemsPayload).select();
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

    const getWorkflowStatusBadge = (status?: string) => {
        const baseClasses = "px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider inline-block";
        let classes = `${baseClasses} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600`;
        switch (status) {
            case 'APPROVED': classes = `${baseClasses} bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800`; break;
            case 'PENDING': classes = `${baseClasses} bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800`; break;
            case 'REJECTED': classes = `${baseClasses} bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800`; break;
            case 'DRAFT': classes = `${baseClasses} bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800`; break;
        }
        return <span className={classes}>{status || 'DRAFT'}</span>;
    };

    const canApprove = (role?: string) => {
        return ['Super Admin', 'Administrator', 'Focal - User', 'Management'].includes(role || '');
    };

    const handleApprove = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm('Are you sure you want to approve this expense?')) return;
        
        if (supabase) {
            const { error } = await supabase.from('other_program_expenses').update({ workflow_status: 'APPROVED' }).eq('id', id);
            if (error) {
                alert('Failed to approve: ' + error.message);
            } else {
                setItems(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'APPROVED' } : s));
            }
        } else {
            setItems(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'APPROVED' } : s));
        }
    };

    const handleReject = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const reason = window.prompt('Please provide a reason for rejection:');
        if (reason === null) return;

        if (supabase) {
            const { error } = await supabase.from('other_program_expenses').update({ 
                workflow_status: 'REJECTED',
                remarks: reason ? `REJECTED: ${reason}` : undefined
            }).eq('id', id);
            if (error) {
                alert('Failed to reject: ' + error.message);
            } else {
                setItems(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'REJECTED', remarks: reason ? `REJECTED: ${reason}` : s.remarks } : s));
            }
        } else {
            setItems(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'REJECTED', remarks: reason ? `REJECTED: ${reason}` : s.remarks } : s));
        }
    };

    const handleDownloadReport = () => {
        const data = filteredItems.map(item => ({
            UID: item.uid, OU: item.operatingUnit, Particulars: item.particulars, Amount: item.amount, 'Obligated Amount': item.obligatedAmount, 'Fund Type': item.fundType, 'Fund Year': item.fundYear, Tier: item.tier, 'Obligation Date': item.obligationDate, 'Disbursement Date': item.disbursementDate
        }));
        const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Other Expenses"); XLSX.writeFile(wb, "Other_Expenses_Report.xlsx");
    };

    const handleDownloadTemplate = () => {
        const monthHeaders = ['disbursementJan', 'disbursementFeb', 'disbursementMar', 'disbursementApr', 'disbursementMay', 'disbursementJun', 'disbursementJul', 'disbursementAug', 'disbursementSep', 'disbursementOct', 'disbursementNov', 'disbursementDec'];
        const headers = ['operatingUnit', 'fundYear', 'fundType', 'tier', 'obligationDate', 'amount', 'obligatedAmount', 'uacsCode', 'particulars', ...monthHeaders];
        const exampleData = [{ operatingUnit: 'NPMO', fundYear: 2024, fundType: 'Current', tier: 'Tier 1', obligationDate: '2024-01-15', amount: 20000, obligatedAmount: 10000, uacsCode: '50299990-99', particulars: 'Miscellaneous Expenses', disbursementJan: 10000, disbursementFeb: 5000 }];
        const ws = XLSX.utils.json_to_sheet(exampleData, { header: headers }); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Template"); XLSX.writeFile(wb, "Other_Exp_Template.xlsx");
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file) return; setIsUploading(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = event.target?.result; const workbook = XLSX.read(data, { type: 'array' });
                const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as any[];
                const currentTimestamp = new Date().toISOString();
                const workflow_status = currentUser?.role === 'RFO - User' ? 'PENDING' : 'APPROVED';

                const newItems = jsonData.map((row: any, index: number) => {
                    const fundYear = Number(row.fundYear) || new Date().getFullYear();
                    const uid = `OE-${fundYear}-${Date.now().toString().slice(-4)}${index}`;
                    const resolvedOU = row.operatingUnit ? resolveOperatingUnit(row.operatingUnit) : 'NPMO';

                    return parseOtherExpenseRow(row, {
                        uid, 
                        operatingUnit: resolvedOU, 
                        fundYear: fundYear, 
                        fundType: row.fundType || 'Current', 
                        tier: resolveTier(row.tier) || 'Tier 1', 
                        obligationDate: row.obligationDate || '', 
                        uacsCode: row.uacsCode || '', 
                        encodedBy: currentUser?.fullName || 'Upload', 
                        workflow_status,
                        created_at: currentTimestamp, 
                        updated_at: currentTimestamp
                    });
                });
                if (supabase) {
                    const { error } = await supabase.from('other_program_expenses').insert(newItems); if (error) throw error;
                    const { data } = await supabase.from('other_program_expenses').select('*').order('id', { ascending: true }); if (data) setItems(data as OtherProgramExpense[]);
                } else { setItems(prev => [...newItems.map((i, idx) => ({ ...i, id: Date.now() + idx })), ...prev]); }
                alert(`${newItems.length} items imported.`);
            } catch (err: any) { alert(`Import failed: ${err.message}`); } finally { setIsUploading(false); if(e.target) e.target.value = ''; }
        };
        reader.readAsArrayBuffer(file);
    };

    if (view === 'form') {
        return (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-100 dark:border-gray-700">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white">
                        {editingItem ? 'Edit Other Expense' : 'Add New Other Expense'}
                    </h3>
                    <button onClick={() => { setView('list'); setEditingItem(null); setValidationErrors([]); }} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Cancel</button>
                </div>
                <form onSubmit={handleFormSubmit} className="space-y-8">
                    {/* Section 1: Basic Information */}
                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                        <legend className="px-2 font-medium text-emerald-700 dark:text-emerald-400">Basic Information</legend>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Operating Unit <span className="text-red-500">*</span></label>
                                <select 
                                    name="operatingUnit" 
                                    value={formData.operatingUnit} 
                                    onChange={handleInputChange} 
                                    disabled={!canViewAll && !!currentUser} 
                                    className={`${getInputClasses('operatingUnit')} disabled:bg-gray-100 disabled:cursor-not-allowed`}
                                >
                                    <option value="">Select OU</option>
                                    {operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status <span className="text-red-500">*</span></label>
                                <select name="status" value={formData.status} onChange={handleInputChange} className={commonInputClasses}>
                                    <option value="Proposed">Proposed</option>
                                    <option value="Ongoing">Ongoing</option>
                                    <option value="Completed">Completed</option>
                                    <option value="Cancelled">Cancelled</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Particular <span className="text-red-500">*</span></label>
                                <input type="text" name="particulars" value={formData.particulars} onChange={handleInputChange} placeholder="Enter particulars" className={getInputClasses('particulars')} />
                            </div>
                        </div>
                    </fieldset>

                    {/* Section 2: Funding */}
                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                        <legend className="px-2 font-medium text-emerald-700 dark:text-emerald-400">Funding</legend>
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fund Year <span className="text-red-500">*</span></label>
                                    <input type="number" name="fundYear" value={formData.fundYear} onChange={handleInputChange} className={getInputClasses('fundYear')} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fund Type <span className="text-red-500">*</span></label>
                                    <select name="fundType" value={formData.fundType} onChange={handleInputChange} className={commonInputClasses}>
                                        {fundTypes.map(f => <option key={f} value={f}>{f}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tier <span className="text-red-500">*</span></label>
                                    <select name="tier" value={formData.tier} onChange={handleInputChange} className={commonInputClasses}>
                                        {tiers.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* UACS Row */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Object Type <span className="text-red-500">*</span></label>
                                    <select 
                                        value={selectedObjectType} 
                                        onChange={e => { setSelectedObjectType(e.target.value as ObjectType); setSelectedParticular(''); setFormData(prev => ({...prev, uacsCode: ''})); }} 
                                        className={commonInputClasses}
                                    >
                                        {objectTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Particular <span className="text-red-500">*</span></label>
                                    <select 
                                        value={selectedParticular} 
                                        onChange={e => { 
                                            setSelectedParticular(e.target.value); 
                                            // Find first code for this particular
                                            const ot = selectedObjectType;
                                            const ep = e.target.value;
                                            if (uacsCodes[ot] && uacsCodes[ot][ep]) {
                                                const firstCode = Object.keys(uacsCodes[ot][ep])[0];
                                                setFormData(prev => ({...prev, uacsCode: firstCode}));
                                            } else {
                                                setFormData(prev => ({...prev, uacsCode: ''}));
                                            }
                                        }} 
                                        className={commonInputClasses}
                                    >
                                        <option value="">Select Particular</option>
                                        {uacsCodes[selectedObjectType] && Object.keys(uacsCodes[selectedObjectType]).map(p => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                </div>
                                <div className="relative">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">UACS Code <span className="text-red-500">*</span></label>
                                    <div className="relative">
                                        <input 
                                            type="text" 
                                            name="uacsCode" 
                                            value={formData.uacsCode} 
                                            onChange={handleInputChange} 
                                            list="uacs-codes-list"
                                            className={`${getInputClasses('uacsCode')} pr-10`} 
                                        />
                                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                                            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>
                                    <datalist id="uacs-codes-list">
                                        {availableUacsCodes.map((item) => (
                                            <option key={item.code} value={item.code}>{item.code} - {item.desc}</option>
                                        ))}
                                    </datalist>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                                    <input 
                                        type="text" 
                                        value={selectedUacsDesc} 
                                        readOnly 
                                        className={`${commonInputClasses} bg-gray-50 dark:bg-gray-800/50 cursor-not-allowed font-normal`} 
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Obligation Date <span className="text-red-500">*</span></label>
                                    <MonthYearPicker 
                                        value={formData.obligationDate} 
                                        onChange={(val) => {
                                            setFormData(prev => ({...prev, obligationDate: val}));
                                            if (validationErrors.includes('obligationDate')) {
                                                setValidationErrors(prev => prev.filter(f => f !== 'obligationDate'));
                                            }
                                        }} 
                                        className={validationErrors.includes('obligationDate') ? 'border-red-500 ring-red-500' : ''}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Allocation Amount <span className="text-red-500">*</span></label>
                                    <input type="number" name="amount" value={formData.amount} onChange={handleInputChange} placeholder="0.00" className={getInputClasses('amount')} />
                                </div>
                            </div>

                            <div className="mt-8">
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 uppercase tracking-wider">Monthly Disbursement Schedule <span className="text-red-500">*</span></h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                    {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(month => (
                                        <div key={month}>
                                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{month}</label>
                                            <input 
                                                type="number" 
                                                name={`disbursement${month}`} 
                                                value={formData[`disbursement${month}` as keyof OtherProgramExpense] || 0} 
                                                onChange={handleInputChange} 
                                                className={getInputClasses(`disbursement${month}`)} 
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </fieldset>

                    <div className="flex justify-end pt-6 border-t border-gray-100 dark:border-gray-700">
                        <button type="submit" className="px-6 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors font-medium shadow-sm">
                            Save
                        </button>
                    </div>
                </form>
            </div>
        );
    }

    // List View
    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            {isDeleteModalOpen && (<div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"><div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl"><h3 className="text-lg font-bold">Confirm Deletion</h3><p className="my-4">Are you sure?</p><div className="flex justify-end gap-4"><button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 rounded-md text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button><button onClick={handleDelete} className="px-4 py-2 rounded-md text-sm bg-red-600 text-white hover:bg-red-700">Delete</button></div></div></div>)}
            {isMultiDeleteModalOpen && (<div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"><div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl"><h3 className="text-lg font-bold">Confirm Bulk Deletion</h3><p className="my-4">Delete {selectedIds.length} items?</p><div className="flex justify-end gap-4"><button onClick={() => setIsMultiDeleteModalOpen(false)} className="px-4 py-2 rounded-md text-sm bg-gray-200 dark:bg-gray-700">Cancel</button><button onClick={handleMultiDelete} className="px-4 py-2 rounded-md text-sm bg-red-600 text-white hover:bg-red-700">Delete All</button></div></div></div>)}

            <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="relative flex-1 md:flex-none">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-gray-400" />
                        </span>
                        <input 
                            type="text" 
                            placeholder="Search Other Expenses..." 
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
                            onClick={() => { setEditingItem(null); setView('form'); }} 
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
                            <OtherExpenseColumnHeader label="UID" columnKey="uid" sortConfig={sortConfig} onSort={handleSort} filters={columnFilters['uid'] || []} onFilterChange={(v) => handleColumnFilterChange('uid', v)} uniqueValues={uniqueValues['uid']} />
                            <OtherExpenseColumnHeader label="OU" columnKey="operatingUnit" sortConfig={sortConfig} onSort={handleSort} filters={columnFilters['operatingUnit'] || []} onFilterChange={(v) => handleColumnFilterChange('operatingUnit', v)} uniqueValues={uniqueValues['operatingUnit']} />
                            <OtherExpenseColumnHeader label="Status" columnKey="status" sortConfig={sortConfig} onSort={handleSort} filters={columnFilters['status'] || []} onFilterChange={(v) => handleColumnFilterChange('status', v)} uniqueValues={uniqueValues['status']} />
                            <OtherExpenseColumnHeader label="UACS Code" columnKey="uacsCode" sortConfig={sortConfig} onSort={handleSort} filters={columnFilters['uacsCode'] || []} onFilterChange={(v) => handleColumnFilterChange('uacsCode', v)} uniqueValues={uniqueValues['uacsCode']} />
                            <OtherExpenseColumnHeader label="Particulars" columnKey="particulars" sortConfig={sortConfig} onSort={handleSort} filters={columnFilters['particulars'] || []} onFilterChange={(v) => handleColumnFilterChange('particulars', v)} uniqueValues={uniqueValues['particulars']} />
                            <OtherExpenseColumnHeader label="Amount" columnKey="amount" sortConfig={sortConfig} onSort={handleSort} filters={columnFilters['amount'] || []} onFilterChange={(v) => handleColumnFilterChange('amount', v)} uniqueValues={[]} isNumeric />
                            <OtherExpenseColumnHeader label="Fund Year" columnKey="fundYear" sortConfig={sortConfig} onSort={handleSort} filters={columnFilters['fundYear'] || []} onFilterChange={(v) => handleColumnFilterChange('fundYear', v)} uniqueValues={uniqueValues['fundYear']} />
                            <OtherExpenseColumnHeader label="Fund Type" columnKey="fundType" sortConfig={sortConfig} onSort={handleSort} filters={columnFilters['fundType'] || []} onFilterChange={(v) => handleColumnFilterChange('fundType', v)} uniqueValues={uniqueValues['fundType']} />
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Workflow Status</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{isSelectionMode ? "Select" : "Actions"}</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {paginatedData.map((item) => (
                            <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500 dark:text-gray-400">{item.uid}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{item.operatingUnit}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                        item.status === 'Completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                        item.status === 'Ongoing' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                                        item.status === 'Cancelled' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                                        'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                                    }`}>
                                        {item.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-medium text-gray-900 dark:text-white">
                                    {item.uacsCode}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-900 dark:text-white"><div className="truncate w-64" title={item.particulars}>{item.particulars}</div></td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(item.amount)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{item.fundYear}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                    <div>{item.fundType}</div>
                                    <div className="text-[10px] text-gray-500 dark:text-gray-400">{item.tier}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-xs">
                                    <div className="flex flex-col gap-1 items-start">
                                        {getWorkflowStatusBadge(item.workflow_status)}
                                        {item.workflow_status === 'PENDING' && canApprove(currentUser?.role) && (
                                            <div className="flex gap-1 mt-1">
                                                <button 
                                                    onClick={(e) => handleApprove(item.id, e)} 
                                                    className="p-1 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 transition-colors"
                                                    title="Approve"
                                                >
                                                    <Check className="h-3 w-3" />
                                                </button>
                                                <button 
                                                    onClick={(e) => handleReject(item.id, e)} 
                                                    className="p-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                                                    title="Reject"
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    {canEdit && (isSelectionMode ? (
                                        <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={(e) => { e.stopPropagation(); handleSelectRow(item.id); }} className="mr-3 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"/>
                                    ) : (
                                        <div className="flex justify-end gap-3">
                                            <button onClick={() => onSelect(item)} className="text-emerald-600 hover:text-emerald-900">View</button>
                                            <button onClick={() => { setItemToDelete(item); setIsDeleteModalOpen(true); }} className="text-red-600 hover:text-red-900">Delete</button>
                                        </div>
                                    ))}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            <div className="py-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm"><span className="text-gray-700 dark:text-gray-300">Show</span><select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1 pl-2 pr-8 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm">{[10, 20, 50, 100].map(size => ( <option key={size} value={size}>{size}</option> ))}</select><span className="text-gray-700 dark:text-gray-300">entries</span></div>
                <div className="flex items-center gap-4 text-sm"><span className="text-gray-700 dark:text-gray-300">Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredItems.length)} to {Math.min(currentPage * itemsPerPage, filteredItems.length)} of {filteredItems.length} entries</span><div className="flex items-center gap-2"><button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">Previous</button><span className="px-2 font-medium">{currentPage} / {totalPages}</span><button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">Next</button></div></div>
            </div>
        </div>
    );
};