
// Author: 4K 
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Subproject, IPO, SubprojectDetail, operatingUnits, ouToRegionMap, filterYears } from '../constants';
import { Check, Download, FileSpreadsheet, Plus, Upload, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLogAction } from '../hooks/useLogAction';
import { usePagination, useSelection, useUserAccess } from './mainfunctions/TableHooks';
import { downloadSubprojectsReport, downloadSubprojectsTemplate, handleSubprojectsUpload } from './mainfunctions/ImportExportService';
import useLocalStorageState from '../hooks/useLocalStorageState';
import { supabase } from '../supabaseClient';
import type { DataScope } from '../lib/scopedDataFetch';
import { DcfScopeFilterPanel, DcfScopeFilterToggle, matchesDcfScope, useDcfScopeFilters } from './ui/DcfScopeFilters';
import { useDcfPolicyGuard } from '../hooks/useDcfPolicyGuard';

// Declare XLSX to inform TypeScript about the global variable from the script tag
declare const XLSX: any;

interface SubprojectsProps {
    ipos: IPO[];
    subprojects: Subproject[];
    setSubprojects: React.Dispatch<React.SetStateAction<Subproject[]>>;
    setIpos: React.Dispatch<React.SetStateAction<IPO[]>>;
    onSelectIpo: (ipo: IPO) => void;
    onSelectSubproject: (subproject: Subproject) => void;
    onCreateSubproject: () => void; // New prop for triggering Add Mode
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    particularTypes: { [key: string]: string[] };
    commodityCategories: { [key: string]: string[] };
    externalFilters?: { region?: string; year?: string; search?: string; status?: string } | null;
    onClearExternalFilters?: () => void;
    onDataScopeChange?: (scope: Partial<DataScope>) => void;
}

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

const FilterIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </svg>
);

const calculateTotalBudget = (details: SubprojectDetail[]) => {
    return details.reduce((total, item) => total + (item.pricePerUnit * item.numberOfUnits), 0);
};

const commonInputClasses = "form-control";
const DCF_SCOPE_COLUMN_KEYS = new Set(['fundingYear', 'operatingUnit', 'fundType', 'tier']);

// --- COLUMN HEADER COMPONENT WITH FILTER ---
interface SubprojectColumnHeaderProps {
    label: string;
    columnKey: keyof Subproject | 'totalBudget' | 'actualObligated' | 'actualDisbursed' | 'completionRate' | 'commodityTarget';
    sortConfig: { key: string; direction: 'ascending' | 'descending' } | null;
    onSort: (key: any, direction: 'ascending' | 'descending') => void;
    filters: string[];
    onFilterChange: (values: string[]) => void;
    uniqueValues: string[];
    isNumeric?: boolean;
}

const SubprojectColumnHeader: React.FC<SubprojectColumnHeaderProps> = ({ 
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

    const filteredValues = (uniqueValues || []).filter(v => v.toLowerCase().includes(searchTerm.toLowerCase()));
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
        <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 dark:text-gray-300 relative group select-none whitespace-nowrap">
            <div className="flex items-center justify-between cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
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
                                            checked={filters.includes(val)} 
                                            onChange={() => toggleFilter(val)}
                                            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                        />
                                        <span className="truncate" title={val}>{val}</span>
                                    </label>
                                ))}
                            </div>
                            <div className="p-2 border-t border-gray-200 dark:border-gray-700 flex justify-between">
                                <button 
                                    onClick={() => onFilterChange([])}
                                    className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline"
                                >
                                    Clear
                                </button>
                                <button 
                                    onClick={() => setIsOpen(false)}
                                    className="text-xs px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                                >
                                    Done
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </th>
    );
};


