
// Author: 4K 
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Activity, ActivityExpense, IPO, objectTypes, ObjectType, fundTypes, FundType, tiers, Tier, otherActivityComponents, ReferenceActivity, philippineRegions, operatingUnits, ouToRegionMap } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import { useLogAction } from '../hooks/useLogAction';
import { usePagination, useSelection, getUserPermissions } from './mainfunctions/TableHooks';
import { downloadActivitiesReport, downloadActivitiesTemplate, handleActivitiesUpload } from './mainfunctions/ImportExportService';
import { useIpoHistory } from '../hooks/useIpoHistory';
import { fetchAll } from '../hooks/useSupabaseTable';
import useLocalStorageState from '../hooks/useLocalStorageState';

// Declare XLSX to inform TypeScript about the global variable from the script tag
declare const XLSX: any;

interface ActivitiesProps {
    ipos: IPO[];
    activities: Activity[];
    setActivities: React.Dispatch<React.SetStateAction<Activity[]>>;
    onSelectIpo: (ipo: IPO) => void;
    onSelectActivity: (activity: Activity) => void; 
    onCreateActivity: () => void;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    referenceActivities?: ReferenceActivity[]; 
    forcedType?: 'Training' | 'Activity';
    externalFilters?: { region?: string; year?: string; search?: string; status?: string } | null;
    onClearExternalFilters?: () => void;
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

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm text-gray-900 dark:text-white";

const getStatusBadge = (status: Activity['status']) => {
    const baseClasses = "px-2 py-0.5 text-xs font-medium rounded-full";
    switch (status) {
        case 'Completed': return `${baseClasses} bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200`;
        case 'Ongoing': return `${baseClasses} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`;
        case 'Proposed': return `${baseClasses} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`;
        case 'Cancelled': return `${baseClasses} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`;
        default: return `${baseClasses} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200`;
    }
}

// --- COLUMN HEADER COMPONENT WITH FILTER ---
interface ActivityColumnHeaderProps {
    label: string;
    columnKey: keyof Activity | 'budget';
    sortConfig: { key: string; direction: 'ascending' | 'descending' } | null;
    onSort: (key: any, direction: 'ascending' | 'descending') => void;
    filters: string[];
    onFilterChange: (values: string[]) => void;
    uniqueValues: string[];
    isNumeric?: boolean;
}

const ActivityColumnHeader: React.FC<ActivityColumnHeaderProps> = ({ 
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

    const filteredValues = uniqueValues.filter(v => v.toLowerCase().includes(searchTerm.toLowerCase()));
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


export const ActivitiesComponent: React.FC<ActivitiesProps> = ({ 
    ipos, activities, setActivities, onSelectIpo, onSelectActivity, 
    onCreateActivity, uacsCodes, referenceActivities = [], forcedType,
    externalFilters, onClearExternalFilters 
}) => {
    const { currentUser } = useAuth();
    const { logAction } = useLogAction();
    const { addIpoHistory } = useIpoHistory();
    
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<Activity | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [selectionIntent, setSelectionIntent] = useState<'delete' | 'clone'>('delete');

    // Shared Hooks
    const { canEdit, canViewAll } = getUserPermissions(currentUser);
    const { 
        isSelectionMode, selectedIds, isMultiDeleteModalOpen, setIsMultiDeleteModalOpen, toggleSelectionMode, 
        handleSelectAll, handleSelectRow, resetSelection 
    } = useSelection<Activity>();

    // Global Filters (Only Search retained in UI)
    const [savedSearchTerm, setSavedSearchTerm] = useLocalStorageState('activities_searchTerm', '');
    const [searchTerm, setSearchTerm] = useState(savedSearchTerm);

    // Column Filters (New) - Stores an array of selected values for each column key
    const [savedColumnFilters, setSavedColumnFilters] = useLocalStorageState<Record<string, string[]>>('activities_columnFilters', {});
    const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>(savedColumnFilters);

    // Sorting
    type SortKeys = keyof Activity | 'totalParticipants' | 'budget';
    const [sortConfig, setSortConfig] = useState<{ key: SortKeys; direction: 'ascending' | 'descending' } | null>({ key: 'date', direction: 'descending' });
    
    const [expandedRowId, setExpandedRowId] = useState<number | null>(null);

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
            
            if (Object.keys(newFilters).length > 0) {
                setColumnFilters(prev => ({ ...prev, ...newFilters }));
            }
            
            // Clear the external filters so they don't re-apply on remount or navigation
            if (onClearExternalFilters) {
                onClearExternalFilters();
            }
        }
    }, [externalFilters, onClearExternalFilters]);

