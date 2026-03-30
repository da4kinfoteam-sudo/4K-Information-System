
// Author: 4K 
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MonthYearPicker } from '../ui/MonthYearPicker';
import { OfficeRequirement, operatingUnits, fundTypes, tiers, objectTypes, FundType, Tier, ObjectType } from '../../constants';
import { formatCurrency } from '../reports/ReportUtils';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection, getUserPermissions, usePagination } from '../mainfunctions/TableHooks';
import { supabase } from '../../supabaseClient';
import { parseLocation } from '../LocationPicker'; 
import { resolveOperatingUnit, resolveTier } from '../mainfunctions/ImportExportService';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import { Search, Filter, ArrowUpDown, ArrowUp, ArrowDown, X } from 'lucide-react';

declare const XLSX: any;

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

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

const FilterIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </svg>
);

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm";

// --- COLUMN HEADER COMPONENT ---
interface OfficeRequirementColumnHeaderProps {
    label: string;
    columnKey: keyof OfficeRequirement;
    sortConfig: { key: string; direction: 'ascending' | 'descending' } | null;
    onSort: (key: any, direction: 'ascending' | 'descending') => void;
    filters: string[];
    onFilterChange: (values: string[]) => void;
    uniqueValues: string[];
    isNumeric?: boolean;
}

