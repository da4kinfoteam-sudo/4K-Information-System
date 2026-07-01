// Author: 4K
import React, { useState, useMemo } from 'react';
import { 
    Subproject, Activity, OfficeRequirement, StaffingRequirement
} from '../../constants';
import { supabase } from '../../supabaseClient';
import { useLogAction } from '../../hooks/useLogAction';

interface PhysicalStatusManagementProps {
    subprojects: Subproject[];
    setSubprojects: React.Dispatch<React.SetStateAction<Subproject[]>>;
    activities: Activity[];
    setActivities: React.Dispatch<React.SetStateAction<Activity[]>>;
    officeReqs: OfficeRequirement[];
    setOfficeReqs: React.Dispatch<React.SetStateAction<OfficeRequirement[]>>;
    staffingReqs: StaffingRequirement[];
    setStaffingReqs: React.Dispatch<React.SetStateAction<StaffingRequirement[]>>;
    onSelectSubproject: (project: Subproject) => void;
    onSelectActivity: (activity: Activity) => void;
}

const STATUS_OPTIONS_STANDARD = ['Proposed', 'Ongoing', 'Completed', 'Cancelled'];
const STATUS_OPTIONS_STAFFING = ['Proposed', 'Filled', 'Unfilled'];

// Type for tracking pending changes including original value for rollback
type PendingChange = {
    table: string;
    id: number;
    field: string;
    value: string;
    originalValue: string;
};

type ColumnFilters = {
    search: string;
    status: string;
    ou: string;
    year: string;
    tier: string;
    fundType: string;
};

type ConfirmModalState = {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    type: 'info' | 'warning' | 'danger' | 'success';
    onConfirm?: () => void | Promise<void>;
};

const DEFAULT_COLUMN_FILTERS: ColumnFilters = {
    search: '',
    status: 'All',
    ou: 'All',
    year: new Date().getFullYear().toString(),
    tier: 'Tier 1',
    fundType: 'Current',
};

