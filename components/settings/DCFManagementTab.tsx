
// Author: 4K
import React, { useState, useMemo } from 'react';
import { 
    Subproject, Activity, OfficeRequirement, StaffingRequirement,
    operatingUnits, fundTypes, tiers
} from '../../constants';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useLogAction } from '../../hooks/useLogAction';

interface DCFManagementTabProps {
    subprojects: Subproject[];
    setSubprojects: React.Dispatch<React.SetStateAction<Subproject[]>>;
    activities: Activity[];
    setActivities: React.Dispatch<React.SetStateAction<Activity[]>>;
    officeReqs: OfficeRequirement[];
    setOfficeReqs: React.Dispatch<React.SetStateAction<OfficeRequirement[]>>;
    staffingReqs: StaffingRequirement[];
    setStaffingReqs: React.Dispatch<React.SetStateAction<StaffingRequirement[]>>;
}

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm text-gray-900 dark:text-white";

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

const DCFManagementTab: React.FC<DCFManagementTabProps> = ({
    subprojects, setSubprojects,
    activities, setActivities,
    officeReqs, setOfficeReqs,
    staffingReqs, setStaffingReqs
}) => {
    const { currentUser } = useAuth();
    const { logAction } = useLogAction();
    
    // Filters - Updated Defaults
    const [filterYear, setFilterYear] = useState<string>(new Date().getFullYear().toString());
    const [filterOu, setFilterOu] = useState<string>('All');
    const [filterFundType, setFilterFundType] = useState<string>('Current');
    const [filterTier, setFilterTier] = useState<string>('Tier 1');

    // UI State
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['Subprojects', 'Activities', 'Staffing', 'Office']));
    const [isSaving, setIsSaving] = useState(false);

    // Pending Changes State
    const [pendingChanges, setPendingChanges] = useState<Record<string, PendingChange>>({});

    // Derived Years
    const availableYears = useMemo(() => {
        const years = new Set<string>();
        const add = (y?: number) => y && years.add(y.toString());
        subprojects.forEach(x => add(x.fundingYear));
        activities.forEach(x => add(x.fundingYear));
        officeReqs.forEach(x => add(x.fundYear));
        staffingReqs.forEach(x => add(x.fundYear));
        return Array.from(years).sort().reverse();
    }, [subprojects, activities, officeReqs, staffingReqs]);

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(group)) next.delete(group); else next.add(group);
            return next;
        });
    };

    // Filter Logic
    const filterItem = (item: any) => {
        const y = item.fundingYear || item.fundYear;
        if (filterYear !== 'All' && y?.toString() !== filterYear) return false;
        if (filterOu !== 'All' && item.operatingUnit !== filterOu) return false;
        if (filterFundType !== 'All' && item.fundType !== filterFundType) return false;
        if (filterTier !== 'All' && item.tier !== filterTier) return false;
        return true;
    };

    const filteredSubprojects = subprojects.filter(filterItem);
    const filteredActivities = activities.filter(filterItem);
    const filteredStaffing = staffingReqs.filter(filterItem);
    const filteredOffice = officeReqs.filter(filterItem);

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
        if (!window.confirm(`Are you sure you want to update ${items.length} items to "${newValue}"?`)) return;

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

        // Optimistic Update
        setter(prev => prev.map(item => idsToUpdate.includes(item.id) ? { ...item, [field]: newValue } : item));
    };

    // Handler: Save to Supabase
    const saveChanges = async () => {
        const changes = Object.values(pendingChanges) as PendingChange[];
        if (changes.length === 0) return;

        if (!window.confirm(`Are you sure you want to save ${changes.length} changes to the database?`)) return;

        setIsSaving(true);
        try {
            if (supabase) {
                const updatePromises = changes.map(change => 
                    supabase
                        .from(change.table)
                        .update({ [change.field]: change.value })
                        .eq('id', change.id)
                );

                await Promise.all(updatePromises);
                
                // Logs
                logAction('DCF Management', `Batch updated ${changes.length} records.`);
            }

            setPendingChanges({});
            alert("Changes saved successfully!");
        } catch (error: any) {
            console.error("Save Error:", error);
            alert("Failed to save changes: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const cancelChanges = () => {
        if (!window.confirm("Undo all unsaved changes?")) return;

        const setters: Record<string, React.Dispatch<React.SetStateAction<any[]>>> = {
            'subprojects': setSubprojects as any,
            'activities': setActivities as any,
            'staffing_requirements': setStaffingReqs as any,
            'office_requirements': setOfficeReqs as any
        };

        const changes = Object.values(pendingChanges) as PendingChange[];
        
        // Group changes by table to minimize setter calls
        const changesByTable: Record<string, PendingChange[]> = {};
        changes.forEach(c => {
            if (!changesByTable[c.table]) changesByTable[c.table] = [];
            changesByTable[c.table].push(c);
        });

        // Revert state
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
        
        const handleBulkDropdown = (e: React.ChangeEvent<HTMLSelectElement>) => {
            const val = e.target.value;
            if (!val) return;
            handleBulkLocalUpdate(table, items, val, statusField, setter);
            e.target.value = ""; 
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
                        <span className="bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-xs px-2 py-0.5 rounded-full">{items.length}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    {isExpanded && (
                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">Set All To:</span>
                            <select 
                                onChange={handleBulkDropdown} 
                                disabled={items.length === 0}
                                className="bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded px-2 py-1 text-sm focus:ring-emerald-500 focus:border-emerald-500 w-full md:w-40"
                                defaultValue=""
                            >
                                <option value="" disabled>Select Status</option>
                                {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </div>
                    )}
                </div>

                {isExpanded && (
                    <div className="overflow-x-auto max-h-[500px]">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-6 py-2 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider w-1/3">Item Description</th>
                                    <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">OU</th>
                                    <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Fund Year</th>
                                    <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Tier</th>
                                    <th className="px-6 py-2 text-right text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Current Status</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {items.length === 0 ? (
                                    <tr><td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500 italic">No records found matching filters.</td></tr>
                                ) : (
                                    items.map(item => {
                                        const isModified = !!pendingChanges[`${table}-${item.id}`];
                                        return (
                                            <tr key={item.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${isModified ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''}`}>
                                                <td className="px-6 py-2 text-sm text-gray-900 dark:text-white font-medium">
                                                    {item[displayField]}
                                                    {isModified && <span className="ml-2 text-[9px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-bold uppercase">Modified</span>}
                                                </td>
                                                <td className="px-4 py-2 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                                                    {item.operatingUnit}
                                                </td>
                                                <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                                                    {item.fundingYear || item.fundYear} ({item.fundType})
                                                </td>
                                                <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                                                    {item.tier}
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
            {/* Filter Bar */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-6 border border-gray-100 dark:border-gray-700">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    Filter DCF Entries
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                     <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Fund Year</label>
                        <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className={commonInputClasses}>
                            <option value="All">All Years</option>
                            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Operating Unit</label>
                        <select value={filterOu} onChange={(e) => setFilterOu(e.target.value)} className={commonInputClasses}>
                            <option value="All">All OUs</option>
                            {operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Tier</label>
                        <select value={filterTier} onChange={(e) => setFilterTier(e.target.value)} className={commonInputClasses}>
                            <option value="All">All Tiers</option>
                            {tiers.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Fund Type</label>
                        <select value={filterFundType} onChange={(e) => setFilterFundType(e.target.value)} className={commonInputClasses}>
                            <option value="All">All Fund Types</option>
                            {fundTypes.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Management Groups */}
            <div className="space-y-4">
                <RenderGroup 
                    title="Subprojects" 
                    items={filteredSubprojects} 
                    table="subprojects" 
                    setter={setSubprojects as any} 
                    displayField="name" 
                />
                <RenderGroup 
                    title="Activities & Trainings" 
                    items={filteredActivities} 
                    table="activities" 
                    setter={setActivities as any} 
                    displayField="name" 
                />
                <RenderGroup 
                    title="Staffing Requirements" 
                    items={filteredStaffing} 
                    table="staffing_requirements" 
                    setter={setStaffingReqs as any} 
                    displayField="personnelPosition"
                    statusField="hiringStatus"
                    options={STATUS_OPTIONS_STAFFING}
                />
                <RenderGroup 
                    title="Office Requirements" 
                    items={filteredOffice} 
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
        </div>
    );
};

export default DCFManagementTab;
