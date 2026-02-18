
// Author: 4K 
import React, { useState, useMemo, useEffect } from 'react';
import { Activity, IPO, ActivityComponentType, otherActivityComponents, ActivityExpense, objectTypes, ObjectType, fundTypes, FundType, tiers, Tier, operatingUnits, ReferenceActivity } from '../constants';
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

export const ActivitiesComponent: React.FC<ActivitiesProps> = ({ ipos, activities, setActivities, onSelectIpo, onSelectActivity, onCreateActivity, uacsCodes, referenceActivities = [], forcedType }) => {
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

    // Persistent Filters
    const [searchTerm, setSearchTerm] = useLocalStorageState('activities_searchTerm', '');
    const [ouFilter, setOuFilter] = useLocalStorageState('activities_ouFilter', 'All');
    const [fundYearFilter, setFundYearFilter] = useLocalStorageState('activities_fundYearFilter', 'All');
    const [componentFilter, setComponentFilter] = useLocalStorageState<ActivityComponentType | 'All'>('activities_componentFilter', 'All');
    const [typeFilter, setTypeFilter] = useLocalStorageState<'All' | 'Training' | 'Activity'>('activities_typeFilter', forcedType || 'All');

    // Sorting
    type SortKeys = keyof Activity | 'totalParticipants' | 'budget';
    const [sortConfig, setSortConfig] = useState<{ key: SortKeys; direction: 'ascending' | 'descending' } | null>({ key: 'date', direction: 'descending' });
    
    const [expandedRowId, setExpandedRowId] = useState<number | null>(null);

    // Helper to refresh data from Supabase
    const refreshData = async () => {
        if (!supabase) return;
        const data = await fetchAll('activities', 'id', false);
        if (data) {
            setActivities(data as Activity[]);
        }
    };

    // Update typeFilter if forcedType changes
    useEffect(() => {
        if (forcedType) setTypeFilter(forcedType);
    }, [forcedType]);

    // Enforce User OU restriction on mount
    useEffect(() => {
        if (currentUser && currentUser.role === 'User') {
            setOuFilter(currentUser.operatingUnit);
        }
    }, [currentUser]);

    const availableFundYears = useMemo(() => {
        const years = new Set<string>();
        activities.forEach(a => a.fundingYear && years.add(a.fundingYear.toString()));
        return Array.from(years).sort().reverse();
    }, [activities]);

    // Process list data
    const processedActivities = useMemo(() => {
        let filtered = [...activities];

        // OU Filtering
        if (!canViewAll && currentUser) {
            filtered = filtered.filter(a => a.operatingUnit === currentUser.operatingUnit);
        } else if (canViewAll && ouFilter !== 'All') {
            filtered = filtered.filter(a => a.operatingUnit === ouFilter);
        }
        
        if (fundYearFilter !== 'All') {
            filtered = filtered.filter(a => a.fundingYear?.toString() === fundYearFilter);
        }

        if (componentFilter !== 'All') {
            filtered = filtered.filter(activity => activity.component === componentFilter);
        }

        if (typeFilter !== 'All') {
            filtered = filtered.filter(activity => activity.type === typeFilter);
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
                }
                else {
                    aValue = a[sortConfig.key as keyof Activity];
                    bValue = b[sortConfig.key as keyof Activity];
                }

                if (aValue < bValue) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return filtered;
    }, [activities, searchTerm, componentFilter, typeFilter, sortConfig, ouFilter, fundYearFilter, ipos, currentUser, canViewAll]);

    // Use Shared Pagination Hook
    const { 
        currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData: paginatedActivities 
    } = usePagination(processedActivities, [searchTerm, componentFilter, typeFilter, ouFilter, fundYearFilter, sortConfig]);

    const requestSort = (key: SortKeys) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };
    
    const handleToggleRow = (activityId: number) => {
        setExpandedRowId(prevId => (prevId === activityId ? null : activityId));
    };

    const confirmMultiDelete = async () => {
        if (selectedIds.length > 0) {
            // Log Bulk Delete
            const deletedItems = activities.filter(a => selectedIds.includes(a.id)).map(a => a.name).join(', ');
            logAction('Deleted Activities', `Bulk deleted ${selectedIds.length} items: ${deletedItems}`);

            if (supabase) {
                const { error } = await supabase.from('activities').delete().in('id', selectedIds);
                if (error) {
                    console.error("Error deleting items:", error);
                    alert("Failed to delete selected items.");
                } else {
                    refreshData();
                }
            } else {
                // Offline fallback
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

            // Deep copy expenses and reset actuals
            const clonedExpenses = item.expenses.map(exp => ({
                ...exp,
                id: Date.now() + Math.random(), // New temp ID
                actualObligationAmount: 0,
                actualObligationDate: '',
                actualDisbursementAmount: 0,
                actualDisbursementDate: '',
                actualAmount: 0 // Legacy field
            }));

            return {
                ...rest,
                uid: newUid,
                status: 'Proposed', // Reset status
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
            setActivities(prev => [...newLocalItems as Activity[], ...prev]);
            resetSelection();
            alert(`Successfully cloned ${newLocalItems.length} activities (Local).`);
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

    const handleDeleteClick = (activity: Activity) => {
        setItemToDelete(activity);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (itemToDelete) {
            // Log Delete
            logAction(`Deleted ${itemToDelete.type}`, itemToDelete.name, itemToDelete.participatingIpos.join(', '));

             // Log to IPO History
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
                    refreshData();
                }
            } else {
                // Offline fallback
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
    
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
    }

    const SortableHeader: React.FC<{ sortKey: SortKeys; label: string; className?: string; }> = ({ sortKey, label, className }) => {
      const isSorted = sortConfig?.key === sortKey;
      const directionIcon = isSorted ? (sortConfig?.direction === 'ascending' ? '▲' : '▼') : '↕';
      return (
        <th scope="col" className={`px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider ${className}`}>
            <button onClick={() => requestSort(sortKey)} className="flex items-center gap-1.5 group">
              <span>{label}</span>
              <span className={`transition-opacity ${isSorted ? 'opacity-100' : 'opacity-30 group-hover:opacity-100'}`}>{directionIcon}</span>
            </button>
        </th>
      )
    }

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
                 <div className="mb-4 flex flex-col md:flex-row gap-4">
                    <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
                        <input type="text" placeholder="Search activities..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className={`w-full md:w-auto ${commonInputClasses} mt-0`} />
                         {canViewAll && (
                            <div className="flex items-center gap-2">
                               <label htmlFor="ouFilter" className="text-sm font-medium text-gray-700 dark:text-gray-300">OU:</label>
                                <select 
                                    id="ouFilter" 
                                    value={ouFilter} 
                                    onChange={(e) => setOuFilter(e.target.value)} 
                                    disabled={currentUser?.role === 'User'}
                                    className={`${commonInputClasses} mt-0 disabled:opacity-70 disabled:cursor-not-allowed`}
                                >
                                    <option value="All">All OUs</option>
                                    {operatingUnits.map(ou => (
                                        <option key={ou} value={ou}>{ou}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                           <label htmlFor="fundYearFilter" className="text-sm font-medium text-gray-700 dark:text-gray-300">Fund Year:</label>
                            <select id="fundYearFilter" value={fundYearFilter} onChange={(e) => setFundYearFilter(e.target.value)} className={`${commonInputClasses} mt-0`}>
                                <option value="All">All Years</option>
                                {availableFundYears.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                           <label htmlFor="componentFilter" className="text-sm font-medium text-gray-700 dark:text-gray-300">Component:</label>
                            <select id="componentFilter" value={componentFilter} onChange={(e) => setComponentFilter(e.target.value as any)} className={`${commonInputClasses} mt-0`}>
                                <option value="All">All Components</option>{otherActivityComponents.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                         <div className="flex items-center gap-2">
                           <label htmlFor="typeFilter" className="text-sm font-medium text-gray-700 dark:text-gray-300">Type:</label>
                            <select id="typeFilter" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className={`${commonInputClasses} mt-0`} disabled={!!forcedType}>
                                <option value="All">All Types</option>
                                <option value="Training">Trainings Only</option>
                                <option value="Activity">Other Activities Only</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex-grow"></div>
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
                                <button onClick={downloadActivitiesTemplate} className="inline-flex items-center justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">Download Template</button>
                                <label htmlFor="activity-upload" className={`inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 ${isUploading ? 'bg-gray-400 cursor-not-allowed' : 'cursor-pointer'}`}>{isUploading ? 'Uploading...' : 'Upload XLSX'}</label>
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

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th scope="col" className="w-12 px-4 py-3 sticky left-0 bg-gray-50 dark:bg-gray-700 z-10"></th>
                                <SortableHeader sortKey="name" label="Name" />
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 tracking-wider">Status</th>
                                <SortableHeader sortKey="date" label="Date" />
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 tracking-wider">Description</th>
                                <SortableHeader sortKey="budget" label="Budget" />
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 tracking-wider">OU</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 tracking-wider sticky right-0 bg-gray-50 dark:bg-gray-700 z-10">
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
                                        <td className="px-6 py-4 whitespace-nowrap text-xs"><span className={getStatusBadge(activity.status)}>{activity.status}</span></td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                                            {new Date(activity.date).toLocaleDateString()}
                                            {activity.endDate && activity.endDate !== activity.date ? ` - ${new Date(activity.endDate).toLocaleDateString()}` : ''}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300 max-w-xs truncate" title={activity.description}>{activity.description}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(totalActivityBudget)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{activity.operatingUnit}</td>
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
                                            <td colSpan={9} className="p-4">
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
                                                             <p><strong className="text-gray-500 dark:text-gray-400">Funding Year:</strong> {activity.fundingYear ?? 'N/A'}</p>
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
                 {/* Pagination - Reuse existing code */}
                 <div className="py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-700 dark:text-gray-300">Show</span>
                        <select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1 pl-2 pr-8 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm">{[10, 20, 50, 100].map(size => ( <option key={size} value={size}>{size}</option> ))}
                        </select>
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