    // 1. Initial Filtering (Search + Permissions + ForcedType)
    const initiallyFilteredActivities = useMemo(() => {
        let filtered = [...activities];

        // Permission-based OU Filtering
        if (!canViewAll && currentUser) {
            filtered = filtered.filter(a => a.operatingUnit === currentUser.operatingUnit);
        }
        
        // Forced Type (e.g. Trainings Page vs Activities Page)
        if (forcedType) {
            filtered = filtered.filter(activity => activity.type === forcedType);
        }

        if (searchTerm) {
            const lowercasedSearchTerm = searchTerm.toLowerCase();
            filtered = filtered.filter(t =>
                t.name.toLowerCase().includes(lowercasedSearchTerm) ||
                t.location.toLowerCase().includes(lowercasedSearchTerm) ||
                t.description.toLowerCase().includes(lowercasedSearchTerm) ||
                (t.type === 'Training' && t.facilitator?.toLowerCase().includes(lowercasedSearchTerm)) ||
                t.operatingUnit.toLowerCase().includes(lowercasedSearchTerm) ||
                (t.uid && t.uid.toLowerCase().includes(lowercasedSearchTerm))
            );
        }
        return filtered;
    }, [activities, searchTerm, forcedType, currentUser, canViewAll]);

    // 2. Extract Unique Values for Column Filters based on Initially Filtered Data
    const uniqueValues = useMemo(() => {
        const getUnique = (key: keyof Activity) => Array.from(new Set(initiallyFilteredActivities.map(a => String(a[key] || '')))).filter(Boolean).sort();
        return {
            name: getUnique('name'),
            status: getUnique('status'),
            date: getUnique('date'), 
            description: getUnique('description'),
            budget: [], // Budget is numeric
            operatingUnit: getUnique('operatingUnit'),
            component: getUnique('component'),
            fundingYear: getUnique('fundingYear')
        };
    }, [initiallyFilteredActivities]);

