// Author: 4K 
import React, { useState, useMemo, useEffect } from 'react';
import { Subproject, Activity, OfficeRequirement, StaffingRequirement, operatingUnits, tiers, fundTypes } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';
import { getUserPermissions } from '../mainfunctions/TableHooks';
import useLocalStorageState from '../../hooks/useLocalStorageState';

interface Props {
    subprojects: Subproject[];
    setSubprojects: React.Dispatch<React.SetStateAction<Subproject[]>>;
    activities: Activity[];
    setActivities: React.Dispatch<React.SetStateAction<Activity[]>>;
    officeReqs: OfficeRequirement[];
    setOfficeReqs: React.Dispatch<React.SetStateAction<OfficeRequirement[]>>;
    staffingReqs: StaffingRequirement[];
    setStaffingReqs: React.Dispatch<React.SetStateAction<StaffingRequirement[]>>;
    onSelectSubproject: (subproject: Subproject) => void;
    onSelectActivity: (activity: Activity) => void;
    onSelectOfficeReq: (item: OfficeRequirement) => void;
    onSelectStaffingReq: (item: StaffingRequirement) => void;
}

interface PhysicalItem {
    uniqueId: string;
    sourceType: 'Subproject' | 'Activity' | 'Office' | 'Staffing';
    sourceId: number;
    parentId?: string; // For grouping
    detailId?: number; // For subproject details

    // Display
    name: string; // Title, Particular, or Position
    subName?: string; // Additional info
    location?: string;
    
    // Target
    targetDateStart: string;
    targetDateEnd?: string;
    targetQty: number; // Units or Total Pax
    targetMale?: number;
    targetFemale?: number;
    unitOfMeasure: string;

    // Actual (Editable)
    actualDateStart: string;
    actualDateEnd?: string;
    actualQty: number;
    actualMale?: number;
    actualFemale?: number;

    // Meta
    isParent: boolean;
    isLocked: boolean; 
    children?: PhysicalItem[];
}

const commonInputClasses = "mt-1 block w-full px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 text-xs text-gray-900 dark:text-white";
const modalInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm text-gray-900 dark:text-white";