const Subprojects: React.FC<SubprojectsProps> = ({ 
    ipos, subprojects, setSubprojects, setIpos, onSelectIpo, onSelectSubproject, 
    onCreateSubproject, uacsCodes, particularTypes, commodityCategories, externalFilters, onClearExternalFilters,
    onDataScopeChange
}) => {
    const { currentUser } = useAuth();
    const { logAction } = useLogAction();
    const { canEdit, canViewAll } = useUserAccess('Subprojects');
    const { getDeleteDecision, ensureDecisionAllowed } = useDcfPolicyGuard();

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [subprojectToDelete, setSubprojectToDelete] = useState<Subproject | null>(null);
    const [selectionIntent, setSelectionIntent] = useState<'delete' | 'clone'>('delete');
    
    // Use Shared Selection Hook
    const { 
        isSelectionMode, setIsSelectionMode, selectedIds, setSelectedIds, 
        isMultiDeleteModalOpen, setIsMultiDeleteModalOpen, toggleSelectionMode, 
        handleSelectAll, handleSelectRow, resetSelection 
    } = useSelection<Subproject>();

    const [isUploading, setIsUploading] = useState(false);

    // Filters - Persistent State
    const [savedSearchTerm, setSavedSearchTerm] = useLocalStorageState('subprojects_searchTerm', '');
    const [searchTerm, setSearchTerm] = useState(savedSearchTerm);
    
    // Column Filters
    const [savedColumnFilters, setSavedColumnFilters] = useLocalStorageState<Record<string, string[]>>('subprojects_columnFilters', {});
    const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>(savedColumnFilters);

    // Sorting - Persistent State
    type SortKeys = keyof Subproject | 'totalBudget' | 'actualObligated' | 'actualDisbursed' | 'completionRate' | 'commodityTarget';
    const [sortConfig, setSortConfig] = useLocalStorageState<{ key: SortKeys; direction: 'ascending' | 'descending' } | null>('subprojects_sortConfig', { key: 'startDate', direction: 'descending' });
    
    const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
    const dcfFilters = useDcfScopeFilters({
        storageKey: 'subprojects_dcf_scope',
        moduleName: 'Subprojects',
        onDataScopeChange
    });

    useEffect(() => {
        const cleanedFilters = Object.fromEntries(
            Object.entries(columnFilters).filter(([key]) => !DCF_SCOPE_COLUMN_KEYS.has(key))
        );
        if (Object.keys(cleanedFilters).length !== Object.keys(columnFilters).length) {
            setColumnFilters(cleanedFilters);
            setSavedColumnFilters(cleanedFilters);
        }
    }, [columnFilters, setSavedColumnFilters]);

    // Listen to External Filters (Chatbot)
    useEffect(() => {
        if (externalFilters) {
            const newFilters: Record<string, string[]> = {};
            
            if (externalFilters.year) {
                newFilters['fundingYear'] = [externalFilters.year];
            }
            if (externalFilters.region) {
                // Improved logic: Filter OUs where the mapped region name includes the filter text
                // This handles "Region 3" vs "Region III" loose matching
                const filterRegionLower = externalFilters.region.toLowerCase();
                const targetOUs = operatingUnits.filter(ou => {
                    const mappedRegion = ouToRegionMap[ou];
                    if (!mappedRegion) return false;
                    return mappedRegion.toLowerCase().includes(filterRegionLower);
                });

                if (targetOUs.length > 0) {
                    newFilters['operatingUnit'] = targetOUs;
                }
            }
            if (externalFilters.status) {
                newFilters['status'] = [externalFilters.status];
            }
            if (externalFilters.search) {
                setSearchTerm(externalFilters.search);
            }
            
            // Only update if there are changes to avoid loop
            if (Object.keys(newFilters).length > 0) {
                setColumnFilters(prev => ({ ...prev, ...newFilters }));
            }

            // Clear the external filters so they don't re-apply on remount
            if (onClearExternalFilters) {
                onClearExternalFilters();
            }
        }
    }, [externalFilters, onClearExternalFilters]);

    const initiallyFilteredSubprojects = useMemo(() => {
        let filtered = subprojects.filter(s => matchesDcfScope(s as any, dcfFilters.value, 'fundingYear'));

        if (!canViewAll && currentUser) {
            filtered = filtered.filter(s => s.operatingUnit === currentUser.operatingUnit);
        }

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            filtered = filtered.filter(s =>
                (s.name?.toLowerCase() || '').includes(lower) ||
                (s.indigenousPeopleOrganization?.toLowerCase() || '').includes(lower) ||
                (s.location?.toLowerCase() || '').includes(lower) ||
                (s.operatingUnit?.toLowerCase() || '').includes(lower) ||
                (s.uid?.toLowerCase() || '').includes(lower) ||
                (s.details && s.details.some(d => 
                    (d.type?.toLowerCase() || '').includes(lower) || 
                    (d.particulars?.toLowerCase() || '').includes(lower)
                ))
            );
        }
        return filtered;
    }, [subprojects, searchTerm, currentUser, canViewAll, dcfFilters.value]);

    // 2. Extract Unique Values
    const uniqueValues = useMemo(() => {
        const getUnique = (key: keyof Subproject) => Array.from(new Set(initiallyFilteredSubprojects.map(s => String(s[key] || '')))).filter(Boolean).sort();
        return {
            name: getUnique('name'),
            status: getUnique('status'),
            operatingUnit: getUnique('operatingUnit'),
            indigenousPeopleOrganization: getUnique('indigenousPeopleOrganization'),
            packageType: getUnique('packageType'),
            fundingYear: filterYears,
            fundType: getUnique('fundType'),
            tier: getUnique('tier'),
            estimatedCompletionDate: getUnique('estimatedCompletionDate'),
            actualCompletionDate: getUnique('actualCompletionDate')
        };
    }, [initiallyFilteredSubprojects]);

    const processedSubprojects = useMemo(() => {
        let filtered = [...initiallyFilteredSubprojects];

        Object.keys(columnFilters).forEach(key => {
            const selectedValues = columnFilters[key];
            if (selectedValues && selectedValues.length > 0) {
                filtered = filtered.filter(item => {
                    const itemValue = String((item as any)[key] || '');
                    return selectedValues.includes(itemValue);
                });
            }
        });

        if (sortConfig !== null) {
            filtered.sort((a, b) => {
                let aValue: any = '';
                let bValue: any = '';

                const getBudget = (s: Subproject) => calculateTotalBudget(s.details || []);
                const getObligated = (s: Subproject) => (s.details || []).reduce((sum, d) => sum + (d.actualObligationAmount || 0), 0);
                const getDisbursed = (s: Subproject) => (s.details || []).reduce((sum, d) => sum + (d.actualDisbursementAmount || 0), 0);
                const getRate = (s: Subproject) => {
                    const details = s.details || [];
                    const total = details.length;
                    const comp = details.filter(d => d.actualDeliveryDate).length;
                    return total > 0 ? (comp / total) * 100 : 0;
                };
                const getCommodities = (s: Subproject) => s.subprojectCommodities?.map(c => c.name || '').join(', ') || '';

                switch (sortConfig.key) {
                    case 'totalBudget':
                        aValue = getBudget(a);
                        bValue = getBudget(b);
                        break;
                    case 'actualObligated':
                        aValue = getObligated(a);
                        bValue = getObligated(b);
                        break;
                    case 'actualDisbursed':
                        aValue = getDisbursed(a);
                        bValue = getDisbursed(b);
                        break;
                    case 'completionRate':
                        aValue = getRate(a);
                        bValue = getRate(b);
                        break;
                    case 'commodityTarget':
                        aValue = getCommodities(a);
                        bValue = getCommodities(b);
                        break;
                    case 'estimatedCompletionDate':
                    case 'actualCompletionDate':
                    case 'startDate':
                        aValue = a[sortConfig.key] ? new Date(a[sortConfig.key] as string).getTime() : 0;
                        bValue = b[sortConfig.key] ? new Date(b[sortConfig.key] as string).getTime() : 0;
                        break;
                    default:
                        aValue = a[sortConfig.key as keyof Subproject] ?? '';
                        bValue = b[sortConfig.key as keyof Subproject] ?? '';
                }

                if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return filtered;
    }, [initiallyFilteredSubprojects, columnFilters, sortConfig]);

    // Use Shared Pagination Hook
    const { 
        currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData: paginatedSubprojects 
    } = usePagination(processedSubprojects, [searchTerm, columnFilters, sortConfig]);

    const handleSort = (key: SortKeys, direction: 'ascending' | 'descending') => {
        setSortConfig({ key, direction });
    };

    const handleColumnFilterChange = (columnKey: string, values: string[]) => {
        const nextScopeValue = values.length === 1 ? values[0] : 'All';
        if (columnKey === 'fundingYear') {
            dcfFilters.setSelectedYear(nextScopeValue);
            return;
        }
        if (columnKey === 'operatingUnit') {
            dcfFilters.setSelectedOu(nextScopeValue);
            return;
        }
        if (columnKey === 'fundType') {
            dcfFilters.setSelectedFundType(nextScopeValue);
            return;
        }
        if (columnKey === 'tier') {
            dcfFilters.setSelectedTier(nextScopeValue);
            return;
        }
        const newFilters = {
            ...columnFilters,
            [columnKey]: values
        };
        setColumnFilters(newFilters);
        setSavedColumnFilters(newFilters);
    };
    
    const clearColumnFilters = () => {
        setColumnFilters({});
        setSavedColumnFilters({});
    }

    const getScopeColumnFilter = (key: 'fundingYear' | 'operatingUnit' | 'fundType' | 'tier') => {
        const value = key === 'fundingYear'
            ? dcfFilters.selectedYear
            : key === 'operatingUnit'
                ? dcfFilters.selectedOu
                : key === 'fundType'
                    ? dcfFilters.selectedFundType
                    : dcfFilters.selectedTier;
        return value === 'All' ? [] : [value];
    };

    const handleToggleRow = (id: number) => {
        setExpandedRowId(prev => (prev === id ? null : id));
    };

    const canDeleteSubprojectByPolicy = (subproject: Subproject) => getDeleteDecision({
        moduleKey: 'subprojects',
        item: subproject,
        hasModuleAccess: canEdit,
    });

    const confirmMultiDelete = async () => {
        const itemsToDelete = subprojects.filter(s => selectedIds.includes(s.id));
        const deletableItems = itemsToDelete.filter(item => canDeleteSubprojectByPolicy(item).allowed);
        const skippedCount = itemsToDelete.length - deletableItems.length;
        if (deletableItems.length === 0) {
            alert('None of the selected subprojects can be deleted under the current DCF editing policy.');
            resetSelection();
            return;
        }
        const deletableIds = deletableItems.map(item => item.id);
        const deletedNames = deletableItems.map(s => s.name).join(', ');
        logAction('Deleted Subprojects', `Bulk deleted ${deletableItems.length} subprojects: ${deletedNames}${skippedCount ? ` (${skippedCount} skipped by policy)` : ''}`);

        if (supabase) {
            try {
                // Archive each item
                const archivePayload = deletableItems.map(item => ({
                    entity_type: 'subproject',
                    original_id: item.id,
                    data: item,
                    deleted_by: currentUser?.email || currentUser?.fullName || 'Unknown',
                    deleted_at: new Date().toISOString()
                }));

                const { error: archiveError } = await supabase.from('trash_bin').insert(archivePayload);
                if (archiveError) throw archiveError;

                const { error: deleteError } = await supabase.from('subprojects').delete().in('id', deletableIds);
                if (deleteError) throw deleteError;

                setSubprojects(prev => prev.filter(s => !deletableIds.includes(s.id)));
                resetSelection();
            } catch (error: any) {
                console.error("Error archiving/deleting:", error);
                alert("Failed to delete selected items: " + error.message);
            }
        } else {
            setSubprojects(prev => prev.filter(s => !deletableIds.includes(s.id)));
            resetSelection();
        }
        if (skippedCount) alert(`${skippedCount} selected subproject${skippedCount === 1 ? ' was' : 's were'} skipped by DCF editing policy.`);
    };

    const handleClone = async () => {
        const itemsToClone = subprojects.filter(s => selectedIds.includes(s.id));
        if (itemsToClone.length === 0) return;

        if (!window.confirm(`Are you sure you want to clone ${itemsToClone.length} subprojects? This will create new entries with the same details but reset accomplishments.`)) return;

        const currentTimestamp = new Date().toISOString();
        const currentYear = new Date().getFullYear();

        const newItemsPayload = itemsToClone.map((item, index) => {
            const { id, uid, created_at, updated_at, history, physical_accomplishment_submitted_at, ...rest } = item;
            
            const sequence = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
            const newUid = `SP-${currentYear}-${sequence}${index}`;

            const clonedDetails = (item.details || []).map(d => ({
                ...d,
                id: Date.now() + Math.random(),
                actualDeliveryDate: '',
                actualNumberOfUnits: 0,
                actualObligationDate: '',
                actualDisbursementDate: '',
                actualAmount: 0,
                actualObligationAmount: 0,
                actualDisbursementAmount: 0,
                isCompleted: false
            }));

            const clonedCommodities = (item.subprojectCommodities || []).map(c => ({
                ...c,
                actualYield: 0,
                income: 0
            }));

            return {
                ...rest,
                uid: newUid,
                status: 'Proposed',
                actualCompletionDate: undefined,
                physical_accomplishment_submitted_at: null,
                catchUpPlanRemarks: '',
                newTargetCompletionDate: '',
                details: clonedDetails,
                subprojectCommodities: clonedCommodities,
                encodedBy: currentUser?.fullName || 'System Clone',
                created_at: currentTimestamp,
                updated_at: currentTimestamp,
                history: [{
                    date: currentTimestamp,
                    event: 'Cloned from ' + uid,
                    user: currentUser?.fullName || 'System'
                }]
            };
        });

        if (supabase) {
            const { data, error } = await supabase.from('subprojects').insert(newItemsPayload).select();
            if (error) {
                alert('Failed to clone items: ' + error.message);
            } else if (data) {
                setSubprojects(prev => [...data as Subproject[], ...prev]);
                resetSelection();
                alert(`Successfully cloned ${data.length} subprojects.`);
            }
        } else {
            const newLocalItems = newItemsPayload.map((item, idx) => ({ ...item, id: Date.now() + idx }));
            setSubprojects(prev => [...(newLocalItems as Subproject[]), ...prev]);
            resetSelection();
            alert(`Successfully cloned ${newLocalItems.length} subprojects (Local).`);
        }
    };

    const handleToggleMode = (intent: 'delete' | 'clone') => {
        if (isSelectionMode && selectionIntent === intent) {
            toggleSelectionMode();
        } else if (isSelectionMode && selectionIntent !== intent) {
            setSelectionIntent(intent);
        } else {
            setSelectionIntent(intent);
            toggleSelectionMode();
        }
    };

    const handleDeleteClick = (subproject: Subproject) => {
        setSubprojectToDelete(subproject);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (subprojectToDelete) {
            const allowed = await ensureDecisionAllowed(canDeleteSubprojectByPolicy(subprojectToDelete), {
                moduleKey: 'subprojects',
                item: subprojectToDelete,
                itemId: subprojectToDelete.id,
                itemName: subprojectToDelete.name,
                status: subprojectToDelete.status,
                action: 'delete',
                entityType: 'subproject',
            });
            if (!allowed) return;
            logAction('Deleted Subproject', subprojectToDelete.name, subprojectToDelete.indigenousPeopleOrganization, 'Subproject', String(subprojectToDelete.id));
            
            if (supabase) {
                try {
                    const { error: archiveError } = await supabase.from('trash_bin').insert([{
                        entity_type: 'subproject',
                        original_id: subprojectToDelete.id,
                        data: subprojectToDelete,
                        deleted_by: currentUser?.email || currentUser?.fullName || 'Unknown',
                        deleted_at: new Date().toISOString()
                    }]);
                    if (archiveError) throw archiveError;

                    const { error: deleteError } = await supabase.from('subprojects').delete().eq('id', subprojectToDelete.id);
                    if (deleteError) throw deleteError;

                    setSubprojects(prev => prev.filter(s => s.id !== subprojectToDelete.id));
                } catch (error: any) {
                    console.error("Error archiving/deleting:", error);
                    alert("Failed to delete subproject: " + error.message);
                }
            } else {
                setSubprojects(prev => prev.filter(s => s.id !== subprojectToDelete.id));
            }

            setIsDeleteModalOpen(false);
            setSubprojectToDelete(null);
        }
    };

    // --- Render Helpers ---
    const formatDate = (dateString?: string) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'N/A';
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const formatMonthYear = (dateString?: string) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'N/A';
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
    };

    const getStatusBadge = (status: Subproject['status']) => {
        switch (status) {
            case 'Completed': return 'status-badge status-badge--completed';
            case 'Ongoing': return 'status-badge status-badge--ongoing';
            case 'Proposed': return 'status-badge status-badge--proposed';
            case 'Cancelled': return 'status-badge status-badge--cancelled';
            default: return 'status-badge status-badge--neutral';
        }
    };

    const getWorkflowStatusBadge = (status?: string) => {
        let classes = 'status-badge status-badge--compact status-badge--neutral';
        switch (status) {
            case 'APPROVED': classes = 'status-badge status-badge--compact status-badge--approved'; break;
            case 'PENDING': classes = 'status-badge status-badge--compact status-badge--pending'; break;
            case 'REJECTED': classes = 'status-badge status-badge--compact status-badge--rejected'; break;
            case 'DRAFT': classes = 'status-badge status-badge--compact status-badge--draft'; break;
        }
        return <span className={classes}>{status || 'DRAFT'}</span>;
    };

    const canApprove = (role?: string) => {
        return ['Super Admin', 'Administrator', 'Focal - User', 'Management'].includes(role || '');
    };

    const handleApprove = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm('Are you sure you want to approve this subproject?')) return;
        
        if (supabase) {
            const { error } = await supabase.from('subprojects').update({ workflow_status: 'APPROVED' }).eq('id', id);
            if (error) {
                alert('Failed to approve: ' + error.message);
            } else {
                setSubprojects(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'APPROVED' } : s));
            }
        } else {
            setSubprojects(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'APPROVED' } : s));
        }
    };

    const handleReject = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const reason = window.prompt('Please provide a reason for rejection:');
        if (reason === null) return;

        if (supabase) {
            const { error } = await supabase.from('subprojects').update({ 
                workflow_status: 'REJECTED',
                remarks: reason ? `REJECTED: ${reason}` : undefined
            }).eq('id', id);
            if (error) {
                alert('Failed to reject: ' + error.message);
            } else {
                setSubprojects(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'REJECTED', remarks: reason ? `REJECTED: ${reason}` : s.remarks } : s));
            }
        } else {
            setSubprojects(prev => prev.map(s => s.id === id ? { ...s, workflow_status: 'REJECTED', remarks: reason ? `REJECTED: ${reason}` : s.remarks } : s));
        }
    };

    return (
        <div className="data-list-page">
            {isDeleteModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl">
                        <h3 className="text-lg font-bold">Confirm Deletion</h3>
                        <p className="my-4">Are you sure you want to delete "{subprojectToDelete?.name}"? This action cannot be undone.</p>
                        <div className="flex justify-end gap-4">
                            <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
                            <button onClick={confirmDelete} className="btn btn-danger">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {isMultiDeleteModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl">
                        <h3 className="text-lg font-bold text-red-600 dark:text-red-400">Confirm Bulk Deletion</h3>
                        <p className="my-4 text-gray-700 dark:text-gray-300">
                            Are you sure you want to delete the <strong>{selectedIds.length}</strong> selected subproject(s)? 
                            This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-4">
                            <button onClick={() => setIsMultiDeleteModalOpen(false)} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
                            <button onClick={confirmMultiDelete} className="btn btn-danger">Delete All Selected</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="data-list-header">
                <h2 className="data-list-title">Subprojects Management</h2>
                <div className="data-list-actions">
                    <DcfScopeFilterToggle idPrefix="subprojects-dcf" filters={dcfFilters} />
                    {canEdit && (
                        <button onClick={onCreateSubproject} className="btn btn-primary btn-responsive" title="Add New Subproject">
                            <Plus className="btn-symbol" aria-hidden="true" />
                            <span className="btn-text">Add New Subproject</span>
                        </button>
                    )}
                </div>
            </div>
            <DcfScopeFilterPanel idPrefix="subprojects-dcf" filters={dcfFilters} />
            <div className="data-table-card">
                <div className="data-table-toolbar">
                    <div className="data-toolbar-row">
                    <div className="data-toolbar-group">
                        <input
                            type="text"
                            placeholder="Search Subproject..."
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setSavedSearchTerm(e.target.value);
                            }}
                            className={`data-table-search w-full md:w-64 ${commonInputClasses} mt-0`}
                        />
                        {Object.keys(columnFilters).length > 0 && (
                            <button onClick={clearColumnFilters} className="text-sm text-red-500 hover:text-red-700 underline">
                                Reset Filters
                            </button>
                        )}
                    </div>
                    <div className="data-toolbar-group data-toolbar-group--actions">
                        {isSelectionMode && selectedIds.length > 0 && (
                            <button 
                                onClick={() => selectionIntent === 'delete' ? setIsMultiDeleteModalOpen(true) : handleClone()} 
                                className={`btn ${selectionIntent === 'delete' ? 'btn-danger' : 'btn-info'}`}
                            >
                                {selectionIntent === 'delete' ? `Delete Selected (${selectedIds.length})` : `Clone Selected (${selectedIds.length})`}
                            </button>
                        )}
                        <button onClick={() => downloadSubprojectsReport(processedSubprojects)} className="btn btn-primary btn-responsive" title="Download Report">
                            <Download className="btn-symbol" aria-hidden="true" />
                            <span className="btn-text">Download Report</span>
                        </button>
                        {canEdit && (
                            <>
                                <button onClick={downloadSubprojectsTemplate} className="btn btn-secondary btn-responsive" title="Download Template">
                                    <FileSpreadsheet className="btn-symbol" aria-hidden="true" />
                                    <span className="btn-text">Template</span>
                                </button>
                                <label htmlFor="subproject-upload" className={`btn btn-primary btn-responsive ${isUploading ? 'is-disabled' : 'cursor-pointer'}`} title={isUploading ? 'Uploading...' : 'Upload'}>
                                    <Upload className="btn-symbol" aria-hidden="true" />
                                    <span className="btn-text">{isUploading ? 'Uploading...' : 'Upload'}</span>
                                </label>
                                <input id="subproject-upload" type="file" className="hidden" onChange={(e) => handleSubprojectsUpload(e, subprojects, setSubprojects, ipos, logAction, setIsUploading, uacsCodes, currentUser)} accept=".xlsx, .xls" disabled={isUploading} />
                                <button 
                                    onClick={() => handleToggleMode('clone')} 
                                    className={`btn btn-secondary btn-icon ${isSelectionMode && selectionIntent === 'clone' ? 'is-active-clone' : ''}`} 
                                    title="Toggle Clone Mode"
                                >
                                    <DuplicateIcon />
                                </button>
                                <button
                                    onClick={() => handleToggleMode('delete')}
                                    className={`btn btn-secondary btn-icon ${isSelectionMode && selectionIntent === 'delete' ? 'is-active-danger' : ''}`}
                                    title="Toggle Multi-Delete Mode"
                                >
                                    <TrashIcon />
                                </button>
                            </>
                        )}
                    </div>
                    </div>
                </div>

                <div className="data-table-scroll overflow-x-auto pb-24">
                    <table className="data-table min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th scope="col" className="w-12 px-4 py-3 sticky left-0 bg-gray-50 dark:bg-gray-700 z-10"></th>
                                <SubprojectColumnHeader label="Name" columnKey="name" sortConfig={sortConfig} onSort={handleSort} filters={columnFilters['name'] || []} onFilterChange={(v) => handleColumnFilterChange('name', v)} uniqueValues={uniqueValues.name} />
                                <SubprojectColumnHeader label="OU" columnKey="operatingUnit" sortConfig={sortConfig} onSort={handleSort} filters={getScopeColumnFilter('operatingUnit')} onFilterChange={(v) => handleColumnFilterChange('operatingUnit', v)} uniqueValues={uniqueValues.operatingUnit} />
                                <SubprojectColumnHeader label="IPO" columnKey="indigenousPeopleOrganization" sortConfig={sortConfig} onSort={handleSort} filters={columnFilters['indigenousPeopleOrganization'] || []} onFilterChange={(v) => handleColumnFilterChange('indigenousPeopleOrganization', v)} uniqueValues={uniqueValues.indigenousPeopleOrganization} />
                                <SubprojectColumnHeader label="Fund Year" columnKey="fundingYear" sortConfig={sortConfig} onSort={handleSort} filters={getScopeColumnFilter('fundingYear')} onFilterChange={(v) => handleColumnFilterChange('fundingYear', v)} uniqueValues={uniqueValues.fundingYear} />
                                <SubprojectColumnHeader label="Fund Type" columnKey="fundType" sortConfig={sortConfig} onSort={handleSort} filters={getScopeColumnFilter('fundType')} onFilterChange={(v) => handleColumnFilterChange('fundType', v)} uniqueValues={uniqueValues.fundType} />
                                <SubprojectColumnHeader label="Tier" columnKey="tier" sortConfig={sortConfig} onSort={handleSort} filters={getScopeColumnFilter('tier')} onFilterChange={(v) => handleColumnFilterChange('tier', v)} uniqueValues={uniqueValues.tier} />
                                <SubprojectColumnHeader label="Project Status" columnKey="status" sortConfig={sortConfig} onSort={handleSort} filters={columnFilters['status'] || []} onFilterChange={(v) => handleColumnFilterChange('status', v)} uniqueValues={uniqueValues.status} />
                                <SubprojectColumnHeader label="Commodity target" columnKey="commodityTarget" sortConfig={sortConfig} onSort={handleSort} filters={[]} onFilterChange={() => {}} uniqueValues={[]} isNumeric={true} />
                                <SubprojectColumnHeader label="Budget" columnKey="totalBudget" sortConfig={sortConfig} onSort={handleSort} filters={[]} onFilterChange={() => {}} uniqueValues={[]} isNumeric={true} />
                                <SubprojectColumnHeader label="Completion rate" columnKey="completionRate" sortConfig={sortConfig} onSort={handleSort} filters={[]} onFilterChange={() => {}} uniqueValues={[]} isNumeric={true} />
                                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">Workflow Status</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap sticky right-0 bg-gray-50 dark:bg-gray-700 z-10">
                                    {isSelectionMode ? (
                                        <div className="flex items-center justify-end gap-2">
                                            <span className="text-xs">Select All</span>
                                            <input type="checkbox" onChange={(e) => handleSelectAll(e, paginatedSubprojects)} checked={paginatedSubprojects.length > 0 && paginatedSubprojects.every(s => selectedIds.includes(s.id))} className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                                        </div>
                                    ) : ("Actions")}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {paginatedSubprojects.map((s) => {
                                const details = s.details || [];
                                const budget = calculateTotalBudget(details);
                                const actualObligated = details.reduce((sum, d) => sum + (d.actualObligationAmount || 0), 0);
                                const actualDisbursed = details.reduce((sum, d) => sum + (d.actualDisbursementAmount || 0), 0);
                                const totalItems = details.length;
                                const completedItems = details.filter(d => d.actualDeliveryDate).length;
                                const completionRate = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
                                const commodities = s.subprojectCommodities && s.subprojectCommodities.length > 0 ? s.subprojectCommodities.map(c => `${c.name} (${c.area} ${c.typeName === 'Livestock' ? 'heads' : 'ha'})`).join(', ') : 'N/A';

                                return (
                                <React.Fragment key={s.id}>
                                    <tr onClick={() => handleToggleRow(s.id)} className="cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-900/10">
                                        <td className="px-4 py-4 text-gray-400 sticky left-0 bg-white dark:bg-gray-800 z-10"><svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-200 ${expandedRowId === s.id ? 'transform rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></td>
                                        <td className="px-6 py-4 whitespace-normal text-sm font-medium text-gray-900 dark:text-white min-w-[200px]">
                                            <button onClick={(e) => {e.stopPropagation(); onSelectSubproject(s);}} className="table-link">
                                                {s.name || 'Unnamed Subproject'}
                                            </button>
                                            <div className="text-xs text-gray-400">{s.uid || 'No UID'}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{s.operatingUnit || 'N/A'}</td>
                                        <td className="px-6 py-4 whitespace-normal text-sm text-gray-500 dark:text-gray-300">{s.indigenousPeopleOrganization || 'N/A'}</td>
                                         <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{s.fundingYear || 'N/A'}</td>
                                         <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{s.fundType || 'N/A'}</td>
                                         <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{s.tier || 'N/A'}</td>
                                         <td className="px-6 py-4 whitespace-nowrap text-xs"><span className={getStatusBadge(s.status)}>{s.status || 'Unknown'}</span></td>
                                        <td className="px-6 py-4 whitespace-normal text-sm text-gray-500 dark:text-gray-300 min-w-[150px]">{commodities}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatCurrency(budget)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                                            <div className="flex items-center">
                                                <span className="mr-2 text-xs font-medium">{completionRate}%</span>
                                                <div className="w-20 bg-gray-200 rounded-full h-1.5 dark:bg-gray-700">
                                                    <div className={`h-1.5 rounded-full ${completionRate === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${completionRate}%` }}></div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex flex-col gap-1 items-start">
                                                {getWorkflowStatusBadge(s.workflow_status)}
                                                {s.workflow_status === 'PENDING' && canApprove(currentUser?.role) && (
                                                    <div className="flex gap-1 mt-1">
                                                        <button 
                                                            onClick={(e) => handleApprove(s.id, e)} 
                                                            className="action-mini action-mini--approve"
                                                            title="Approve"
                                                        >
                                                            <Check className="h-3 w-3" />
                                                        </button>
                                                        <button 
                                                            onClick={(e) => handleReject(s.id, e)} 
                                                            className="action-mini action-mini--reject"
                                                            title="Reject"
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium sticky right-0 bg-white dark:bg-gray-800 z-10">
                                            {canEdit ? (
                                                <div className="flex items-center justify-end gap-3">
                                                    {isSelectionMode && (
                                                        <input type="checkbox" checked={selectedIds.includes(s.id)} onChange={(e) => { e.stopPropagation(); handleSelectRow(s.id); }} onClick={(e) => e.stopPropagation()} className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                                                    )}
                                                    <button onClick={(e) => { e.stopPropagation(); onSelectSubproject(s); }} className="table-action table-action--primary">Details</button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(s); }} className="table-action table-action--danger">Delete</button>
                                                </div>
                                            ) : (
                                                <button onClick={(e) => { e.stopPropagation(); onSelectSubproject(s); }} className="table-action table-action--primary">View Details</button>
                                            )}
                                        </td>
                                    </tr>
                                    {expandedRowId === s.id && (
                                        <tr className="bg-gray-50 dark:bg-gray-900/50">
                                            <td colSpan={11} className="p-4">
                                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                                    <div className="space-y-4">
                                                        <div>
                                                            <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Project Details</h4>
                                                            <div className="space-y-2 text-sm">
                                                                <p><strong className="text-gray-500 dark:text-gray-400">Location:</strong> <span className="text-gray-900 dark:text-gray-100">{s.location || 'N/A'}</span></p>
                                                                <p><strong className="text-gray-500 dark:text-gray-400">Package:</strong> <span className="text-gray-900 dark:text-gray-100">{s.packageType || 'N/A'}</span></p>
                                                                <p><strong className="text-gray-500 dark:text-gray-400">Status:</strong> <span className={getStatusBadge(s.status)}>{s.status || 'Unknown'}</span></p>
                                                                <p><strong className="text-gray-500 dark:text-gray-400">Encoded by:</strong> <span className="text-gray-900 dark:text-gray-100">{s.encodedBy || 'N/A'}</span></p>
                                                            </div>
                                                        </div>
                                                        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
                                                            <h4 className="font-semibold text-md mb-2 text-blue-700 dark:text-blue-300">Timeline</h4>
                                                            <div className="space-y-1 text-sm">
                                                                <p><strong className="text-gray-500 dark:text-gray-400">Start Date:</strong> {formatDate(s.startDate)}</p>
                                                                <p><strong className="text-gray-500 dark:text-gray-400">Target Completion:</strong> {formatDate(s.estimatedCompletionDate)}</p>
                                                                <p><strong className="text-gray-500 dark:text-gray-400">Actual Completion:</strong> {formatDate(s.actualCompletionDate)}</p>
                                                            </div>
                                                        </div>
                                                        {s.remarks && (
                                                            <div>
                                                                <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Remarks</h4>
                                                                <p className="text-sm text-gray-600 dark:text-gray-300 italic">{s.remarks}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                    
                                                    <div className="space-y-4 text-sm bg-gray-100 dark:bg-gray-800/50 p-4 rounded-lg">
                                                        <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Budget & Particulars</h4>
                                                        {details.length > 0 ? (
                                                            <ul className="space-y-1">
                                                                {details.map(detail => (
                                                                    <li key={detail.id} className="flex justify-between items-start p-1 border-b border-gray-200 dark:border-gray-700 last:border-0">
                                                                        <div>
                                                                            <span className="block font-medium text-gray-800 dark:text-gray-200">{detail.particulars || 'Unnamed Item'}</span>
                                                                            <span className="text-xs text-gray-500 dark:text-gray-400">{detail.uacsCode || 'No UACS'} | {detail.numberOfUnits || 0} {detail.unitOfMeasure || 'units'}</span>
                                                                            <span className="text-xs text-gray-400 block">Obl: {formatMonthYear(detail.obligationMonth)} | Disb: {formatMonthYear(detail.disbursementMonth)}</span>
                                                                        </div>
                                                                        <span className="font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">{formatCurrency((detail.pricePerUnit || 0) * (detail.numberOfUnits || 0))}</span>
                                                                    </li>
                                                                ))}
                                                                <li className="flex justify-between items-center p-1 border-t border-gray-300 dark:border-gray-600 mt-2 pt-2 font-bold text-gray-900 dark:text-white"><span>Total</span><span>{formatCurrency(calculateTotalBudget(details))}</span></li>
                                                            </ul>
                                                        ) : ( <p className="text-sm text-gray-500 dark:text-gray-400 italic">No budget items listed.</p> )}
                                                        
                                                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-200 dark:border-gray-700 mt-2">
                                                            <p><strong className="text-gray-500 dark:text-gray-400">Funding Year:</strong> <span className="text-gray-900 dark:text-gray-100">{s.fundingYear ?? 'N/A'}</span></p>
                                                            <p><strong className="text-gray-500 dark:text-gray-400">Fund Type:</strong> <span className="text-gray-900 dark:text-gray-100">{s.fundType ?? 'N/A'}</span></p>
                                                            <p><strong className="text-gray-500 dark:text-gray-400">Tier:</strong> <span className="text-gray-900 dark:text-gray-100">{s.tier ?? 'N/A'}</span></p>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-4 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
                                                        <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Accomplishment Brief</h4>
                                                        <div className="space-y-3 text-sm">
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-gray-600 dark:text-gray-400">Physical Completion</span>
                                                                <span className={`font-bold ${completionRate === 100 ? 'text-green-600' : 'text-blue-600'}`}>{completionRate}%</span>
                                                            </div>
                                                            <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
                                                                <div className={`h-2 rounded-full ${completionRate === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${completionRate}%` }}></div>
                                                            </div>
                                                            <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                                                                <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Actual Obligated</span><span className="font-medium text-gray-800 dark:text-gray-200">{formatCurrency(actualObligated)}</span></div>
                                                                <div className="flex justify-between mt-1"><span className="text-gray-500 dark:text-gray-400">Actual Disbursed</span><span className="font-medium text-gray-800 dark:text-gray-200">{formatCurrency(actualDisbursed)}</span></div>
                                                            </div>
                                                            {s.subprojectCommodities && s.subprojectCommodities.length > 0 && (
                                                                <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-semibold uppercase">Impact</p>
                                                                    {s.subprojectCommodities.map((c, i) => (
                                                                        <div key={i} className="flex justify-between text-xs"><span>{c.name || 'Unknown'}</span><span className="font-medium">{c.actualYield ? c.actualYield : '-'} {c.typeName === 'Livestock' ? 'heads' : 'yield'} (Actual)</span></div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );})}
                        </tbody>
                    </table>
                </div>
                 
                 <div className="data-table-pagination py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-700 dark:text-gray-300">Show</span>
                        <select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1 pl-2 pr-8 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm">
                            {[10, 20, 50, 100].map(size => ( <option key={size} value={size}>{size}</option> ))}
                        </select>
                        <span className="text-gray-700 dark:text-gray-300">entries</span>
                    </div>
                     <div className="flex items-center gap-4 text-sm">
                        <span className="text-gray-700 dark:text-gray-300">Showing {Math.min((currentPage - 1) * itemsPerPage + 1, processedSubprojects.length)} to {Math.min(currentPage * itemsPerPage, processedSubprojects.length)} of {processedSubprojects.length} entries</span>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">Previous</button>
                            <span className="px-2 font-medium">{currentPage} / {totalPages}</span>
                            <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Subprojects;

// --- End of Subprojects.tsx ---
