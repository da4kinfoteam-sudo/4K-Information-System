
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

// Type for tracking pending changes
type PendingChange = {
    table: string;
    id: number;
    field: string;
    value: string;
    itemRef?: any; // Reference to item for easier logging
};

const DCFManagementTab: React.FC<DCFManagementTabProps> = ({
    subprojects, setSubprojects,
    activities, setActivities,
    officeReqs, setOfficeReqs,
    staffingReqs, setStaffingReqs
}) => {
    const { currentUser } = useAuth();
    const { logAction } = useLogAction();
    
    // Filters
    const [filterYear, setFilterYear] = useState<string>('All');
    const [filterOu, setFilterOu] = useState<string>('All');
    const [filterFundType, setFilterFundType] = useState<string>('All');
    const [filterTier, setFilterTier] = useState<string>('All');

    // UI State
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['Subprojects', 'Activities', 'Staffing', 'Office']));
    const [isSaving, setIsSaving] = useState(false);

    // Pending Changes State: Map key "table-id" to change object
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
        setter: React.Dispatch<React.SetStateAction<any[]>>
    ) => {
        // 1. Optimistic Update
        setter(prev => prev.map(item => item.id === id ? { ...item, [field]: newValue } : item));

        // 2. Track Change
        const key = `${table}-${id}`;
        setPendingChanges(prev => ({
            ...prev,
            [key]: { table, id, field, value: newValue }
        }));
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
        if (!window.confirm(`Apply "${newValue}" status to ${items.length} items locally? (Click Save to finalize)`)) return;

        const idsToUpdate = items.map(i => i.id);
        
        // 1. Optimistic Update
        setter(prev => prev.map(item => idsToUpdate.includes(item.id) ? { ...item, [field]: newValue } : item));

        // 2. Track Changes
        setPendingChanges(prev => {
            const updates = { ...prev };
            idsToUpdate.forEach(id => {
                updates[`${table}-${id}`] = { table, id, field, value: newValue };
            });
            return updates;
        });
    };

    // Handler: Save to Supabase
    const saveChanges = async () => {
        const changes = Object.values(pendingChanges);
        if (changes.length === 0) return;

        if (!window.confirm(`Are you sure you want to save ${changes.length} changes to the database?`)) return;

        setIsSaving(true);
        try {
            if (supabase) {
                // Group updates by table to allow potential batching (though updates are row-specific usually)
                // For now, simpler to loop promises.
                
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

    const hasChanges = Object.keys(pendingChanges).length > 0;

    const RenderGroup = ({ 
        title, 
        items, 
        table, 
        setter,
        displayField,
        statusField = 'status',
        options = STATUS_OPTIONS_STANDARD,
        iconPath
    }: { 
        title: string, 
        items: any[], 
        table: string, 
        setter: React.Dispatch<React.SetStateAction<any[]>>,
        displayField: string,
        statusField?: string,
        options?: string[],
        iconPath: React.ReactNode
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
                    className={`p-4 flex flex-col md:flex-row justify-between items-center gap-4 transition-colors ${
                        isExpanded ? 'bg-emerald-50 dark:bg-emerald-900/10' : 'bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                >
                    <button 
                        onClick={() => toggleGroup(title)}
                        className="flex items-center gap-3 font-bold text-gray-800 dark:text-white text-lg focus:outline-none w-full md:w-auto"
                    >
                         <div className={`p-2 rounded-full ${isExpanded ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-800 dark:text-emerald-200' : 'bg-white dark:bg-gray-600 text-gray-500 dark:text-gray-300'}`}>
                            {iconPath}
                        </div>
                        <span>{title}</span>
                        <span className="bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-xs px-2 py-0.5 rounded-full">{items.length}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    {isExpanded && (
                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">Set All To:</span>
                            <select 
                                onChange={handleBulkDropdown} 
                                disabled={items.length === 0}
                                className="bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded px-3 py-1.5 text-sm focus:ring-emerald-500 focus:border-emerald-500 w-full md:w-48"
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
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Item Description</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Details</th>
                                    <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Current Status</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {items.length === 0 ? (
                                    <tr><td colSpan={3} className="px-6 py-8 text-center text-sm text-gray-500 italic">No records found matching filters.</td></tr>
                                ) : (
                                    items.map(item => {
                                        const isModified = !!pendingChanges[`${table}-${item.id}`];
                                        return (
                                            <tr key={item.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${isModified ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''}`}>
                                                <td className="px-6 py-4 text-sm text-gray-900 dark:text-white font-medium">
                                                    {item[displayField]}
                                                    {isModified && <span className="ml-2 text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-bold">Modified</span>}
                                                </td>
                                                <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400">
                                                    <div className="font-semibold text-emerald-600 dark:text-emerald-400">{item.operatingUnit}</div>
                                                    <div>{item.fundType} {item.fundingYear || item.fundYear} - {item.tier}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                                    <select 
                                                        value={item[statusField]} 
                                                        onChange={(e) => handleStatusChange(table, item.id, e.target.value, statusField, setter)}
                                                        className={`
                                                            border-0 rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset cursor-pointer focus:ring-2 focus:ring-emerald-500
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
            <div className="space-y-6">
                <RenderGroup 
                    title="Subprojects" 
                    items={filteredSubprojects} 
                    table="subprojects" 
                    setter={setSubprojects as any} 
                    displayField="name" 
                    iconPath={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
                />
                <RenderGroup 
                    title="Activities & Trainings" 
                    items={filteredActivities} 
                    table="activities" 
                    setter={setActivities as any} 
                    displayField="name" 
                    iconPath={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>}
                />
                <RenderGroup 
                    title="Staffing Requirements" 
                    items={filteredStaffing} 
                    table="staffing_requirements" 
                    setter={setStaffingReqs as any} 
                    displayField="personnelPosition"
                    statusField="hiringStatus"
                    options={STATUS_OPTIONS_STAFFING}
                    iconPath={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.184-1.268-.5-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.653.184-1.268.5-1.857m0 0a5.002 5.002 0 019 0m-4.5 5.002v-10a4.5 4.5 0 00-9 0v10m9 0a4.5 4.5 0 00-9 0" /></svg>}
                />
                <RenderGroup 
                    title="Office Requirements" 
                    items={filteredOffice} 
                    table="office_requirements" 
                    setter={setOfficeReqs as any} 
                    displayField="equipment" 
                    iconPath={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
                />
            </div>

            {/* Action Bar */}
            <div className={`fixed bottom-0 left-0 right-0 p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg transform transition-transform duration-300 z-50 flex items-center justify-between md:justify-end gap-4 ${hasChanges ? 'translate-y-0' : 'translate-y-full'}`}>
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse"></span>
                    <span className="font-bold text-gray-700 dark:text-gray-200">{Object.keys(pendingChanges).length} unsaved change(s)</span>
                </div>
                <button 
                    onClick={saveChanges} 
                    disabled={isSaving}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-6 rounded-md shadow-md flex items-center gap-2 disabled:opacity-50"
                >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
        </div>
    );
};

export default DCFManagementTab;
