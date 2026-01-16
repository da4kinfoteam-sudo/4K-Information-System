
// Author: 4K 
import React, { useState, FormEvent, useMemo, useEffect } from 'react';
import { Activity, IPO, philippineRegions, ActivityComponentType, otherActivityComponents, otherActivityOptions, ActivityExpense, objectTypes, ObjectType, fundTypes, FundType, tiers, Tier, operatingUnits } from '../constants';
import LocationPicker, { parseLocation } from './LocationPicker';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import { useLogAction } from '../hooks/useLogAction';
import { usePagination, useSelection, getUserPermissions } from './mainfunctions/TableHooks';
import { downloadActivitiesReport, downloadActivitiesTemplate, handleActivitiesUpload } from './mainfunctions/ImportExportService';

// Declare XLSX to inform TypeScript about the global variable from the script tag
declare const XLSX: any;

interface ActivitiesProps {
    ipos: IPO[];
    activities: Activity[];
    setActivities: React.Dispatch<React.SetStateAction<Activity[]>>;
    onSelectIpo: (ipo: IPO) => void;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    forcedType?: 'Training' | 'Activity';
}

const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const defaultFormData: Activity = {
    id: 0,
    uid: '',
    type: 'Activity', // Default type
    name: '',
    date: '',
    description: '',
    location: '',
    facilitator: '',
    participatingIpos: [] as string[],
    participantsMale: 0,
    participantsFemale: 0,
    component: 'Social Preparation' as ActivityComponentType,
    expenses: [] as ActivityExpense[],
    fundingYear: new Date().getFullYear(),
    fundType: fundTypes[0] as FundType,
    tier: tiers[0] as Tier,
    operatingUnit: '',
    encodedBy: '',
    catchUpPlanRemarks: '',
    newTargetDate: '',
    actualDate: '',
    actualParticipantsMale: 0,
    actualParticipantsFemale: 0
};