const OfficeRequirementColumnHeader: React.FC<OfficeRequirementColumnHeaderProps> = ({ 
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

const getStatusBadge = (status: OfficeRequirement['status']) => {
    const baseClasses = "px-2 py-0.5 text-xs font-medium rounded-full";
    switch (status) {
        case 'Completed': return `${baseClasses} bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200`;
        case 'Ongoing': return `${baseClasses} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`;
        case 'Proposed': return `${baseClasses} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`;
        case 'Cancelled': return `${baseClasses} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`;
        default: return `${baseClasses} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200`;
    }
}

export const parseOfficeRequirementRow = (row: any, commonData: any): OfficeRequirement => {
    return {
        ...commonData,
        equipment: row.equipment || '',
        specs: row.specs || '',
        purpose: row.purpose || '',
        numberOfUnits: Number(row.numberOfUnits) || 0,
        pricePerUnit: Number(row.pricePerUnit) || 0,
        status: row.status || 'Proposed',
        physicalDeliveryDate: row.physicalDeliveryDate || ''
    };
};

interface OfficeRequirementsTabProps {
    items: OfficeRequirement[];
    setItems: React.Dispatch<React.SetStateAction<OfficeRequirement[]>>;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    onSelect: (item: OfficeRequirement) => void;
}

export const OfficeRequirementsTab: React.FC<OfficeRequirementsTabProps> = ({ items, setItems, uacsCodes, onSelect }) => {
    const { currentUser } = useAuth();
    const { canEdit, canViewAll } = getUserPermissions(currentUser);
    const isAdmin = currentUser?.role === 'Administrator';
    
    // Local State
    const [view, setView] = useState<'list' | 'form'>('list');
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<OfficeRequirement | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [selectionIntent, setSelectionIntent] = useState<'delete' | 'clone'>('delete');

    // Search and Column Filtering/Sorting
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' }>({ key: 'id', direction: 'descending' });
    const [columnFilters, setColumnFilters] = useState<{ [key: string]: string[] }>({});

    // Selection Hook
    const { 
        isSelectionMode, selectedIds, setSelectedIds, 
        isMultiDeleteModalOpen, setIsMultiDeleteModalOpen, toggleSelectionMode, 
        handleSelectAll, handleSelectRow, resetSelection 
    } = useSelection<OfficeRequirement>();

    // Form State for Add New
    const initialFormState = {
        id: 0,
        uid: '',
        operatingUnit: '',
        uacsCode: '',
        obligationDate: '',
        disbursementDate: '',
        physicalDeliveryDate: '',
        fundType: 'Current' as FundType,
        fundYear: new Date().getFullYear(),
        tier: 'Tier 1' as Tier,
        encodedBy: '',
        equipment: '',
        specs: '',
        purpose: '',
        numberOfUnits: 0,
        pricePerUnit: 0,
        status: 'Proposed' as 'Proposed' | 'Ongoing' | 'Completed' | 'Cancelled',
        actualDate: '',
        actualAmount: 0,
        actualObligationDate: '',
        actualDisbursementDate: '',
        actualObligationAmount: 0,
        actualDisbursementAmount: 0
    };
    const [formData, setFormData] = useState(initialFormState);
    const [selectedObjectType, setSelectedObjectType] = useState<ObjectType>('MOOE');
    const [selectedParticular, setSelectedParticular] = useState('');

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

    // --- Effects ---
    // Initialize Form
    useEffect(() => {
        if (view === 'form') {
            setFormData({
                ...initialFormState,
                operatingUnit: currentUser?.operatingUnit || (canViewAll ? 'NPMO' : currentUser?.operatingUnit || ''),
                encodedBy: currentUser?.fullName || '',
            });
            setSelectedObjectType('MOOE');
            setSelectedParticular('');
        }
    }, [view, uacsCodes, currentUser, canViewAll]);

    // --- Derived Data ---
    const uniqueValues = useMemo(() => {
        const values: { [key: string]: string[] } = {};
        const columns: (keyof OfficeRequirement)[] = ['uid', 'operatingUnit', 'status', 'equipment', 'fundYear', 'fundType', 'tier', 'specs', 'numberOfUnits'];
        
        columns.forEach(col => {
            const unique = Array.from(new Set(items.map(item => String(item[col] || ''))))
                .filter(Boolean)
                .sort() as string[];
            values[col as string] = unique;
        });
        
        return values;
    }, [items]);

    const filteredItems = useMemo(() => {
        return items.filter(item => {
            // Global Search
            const searchStr = `${item.uid} ${item.equipment} ${item.specs} ${item.operatingUnit}`.toLowerCase();
            if (searchTerm && !searchStr.includes(searchTerm.toLowerCase())) return false;

            // Column Filters
            for (const [key, values] of Object.entries(columnFilters)) {
                const filterValues = values as string[];
                if (filterValues.length > 0) {
                    const itemValue = String(item[key as keyof OfficeRequirement] || '');
                    if (!filterValues.includes(itemValue)) return false;
                }
            }

            return true;
        }).sort((a, b) => {
            const aValue = a[sortConfig.key as keyof OfficeRequirement];
            const bValue = b[sortConfig.key as keyof OfficeRequirement];

            if (aValue === bValue) return 0;
            if (aValue === undefined || aValue === null) return 1;
            if (bValue === undefined || bValue === null) return -1;

            const comparison = aValue < bValue ? -1 : 1;
            return sortConfig.direction === 'ascending' ? comparison : -comparison;
        });
    }, [items, searchTerm, sortConfig, columnFilters]);

    const handleSort = (key: any, direction: 'ascending' | 'descending') => {
        setSortConfig({ key, direction });
    };

    const { currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData } = usePagination(filteredItems, []);

    const getInputClasses = (fieldName: string) => {
        const hasError = validationErrors.includes(fieldName);
        return `${commonInputClasses} ${hasError ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}`;
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        
        // Clear validation error for this field
        if (validationErrors.includes(name)) {
            setValidationErrors(prev => prev.filter(f => f !== name));
        }
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
        } else if (name === 'fundYear') {
            const newYear = parseInt(value) || new Date().getFullYear();
            setFormData(prev => {
                const newData = { ...prev, [name]: newYear };
                if (prev.obligationDate) {
                    const m = prev.obligationDate.split('-')[1];
                    if (m) newData.obligationDate = `${newYear}-${m}-01`;
                }
                if (prev.disbursementDate) {
                    const m = prev.disbursementDate.split('-')[1];
                    if (m) newData.disbursementDate = `${newYear}-${m}-01`;
                }
                return newData;
            });
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setValidationErrors([]);
        
        // Validation
        const requiredFields = [
            { field: 'operatingUnit', label: 'Operating Unit' },
            { field: 'equipment', label: 'Equipment' },
            { field: 'fundYear', label: 'Fund Year' },
            { field: 'uacsCode', label: 'UACS Code' },
            { field: 'physicalDeliveryDate', label: 'Physical Delivery Month' },
            { field: 'obligationDate', label: 'Target Obligation' },
            { field: 'disbursementDate', label: 'Target Disbursement' },
            { field: 'numberOfUnits', label: 'Number of Units' },
            { field: 'pricePerUnit', label: 'Price per Unit' }
        ];

        const missingFields = requiredFields.filter(f => !formData[f.field as keyof typeof formData]);
        if (missingFields.length > 0) {
            setValidationErrors(missingFields.map(f => f.field));
            alert(`Please fill in the following required fields:\n${missingFields.map(f => `- ${f.label}`).join('\n')}`);
            return;
        }

        // Validate UACS Code
        const isValidUacs = availableUacsCodes.some(c => c.code === formData.uacsCode);
        if (!isValidUacs) {
            alert("The entered UACS Code is not valid or not found in the reference list.");
            return;
        }

        const submissionData: any = {
            ...formData,
            numberOfUnits: Number(formData.numberOfUnits),
            pricePerUnit: Number(formData.pricePerUnit),
            fundYear: Number(formData.fundYear),
            // Accomplishment fields default to 0 for new items
            actualAmount: 0,
            actualObligationAmount: 0,
            actualDisbursementAmount: 0,
            encodedBy: formData.encodedBy || currentUser?.fullName || 'System',
            status: formData.status || 'Proposed',
            updated_at: new Date().toISOString()
        };

        delete submissionData.id;

        const year = new Date().getFullYear();
        const sequence = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
        submissionData.uid = formData.uid || `OR-${year}-${sequence}`;
        submissionData.created_at = new Date().toISOString();

        if (supabase) {
            const { data, error } = await supabase.from('office_requirements').insert([submissionData]).select().single();
            if (error) { 
                console.error("Create error:", error); 
                alert(`Failed to create: ${error.message}`); 
                return; 
            }
            if (data) setItems(prev => [data, ...prev]);
        } else {
            // Offline
            const newItem = { ...submissionData, id: Date.now() };
            setItems(prev => [newItem, ...prev]);
        }
        
        setView('list');
    };

    const handleDelete = async () => {
        if (!itemToDelete) return;
        const isProposed = itemToDelete.status === 'Proposed';
        const canDeleteThis = isAdmin || (canEdit && isProposed);
        
        if (!canDeleteThis) {
            alert("You do not have permission to delete this item based on its current status.");
            return;
        }

        if (supabase) {
            try {
                const { error: archiveError } = await supabase.from('trash_bin').insert([{
                    entity_type: 'office_requirement',
                    original_id: itemToDelete.id,
                    data: itemToDelete,
                    deleted_by: currentUser?.email || currentUser?.fullName || 'Unknown',
                    deleted_at: new Date().toISOString()
                }]);
                if (archiveError) throw archiveError;

                const { error: deleteError } = await supabase.from('office_requirements').delete().eq('id', itemToDelete.id);
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
        setIsDeleteModalOpen(false);
        setItemToDelete(null);
    };

    const handleMultiDelete = async () => {
        const itemsToDelete = items.filter(i => selectedIds.includes(i.id));
        const deletableItems = itemsToDelete.filter(i => isAdmin || (canEdit && i.status === 'Proposed'));
        const deletableIds = deletableItems.map(i => i.id);
        
        if (deletableIds.length === 0) {
            alert("None of the selected items can be deleted based on their current status.");
            return;
        }

        if (supabase) {
            try {
                const archivePayload = deletableItems.map(item => ({
                    entity_type: 'office_requirement',
                    original_id: item.id,
                    data: item,
                    deleted_by: currentUser?.email || currentUser?.fullName || 'Unknown',
                    deleted_at: new Date().toISOString()
                }));

                const { error: archiveError } = await supabase.from('trash_bin').insert(archivePayload);
                if (archiveError) throw archiveError;

                const { error: deleteError } = await supabase.from('office_requirements').delete().in('id', deletableIds);
                if (deleteError) throw deleteError;

                setItems(prev => prev.filter(i => !deletableIds.includes(i.id)));
            } catch (error: any) {
                console.error("Error archiving/deleting selected:", error);
                alert("Failed to delete selected: " + error.message);
                return;
            }
        } else {
            setItems(prev => prev.filter(i => !deletableIds.includes(i.id)));
        }
        setIsMultiDeleteModalOpen(false);
        setSelectedIds([]);
    };

    const handleClone = async () => {
        const itemsToClone = items.filter(i => selectedIds.includes(i.id));
        if (itemsToClone.length === 0) return;

        if (!window.confirm(`Are you sure you want to clone ${itemsToClone.length} office requirements? This will create new entries with the same targets but reset accomplishments.`)) return;

        const currentTimestamp = new Date().toISOString();
        const newItemsPayload = itemsToClone.map((item, index) => {
            const { id, uid, created_at, updated_at, ...rest } = item;
            const newUid = `OR-${item.fundYear}-${Date.now().toString().slice(-6)}${index}`;
            
            // Reset actuals
            const resetActuals: any = {
                actualDate: '',
                actualAmount: 0,
                actualObligationDate: '',
                actualDisbursementDate: '',
                actualObligationAmount: 0,
                actualDisbursementAmount: 0,
                status: 'Proposed'
            };

            return {
                ...rest,
                ...resetActuals,
                uid: newUid,
                encodedBy: currentUser?.fullName || 'System Clone',
                created_at: currentTimestamp,
                updated_at: currentTimestamp,
            };
        });

        if (supabase) {
            const { data, error } = await supabase.from('office_requirements').insert(newItemsPayload).select();
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

    // --- Import/Export ---
    const handleDownloadReport = () => {
        const data = filteredItems.map(item => ({
            UID: item.uid,
            OU: item.operatingUnit,
            Equipment: item.equipment,
            Specs: item.specs,
            Purpose: item.purpose,
            Status: item.status,
            'Number of Units': item.numberOfUnits,
            'Price/Unit': item.pricePerUnit,
            'Total Amount': item.numberOfUnits * item.pricePerUnit,
            'Fund Type': item.fundType,
            'Fund Year': item.fundYear,
            Tier: item.tier,
            'Obligation Date': item.obligationDate,
            'Disbursement Date': item.disbursementDate
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Office Requirements");
        XLSX.utils.book_append_sheet(wb, "Office_Requirements_Report.xlsx");
    };

    const handleDownloadTemplate = () => {
        const headers = ['operatingUnit', 'fundYear', 'fundType', 'tier', 'status', 'obligationDate', 'disbursementDate', 'uacsCode', 'equipment', 'specs', 'purpose', 'numberOfUnits', 'pricePerUnit'];
        const exampleData = [{
            operatingUnit: 'NPMO', fundYear: 2024, fundType: 'Current', tier: 'Tier 1', status: 'Proposed', obligationDate: '2024-01-15', disbursementDate: '2024-02-15', uacsCode: '50203010-00',
            equipment: 'Laptop', specs: 'i7, 16GB RAM', purpose: 'For administrative use', numberOfUnits: 1, pricePerUnit: 50000
        }];
        const ws = XLSX.utils.json_to_sheet(exampleData, { header: headers });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, "Office_Req_Template.xlsx");
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = event.target?.result;
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]) as any[];
                
                const currentTimestamp = new Date().toISOString();
                const newItems = jsonData.map((row: any, index: number) => {
                    const fundYear = Number(row.fundYear) || new Date().getFullYear();
                    const uid = `OR-${fundYear}-${Date.now().toString().slice(-4)}${index}`;
                    const resolvedOU = row.operatingUnit ? resolveOperatingUnit(row.operatingUnit) : 'NPMO';

                    return parseOfficeRequirementRow(row, {
                        uid,
                        operatingUnit: resolvedOU,
                        fundYear: fundYear,
                        fundType: row.fundType || 'Current',
                        tier: resolveTier(row.tier) || 'Tier 1',
                        obligationDate: row.obligationDate || '',
                        disbursementDate: row.disbursementDate || '',
                        uacsCode: row.uacsCode || '',
                        encodedBy: currentUser?.fullName || 'Upload',
                        status: row.status || 'Proposed',
                        created_at: currentTimestamp,
                        updated_at: currentTimestamp
                    });
                });

                if (supabase) {
                    const { error } = await supabase.from('office_requirements').insert(newItems);
                    if (error) throw error;
                    const { data } = await supabase.from('office_requirements').select('*').order('id', { ascending: true });
                    if (data) setItems(data as OfficeRequirement[]);
                } else {
                    setItems(prev => [...newItems.map((i, idx) => ({ ...i, id: Date.now() + idx })), ...prev]);
                }
                alert(`${newItems.length} items imported.`);
            } catch (err: any) {
                alert(`Import failed: ${err.message}`);
            } finally {
                setIsUploading(false);
                if(e.target) e.target.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };

    // --- Render ---
    if (view === 'form') {
        return (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-100 dark:border-gray-700">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white">Add Office Requirement</h3>
                    <button onClick={() => { setView('list'); }} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Cancel</button>
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
                                    <option value="Cancelled">Cancelled</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Equipment <span className="text-red-500">*</span></label>
                                <input type="text" name="equipment" value={formData.equipment} onChange={handleInputChange} placeholder="Enter equipment name" className={getInputClasses('equipment')} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Specifications</label>
                                <input type="text" name="specs" value={formData.specs} onChange={handleInputChange} placeholder="Enter technical specifications" className={commonInputClasses} />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Purpose</label>
                                <textarea name="purpose" value={formData.purpose} onChange={handleInputChange} rows={2} placeholder="Enter purpose or justification" className={commonInputClasses} />
                            </div>
                        </div>
                    </fieldset>

                    {/* Section 2: Funding & Classification */}
                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                        <legend className="px-2 font-medium text-emerald-700 dark:text-emerald-400">Funding & Classification</legend>
                        <div className="space-y-4">
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

                            {/* Single Line for UACS related fields */}
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
                                        onChange={e => { setSelectedParticular(e.target.value); setFormData(prev => ({...prev, uacsCode: ''})); }} 
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
                        </div>
                    </fieldset>

                    {/* Section 3: Target Schedule & Cost */}
                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                        <legend className="px-2 font-medium text-emerald-700 dark:text-emerald-400">Target Schedule & Cost</legend>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Physical Delivery Month <span className="text-red-500">*</span></label>
                                <MonthYearPicker 
                                    value={formData.physicalDeliveryDate}
                                    onChange={(val) => {
                                        setFormData(prev => ({ ...prev, physicalDeliveryDate: val }));
                                        if (validationErrors.includes('physicalDeliveryDate')) {
                                            setValidationErrors(prev => prev.filter(f => f !== 'physicalDeliveryDate'));
                                        }
                                    }}
                                    className={validationErrors.includes('physicalDeliveryDate') ? 'border-red-500 ring-red-500' : ''}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Obligation <span className="text-red-500">*</span></label>
                                <MonthYearPicker 
                                    value={formData.obligationDate}
                                    onChange={(val) => {
                                        setFormData(prev => ({ ...prev, obligationDate: val }));
                                        if (validationErrors.includes('obligationDate')) {
                                            setValidationErrors(prev => prev.filter(f => f !== 'obligationDate'));
                                        }
                                    }}
                                    className={validationErrors.includes('obligationDate') ? 'border-red-500 ring-red-500' : ''}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Disbursement <span className="text-red-500">*</span></label>
                                <MonthYearPicker 
                                    value={formData.disbursementDate}
                                    onChange={(val) => {
                                        setFormData(prev => ({ ...prev, disbursementDate: val }));
                                        if (validationErrors.includes('disbursementDate')) {
                                            setValidationErrors(prev => prev.filter(f => f !== 'disbursementDate'));
                                        }
                                    }}
                                    className={validationErrors.includes('disbursementDate') ? 'border-red-500 ring-red-500' : ''}
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Number of Units <span className="text-red-500">*</span></label>
                                <input type="number" name="numberOfUnits" value={formData.numberOfUnits} onChange={handleInputChange} min="0" className={getInputClasses('numberOfUnits')} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Price per Unit <span className="text-red-500">*</span></label>
                                <input type="number" name="pricePerUnit" value={formData.pricePerUnit} onChange={handleInputChange} min="0" step="0.01" className={getInputClasses('pricePerUnit')} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Total Amount</label>
                                <input 
                                    type="text" 
                                    value={formatCurrency((Number(formData.numberOfUnits) || 0) * (Number(formData.pricePerUnit) || 0))} 
                                    disabled 
                                    className={`${commonInputClasses} bg-gray-100 dark:bg-gray-800 cursor-not-allowed font-bold text-emerald-600`} 
                                />
                            </div>
                        </div>
                    </fieldset>

                    <div className="flex justify-end gap-4 pt-6 border-t border-gray-200 dark:border-gray-700">
                        <button 
                            type="button" 
                            onClick={() => setView('list')} 
                            className="px-6 py-2 rounded-md text-sm font-medium bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            className="px-8 py-2 rounded-md text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition-all hover:shadow-lg active:scale-95"
                        >
                            Save
                        </button>
                    </div>
                </form>
            </div>
        );
    }

    // List View
    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md animate-fadeIn">
            {isDeleteModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"><div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl"><h3 className="text-lg font-bold text-gray-900 dark:text-white">Confirm Deletion</h3><p className="my-4 text-gray-600 dark:text-gray-300">Are you sure?</p><div className="flex justify-end gap-4"><button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 rounded-md text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button><button onClick={handleDelete} className="px-4 py-2 rounded-md text-sm bg-red-600 text-white hover:bg-red-700">Delete</button></div></div></div>
            )}
            {isMultiDeleteModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"><div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl"><h3 className="text-lg font-bold text-gray-900 dark:text-white">Confirm Bulk Deletion</h3><p className="my-4 text-gray-600 dark:text-gray-300">Delete {selectedIds.length} items?</p><div className="flex justify-end gap-4"><button onClick={() => setIsMultiDeleteModalOpen(false)} className="px-4 py-2 rounded-md text-sm bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button><button onClick={handleMultiDelete} className="px-4 py-2 rounded-md text-sm bg-red-600 text-white hover:bg-red-700">Delete All</button></div></div></div>
            )}

            <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="relative flex-1 md:flex-none">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-gray-400" />
                        </span>
                        <input 
                            type="text" 
                            placeholder="Search Office Requirements..." 
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
                            <OfficeRequirementColumnHeader 
                                label="UID" 
                                columnKey="uid" 
                                sortConfig={sortConfig} 
                                onSort={handleSort}
                                filters={columnFilters['uid'] || []}
                                onFilterChange={(vals) => setColumnFilters(prev => ({ ...prev, uid: vals }))}
                                uniqueValues={uniqueValues['uid'] || []}
                            />
                            <OfficeRequirementColumnHeader 
                                label="OU" 
                                columnKey="operatingUnit" 
                                sortConfig={sortConfig} 
                                onSort={handleSort}
                                filters={columnFilters['operatingUnit'] || []}
                                onFilterChange={(vals) => setColumnFilters(prev => ({ ...prev, operatingUnit: vals }))}
                                uniqueValues={uniqueValues['operatingUnit'] || []}
                            />
                            <OfficeRequirementColumnHeader 
                                label="Status" 
                                columnKey="status" 
                                sortConfig={sortConfig} 
                                onSort={handleSort}
                                filters={columnFilters['status'] || []}
                                onFilterChange={(vals) => setColumnFilters(prev => ({ ...prev, status: vals }))}
                                uniqueValues={uniqueValues['status'] || []}
                            />
                            <OfficeRequirementColumnHeader 
                                label="Equipment" 
                                columnKey="equipment" 
                                sortConfig={sortConfig} 
                                onSort={handleSort}
                                filters={columnFilters['equipment'] || []}
                                onFilterChange={(vals) => setColumnFilters(prev => ({ ...prev, equipment: vals }))}
                                uniqueValues={uniqueValues['equipment'] || []}
                            />
                            <OfficeRequirementColumnHeader 
                                label="Specs/Purpose" 
                                columnKey="specs" 
                                sortConfig={sortConfig} 
                                onSort={handleSort}
                                filters={columnFilters['specs'] || []}
                                onFilterChange={(vals) => setColumnFilters(prev => ({ ...prev, specs: vals }))}
                                uniqueValues={uniqueValues['specs'] || []}
                            />
                            <OfficeRequirementColumnHeader 
                                label="Units" 
                                columnKey="numberOfUnits" 
                                sortConfig={sortConfig} 
                                onSort={handleSort}
                                filters={columnFilters['numberOfUnits'] || []}
                                onFilterChange={(vals) => setColumnFilters(prev => ({ ...prev, numberOfUnits: vals }))}
                                uniqueValues={uniqueValues['numberOfUnits'] || []}
                                isNumeric
                            />
                            <OfficeRequirementColumnHeader 
                                label="Total Amount" 
                                columnKey="pricePerUnit" 
                                sortConfig={sortConfig} 
                                onSort={handleSort}
                                filters={[]}
                                onFilterChange={() => {}}
                                uniqueValues={[]}
                                isNumeric
                            />
                            <OfficeRequirementColumnHeader 
                                label="Fund Year" 
                                columnKey="fundYear" 
                                sortConfig={sortConfig} 
                                onSort={handleSort}
                                filters={columnFilters['fundYear'] || []}
                                onFilterChange={(vals) => setColumnFilters(prev => ({ ...prev, fundYear: vals }))}
                                uniqueValues={uniqueValues['fundYear'] || []}
                            />
                            <OfficeRequirementColumnHeader 
                                label="Fund Type" 
                                columnKey="fundType" 
                                sortConfig={sortConfig} 
                                onSort={handleSort}
                                filters={columnFilters['fundType'] || []}
                                onFilterChange={(vals) => setColumnFilters(prev => ({ ...prev, fundType: vals }))}
                                uniqueValues={uniqueValues['fundType'] || []}
                            />
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{isSelectionMode ? "Select" : "Actions"}</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {paginatedData.map((item) => {
                            const isProposed = item.status === 'Proposed';
                            const canDeleteThis = isAdmin || (canEdit && isProposed);
                            
                            return (
                                <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500 dark:text-gray-400">{item.uid}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{item.operatingUnit}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-xs"><span className={getStatusBadge(item.status)}>{item.status}</span></td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                        {item.equipment}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300"><div className="truncate w-48" title={item.specs}>{item.specs}</div><div className="text-xs text-gray-400 truncate w-48">{item.purpose}</div></td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500 dark:text-gray-300">{item.numberOfUnits}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(item.numberOfUnits * item.pricePerUnit)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.fundYear}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.fundType}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        {canEdit && (
                                            isSelectionMode ? 
                                            <input 
                                                type="checkbox" 
                                                checked={selectedIds.includes(item.id)} 
                                                onChange={(e) => { e.stopPropagation(); handleSelectRow(item.id); }} 
                                                disabled={selectionIntent === 'delete' && !canDeleteThis}
                                                className="mr-3 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
                                            /> :
                                            <div className="flex justify-end gap-2">
                                                <button onClick={() => onSelect(item)} className="text-emerald-600 hover:text-emerald-900">Edit</button>
                                                {canDeleteThis && <button onClick={() => { setItemToDelete(item); setIsDeleteModalOpen(true); }} className="text-red-600 hover:text-red-900">Delete</button>}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
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