    // 3. Apply Column Filters & Sort
    const processedActivities = useMemo(() => {
        let filtered = [...initiallyFilteredActivities];

        // Apply Column Filters
        Object.keys(columnFilters).forEach(key => {
            const selectedValues = columnFilters[key];
            if (selectedValues.length > 0) {
                filtered = filtered.filter(item => {
                    const itemValue = String((item as any)[key] || '');
                    return selectedValues.includes(itemValue);
                });
            }
        });

        // Apply Sorting
        if (sortConfig !== null) {
            filtered.sort((a, b) => {
                let aValue: any;
                let bValue: any;

                if (sortConfig.key === 'totalParticipants') {
                    aValue = a.participantsMale + a.participantsFemale;
                    bValue = b.participantsMale + b.participantsFemale;
                } else if (sortConfig.key === 'budget') {
                    aValue = a.expenses.reduce((sum, e) => sum + e.amount, 0);
                    bValue = b.expenses.reduce((sum, e) => sum + e.amount, 0);
                } else {
                    aValue = a[sortConfig.key as keyof Activity] || '';
                    bValue = b[sortConfig.key as keyof Activity] || '';
                }

                if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return filtered;
    }, [initiallyFilteredActivities, columnFilters, sortConfig]);

    // Use Shared Pagination Hook
    const { 
        currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData: paginatedActivities 
    } = usePagination(processedActivities, [searchTerm, forcedType, sortConfig, columnFilters]);

    // Sorting Handler
    const handleSort = (key: SortKeys, direction: 'ascending' | 'descending') => {
        setSortConfig({ key, direction });
    };

    // Filter Change Handler
    const handleColumnFilterChange = (columnKey: string, values: string[]) => {
        const newFilters = {
            ...columnFilters,
            [columnKey]: values
        };
        setColumnFilters(newFilters);
        setSavedColumnFilters(newFilters);
    };
    
    // Clear Column Filters
    const clearColumnFilters = () => {
        setColumnFilters({});
        setSavedColumnFilters({});
    }

    const handleToggleRow = (activityId: number) => {
        setExpandedRowId(prevId => (prevId === activityId ? null : activityId));
    };

    // ... (Deletion, Cloning, formatDate handlers remain the same)
    const confirmMultiDelete = async () => {
        if (selectedIds.length > 0) {
            const deletedItems = activities.filter(a => selectedIds.includes(a.id)).map(a => a.name).join(', ');
            logAction('Deleted Activities', `Bulk deleted ${selectedIds.length} items: ${deletedItems}`);

            if (supabase) {
                const { error } = await supabase.from('activities').delete().in('id', selectedIds);
                if (error) {
                    console.error("Error deleting items:", error);
                    alert("Failed to delete selected items.");
                } else {
                     setActivities(prev => prev.filter(a => !selectedIds.includes(a.id)));
                }
            } else {
                setActivities(prev => prev.filter(a => !selectedIds.includes(a.id)));
            }
        }
        resetSelection();
    };

    const handleClone = async () => {
        const itemsToClone = activities.filter(a => selectedIds.includes(a.id));
        if (itemsToClone.length === 0) return;

        if (!window.confirm(`Are you sure you want to clone ${itemsToClone.length} activities? This will create new entries with the same details but reset accomplishments.`)) return;

        const currentTimestamp = new Date().toISOString();
        const currentYear = new Date().getFullYear();

        const newActivitiesPayload = itemsToClone.map((item, index) => {
            const { id, uid, created_at, updated_at, history, ...rest } = item;
            
            const prefix = item.type === 'Training' ? 'TRN' : 'ACT';
            const sequence = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
            const newUid = `${prefix}-${currentYear}-${sequence}${index}`;

            const clonedExpenses = item.expenses.map(exp => ({
                ...exp,
                id: Date.now() + Math.random(),
                actualObligationAmount: 0,
                actualObligationDate: '',
                actualDisbursementAmount: 0,
                actualDisbursementDate: '',
                actualAmount: 0
            }));

            return {
                ...rest,
                uid: newUid,
                status: 'Proposed',
                actualDate: '',
                actualEndDate: '',
                actualParticipantsMale: 0,
                actualParticipantsFemale: 0,
                catchUpPlanRemarks: '',
                newTargetDate: '',
                expenses: clonedExpenses,
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
            const { data, error } = await supabase.from('activities').insert(newActivitiesPayload).select();
            if (error) {
                alert('Failed to clone items: ' + error.message);
            } else if (data) {
                setActivities(prev => [...data as Activity[], ...prev]);
                resetSelection();
                alert(`Successfully cloned ${data.length} activities.`);
            }
        } else {
            const newLocalItems = newActivitiesPayload.map((item, idx) => ({ ...item, id: Date.now() + idx }));
            setActivities(prev => [...(newLocalItems as Activity[]), ...prev]);
            resetSelection();
            alert(`Successfully cloned ${newLocalItems.length} activities (Local).`);
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

    const handleDeleteClick = (activity: Activity) => {
        setItemToDelete(activity);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (itemToDelete) {
            logAction(`Deleted ${itemToDelete.type}`, itemToDelete.name, itemToDelete.participatingIpos.join(', '));

             for (const ipoName of itemToDelete.participatingIpos) {
                const ipo = ipos.find(i => i.name === ipoName);
                if (ipo) {
                    await addIpoHistory(ipo.id, `${itemToDelete.type} Deleted: ${itemToDelete.name}`);
                }
            }

            if (supabase) {
                const { error } = await supabase.from('activities').delete().eq('id', itemToDelete.id);
                if (error) {
                    console.error("Error deleting activity:", error);
                    alert("Failed to delete activity.");
                } else {
                     setActivities(prev => prev.filter(p => p.id !== itemToDelete.id));
                }
            } else {
                setActivities(prev => prev.filter(p => p.id !== itemToDelete.id));
            }
            setIsDeleteModalOpen(false);
            setItemToDelete(null);
        }
    };
    
    const formatDate = (dateString?: string) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    return (
        <div>
            {isDeleteModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl">
                        <h3 className="text-lg font-bold">Confirm Deletion</h3>
                        <p className="my-4">Are you sure you want to delete this activity?</p>
                        <div className="flex justify-end gap-4">
                            <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
                            <button onClick={confirmDelete} className="px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700">Delete</button>
                        </div>
                    </div>
                </div>
            )}
            
            {isMultiDeleteModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl">
                        <h3 className="text-lg font-bold text-red-600 dark:text-red-400">Confirm Bulk Deletion</h3>
                        <p className="my-4 text-gray-700 dark:text-gray-300">
                            Are you sure you want to delete the <strong>{selectedIds.length}</strong> selected activities? 
                            This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-4">
                            <button onClick={() => setIsMultiDeleteModalOpen(false)} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
                            <button onClick={confirmMultiDelete} className="px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700">Delete All Selected</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Activities Management</h2>
                {canEdit && (
                    <button onClick={onCreateActivity} className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500">
                        + Add New Activity
                    </button>
                )}
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                 <div className="mb-4 flex flex-col gap-4">
                    <div className="flex flex-wrap gap-x-4 gap-y-2 items-center justify-between">
                        <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
                            <input 
                                type="text" 
                                placeholder="Search Activity..." 
                                value={searchTerm} 
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setSavedSearchTerm(e.target.value);
                                }} 
                                className={`w-full md:w-64 ${commonInputClasses} mt-0`} 
                            />
                            
                            {Object.keys(columnFilters).length > 0 && (
                                <button onClick={clearColumnFilters} className="text-sm text-red-500 hover:text-red-700 underline">
                                    Reset Filters
                                </button>
                            )}
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
                            <button onClick={() => downloadActivitiesReport(processedActivities)} className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700">Download Report</button>
                            {canEdit && (
                                <>
                                    <button onClick={downloadActivitiesTemplate} className="inline-flex items-center justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">Template</button>
                                    <label htmlFor="activity-upload" className={`inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 ${isUploading ? 'bg-gray-400 cursor-not-allowed' : 'cursor-pointer'}`}>{isUploading ? 'Uploading...' : 'Upload'}</label>
                                    <input id="activity-upload" type="file" className="hidden" onChange={(e) => handleActivitiesUpload(e, activities, setActivities, ipos, logAction, setIsUploading, uacsCodes, currentUser)} accept=".xlsx, .xls" disabled={isUploading} />
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
                 </div>

                <div className="overflow-x-visible pb-24">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th scope="col" className="w-12 px-4 py-3 sticky left-0 bg-gray-50 dark:bg-gray-700 z-10"></th>
                                <ActivityColumnHeader 
                                    label="Name" 
                                    columnKey="name" 
                                    sortConfig={sortConfig} 
                                    onSort={handleSort} 
                                    filters={columnFilters['name'] || []} 
                                    onFilterChange={(v) => handleColumnFilterChange('name', v)} 
                                    uniqueValues={uniqueValues.name} 
                                />
                                <ActivityColumnHeader 
                                    label="OU" 
                                    columnKey="operatingUnit" 
                                    sortConfig={sortConfig} 
                                    onSort={handleSort} 
                                    filters={columnFilters['operatingUnit'] || []} 
                                    onFilterChange={(v) => handleColumnFilterChange('operatingUnit', v)} 
                                    uniqueValues={uniqueValues.operatingUnit} 
                                />
                                <ActivityColumnHeader 
                                    label="Component" 
                                    columnKey="component" 
                                    sortConfig={sortConfig} 
                                    onSort={handleSort} 
                                    filters={columnFilters['component'] || []} 
                                    onFilterChange={(v) => handleColumnFilterChange('component', v)} 
                                    uniqueValues={uniqueValues.component} 
                                />
                                <ActivityColumnHeader 
                                    label="Fund Year" 
                                    columnKey="fundingYear" 
                                    sortConfig={sortConfig} 
                                    onSort={handleSort} 
                                    filters={columnFilters['fundingYear'] || []} 
                                    onFilterChange={(v) => handleColumnFilterChange('fundingYear', v)} 
                                    uniqueValues={uniqueValues.fundingYear} 
                                />
                                <ActivityColumnHeader 
                                    label="Status" 
                                    columnKey="status" 
                                    sortConfig={sortConfig} 
                                    onSort={handleSort} 
                                    filters={columnFilters['status'] || []} 
                                    onFilterChange={(v) => handleColumnFilterChange('status', v)} 
                                    uniqueValues={uniqueValues.status} 
                                />
                                <ActivityColumnHeader 
                                    label="Date" 
                                    columnKey="date" 
                                    sortConfig={sortConfig} 
                                    onSort={handleSort} 
                                    filters={columnFilters['date'] || []} 
                                    onFilterChange={(v) => handleColumnFilterChange('date', v)} 
                                    uniqueValues={uniqueValues.date} 
                                />
                                <ActivityColumnHeader 
                                    label="Description" 
                                    columnKey="description" 
                                    sortConfig={sortConfig} 
                                    onSort={handleSort} 
                                    filters={columnFilters['description'] || []} 
                                    onFilterChange={(v) => handleColumnFilterChange('description', v)} 
                                    uniqueValues={uniqueValues.description} 
                                />
                                <ActivityColumnHeader 
                                    label="Budget" 
                                    columnKey="budget" 
                                    sortConfig={sortConfig} 
                                    onSort={handleSort} 
                                    filters={[]} 
                                    onFilterChange={() => {}} 
                                    uniqueValues={[]}
                                    isNumeric={true}
                                />
                                <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider sticky right-0 bg-gray-50 dark:bg-gray-700 z-10">
                                    {isSelectionMode ? (
                                        <div className="flex items-center justify-end gap-2">
                                            <span className="text-xs">Select All</span>
                                            <input 
                                                type="checkbox" 
                                                onChange={(e) => handleSelectAll(e, paginatedActivities)} 
                                                checked={paginatedActivities.length > 0 && paginatedActivities.every(a => selectedIds.includes(a.id))}
                                                className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                            />
                                        </div>
                                    ) : (
                                        "Actions"
                                    )}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {paginatedActivities.map((activity) => {
                                const totalActivityBudget = activity.expenses.reduce((sum, e) => sum + e.amount, 0);
                                const totalParticipants = activity.participantsMale + activity.participantsFemale;
                                
                                return (
                                <React.Fragment key={activity.id}>
                                    <tr onClick={() => handleToggleRow(activity.id)} className="cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-900/10">
                                        <td className="px-4 py-4 text-gray-400 sticky left-0 bg-white dark:bg-gray-800 z-10"><svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-200 ${expandedRowId === activity.id ? 'transform rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></td>
                                        <td className="px-6 py-4 whitespace-normal text-sm font-medium text-gray-900 dark:text-white">
                                            <button onClick={(e) => { e.stopPropagation(); onSelectActivity(activity); }} className="text-left hover:text-emerald-600 hover:underline focus:outline-none">
                                                {activity.name}
                                            </button>
                                            {activity.uid && <div className="text-xs text-gray-400 font-normal mt-1">{activity.uid}</div>}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{activity.operatingUnit}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{activity.component}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{activity.fundingYear || 'N/A'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-xs"><span className={getStatusBadge(activity.status)}>{activity.status}</span></td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                                            {new Date(activity.date).toLocaleDateString()}
                                            {activity.endDate && activity.endDate !== activity.date ? ` - ${new Date(activity.endDate).toLocaleDateString()}` : ''}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300 max-w-xs truncate" title={activity.description}>{activity.description}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(totalActivityBudget)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium sticky right-0 bg-white dark:bg-gray-800 z-10">
                                            {canEdit && (
                                                <div className="flex items-center justify-end">
                                                    {isSelectionMode && (
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedIds.includes(activity.id)} 
                                                            onChange={(e) => { e.stopPropagation(); handleSelectRow(activity.id); }} 
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="mr-3 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                                        />
                                                    )}
                                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(activity); }} className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200">Delete</button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                     {expandedRowId === activity.id && (
                                        <tr className="bg-gray-50 dark:bg-gray-900/50">
                                            <td colSpan={11} className="p-4">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div className="space-y-4">
                                                        <div>
                                                            <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Details</h4>
                                                            <p className="text-sm text-gray-600 dark:text-gray-300"><strong>Type:</strong> <span className={`px-2 py-0.5 rounded-full font-semibold ${activity.type === 'Training' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>{activity.type}</span></p>
                                                            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1"><strong>Component:</strong> {activity.component}</p>
                                                            {activity.description && (
                                                                <div className="mt-2">
                                                                    <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">Description:</p>
                                                                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">{activity.description}</p>
                                                                </div>
                                                            )}
                                                            {activity.type === 'Training' && activity.facilitator && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Facilitator: {activity.facilitator}</p>}
                                                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Encoded by: {activity.encodedBy}</p>
                                                        </div>
                                                        <div>
                                                            <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Target Participants</h4>
                                                            <div className="text-sm text-gray-600 dark:text-gray-300">
                                                                <p>Male: {activity.participantsMale}</p>
                                                                <p>Female: {activity.participantsFemale}</p>
                                                                <p className="font-medium mt-1">Total: {totalParticipants}</p>
                                                            </div>
                                                        </div>
                                                        {activity.participatingIpos.length > 0 && (
                                                            <div>
                                                                <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Participating IPOs</h4>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {activity.participatingIpos.map(ipoName => {
                                                                        const ipo = ipos.find(i => i.name === ipoName);
                                                                        return (
                                                                            <button key={ipoName} onClick={(e) => { e.stopPropagation(); if (ipo) onSelectIpo(ipo); }} className="bg-gray-200 dark:bg-gray-700 rounded-full px-3 py-1 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed" disabled={!ipo} title={ipo ? `View details for ${ipoName}` : `${ipoName} (details not found)`}>
                                                                                {ipoName}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="space-y-4 text-sm bg-gray-100 dark:bg-gray-800/50 p-4 rounded-lg">
                                                        <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Budget & Funding</h4>
                                                         {activity.expenses.length > 0 ? (
                                                             <ul className="space-y-1">
                                                                {activity.expenses.map(exp => (
                                                                    <li key={exp.id} className="flex justify-between items-center p-1"><span>{exp.expenseParticular} ({exp.uacsCode})</span><span className="font-medium">{new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(exp.amount)}</span></li>
                                                                ))}
                                                                <li className="flex justify-between items-center p-1 border-t border-gray-300 dark:border-gray-600 mt-1 pt-1 font-bold"><span>Total</span><span>{new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(totalActivityBudget)}</span></li>
                                                            </ul>
                                                        ) : (<p className="text-sm text-gray-500 dark:text-gray-400 italic">No budget items listed.</p>)}
                                                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                                                             <p><strong className="text-gray-500 dark:text-gray-400">Funding Year:</strong> {activity.fundingYear ?? 'N/A'} </p>
                                                            <p><strong className="text-gray-500 dark:text-gray-400">Fund Type:</strong> {activity.fundType ?? 'N/A'}</p>
                                                            <p><strong className="text-gray-500 dark:text-gray-400">Tier:</strong> {activity.tier ?? 'N/A'}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            )})}
                        </tbody>
                    </table>
                </div>
                 {/* Pagination */}
                 <div className="py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-700 dark:text-gray-300">Show</span>
                        <select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1 pl-2 pr-8 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm">{[10, 20, 50, 100].map(size => ( <option key={size} value={size}>{size}</option> ))}</select>
                        <span className="text-gray-700 dark:text-gray-300">entries</span>
                    </div>
                     <div className="flex items-center gap-4 text-sm">
                        <span className="text-gray-700 dark:text-gray-300">Showing {Math.min((currentPage - 1) * itemsPerPage + 1, processedActivities.length)} to {Math.min(currentPage * itemsPerPage, processedActivities.length)} of {processedActivities.length} entries</span>
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