export const ActivitiesComponent: React.FC<ActivitiesProps> = ({ ipos, activities, setActivities, onSelectIpo, uacsCodes, forcedType }) => {
    const { currentUser } = useAuth();
    const { logAction } = useLogAction();
    const [formData, setFormData] = useState<Activity>(defaultFormData);
    const [editingItem, setEditingItem] = useState<Activity | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<Activity | null>(null);
    const [ipoRegionFilter, setIpoRegionFilter] = useState('All');
    const [activeTab, setActiveTab] = useState<'details' | 'budget' | 'accomplishments'>('details');
    const [isUploading, setIsUploading] = useState(false);
    const [selectedActivityType, setSelectedActivityType] = useState('');

    // Shared Hooks
    const { canEdit, canViewAll } = getUserPermissions(currentUser);
    const { 
        isSelectionMode, setIsSelectionMode, selectedIds, setSelectedIds, 
        isMultiDeleteModalOpen, setIsMultiDeleteModalOpen, toggleSelectionMode, 
        handleSelectAll, handleSelectRow, resetSelection 
    } = useSelection<Activity>();

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [ouFilter, setOuFilter] = useState('All');
    const [componentFilter, setComponentFilter] = useState<ActivityComponentType | 'All'>('All');
    const [typeFilter, setTypeFilter] = useState<'All' | 'Training' | 'Activity'>(forcedType || 'All');

    // Sorting
    type SortKeys = keyof Activity | 'totalParticipants' | 'budget';
    const [sortConfig, setSortConfig] = useState<{ key: SortKeys; direction: 'ascending' | 'descending' } | null>({ key: 'date', direction: 'descending' });
    
    const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
    const [view, setView] = useState<'list' | 'add' | 'edit'>('list');

    // Determine if current form state represents a Training based on selected Activity Type
    const isTrainingForm = useMemo(() => {
        return selectedActivityType.endsWith(' Training');
    }, [selectedActivityType]);

    const [currentExpense, setCurrentExpense] = useState({
        objectType: 'MOOE' as ObjectType,
        expenseParticular: '',
        uacsCode: '',
        obligationMonth: '',
        disbursementMonth: '',
        amount: ''
    });

    // Helper to refresh data from Supabase
    const refreshData = async () => {
        if (!supabase) return;
        const { data, error } = await supabase.from('activities').select('*').order('id', { ascending: false });
        if (!error && data) {
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

    // Initialize form data when editing or creating
    useEffect(() => {
        if (editingItem) {
            setFormData({
                ...defaultFormData,
                ...editingItem,
                participantsMale: Number(editingItem.participantsMale) || 0,
                participantsFemale: Number(editingItem.participantsFemale) || 0,
                fundingYear: editingItem.fundingYear ?? new Date().getFullYear(),
                fundType: editingItem.fundType ?? fundTypes[0],
                tier: editingItem.tier ?? tiers[0],
                facilitator: editingItem.type === 'Training' ? editingItem.facilitator : '',
                catchUpPlanRemarks: editingItem.catchUpPlanRemarks || '',
                newTargetDate: editingItem.newTargetDate || '',
                actualDate: editingItem.actualDate || '',
                actualParticipantsMale: editingItem.actualParticipantsMale || 0,
                actualParticipantsFemale: editingItem.actualParticipantsFemale || 0,
            });
            
            // Set Activity Type
            if (editingItem.type === 'Training') {
                setSelectedActivityType(`${editingItem.component} Training`);
            } else {
                setSelectedActivityType(editingItem.name);
            }

             setActiveTab('details');
        } else {
            setFormData({
                ...defaultFormData,
                type: forcedType || 'Activity',
                operatingUnit: currentUser?.operatingUnit || '',
                encodedBy: currentUser?.fullName || ''
            });
            setSelectedActivityType('');
        }
    }, [editingItem, currentUser, forcedType]);

    // When component changes in form, reset types unless editing
    useEffect(() => {
        if (view !== 'edit') {
            setFormData(prev => ({...prev, name: ''}));
            setSelectedActivityType('');
        }
    }, [formData.component, view]);

    const filteredIposForSelection = useMemo(() => {
        const filtered = ipoRegionFilter === 'All' ? ipos : ipos.filter(ipo => ipo.region === ipoRegionFilter);
        return filtered.sort((a,b) => a.name.localeCompare(b.name));
    }, [ipoRegionFilter, ipos]);

    const activityOptions = useMemo(() => {
        const base = otherActivityOptions[formData.component] || [];
        const trainingOption = `${formData.component} Training`;
        // Ensure unique
        if (base.includes(trainingOption)) return base;
        return [...base, trainingOption];
    }, [formData.component]);

    // Process list data
    const processedActivities = useMemo(() => {
        let filtered = [...activities];

        // OU Filtering
        if (!canViewAll && currentUser) {
            filtered = filtered.filter(a => a.operatingUnit === currentUser.operatingUnit);
        } else if (canViewAll && ouFilter !== 'All') {
            filtered = filtered.filter(a => a.operatingUnit === ouFilter);
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
    }, [activities, searchTerm, componentFilter, typeFilter, sortConfig, ouFilter, ipos, currentUser, canViewAll]);

    // Use Shared Pagination Hook
    const { 
        currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData: paginatedActivities 
    } = usePagination(processedActivities, [searchTerm, componentFilter, typeFilter, ouFilter, sortConfig]);

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

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const target = e.currentTarget as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        const { name, value } = target;
        const isNumberInput = 'type' in target && target.type === 'number';

        setFormData(prev => ({ 
            ...prev, 
            [name]: isNumberInput ? (value === '' ? '' : parseFloat(value)) : value 
        }));
    };

    const handleActivityTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        setSelectedActivityType(value);
        
        let newType: 'Training' | 'Activity' = 'Activity';
        let newName = '';

        if (value.endsWith(' Training')) {
            newType = 'Training';
            // If switching to training type
            if (editingItem && editingItem.type === 'Training' && value === `${editingItem.component} Training`) {
                // If editing and same type, restore original name
                newName = editingItem.name;
            } 
        } else {
            newType = 'Activity';
            // Not a training, name IS the type
            newName = value;
        }
        
        setFormData(prev => ({ ...prev, type: newType, name: newName }));
    };
    
    const handleIpoSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedOptions = Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value);
        setFormData(prev => ({ ...prev, participatingIpos: selectedOptions }));
    };

    const handleExpenseChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'objectType') {
            setCurrentExpense(prev => ({ ...prev, objectType: value as ObjectType, expenseParticular: '', uacsCode: '' }));
        } else if (name === 'expenseParticular') {
            setCurrentExpense(prev => ({ ...prev, expenseParticular: value, uacsCode: '' }));
        } else {
            setCurrentExpense(prev => ({...prev, [name]: value}));
        }
    };
    
    const handleAddExpense = () => {
        if (!currentExpense.amount || !currentExpense.obligationMonth || !currentExpense.disbursementMonth || !currentExpense.uacsCode) {
            alert('Please fill out all expense fields, including UACS classification.');
            return;
        }
        const newExpense: ActivityExpense = {
            id: Date.now(),
            objectType: currentExpense.objectType,
            expenseParticular: currentExpense.expenseParticular,
            uacsCode: currentExpense.uacsCode,
            obligationMonth: currentExpense.obligationMonth,
            disbursementMonth: currentExpense.disbursementMonth,
            amount: parseFloat(currentExpense.amount)
        };
        setFormData(prev => ({...prev, expenses: [...prev.expenses, newExpense]}));
        setCurrentExpense({
            objectType: 'MOOE',
            expenseParticular: '',
            uacsCode: '',
            obligationMonth: '',
            disbursementMonth: '',
            amount: ''
        });
    };

    const handleRemoveExpense = (id: number) => {
        setFormData(prev => ({ ...prev, expenses: prev.expenses.filter(exp => exp.id !== id) }));
    };

    const handleExpenseAccomplishmentChange = (id: number, field: keyof ActivityExpense, value: any) => {
        setFormData(prev => ({
            ...prev,
            expenses: prev.expenses.map(e => e.id === id ? { ...e, [field]: value } : e)
        }));
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.date || !formData.location) {
            alert('Please fill out all required fields.');
            return;
        }

        // New Item logic
        let newId = activities.length > 0 ? Math.max(...activities.map(a => a.id), 0) + 1 : 1;
        const currentYear = new Date().getFullYear();
        let uid = formData.uid;
        if (!uid) {
            const prefix = isTrainingForm ? 'TRN' : 'ACT';
            const sequence = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
            uid = `${prefix}-${currentYear}-${sequence}`;
        }

        const submissionData = {
            ...formData,
            uid: uid || formData.uid,
            updated_at: new Date().toISOString()
        };

        const participatingIposList = formData.participatingIpos.join(', ');

        if (supabase) {
            try {
                if (editingItem) {
                    // Log Update
                    logAction(`Updated ${formData.type}`, formData.name, participatingIposList);

                    const { error } = await supabase.from('activities').update(submissionData).eq('id', editingItem.id);
                    if (error) throw error;
                } else {
                    // Log Create
                    logAction(`Created ${formData.type}`, formData.name, participatingIposList);

                    // Remove ID for insert to let DB auto-generate
                    const { id, ...insertData } = submissionData;
                    const { error } = await supabase.from('activities').insert([insertData]);
                    if (error) throw error;
                }
                refreshData();
            } catch (error: any) {
                console.error("Error saving activity:", error);
                alert("Failed to save activity. " + error.message);
                return;
            }
        } else {
            // Offline fallback
            if (editingItem) {
                const updatedActivity: Activity = {
                    ...formData,
                    id: editingItem.id
                };
                setActivities(prev => prev.map(a => a.id === editingItem.id ? updatedActivity : a));
            } else {
                const newActivity: Activity = {
                    ...formData,
                    uid,
                    id: newId,
                    created_at: new Date().toISOString(),
                };
                setActivities(prev => [newActivity, ...prev]);
            }
        }
        
        handleCancelEdit();
    };

    const handleEditClick = (activity: Activity) => {
        setEditingItem(activity);
        setView('edit');
    };
    
    const handleAddNewClick = () => {
        setEditingItem(null);
        setView('add');
    };

    const handleCancelEdit = () => {
        setEditingItem(null);
        setFormData(defaultFormData);
        setSelectedActivityType('');
        setActiveTab('details');
        setView('list');
    };

    const handleDeleteClick = (activity: Activity) => {
        setItemToDelete(activity);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (itemToDelete) {
            // Log Delete
            logAction(`Deleted ${itemToDelete.type}`, itemToDelete.name, itemToDelete.participatingIpos.join(', '));

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

    const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm";

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

    // Re-declare totalBudget inside component for use in renderFormView
    const totalBudget = useMemo(() => {
        return formData.expenses.reduce((sum, exp) => sum + exp.amount, 0);
    }, [formData.expenses]);
    
    const TabButton: React.FC<{ tabName: typeof activeTab; label: string; }> = ({ tabName, label }) => {
        const isActive = activeTab === tabName;
        return (
            <button
                type="button"
                onClick={() => setActiveTab(tabName)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-200
                    ${isActive
                        ? 'border-accent text-accent dark:text-green-400 dark:border-green-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
            >
                {label}
            </button>
        );
    }

    const renderListView = () => (
        <>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Activities Management</h2>
                {canEdit && (
                    <button onClick={handleAddNewClick} className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent">
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
                            <button onClick={() => setIsMultiDeleteModalOpen(true)} className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700">
                                Delete Selected ({selectedIds.length})
                            </button>
                        )}
                        <button onClick={() => downloadActivitiesReport(processedActivities)} className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">Download Report</button>
                        {canEdit && (
                            <>
                                <button onClick={downloadActivitiesTemplate} className="inline-flex items-center justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">Download Template</button>
                                <label htmlFor="activity-upload" className={`inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 ${isUploading ? 'bg-gray-400 cursor-not-allowed' : 'cursor-pointer'}`}>{isUploading ? 'Uploading...' : 'Upload XLSX'}</label>
                                <input id="activity-upload" type="file" className="hidden" onChange={(e) => handleActivitiesUpload(e, activities, setActivities, ipos, logAction, setIsUploading, uacsCodes, currentUser)} accept=".xlsx, .xls" disabled={isUploading} />
                                <button
                                    onClick={toggleSelectionMode}
                                    className={`inline-flex items-center justify-center p-2 border border-gray-300 dark:border-gray-600 shadow-sm rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 ${isSelectionMode ? 'bg-gray-200 dark:bg-gray-600 text-red-600' : 'bg-white dark:bg-gray-700 text-gray-500'}`}
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
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 tracking-wider">Type</th>
                                <SortableHeader sortKey="date" label="Date" />
                                <SortableHeader sortKey="component" label="Component" />
                                <SortableHeader sortKey="totalParticipants" label="Participants" />
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
                                                className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
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
                                    <tr onClick={() => handleToggleRow(activity.id)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="px-4 py-4 text-gray-400 sticky left-0 bg-white dark:bg-gray-800 z-10"><svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-200 ${expandedRowId === activity.id ? 'transform rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></td>
                                        <td className="px-6 py-4 whitespace-normal text-sm font-medium text-gray-900 dark:text-white">
                                            {activity.name}
                                            {activity.uid && <div className="text-xs text-gray-400 font-normal">{activity.uid}</div>}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-xs"><span className={`px-2 py-1 rounded-full font-semibold ${activity.type === 'Training' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>{activity.type}</span></td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatDate(activity.date)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{activity.component}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{totalParticipants > 0 ? totalParticipants : '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatCurrency(totalActivityBudget)}</td>
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
                                                            className="mr-3 h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                                                        />
                                                    )}
                                                    <button onClick={(e) => { e.stopPropagation(); handleEditClick(activity); }} className="text-accent hover:brightness-90 dark:text-green-400 dark:hover:text-green-300 mr-4">Edit</button>
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
                                                            <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Description</h4>
                                                            <p className="text-sm text-gray-600 dark:text-gray-300">{activity.description || 'No description provided.'}</p>
                                                            {activity.type === 'Training' && activity.facilitator && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Facilitator: {activity.facilitator}</p>}
                                                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Encoded by: {activity.encodedBy}</p>
                                                        </div>
                                                        {activity.participatingIpos.length > 0 && (
                                                            <div>
                                                                <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Participating IPOs</h4>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {activity.participatingIpos.map(ipoName => {
                                                                        const ipo = ipos.find(i => i.name === ipoName);
                                                                        return (
                                                                            <button key={ipoName} onClick={(e) => { e.stopPropagation(); if (ipo) onSelectIpo(ipo); }} className="bg-gray-200 dark:bg-gray-700 rounded-full px-3 py-1 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed" disabled={!ipo} title={ipo ? `View details for ${ipoName}` : `${ipoName} (details not found)`}>
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
                                                                    <li key={exp.id} className="flex justify-between items-center p-1"><span>{exp.expenseParticular} ({exp.uacsCode})</span><span className="font-medium">{formatCurrency(exp.amount)}</span></li>
                                                                ))}
                                                                <li className="flex justify-between items-center p-1 border-t border-gray-300 dark:border-gray-600 mt-1 pt-1 font-bold"><span>Total</span><span>{formatCurrency(totalActivityBudget)}</span></li>
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
                 <div className="py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-700 dark:text-gray-300">Show</span>
                        <select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1 pl-2 pr-8 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm">
                            {[10, 20, 50, 100].map(size => ( <option key={size} value={size}>{size}</option> ))}
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
        </>
    );

    const renderFormView = () => (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-semibold text-gray-800 dark:text-white">{view === 'edit' ? 'Edit Activity' : 'Add New Activity'}</h3>
                 <button onClick={handleCancelEdit} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Back to List</button>
            </div>
            <form onSubmit={handleSubmit}>
                <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                    <nav className="-mb-px flex space-x-4 overflow-x-auto" aria-label="Tabs">
                        <TabButton tabName="details" label="Details" />
                        <TabButton tabName="budget" label="Expenses" />
                        {view === 'edit' && <TabButton tabName="accomplishments" label="Accomplishments" />}
                    </nav>
                </div>
                
                {activeTab === 'details' && (
                    <div className="space-y-6">
                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Activity Information</legend>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium">Component</label>
                                    <select name="component" value={formData.component} onChange={handleInputChange} className={commonInputClasses}>
                                        {otherActivityComponents.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">Activity Type</label>
                                    <select value={selectedActivityType} onChange={handleActivityTypeChange} className={commonInputClasses}>
                                        <option value="">Select Type</option>
                                        {activityOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                </div>
                                {isTrainingForm && (
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium">Training Name</label>
                                        <input type="text" name="name" value={formData.name} onChange={handleInputChange} className={commonInputClasses} placeholder="Specific Training Title" />
                                    </div>
                                )}
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium">Description</label>
                                    <textarea name="description" value={formData.description} onChange={handleInputChange} rows={2} className={commonInputClasses} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">Date</label>
                                    <input type="date" name="date" value={formData.date} onChange={handleInputChange} className={commonInputClasses} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">Location</label>
                                    <LocationPicker value={formData.location} onChange={(val) => setFormData(prev => ({...prev, location: val}))} />
                                </div>
                                {isTrainingForm && (
                                    <div>
                                        <label className="block text-sm font-medium">Facilitator</label>
                                        <input type="text" name="facilitator" value={formData.facilitator} onChange={handleInputChange} className={commonInputClasses} />
                                    </div>
                                )}
                            </div>
                        </fieldset>

                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Participants & IPOs</legend>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                <div>
                                    <label className="block text-sm font-medium">Male Participants</label>
                                    <input type="number" name="participantsMale" value={formData.participantsMale} onChange={handleInputChange} min="0" className={commonInputClasses} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">Female Participants</label>
                                    <input type="number" name="participantsFemale" value={formData.participantsFemale} onChange={handleInputChange} min="0" className={commonInputClasses} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">Total</label>
                                    <input type="number" value={(formData.participantsMale || 0) + (formData.participantsFemale || 0)} readOnly className={`${commonInputClasses} bg-gray-100 dark:bg-gray-600 cursor-not-allowed`} />
                                </div>
                            </div>
                            
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="block text-sm font-medium">Participating IPOs</label>
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs">Filter by Region:</label>
                                        <select value={ipoRegionFilter} onChange={e => setIpoRegionFilter(e.target.value)} className="text-xs border rounded p-1 dark:bg-gray-700 dark:border-gray-600">
                                            <option value="All">All</option>
                                            {philippineRegions.map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <select multiple name="participatingIpos" value={formData.participatingIpos} onChange={handleIpoSelectChange} className={`${commonInputClasses} h-40`}>
                                    {filteredIposForSelection.map(ipo => (
                                        <option key={ipo.id} value={ipo.name}>{ipo.name}</option>
                                    ))}
                                </select>
                                <p className="text-xs text-gray-500 mt-1">Hold Ctrl (Windows) or Cmd (Mac) to select multiple.</p>
                            </div>
                        </fieldset>

                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Funding</legend>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div><label className="block text-sm font-medium">Year</label><input type="number" name="fundingYear" value={formData.fundingYear} onChange={handleInputChange} className={commonInputClasses} /></div>
                                <div>
                                    <label className="block text-sm font-medium">Type</label>
                                    <select name="fundType" value={formData.fundType} onChange={handleInputChange} className={commonInputClasses}>
                                        {fundTypes.map(f => <option key={f} value={f}>{f}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">Tier</label>
                                    <select name="tier" value={formData.tier} onChange={handleInputChange} className={commonInputClasses}>
                                        {tiers.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                            </div>
                        </fieldset>
                    </div>
                )}

                {activeTab === 'budget' && (
                    <div className="space-y-6">
                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Budget Items</legend>
                            <div className="space-y-2 mb-4">
                                {formData.expenses.map((exp) => (
                                    <div key={exp.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 p-2 rounded-md text-sm">
                                        <div>
                                            <span className="font-semibold">{exp.expenseParticular}</span>
                                            <div className="text-xs text-gray-500">{exp.uacsCode} | Obl: {exp.obligationMonth}</div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="font-bold">{formatCurrency(exp.amount)}</span>
                                            <button type="button" onClick={() => handleRemoveExpense(exp.id)} className="text-red-500 hover:text-red-700">&times;</button>
                                        </div>
                                    </div>
                                ))}
                                <div className="text-right font-bold pt-2">Total: {formatCurrency(totalBudget)}</div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 items-end border-t pt-4 mt-4 border-gray-200 dark:border-gray-700">
                                <div><label className="block text-xs font-medium">Object Type</label><select name="objectType" value={currentExpense.objectType} onChange={handleExpenseChange} className={commonInputClasses + " py-1.5"}>{objectTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                <div><label className="block text-xs font-medium">Expense Class</label><select name="expenseParticular" value={currentExpense.expenseParticular} onChange={handleExpenseChange} className={commonInputClasses + " py-1.5"}><option value="">Select Particular</option>{Object.keys(uacsCodes[currentExpense.objectType]).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                                <div><label className="block text-xs font-medium">UACS Code</label><select name="uacsCode" value={currentExpense.uacsCode} onChange={handleExpenseChange} disabled={!currentExpense.expenseParticular} className={commonInputClasses + " py-1.5"}><option value="">Select UACS</option>{currentExpense.expenseParticular && Object.entries(uacsCodes[currentExpense.objectType][currentExpense.expenseParticular]).map(([c, d]) => <option key={c} value={c}>{c} - {d}</option>)}</select></div>
                                
                                <div><label className="block text-xs font-medium">Obligation Month</label><input type="date" name="obligationMonth" value={currentExpense.obligationMonth} onChange={handleExpenseChange} className={commonInputClasses + " py-1.5 text-sm"} /></div>
                                <div><label className="block text-xs font-medium">Disbursement Month</label><input type="date" name="disbursementMonth" value={currentExpense.disbursementMonth} onChange={handleExpenseChange} className={commonInputClasses + " py-1.5 text-sm"} /></div>
                                
                                <div className="flex gap-2 items-end">
                                    <div className="flex-grow">
                                        <label className="block text-xs font-medium">Amount</label>
                                        <input type="number" name="amount" value={currentExpense.amount} onChange={handleExpenseChange} min="0" step="0.01" className={commonInputClasses + " py-1.5"} />
                                    </div>
                                    <button type="button" onClick={handleAddExpense} className="h-9 w-9 flex-shrink-0 inline-flex items-center justify-center rounded-full bg-green-100 text-accent hover:bg-green-200">+</button>
                                </div>
                            </div>
                        </fieldset>
                    </div>
                )}

                {activeTab === 'accomplishments' && view === 'edit' && (
                    <div className="space-y-6">
                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Actual Accomplishment</legend>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium">Actual Date Conducted</label>
                                    <input type="date" name="actualDate" value={formData.actualDate || ''} onChange={handleInputChange} className={commonInputClasses} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">Actual Male Participants</label>
                                    <input type="number" name="actualParticipantsMale" value={formData.actualParticipantsMale || 0} onChange={handleInputChange} className={commonInputClasses} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">Actual Female Participants</label>
                                    <input type="number" name="actualParticipantsFemale" value={formData.actualParticipantsFemale || 0} onChange={handleInputChange} className={commonInputClasses} />
                                </div>
                            </div>
                        </fieldset>

                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Budget Utilization</legend>
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium">Particulars</th>
                                            <th className="px-3 py-2 text-left font-medium">Actual Obligation</th>
                                            <th className="px-3 py-2 text-left font-medium">Actual Disbursement</th>
                                            <th className="px-3 py-2 text-left font-medium">Actual Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                        {formData.expenses.map((expense) => (
                                            <tr key={expense.id}>
                                                <td className="px-3 py-2 text-sm text-gray-800 dark:text-gray-200">{expense.expenseParticular}</td>
                                                <td className="px-3 py-2">
                                                    <input type="date" value={expense.actualObligationDate || ''} onChange={(e) => handleExpenseAccomplishmentChange(expense.id, 'actualObligationDate', e.target.value)} className="w-full text-xs px-2 py-1 rounded border dark:bg-gray-600 dark:border-gray-500" />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <input type="date" value={expense.actualDisbursementDate || ''} onChange={(e) => handleExpenseAccomplishmentChange(expense.id, 'actualDisbursementDate', e.target.value)} className="w-full text-xs px-2 py-1 rounded border dark:bg-gray-600 dark:border-gray-500" />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <input type="number" value={expense.actualAmount || ''} onChange={(e) => handleExpenseAccomplishmentChange(expense.id, 'actualAmount', parseFloat(e.target.value))} className="w-full text-xs px-2 py-1 rounded border dark:bg-gray-600 dark:border-gray-500" placeholder="0.00" />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </fieldset>

                        {/* Catch Up Plan */}
                        {new Date() > new Date(formData.date) && !formData.actualDate && (
                            <fieldset className="border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10 p-4 rounded-md">
                                <legend className="px-2 font-semibold text-red-600 dark:text-red-400">Catch Up Plan</legend>
                                <p className="text-xs text-red-500 mb-2">Activity is delayed. Please provide a catch-up plan.</p>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Remarks / Justification</label>
                                        <textarea name="catchUpPlanRemarks" value={formData.catchUpPlanRemarks || ''} onChange={handleInputChange} rows={3} className={commonInputClasses} placeholder="Describe actions taken or justification for delay..." />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">New Target Date</label>
                                        <input type="date" name="newTargetDate" value={formData.newTargetDate || ''} onChange={handleInputChange} className={commonInputClasses} />
                                    </div>
                                </div>
                            </fieldset>
                        )}
                    </div>
                )}

                <div className="flex justify-end gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button type="button" onClick={handleCancelEdit} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600">Cancel</button>
                    <button type="submit" className="px-4 py-2 rounded-md text-sm font-medium text-white bg-accent hover:brightness-95">Save Activity</button>
                </div>
            </form>
        </div>
    );

    return (
        <div>
            {isDeleteModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl">
                        <h3 className="text-lg font-bold">Confirm Deletion</h3>
                        <p className="my-4">Are you sure you want to delete "{itemToDelete?.name}"? This action cannot be undone.</p>
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

            {view === 'list' ? renderListView() : renderFormView()}
        </div>
    );
};