const PhysicalStatusManagement: React.FC<PhysicalStatusManagementProps> = ({
    subprojects, setSubprojects,
    activities, setActivities,
    officeReqs, setOfficeReqs,
    staffingReqs, setStaffingReqs,
    onSelectSubproject,
    onSelectActivity
}) => {
    const { logAction } = useLogAction();

    // UI State
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['Subprojects', 'Activities & Trainings', 'Staffing Requirements', 'Office Requirements']));
    const [isSaving, setIsSaving] = useState(false);
    const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
    const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilters>>({});
    const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
        isOpen: false,
        title: '',
        message: '',
        confirmLabel: 'Confirm',
        type: 'info',
    });

    // Pending Changes State
    const [pendingChanges, setPendingChanges] = useState<Record<string, PendingChange>>({});

    // Derived Years
    const availableYears = useMemo(() => {
        const years = new Set<string>();
        const add = (y?: number) => y && years.add(y.toString());
        (subprojects || []).forEach(x => add(x.fundingYear));
        (activities || []).forEach(x => add(x.fundingYear));
        (officeReqs || []).forEach(x => add(x.fundYear));
        (staffingReqs || []).forEach(x => add(x.fundYear));
        return Array.from(years).sort().reverse();
    }, [subprojects, activities, officeReqs, staffingReqs]);

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(group)) next.delete(group); else next.add(group);
            return next;
        });
    };

    const openConfirmModal = (config: Omit<ConfirmModalState, 'isOpen'>) => {
        setConfirmModal({ ...config, isOpen: true });
    };

    const closeConfirmModal = () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
    };

    const updateColumnFilter = (table: string, key: keyof ColumnFilters, value: string) => {
        setColumnFilters(prev => ({
            ...prev,
            [table]: {
                ...(prev[table] || DEFAULT_COLUMN_FILTERS),
                [key]: value,
            },
        }));
    };

    const resetColumnFilters = (table: string) => {
        setColumnFilters(prev => ({
            ...prev,
            [table]: DEFAULT_COLUMN_FILTERS,
        }));
    };

    // Handler: Update Local State & Track Pending Change
    const handleStatusChange = (
        table: string, 
        id: number, 
        newValue: string, 
        field: string,
        setter: React.Dispatch<React.SetStateAction<any[]>>,
        items: any[]
    ) => {
        const currentItem = items.find(i => i.id === id);
        if (!currentItem) return;

        const key = `${table}-${id}`;

        // Store original value if not already stored
        setPendingChanges(prev => {
            const existing = prev[key];
            const originalValue = existing ? existing.originalValue : currentItem[field];
            return {
                ...prev,
                [key]: { table, id, field, value: newValue, originalValue }
            };
        });

        // Optimistic Update
        setter(prev => prev.map(item => item.id === id ? { ...item, [field]: newValue } : item));
    };

    // Handler: Bulk Update (Local)
    const handleBulkLocalUpdate = (
        table: string,
        items: any[],
        newValue: string,
        field: string,
        setter: React.Dispatch<React.SetStateAction<any[]>>
    ) => {
        if (!items.length) return;
        openConfirmModal({
            title: 'Apply Status Update',
            message: `Update ${items.length} currently visible item(s) to "${newValue}"? Column filters are respected, so hidden rows will not be changed.`,
            confirmLabel: 'Apply Update',
            type: 'warning',
            onConfirm: () => {
                const idsToUpdate = items.map(i => i.id);

                setPendingChanges(prev => {
                    const updates = { ...prev };
                    items.forEach(item => {
                        const key = `${table}-${item.id}`;
                        const existing = updates[key];
                        const originalValue = existing ? existing.originalValue : item[field];
                        updates[key] = { table, id: item.id, field, value: newValue, originalValue };
                    });
                    return updates;
                });

                setter(prev => prev.map(item => idsToUpdate.includes(item.id) ? { ...item, [field]: newValue } : item));
                setNotice({ type: 'info', message: `${items.length} visible item(s) staged for update. Click Save Changes to write them to the database.` });
                closeConfirmModal();
            },
        });
    };

    const persistChanges = async (changes: PendingChange[]) => {
        setIsSaving(true);
        try {
            if (supabase) {
                const results = await Promise.all(changes.map(change =>
                    supabase
                        .from(change.table)
                        .update({ [change.field]: change.value })
                        .eq('id', change.id)
                ));

                const failed = results.find(result => result.error);
                if (failed?.error) {
                    throw failed.error;
                }
                
                logAction('DCF Management', `Batch updated ${changes.length} physical status record(s).`);
            } else {
                throw new Error('Supabase client is not available.');
            }

            setPendingChanges({});
            setNotice({ type: 'success', message: `${changes.length} change(s) saved successfully.` });
        } catch (error: any) {
            console.error("Save Error:", error);
            setNotice({ type: 'error', message: `Failed to save changes: ${error.message || 'Unknown error'}` });
        } finally {
            setIsSaving(false);
            closeConfirmModal();
        }
    };

    const revertPendingChanges = () => {
        const setters: Record<string, React.Dispatch<React.SetStateAction<any[]>>> = {
            'subprojects': setSubprojects as any,
            'activities': setActivities as any,
            'staffing_requirements': setStaffingReqs as any,
            'office_requirements': setOfficeReqs as any
        };

        const changes = Object.values(pendingChanges) as PendingChange[];
        
        const changesByTable: Record<string, PendingChange[]> = {};
        changes.forEach(c => {
            if (!changesByTable[c.table]) changesByTable[c.table] = [];
            changesByTable[c.table].push(c);
        });

        Object.entries(changesByTable).forEach(([table, list]) => {
            const setter = setters[table];
            if (setter) {
                setter(prev => prev.map(item => {
                    const change = list.find(c => c.id === item.id);
                    if (change) {
                        return { ...item, [change.field]: change.originalValue };
                    }
                    return item;
                }));
            }
        });

        setPendingChanges({});
        setNotice({ type: 'info', message: 'Unsaved changes were discarded.' });
        closeConfirmModal();
    };

    // Handler: Save to Supabase
    const saveChanges = async () => {
        const changes = Object.values(pendingChanges) as PendingChange[];
        if (changes.length === 0) return;

        openConfirmModal({
            title: 'Save Physical Status Changes',
            message: `Save ${changes.length} staged change(s) to the database? This will only save rows you edited or bulk-updated.`,
            confirmLabel: 'Save Changes',
            type: 'success',
            onConfirm: () => persistChanges(changes),
        });
    };

    const cancelChanges = () => {
        if (!Object.keys(pendingChanges).length) return;

        openConfirmModal({
            title: 'Discard Unsaved Changes',
            message: 'Discard all unsaved physical status changes and restore the previous values?',
            confirmLabel: 'Discard Changes',
            type: 'danger',
            onConfirm: revertPendingChanges,
        });
    };

    const hasChanges = Object.keys(pendingChanges).length > 0;

    const RenderGroup = ({ 
        title, 
        items, 
        table, 
        setter,
        displayField,
        statusField = 'status',
        options = STATUS_OPTIONS_STANDARD
    }: { 
        title: string, 
        items: any[], 
        table: string, 
        setter: React.Dispatch<React.SetStateAction<any[]>>,
        displayField: string,
        statusField?: string,
        options?: string[]
    }) => {
        const isExpanded = expandedGroups.has(title);
        const filters = columnFilters[table] || DEFAULT_COLUMN_FILTERS;
        const getYear = (item: any) => (item.fundingYear || item.fundYear || '').toString();
        const getText = (item: any, field: string) => (item[field] || '').toString();
        const visibleItems = items.filter(item => {
            const searchValue = filters.search.trim().toLowerCase();
            if (searchValue) {
                const haystack = [
                    getText(item, displayField),
                    getText(item, 'operatingUnit'),
                    getText(item, statusField),
                    getText(item, 'fundType'),
                    getText(item, 'tier'),
                    getYear(item),
                ].join(' ').toLowerCase();
                if (!haystack.includes(searchValue)) return false;
            }
            if (filters.status !== 'All' && item[statusField] !== filters.status) return false;
            if (filters.ou !== 'All' && item.operatingUnit !== filters.ou) return false;
            if (filters.year !== 'All' && getYear(item) !== filters.year) return false;
            if (filters.tier !== 'All' && item.tier !== filters.tier) return false;
            if (filters.fundType !== 'All' && item.fundType !== filters.fundType) return false;
            return true;
        });

        const uniqueOptions = (field: 'operatingUnit' | 'tier' | 'fundType' | 'year') => {
            const values = items.map(item => field === 'year' ? getYear(item) : getText(item, field)).filter(Boolean);
            return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        };
        
        const handleBulkDropdown = (e: React.ChangeEvent<HTMLSelectElement>) => {
            const val = e.target.value;
            e.target.value = ""; 
            if (!val) return;
            handleBulkLocalUpdate(table, visibleItems, val, statusField, setter);
        };

        return (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div 
                    className={`p-3 flex flex-col md:flex-row justify-between items-center gap-4 transition-colors ${
                        isExpanded ? 'bg-emerald-50 dark:bg-emerald-900/10' : 'bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                >
                    <button 
                        onClick={() => toggleGroup(title)}
                        className="flex items-center gap-2 font-bold text-gray-800 dark:text-white text-lg focus:outline-none w-full md:w-auto"
                    >
                        <span>{title}</span>
                        <span className="bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-xs px-2 py-0.5 rounded-full">{visibleItems.length} / {items.length}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    {isExpanded && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full md:w-auto">
                            <button
                                type="button"
                                onClick={() => resetColumnFilters(table)}
                                className="px-3 py-1.5 text-xs font-semibold rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                                Reset Column Filters
                            </button>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">Set Items to</span>
                                <select
                                    onChange={handleBulkDropdown}
                                    disabled={visibleItems.length === 0}
                                    className="bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded px-2 py-1 text-sm focus:ring-emerald-500 focus:border-emerald-500 w-full md:w-40"
                                    defaultValue=""
                                >
                                    <option value="" disabled>Select Status</option>
                                    {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            </div>
                        </div>
                    )}
                </div>

                {isExpanded && (
                    <div className="overflow-x-auto max-h-[500px]">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-6 py-2 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[18rem]">Item Description</th>
                                    <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[9rem]">OU</th>
                                    <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[7rem]">Fund Year</th>
                                    <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[8rem]">Fund Type</th>
                                    <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[7rem]">Tier</th>
                                    <th className="px-6 py-2 text-right text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[10rem]">Current Status</th>
                                </tr>
                                <tr className="bg-white dark:bg-gray-900">
                                    <th className="px-3 py-2">
                                        <input
                                            type="search"
                                            value={filters.search}
                                            onChange={event => updateColumnFilter(table, 'search', event.target.value)}
                                            placeholder="Search items..."
                                            className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-white"
                                        />
                                    </th>
                                    <th className="px-3 py-2">
                                        <select value={filters.ou} onChange={event => updateColumnFilter(table, 'ou', event.target.value)} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-white">
                                            <option value="All">All OUs</option>
                                            {uniqueOptions('operatingUnit').map(value => <option key={value} value={value}>{value}</option>)}
                                        </select>
                                    </th>
                                    <th className="px-3 py-2">
                                        <select value={filters.year} onChange={event => updateColumnFilter(table, 'year', event.target.value)} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-white">
                                            <option value="All">All Years</option>
                                            {uniqueOptions('year').map(value => <option key={value} value={value}>{value}</option>)}
                                        </select>
                                    </th>
                                    <th className="px-3 py-2">
                                        <select value={filters.fundType} onChange={event => updateColumnFilter(table, 'fundType', event.target.value)} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-white">
                                            <option value="All">All Fund Types</option>
                                            {uniqueOptions('fundType').map(value => <option key={value} value={value}>{value}</option>)}
                                        </select>
                                    </th>
                                    <th className="px-3 py-2">
                                        <select value={filters.tier} onChange={event => updateColumnFilter(table, 'tier', event.target.value)} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-white">
                                            <option value="All">All Tiers</option>
                                            {uniqueOptions('tier').map(value => <option key={value} value={value}>{value}</option>)}
                                        </select>
                                    </th>
                                    <th className="px-3 py-2">
                                        <select value={filters.status} onChange={event => updateColumnFilter(table, 'status', event.target.value)} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-white">
                                            <option value="All">All Statuses</option>
                                            {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {visibleItems.length === 0 ? (
                                    <tr><td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500 italic">No records found matching filters.</td></tr>
                                ) : (
                                    visibleItems.map(item => {
                                        const isModified = !!pendingChanges[`${table}-${item.id}`];
                                        const canClick = (table === 'subprojects' || table === 'activities');
                                        return (
                                            <tr key={item.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${isModified ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''}`}>
                                                <td className="px-6 py-2 text-sm text-gray-900 dark:text-white font-medium">
                                                    {canClick ? (
                                                        <button 
                                                            onClick={() => {
                                                                if (table === 'subprojects') onSelectSubproject(item);
                                                                if (table === 'activities') onSelectActivity(item);
                                                            }}
                                                            className="hover:text-emerald-600 hover:underline text-left"
                                                        >
                                                            {item[displayField]}
                                                        </button>
                                                    ) : (
                                                        <span>{item[displayField]}</span>
                                                    )}
                                                    {isModified && <span className="ml-2 text-[9px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-bold uppercase">Modified</span>}
                                                </td>
                                                <td className="px-4 py-2 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                                                    {item.operatingUnit}
                                                </td>
                                                <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                                                    {getYear(item)}
                                                </td>
                                                <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                                                    {item.fundType || '-'}
                                                </td>
                                                <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                                                    {item.tier || '-'}
                                                </td>
                                                <td className="px-6 py-2 whitespace-nowrap text-right text-sm">
                                                    <select 
                                                        value={item[statusField]} 
                                                        onChange={(e) => handleStatusChange(table, item.id, e.target.value, statusField, setter, items)}
                                                        className={`
                                                            border-0 rounded-full px-3 py-0.5 text-xs font-bold ring-1 ring-inset cursor-pointer focus:ring-2 focus:ring-emerald-500
                                                            ${item[statusField] === 'Completed' || item[statusField] === 'Filled' ? 'bg-green-50 text-green-700 ring-green-600/20' : 
                                                            item[statusField] === 'Ongoing' ? 'bg-blue-50 text-blue-700 ring-blue-600/20' :
                                                            item[statusField] === 'Cancelled' || item[statusField] === 'Unfilled' ? 'bg-red-50 text-red-700 ring-red-600/20' :
                                                            'bg-yellow-50 text-yellow-800 ring-yellow-600/20'}
                                                        `}
                                                    >
                                                        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                    </select>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="animate-fadeIn pb-20">
            {notice && (
                <div className={`mb-4 rounded-lg border px-4 py-3 text-sm font-medium ${
                    notice.type === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200'
                        : notice.type === 'error'
                            ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200'
                            : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200'
                }`}>
                    {notice.message}
                </div>
            )}
            {/* Management Groups */}
            <div className="space-y-4">
                <RenderGroup 
                    title="Subprojects" 
                    items={subprojects}
                    table="subprojects" 
                    setter={setSubprojects as any} 
                    displayField="name" 
                />
                <RenderGroup 
                    title="Activities & Trainings" 
                    items={activities}
                    table="activities" 
                    setter={setActivities as any} 
                    displayField="name" 
                />
                <RenderGroup 
                    title="Staffing Requirements" 
                    items={staffingReqs}
                    table="staffing_requirements" 
                    setter={setStaffingReqs as any} 
                    displayField="personnelPosition"
                    statusField="hiringStatus"
                    options={STATUS_OPTIONS_STAFFING}
                />
                <RenderGroup 
                    title="Office Requirements" 
                    items={officeReqs}
                    table="office_requirements" 
                    setter={setOfficeReqs as any} 
                    displayField="equipment" 
                />
            </div>

            {/* Action Bar */}
            <div className={`fixed bottom-0 left-0 right-0 p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] transform transition-transform duration-300 z-50 flex items-center justify-between md:justify-end gap-4 ${hasChanges ? 'translate-y-0' : 'translate-y-full'}`}>
                <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse"></span>
                    <span className="font-bold text-gray-700 dark:text-gray-200 text-sm">{Object.keys(pendingChanges).length} unsaved change(s)</span>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={cancelChanges} 
                        disabled={isSaving}
                        className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white font-semibold rounded-md text-sm transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={saveChanges} 
                        disabled={isSaving}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-6 rounded-md shadow-md flex items-center gap-2 disabled:opacity-50 text-sm transition-colors"
                    >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>

            {confirmModal.isOpen && (
                <div className="dashboard-modal-backdrop">
                    <div className="dashboard-modal dashboard-modal--compact" role="dialog" aria-modal="true" aria-labelledby="physical-status-confirm-title">
                        <div className="dashboard-modal__header">
                            <div>
                                <h3 id="physical-status-confirm-title">{confirmModal.title}</h3>
                                <p>Physical Status Management</p>
                            </div>
                            <button
                                type="button"
                                className="dashboard-modal__close"
                                onClick={closeConfirmModal}
                                disabled={isSaving}
                                aria-label="Close confirmation"
                            >
                                x
                            </button>
                        </div>
                        <div className="dashboard-modal__body">
                            <p className="text-sm text-gray-600 dark:text-gray-300">{confirmModal.message}</p>
                        </div>
                        <div className="dashboard-modal__actions">
                            <button
                                type="button"
                                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white font-semibold rounded-md text-sm transition-colors"
                                onClick={closeConfirmModal}
                                disabled={isSaving}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className={`font-semibold py-2 px-5 rounded-md shadow-md text-sm transition-colors disabled:opacity-50 ${
                                    confirmModal.type === 'danger'
                                        ? 'bg-red-600 hover:bg-red-700 text-white'
                                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                }`}
                                onClick={() => confirmModal.onConfirm?.()}
                                disabled={isSaving}
                            >
                                {isSaving ? 'Saving...' : confirmModal.confirmLabel}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PhysicalStatusManagement;