const PhysicalAccomplishment: React.FC<Props> = ({
    subprojects, setSubprojects,
    activities, setActivities,
    officeReqs, setOfficeReqs,
    staffingReqs, setStaffingReqs,
    onSelectSubproject, onSelectActivity,
    onSelectOfficeReq, onSelectStaffingReq
}) => {
    const { currentUser } = useAuth();
    const { canEdit } = getUserPermissions(currentUser);

    // Filters (Persistent)
    const [selectedYear, setSelectedYear] = useLocalStorageState<number | null>('phys_selectedYear', null);
    const [selectedOu, setSelectedOu] = useLocalStorageState<string>('phys_selectedOu', 'All');
    const [selectedTier, setSelectedTier] = useLocalStorageState<string>('phys_selectedTier', 'Tier 1');
    const [selectedFundType, setSelectedFundType] = useLocalStorageState<string>('phys_selectedFundType', 'Current');
    
    // Modal Form State for Filters
    const [formYear, setFormYear] = useState<string>(selectedYear ? selectedYear.toString() : new Date().getFullYear().toString());
    const [formOu, setFormOu] = useState<string>(selectedOu);
    const [formTier, setFormTier] = useState<string>(selectedTier);
    const [formFundType, setFormFundType] = useState<string>(selectedFundType);
    const [isYearModalOpen, setIsYearModalOpen] = useState(!selectedYear);

    // Local Data State
    const [items, setItems] = useState<PhysicalItem[]>([]);
    
    // Expansion State
    const [expandedGroups, setExpandedGroups] = useLocalStorageState<string[]>('phys_expandedGroups', ['Subprojects', 'Activities', 'Program Management']);
    const [expandedParents, setExpandedParents] = useLocalStorageState<string[]>('phys_expandedParents', []);

    // Init OU Lock
    useEffect(() => {
        if (currentUser && currentUser.role === 'User') {
            setFormOu(currentUser.operatingUnit);
            setSelectedOu(currentUser.operatingUnit);
        }
    }, [currentUser]);

    // --- 1. Load Data ---
    useEffect(() => {
        if (!selectedYear) return;

        const loadedItems: PhysicalItem[] = [];
        const matchesFilters = (item: any) => {
            const y = item.fundingYear || item.fundYear;
            if (y !== selectedYear) return false;
            if (selectedOu !== 'All' && item.operatingUnit !== selectedOu) return false;
            if (selectedTier !== 'All' && item.tier !== selectedTier) return false;
            if (selectedFundType !== 'All' && item.fundType !== selectedFundType) return false;
            return true;
        };

        // A. Subprojects (Parent + Children)
        subprojects.filter(matchesFilters).forEach(sp => {
            const parentId = `sp-${sp.id}`;
            const children: PhysicalItem[] = sp.details.map(d => ({
                uniqueId: `${parentId}-d-${d.id}`,
                sourceType: 'Subproject',
                sourceId: sp.id,
                parentId: parentId,
                detailId: d.id,
                name: d.particulars,
                targetDateStart: d.deliveryDate,
                targetQty: d.numberOfUnits,
                unitOfMeasure: d.unitOfMeasure,
                actualDateStart: d.actualDeliveryDate || '',
                actualQty: d.actualNumberOfUnits || 0,
                isParent: false,
                isLocked: false // Individual items editable
            }));

            loadedItems.push({
                uniqueId: parentId,
                sourceType: 'Subproject',
                sourceId: sp.id,
                name: sp.name,
                location: sp.location,
                targetDateStart: sp.estimatedCompletionDate,
                targetQty: 0,
                unitOfMeasure: 'Project',
                actualDateStart: sp.actualCompletionDate || '',
                actualQty: 0,
                isParent: true,
                isLocked: false,
                children: children
            });
        });

        // B. Activities (Flat)
        activities.filter(matchesFilters).forEach(act => {
            loadedItems.push({
                uniqueId: `act-${act.id}`,
                sourceType: 'Activity',
                sourceId: act.id,
                name: act.name,
                subName: act.type,
                targetDateStart: act.date,
                targetDateEnd: act.endDate !== act.date ? act.endDate : undefined,
                targetQty: (act.participantsMale || 0) + (act.participantsFemale || 0),
                targetMale: act.participantsMale,
                targetFemale: act.participantsFemale,
                unitOfMeasure: 'Pax',
                actualDateStart: act.actualDate || '',
                actualQty: (act.actualParticipantsMale || 0) + (act.actualParticipantsFemale || 0),
                actualMale: act.actualParticipantsMale || 0,
                actualFemale: act.actualParticipantsFemale || 0,
                isParent: false,
                isLocked: !!act.actualDate
            });
        });

        // C. Staffing (Grouped by Position)
        const staffingGroups: { [key: string]: StaffingRequirement[] } = {};
        staffingReqs.filter(matchesFilters).forEach(s => {
            if (!staffingGroups[s.personnelPosition]) staffingGroups[s.personnelPosition] = [];
            staffingGroups[s.personnelPosition].push(s);
        });

        Object.entries(staffingGroups).forEach(([position, groupItems], idx) => {
            const parentId = `staff-group-${idx}`;
            const children: PhysicalItem[] = groupItems.map(s => ({
                uniqueId: `staff-${s.id}`,
                sourceType: 'Staffing',
                sourceId: s.id,
                parentId: parentId,
                name: `${s.personnelPosition} (${s.operatingUnit})`,
                targetDateStart: s.obligationDate,
                targetQty: 1,
                unitOfMeasure: 'Head',
                actualDateStart: s.actualObligationDate || '', // Date Hired
                actualQty: s.actualObligationDate ? 1 : 0,
                isParent: false,
                isLocked: false
            }));

            loadedItems.push({
                uniqueId: parentId,
                sourceType: 'Staffing',
                sourceId: 0, // Virtual ID
                name: position,
                targetDateStart: '',
                targetQty: groupItems.length,
                unitOfMeasure: 'Heads',
                actualDateStart: '',
                actualQty: children.filter(c => c.actualDateStart).length,
                isParent: true,
                isLocked: true, 
                children: children
            });
        });

        // D. Office Requirements (Flat)
        officeReqs.filter(matchesFilters).forEach(off => {
            loadedItems.push({
                uniqueId: `office-${off.id}`,
                sourceType: 'Office',
                sourceId: off.id,
                name: off.equipment,
                targetDateStart: off.obligationDate,
                targetQty: off.numberOfUnits,
                unitOfMeasure: 'Units',
                actualDateStart: off.actualObligationDate || '', // Use obligation date as delivery proxy
                actualQty: off.actualObligationDate ? off.numberOfUnits : 0, 
                isParent: false,
                isLocked: false
            });
        });

        setItems(loadedItems);
    }, [selectedYear, selectedOu, selectedTier, selectedFundType, subprojects, activities, staffingReqs, officeReqs]);

    // --- 2. Grouping for Display ---
    const groupedDisplay = useMemo(() => {
        return {
            'Subprojects': items.filter(i => i.sourceType === 'Subproject'),
            'Activities': items.filter(i => i.sourceType === 'Activity'),
            'Program Management': [
                ...items.filter(i => i.sourceType === 'Staffing'),
                ...items.filter(i => i.sourceType === 'Office')
            ]
        };
    }, [items]);

    // --- 3. Handlers ---

    const handleLoadData = () => {
        const y = parseInt(formYear);
        if (!isNaN(y) && y > 2000 && y < 2100) {
            setSelectedYear(y);
            setSelectedOu(formOu);
            setSelectedTier(formTier);
            setSelectedFundType(formFundType);
            setIsYearModalOpen(false);
        } else {
            alert("Please enter a valid year.");
        }
    };

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev => prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]);
    };

    const toggleParent = (id: string) => {
        setExpandedParents(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
    };

    const handleTitleClick = (item: PhysicalItem) => {
        if (item.sourceType === 'Subproject') {
            const s = subprojects.find(x => x.id === item.sourceId);
            if (s) onSelectSubproject(s);
        } else if (item.sourceType === 'Activity') {
            const a = activities.find(x => x.id === item.sourceId);
            if (a) onSelectActivity(a);
        } else if (item.sourceType === 'Office') {
            const o = officeReqs.find(x => x.id === item.sourceId);
            if (o) onSelectOfficeReq(o);
        } else if (item.sourceType === 'Staffing' && !item.isParent) {
            const s = staffingReqs.find(x => x.id === item.sourceId);
            if (s) onSelectStaffingReq(s);
        }
    };

    // Update Local State
    const updateLocalItem = (uniqueId: string, updates: Partial<PhysicalItem>) => {
        setItems(prev => {
            const newItems = [...prev];
            
            // Recursive updater to handle children in local state
            const updateNode = (nodes: PhysicalItem[]): boolean => {
                for (let i = 0; i < nodes.length; i++) {
                    if (nodes[i].uniqueId === uniqueId) {
                        nodes[i] = { ...nodes[i], ...updates };
                        
                        // Special Logic: Subproject Parent Date Cascade
                        if (nodes[i].sourceType === 'Subproject' && nodes[i].isParent && updates.actualDateStart !== undefined && nodes[i].children) {
                            nodes[i].children = nodes[i].children?.map(child => ({
                                ...child,
                                actualDateStart: updates.actualDateStart!
                            }));
                        }
                        return true;
                    }
                    if (nodes[i].children) {
                        if (updateNode(nodes[i].children!)) return true;
                    }
                }
                return false;
            };
            
            updateNode(newItems);
            return newItems;
        });
    };

    // Save Logic
    const handleSaveItem = async (item: PhysicalItem) => {
        if (!canEdit) return;

        try {
            if (item.sourceType === 'Subproject') {
                if (item.isParent) {
                    // Save parent status/date AND children cascading
                    const sp = subprojects.find(s => s.id === item.sourceId);
                    if (!sp) throw new Error("Subproject not found");

                    const newStatus = item.actualDateStart ? 'Completed' : 'Ongoing';
                    
                    // Update all details if children modified in local state (they are nested in item.children)
                    const updatedDetails = sp.details.map(d => {
                        const childState = item.children?.find(c => c.detailId === d.id);
                        if (childState) {
                            return {
                                ...d,
                                actualDeliveryDate: childState.actualDateStart,
                                actualNumberOfUnits: childState.actualQty
                            };
                        }
                        return d;
                    });

                    if (supabase) {
                        await supabase.from('subprojects').update({
                            actualCompletionDate: item.actualDateStart || null,
                            status: newStatus,
                            details: updatedDetails
                        }).eq('id', sp.id);
                    }

                    // Update Context
                    setSubprojects(prev => prev.map(s => s.id === sp.id ? { ...s, actualCompletionDate: item.actualDateStart, status: newStatus, details: updatedDetails } : s));

                } else {
                    // Save Individual Child Row
                    const parentItem = items.find(p => p.uniqueId === item.parentId);
                    if (!parentItem) throw new Error("Parent not found");
                    const sp = subprojects.find(s => s.id === parentItem.sourceId);
                    if (!sp) throw new Error("Subproject not found");

                    const updatedDetails = sp.details.map(d => {
                        if (d.id === item.detailId) {
                            return { ...d, actualDeliveryDate: item.actualDateStart, actualNumberOfUnits: item.actualQty };
                        }
                        return d;
                    });

                    if (supabase) {
                        await supabase.from('subprojects').update({ details: updatedDetails }).eq('id', sp.id);
                    }
                    setSubprojects(prev => prev.map(s => s.id === sp.id ? { ...s, details: updatedDetails } : s));
                }

            } else if (item.sourceType === 'Activity') {
                const act = activities.find(a => a.id === item.sourceId);
                if (!act) throw new Error("Activity not found");

                const newStatus: Activity['status'] = item.actualDateStart ? 'Completed' : 'Ongoing';
                const payload = {
                    actualDate: item.actualDateStart,
                    actualParticipantsMale: item.actualMale,
                    actualParticipantsFemale: item.actualFemale,
                    status: newStatus
                };

                if (supabase) {
                    await supabase.from('activities').update(payload).eq('id', act.id);
                }
                setActivities(prev => prev.map(a => a.id === act.id ? { ...a, ...payload } : a));

            } else if (item.sourceType === 'Staffing') {
                 // Update Date Hired
                 const payload = { actualObligationDate: item.actualDateStart };
                 if (supabase) {
                    await supabase.from('staffing_requirements').update(payload).eq('id', item.sourceId);
                 }
                 setStaffingReqs(prev => prev.map(s => s.id === item.sourceId ? { ...s, ...payload } : s));

            } else if (item.sourceType === 'Office') {
                // Update Actual Date
                const payload = { actualObligationDate: item.actualDateStart }; 
                if (supabase) {
                    await supabase.from('office_requirements').update(payload).eq('id', item.sourceId);
                }
                setOfficeReqs(prev => prev.map(o => o.id === item.sourceId ? { ...o, ...payload } : o));
            }

            updateLocalItem(item.uniqueId, { isLocked: true });

        } catch (error: any) {
            console.error("Save error:", error);
            alert("Failed to save: " + error.message);
        }
    };

    // --- Render Helpers ---
    const renderDateInput = (value: string, onChange: (val: string) => void, disabled: boolean) => (
        <input 
            type="date" 
            value={value} 
            onChange={(e) => onChange(e.target.value)} 
            disabled={disabled}
            className={`${commonInputClasses} disabled:bg-gray-100 disabled:dark:bg-gray-600 disabled:cursor-not-allowed`}
        />
    );

    const renderNumberInput = (value: number, onChange: (val: number) => void, disabled: boolean) => (
        <input 
            type="number" 
            value={value || ''} 
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)} 
            disabled={disabled}
            className={`${commonInputClasses} text-right disabled:bg-gray-100 disabled:dark:bg-gray-600 disabled:cursor-not-allowed`}
        />
    );

    const getCompletionRate = (actual: number, target: number) => {
        if (!target) return 0;
        return Math.min(100, Math.round((actual / target) * 100));
    };

    return (
        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg min-h-screen">
             {/* Filter Modal */}
             {isYearModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fadeIn">
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-2xl max-w-md w-full relative">
                        {/* Close Button for navigating away without loading */}
                        <button 
                            onClick={() => setIsYearModalOpen(false)}
                            className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>

                        <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-6 border-b pb-2 dark:border-gray-700">Filter Physical Data</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fund Year</label>
                                <input type="number" value={formYear} onChange={(e) => setFormYear(e.target.value)} className={modalInputClasses} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Operating Unit</label>
                                <select value={formOu} onChange={(e) => setFormOu(e.target.value)} disabled={currentUser?.role === 'User'} className={`${modalInputClasses} disabled:opacity-70 disabled:cursor-not-allowed`}>
                                    <option value="All">All OUs</option>
                                    {operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tier</label>
                                <select value={formTier} onChange={(e) => setFormTier(e.target.value)} className={modalInputClasses}>
                                    <option value="All">All Tiers</option>
                                    {tiers.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fund Type</label>
                                <select value={formFundType} onChange={(e) => setFormFundType(e.target.value)} className={modalInputClasses}>
                                    <option value="All">All Fund Types</option>
                                    {fundTypes.map(f => <option key={f} value={f}>{f}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="mt-8 flex justify-end">
                            <button onClick={handleLoadData} className="w-full bg-emerald-600 text-white py-2 rounded-md font-semibold hover:bg-emerald-700">Load Data</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Physical Accomplishment Collection Form</h2>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex gap-2">
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">Year: {selectedYear || 'None'}</span>
                        <span>|</span>
                        <span>OU: {selectedOu}</span>
                        <span>|</span>
                        <span>Tier: {selectedTier}</span>
                        <span>|</span>
                        <span>Fund: {selectedFundType}</span>
                    </div>
                </div>
                <button onClick={() => setIsYearModalOpen(true)} className="text-sm text-gray-500 hover:text-emerald-600 underline">Change Filter</button>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-emerald-50 dark:bg-emerald-900/20">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase w-1/3">Particulars / Activity</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Target Date</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Target Units</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase bg-emerald-100/50 dark:bg-emerald-800/30 border-l border-emerald-200">Actual Date</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase bg-emerald-100/50 dark:bg-emerald-800/30">Actual Units</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">% Comp</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                        {/* Group Render Logic */}
                        {['Subprojects', 'Activities', 'Program Management'].map(groupKey => {
                            // @ts-ignore
                            const groupItems: PhysicalItem[] = groupedDisplay[groupKey] || [];
                            if (groupItems.length === 0) return null;
                            const isGroupExpanded = expandedGroups.includes(groupKey);

                            return (
                                <React.Fragment key={groupKey}>
                                    {/* Level 1 Group Header */}
                                    <tr className="bg-emerald-200/50 dark:bg-gray-700 border-y border-emerald-300 dark:border-gray-600">
                                        <td colSpan={7} className="px-4 py-2">
                                            <button onClick={() => toggleGroup(groupKey)} className="flex items-center gap-2 font-bold text-emerald-900 dark:text-white w-full text-left focus:outline-none">
                                                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${isGroupExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                {groupKey}
                                            </button>
                                        </td>
                                    </tr>
                                    
                                    {isGroupExpanded && groupItems.map(item => {
                                        const isParentExpanded = item.isParent && expandedParents.includes(item.uniqueId);
                                        // Specific render logic based on type
                                        
                                        const completionRate = getCompletionRate(item.actualQty, item.targetQty);
                                        const isLocked = !canEdit || (item.isLocked && currentUser?.role !== 'Administrator');

                                        return (
                                            <React.Fragment key={item.uniqueId}>
                                                {/* Parent / Main Item Row */}
                                                <tr className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${item.isParent ? 'bg-emerald-50/30 dark:bg-emerald-900/10' : ''}`}>
                                                    <td className="px-4 py-3 pl-8">
                                                        <div className="flex items-center gap-2">
                                                            {item.isParent && (
                                                                <button onClick={() => toggleParent(item.uniqueId)} className="text-gray-500 focus:outline-none">
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 transition-transform ${isParentExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                                </button>
                                                            )}
                                                            <div>
                                                                <button onClick={() => handleTitleClick(item)} className="text-left font-medium text-gray-800 dark:text-white hover:text-emerald-600 hover:underline">
                                                                    {item.name}
                                                                </button>
                                                                {item.subName && <div className="text-xs text-gray-500">{item.subName}</div>}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    
                                                    {/* Target Date */}
                                                    <td className="px-4 py-3 text-center text-xs text-gray-600 dark:text-gray-400">
                                                        {item.targetDateStart || '-'} 
                                                        {item.targetDateEnd ? ` to ${item.targetDateEnd}` : ''}
                                                    </td>

                                                    {/* Target Units */}
                                                    <td className="px-4 py-3 text-center text-xs text-gray-600 dark:text-gray-400">
                                                        {item.sourceType === 'Activity' ? (
                                                            <div className="flex flex-col">
                                                                <span>{item.targetQty} Pax</span>
                                                                <span className="text-[10px] text-gray-400">M:{item.targetMale} F:{item.targetFemale}</span>
                                                            </div>
                                                        ) : (
                                                             item.isParent && item.sourceType === 'Subproject' ? '-' : `${item.targetQty} ${item.unitOfMeasure}`
                                                        )}
                                                    </td>

                                                    {/* Actual Date */}
                                                    <td className="px-4 py-3 bg-emerald-50/20 dark:bg-emerald-900/10 border-l border-emerald-100 dark:border-emerald-800">
                                                        {/* For Staffing Groups, no date on parent */}
                                                        {!(item.sourceType === 'Staffing' && item.isParent) && (
                                                            <div className="space-y-1">
                                                                {renderDateInput(item.actualDateStart, (val) => updateLocalItem(item.uniqueId, { actualDateStart: val }), isLocked)}
                                                                {item.sourceType === 'Activity' && item.targetDateEnd && (
                                                                     renderDateInput(item.actualDateEnd || item.actualDateStart, (val) => updateLocalItem(item.uniqueId, { actualDateEnd: val }), isLocked)
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>

                                                    {/* Actual Units */}
                                                    <td className="px-4 py-3 bg-emerald-50/20 dark:bg-emerald-900/10 text-center">
                                                        {item.sourceType === 'Activity' ? (
                                                            <div className="flex gap-1">
                                                                <input type="number" placeholder="M" value={item.actualMale || ''} onChange={(e) => updateLocalItem(item.uniqueId, { actualMale: parseFloat(e.target.value) || 0, actualQty: (parseFloat(e.target.value) || 0) + (item.actualFemale || 0) })} disabled={isLocked} className={`${commonInputClasses} w-12`} />
                                                                <input type="number" placeholder="F" value={item.actualFemale || ''} onChange={(e) => updateLocalItem(item.uniqueId, { actualFemale: parseFloat(e.target.value) || 0, actualQty: (item.actualMale || 0) + (parseFloat(e.target.value) || 0) })} disabled={isLocked} className={`${commonInputClasses} w-12`} />
                                                            </div>
                                                        ) : (
                                                            item.isParent && item.sourceType === 'Subproject' ? '-' 
                                                            : (item.sourceType === 'Staffing' && item.isParent ? <span className="text-xs font-bold">{item.actualQty} / {item.targetQty}</span>
                                                                : renderNumberInput(item.actualQty, (val) => updateLocalItem(item.uniqueId, { actualQty: val }), isLocked))
                                                        )}
                                                    </td>
                                                    
                                                    {/* % Comp */}
                                                    <td className="px-4 py-3 text-center text-xs font-bold text-emerald-600">
                                                        {/* Hide for SP Parents and Staffing Parents */}
                                                        {item.isParent ? '-' : `${completionRate}%`}
                                                    </td>

                                                    {/* Action */}
                                                    <td className="px-4 py-3 text-right">
                                                        {canEdit && !item.isParent && (
                                                            <button onClick={() => handleSaveItem(item)} className="px-2 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700">Save</button>
                                                        )}
                                                        {/* Allow saving Subproject Parent Date */}
                                                        {canEdit && item.sourceType === 'Subproject' && item.isParent && (
                                                             <button onClick={() => handleSaveItem(item)} className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">Set Date</button>
                                                        )}
                                                    </td>
                                                </tr>

                                                {/* Child Rows (Subproject Details or Individual Staff) */}
                                                {item.isParent && isParentExpanded && item.children?.map(child => {
                                                     const childRate = getCompletionRate(child.actualQty, child.targetQty);
                                                     const childLocked = !canEdit || (child.isLocked && currentUser?.role !== 'Administrator');
                                                     
                                                     return (
                                                        <tr key={child.uniqueId} className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-800">
                                                            <td className="px-4 py-2 pl-16 text-xs text-gray-600 dark:text-gray-300 flex items-center">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 mr-2"></span>
                                                                {child.name}
                                                            </td>
                                                            <td className="px-4 py-2 text-center text-xs text-gray-500">{child.targetDateStart}</td>
                                                            <td className="px-4 py-2 text-center text-xs text-gray-500">{child.targetQty} {child.unitOfMeasure}</td>
                                                            
                                                            <td className="px-4 py-2 border-l border-gray-100 dark:border-gray-700">
                                                                 {renderDateInput(child.actualDateStart, (val) => updateLocalItem(child.uniqueId, { actualDateStart: val }), childLocked)}
                                                            </td>
                                                            <td className="px-4 py-2">
                                                                {/* Staffing Children are Binary (Hired or Not, essentially count 1) */}
                                                                {child.sourceType === 'Staffing' 
                                                                    ? (child.actualDateStart ? <span className="text-xs text-green-600 font-bold block text-center">Hired</span> : <span className="text-xs text-gray-400 block text-center">Vacant</span>)
                                                                    : renderNumberInput(child.actualQty, (val) => updateLocalItem(child.uniqueId, { actualQty: val }), childLocked)
                                                                }
                                                            </td>
                                                            <td className="px-4 py-2 text-center text-xs text-emerald-600 font-medium">{childRate}%</td>
                                                            <td className="px-4 py-2 text-right">
                                                                {canEdit && (
                                                                     <button onClick={() => handleSaveItem(child)} className="text-xs text-emerald-600 hover:underline">Save Item</button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                     )
                                                })}
                                            </React.Fragment>
                                        );
                                    })}
                                </React.Fragment>
                            );
                        })}
                        {items.length === 0 && <tr><td colSpan={7} className="text-center py-6 text-gray-500">No data available for the selected filters.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default PhysicalAccomplishment;