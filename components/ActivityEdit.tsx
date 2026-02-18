
// Author: 4K 
import React, { useState, FormEvent, useEffect, useMemo } from 'react';
import { Activity, ActivityExpense, IPO, objectTypes, ObjectType, fundTypes, FundType, tiers, Tier, otherActivityComponents, ReferenceActivity } from '../constants';
import LocationPicker from './LocationPicker';
import { useAuth } from '../contexts/AuthContext';
import { useLogAction } from '../hooks/useLogAction';
import { useIpoHistory } from '../hooks/useIpoHistory';
import { supabase } from '../supabaseClient';

interface ActivityEditProps {
    mode: 'create' | 'details' | 'expenses' | 'accomplishment';
    activity?: Activity;
    ipos: IPO[];
    onBack: () => void;
    onUpdateActivity: (updatedActivity: Activity) => void;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    referenceActivities?: ReferenceActivity[];
    forcedType?: 'Training' | 'Activity';
}

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm disabled:bg-gray-100 disabled:dark:bg-gray-800 disabled:cursor-not-allowed disabled:text-gray-500";

const defaultFormData: Activity = {
    id: 0,
    uid: '',
    type: 'Activity', 
    name: '',
    date: '',
    endDate: '',
    description: '',
    location: '',
    facilitator: '',
    participatingIpos: [],
    participantsMale: 0,
    participantsFemale: 0,
    component: 'Social Preparation',
    expenses: [],
    fundingYear: new Date().getFullYear(),
    fundType: 'Current',
    tier: 'Tier 1',
    operatingUnit: '',
    encodedBy: '',
    catchUpPlanRemarks: '',
    newTargetDate: '',
    actualDate: '',
    actualEndDate: '',
    actualParticipantsMale: 0,
    actualParticipantsFemale: 0,
    status: 'Proposed'
};

const ActivityEdit: React.FC<ActivityEditProps> = ({ 
    mode, activity, ipos, onBack, onUpdateActivity, uacsCodes, referenceActivities = [], forcedType 
}) => {
    const { currentUser } = useAuth();
    const { logAction } = useLogAction();
    const { addIpoHistory } = useIpoHistory();
    const isAdmin = currentUser?.role === 'Administrator';

    const [formData, setFormData] = useState<Activity>(activity || defaultFormData);
    // Store original activity state for locking logic comparison
    const [initialActivity, setInitialActivity] = useState<Activity>(activity || defaultFormData);

    const [selectedActivityType, setSelectedActivityType] = useState('');
    const [conductType, setConductType] = useState<'Single' | 'Multi-day' | 'Repeating'>('Single');
    const [repeatingEntries, setRepeatingEntries] = useState<any[]>([]);
    const [currentRepeatingEntry, setCurrentRepeatingEntry] = useState<any>({
        id: 0, date: '', endDate: '', isMultiDay: false, participantsMale: 0, participantsFemale: 0, participatingIpos: []
    });
    
    // Expense Edit State
    const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
    const [currentExpense, setCurrentExpense] = useState({
        objectType: 'MOOE' as ObjectType,
        expenseParticular: '',
        uacsCode: '',
        obligationMonth: '',
        disbursementMonth: '',
        amount: ''
    });

    useEffect(() => {
        if (activity) {
            setFormData(activity);
            setInitialActivity(activity);
            if (activity.endDate && activity.endDate !== activity.date) {
                setConductType('Multi-day');
            }
            if (activity.type === 'Training') {
                const ref = referenceActivities?.find(ra => ra.component === activity.component && ra.type === 'Training');
                setSelectedActivityType(ref ? ref.activity_name : `${activity.component} Training`);
            } else {
                setSelectedActivityType(activity.name);
            }
        } else {
            // Create Mode Defaults
            setFormData({
                ...defaultFormData,
                type: forcedType || 'Activity',
                operatingUnit: currentUser?.operatingUnit || '',
                encodedBy: currentUser?.fullName || '',
                status: 'Proposed'
            });
        }
    }, [activity, mode, forcedType, currentUser]);

    // Derived States
    const activityOptions = useMemo(() => {
        return referenceActivities
            .filter(ra => ra.component === formData.component)
            .filter(ra => forcedType ? ra.type === forcedType : true)
            .map(ra => ra.activity_name);
    }, [formData.component, referenceActivities, forcedType]);

    // Status Logic
    const availableStatuses = useMemo(() => {
        if (isAdmin) return ['Proposed', 'Ongoing', 'Completed', 'Cancelled'];
        
        // User Role Logic
        const currentStatus = initialActivity.status;
        if (mode === 'create') return ['Proposed'];
        
        if (currentStatus === 'Proposed') return ['Proposed', 'Ongoing', 'Cancelled'];
        if (currentStatus === 'Ongoing') return ['Ongoing', 'Cancelled'];
        if (currentStatus === 'Cancelled') return ['Cancelled'];
        if (currentStatus === 'Completed') return ['Completed']; // Users can't change out of completed easily
        
        return [currentStatus];
    }, [isAdmin, initialActivity.status, mode]);

    const isDetailsLocked = useMemo(() => {
        if (isAdmin) return false;
        if (mode === 'create') return false;
        // User cannot edit details/expenses if status is Ongoing, Completed or Cancelled
        return ['Ongoing', 'Completed', 'Cancelled'].includes(initialActivity.status);
    }, [isAdmin, initialActivity.status, mode]);

    // Locking Logic for Accomplishment Fields
    // Locked if field HAD a value when the component loaded (from DB)
    const isFieldLocked = (fieldName: keyof Activity | keyof ActivityExpense, obj: any = initialActivity) => {
        if (isAdmin) return false;
        const val = obj[fieldName];
        return val !== null && val !== undefined && val !== '' && val !== 0;
    };

    // --- Handlers ---

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        
        if (name === 'component') setSelectedActivityType('');
        if (name === 'date' && conductType === 'Single') setFormData(prev => ({ ...prev, endDate: value }));
    };

    const handleNumericChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
    };

    const handleActivityTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedName = e.target.value;
        setSelectedActivityType(selectedName);
        const ref = referenceActivities?.find(ra => ra.activity_name === selectedName && ra.component === formData.component);
        const type = ref?.type || 'Activity'; 
        
        setFormData(prev => ({ 
            ...prev, 
            name: type === 'Training' && (!activity || activity.type !== 'Training') ? '' : selectedName, // Reset name if switching to Training for specific title
            type: type 
        }));
    };

    const handleConductTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value as any;
        setConductType(val);
        setFormData(prev => {
             if (val === 'Single') return { ...prev, endDate: prev.date };
             if (val === 'Repeating') return { ...prev, date: '', endDate: '' };
             return prev;
        });
    };

    // Repeating Activity Logic
    const handleRepeatingEntryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        if (type === 'checkbox') {
             setCurrentRepeatingEntry(prev => ({ ...prev, [name]: checked }));
        } else {
             const isNum = type === 'number';
             setCurrentRepeatingEntry(prev => ({ ...prev, [name]: isNum ? (value === '' ? '' : parseFloat(value)) : value }));
        }
        
        // Sync End Date for single day entries in repeater
        if (name === 'date' && !currentRepeatingEntry.isMultiDay) {
             setCurrentRepeatingEntry(prev => ({ ...prev, endDate: value }));
        }
    };
    
    const handleRepeatingIpoSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedOptions = Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value);
        setCurrentRepeatingEntry(prev => ({ ...prev, participatingIpos: selectedOptions }));
    };

    const handleAddRepeatingEntry = () => {
        if (!currentRepeatingEntry.date || currentRepeatingEntry.participatingIpos.length === 0) {
            alert("Date and at least one IPO are required.");
            return;
        }
        const newEntry = { ...currentRepeatingEntry, id: Date.now() };
        setRepeatingEntries(prev => [...prev, newEntry]);
        setCurrentRepeatingEntry({ id: 0, date: '', endDate: '', isMultiDay: false, participantsMale: 0, participantsFemale: 0, participatingIpos: [] });
    };

    // Budget Handlers
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
            alert('Please fill out all expense fields.'); return;
        }
        const newExpense: ActivityExpense = {
            id: Date.now(),
            ...currentExpense,
            amount: parseFloat(currentExpense.amount),
            // Init actuals
            actualObligationAmount: 0, actualObligationDate: '', actualDisbursementAmount: 0, actualDisbursementDate: '', actualAmount: 0
        };

        if (editingExpenseId !== null) {
            setFormData(prev => ({ ...prev, expenses: prev.expenses.map(e => e.id === editingExpenseId ? { ...e, ...newExpense, id: e.id } : e) }));
            setEditingExpenseId(null);
        } else {
            setFormData(prev => ({ ...prev, expenses: [...prev.expenses, newExpense] }));
        }
        setCurrentExpense({ objectType: 'MOOE', expenseParticular: '', uacsCode: '', obligationMonth: '', disbursementMonth: '', amount: '' });
    };

    // Accomplishment Handlers
    const handleExpenseAccomplishmentChange = (id: number, field: keyof ActivityExpense, value: any) => {
        setFormData(prev => ({
            ...prev,
            expenses: prev.expenses.map(e => e.id === id ? { ...e, [field]: value } : e)
        }));
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        
        let activitiesToSave: Activity[] = [];
        const currentYear = new Date().getFullYear();
        const prefix = formData.type === 'Training' ? 'TRN' : 'ACT';

        if (mode === 'create') {
             if (conductType === 'Repeating') {
                activitiesToSave = repeatingEntries.map((entry, idx) => ({
                    ...formData,
                    uid: `${prefix}-${currentYear}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}-${idx}`,
                    date: entry.date,
                    endDate: entry.endDate || entry.date, // Support multi-day repeater
                    participantsMale: entry.participantsMale,
                    participantsFemale: entry.participantsFemale,
                    participatingIpos: entry.participatingIpos,
                    expenses: formData.expenses.map((exp, eIdx) => ({ ...exp, id: Date.now() + Math.random() + eIdx })), // Clone expenses
                    id: 0,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    history: [{ date: new Date().toISOString(), event: "Created (Repeating)", user: currentUser?.fullName || "System" }]
                }));
             } else {
                 activitiesToSave = [{
                     ...formData,
                     uid: `${prefix}-${currentYear}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
                     id: 0,
                     created_at: new Date().toISOString(),
                     updated_at: new Date().toISOString(),
                     history: [{ date: new Date().toISOString(), event: "Created", user: currentUser?.fullName || "System" }]
                 }];
             }
        } else {
            // Edit Mode
            let updatedStatus = formData.status;
            // Auto-complete logic for Accomplishment Mode
            if (mode === 'accomplishment') {
                 if (formData.actualDate) {
                     updatedStatus = 'Completed';
                 }
            }

            activitiesToSave = [{
                ...formData,
                status: updatedStatus,
                updated_at: new Date().toISOString(),
                history: [...(formData.history || []), { date: new Date().toISOString(), event: `Updated (${mode})`, user: currentUser?.fullName || "System" }]
            }];
        }

        if (supabase) {
            try {
                for (const act of activitiesToSave) {
                    const { id, ...payload } = act;
                    if (mode === 'create') {
                         await supabase.from('activities').insert([payload]);
                         logAction(`Created ${act.type}`, act.name);
                    } else {
                         await supabase.from('activities').update(payload).eq('id', activity!.id);
                         logAction(`Updated ${act.type}`, act.name);
                    }
                    
                    // IPO History Log
                    for (const ipoName of act.participatingIpos) {
                        const ipo = ipos.find(i => i.name === ipoName);
                        if(ipo) await addIpoHistory(ipo.id, `${mode === 'create' ? 'Created' : 'Updated'} ${act.type}: ${act.name}`);
                    }
                }
            } catch (err: any) {
                alert("Error saving: " + err.message);
                return;
            }
        }
        
        onUpdateActivity(activitiesToSave[0]); // Update local state for immediate feedback
        if (mode === 'create') alert(`Saved ${activitiesToSave.length} activities.`);
        onBack();
    };

    return (
        <div className="space-y-6 animate-fadeIn pb-20">
             <div className="flex justify-between items-center mb-4">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white">
                    {mode === 'create' ? 'Create New Activity' : `Edit ${mode === 'expenses' ? 'Expenses' : mode === 'accomplishment' ? 'Accomplishment' : 'Details'}: ${formData.name}`}
                </h1>
                <button onClick={onBack} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
            </div>

            <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                
                {/* CREATE / DETAILS MODE */}
                {(mode === 'create' || mode === 'details') && (
                    <div className="space-y-6">
                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md" disabled={isDetailsLocked}>
                            <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Basic Information</legend>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium">Status</label>
                                    <select name="status" value={formData.status} onChange={handleInputChange} className={commonInputClasses}>
                                        {availableStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">Component</label>
                                    <select name="component" value={formData.component} onChange={handleInputChange} className={commonInputClasses}>
                                        {otherActivityComponents.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">Activity Type</label>
                                    <select value={selectedActivityType} onChange={handleActivityTypeChange} className={commonInputClasses}>
                                        <option value="">Select Activity</option>
                                        {activityOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                </div>
                                {formData.type === 'Training' && (
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium">Specific Title</label>
                                        <input type="text" name="name" value={formData.name} onChange={handleInputChange} className={commonInputClasses} required />
                                    </div>
                                )}
                                
                                {mode === 'create' && (
                                    <div>
                                        <label className="block text-sm font-medium">Conduct Mode</label>
                                        <select value={conductType} onChange={handleConductTypeChange} className={commonInputClasses}>
                                            <option value="Single">Single Day</option>
                                            <option value="Multi-day">Multi-Day</option>
                                            <option value="Repeating">Repeating Entries</option>
                                        </select>
                                    </div>
                                )}

                                {conductType !== 'Repeating' && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-medium">Start Date</label>
                                            <input type="date" name="date" value={formData.date} onChange={handleInputChange} required className={commonInputClasses} />
                                        </div>
                                        {conductType === 'Multi-day' && (
                                            <div>
                                                <label className="block text-sm font-medium">End Date</label>
                                                <input type="date" name="endDate" value={formData.endDate} onChange={handleInputChange} required className={commonInputClasses} />
                                            </div>
                                        )}
                                    </>
                                )}

                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium">Location</label>
                                    <LocationPicker value={formData.location} onChange={(val) => setFormData(prev => ({...prev, location: val}))} />
                                </div>
                            </div>
                        </fieldset>
                        
                        {/* Participants & Funding (Hide in Repeating Create mode as it's per entry there) */}
                        {conductType !== 'Repeating' && (
                             <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md" disabled={isDetailsLocked}>
                                <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Participants & Funding</legend>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                     <div><label className="block text-sm font-medium">Male Target</label><input type="number" name="participantsMale" value={formData.participantsMale} onChange={handleNumericChange} className={commonInputClasses} /></div>
                                     <div><label className="block text-sm font-medium">Female Target</label><input type="number" name="participantsFemale" value={formData.participantsFemale} onChange={handleNumericChange} className={commonInputClasses} /></div>
                                     <div className="md:col-span-3">
                                         <label className="block text-sm font-medium">Participating IPOs</label>
                                         <select multiple value={formData.participatingIpos} onChange={(e) => setFormData(prev => ({ ...prev, participatingIpos: Array.from(e.target.selectedOptions, o => o.value) }))} className={`${commonInputClasses} h-32`}>
                                            {ipos.map(i => <option key={i.id} value={i.name}>{i.name}</option>)}
                                         </select>
                                     </div>
                                     <div><label className="block text-sm font-medium">Fund Year</label><input type="number" name="fundingYear" value={formData.fundingYear} onChange={handleNumericChange} className={commonInputClasses} /></div>
                                     <div><label className="block text-sm font-medium">Fund Type</label><select name="fundType" value={formData.fundType} onChange={handleInputChange} className={commonInputClasses}>{fundTypes.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                                </div>
                             </fieldset>
                        )}
                        
                        {/* Repeating Entry Form (Create Only) */}
                        {mode === 'create' && conductType === 'Repeating' && (
                             <fieldset className="border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/10 p-4 rounded-md">
                                <legend className="px-2 font-semibold text-blue-700 dark:text-blue-300">Repeating Schedule</legend>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-white dark:bg-gray-800 rounded mb-4">
                                    <div className="md:col-span-4 flex items-center gap-2 mb-2">
                                        <input type="checkbox" name="isMultiDay" checked={currentRepeatingEntry.isMultiDay} onChange={handleRepeatingEntryChange} className="h-4 w-4 rounded" />
                                        <label className="text-sm font-medium">Is Multi-day?</label>
                                    </div>
                                    <div><label className="block text-xs font-medium">Start Date</label><input type="date" name="date" value={currentRepeatingEntry.date} onChange={handleRepeatingEntryChange} className={commonInputClasses} /></div>
                                    {currentRepeatingEntry.isMultiDay && <div><label className="block text-xs font-medium">End Date</label><input type="date" name="endDate" value={currentRepeatingEntry.endDate} onChange={handleRepeatingEntryChange} className={commonInputClasses} /></div>}
                                    <div><label className="block text-xs font-medium">Male</label><input type="number" name="participantsMale" value={currentRepeatingEntry.participantsMale} onChange={handleRepeatingEntryChange} className={commonInputClasses} /></div>
                                    <div><label className="block text-xs font-medium">Female</label><input type="number" name="participantsFemale" value={currentRepeatingEntry.participantsFemale} onChange={handleRepeatingEntryChange} className={commonInputClasses} /></div>
                                    <div className="md:col-span-4"><label className="block text-xs font-medium">IPOs</label><select multiple value={currentRepeatingEntry.participatingIpos} onChange={handleRepeatingIpoSelect} className={`${commonInputClasses} h-20`}>{ipos.map(i => <option key={i.id} value={i.name}>{i.name}</option>)}</select></div>
                                    <div className="md:col-span-4"><button type="button" onClick={handleAddRepeatingEntry} className="w-full py-2 bg-blue-600 text-white rounded text-sm">Add to Schedule</button></div>
                                </div>
                                {/* List of entries to be created */}
                                <div className="space-y-2">
                                    {repeatingEntries.map((entry, idx) => (
                                        <div key={idx} className="p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 flex justify-between text-sm">
                                            <span>{entry.date} {entry.endDate ? `to ${entry.endDate}` : ''} | M:{entry.participantsMale} F:{entry.participantsFemale}</span>
                                            <span>{entry.participatingIpos.length} IPOs</span>
                                        </div>
                                    ))}
                                </div>
                             </fieldset>
                        )}
                    </div>
                )}

                {/* EXPENSES MODE (and Create) */}
                {(mode === 'create' || mode === 'expenses') && (
                     <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md mt-6" disabled={isDetailsLocked}>
                        <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Expenses</legend>
                        <div className="mb-4 space-y-2">
                            {formData.expenses.map((exp, idx) => (
                                <div key={idx} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded">
                                    <span className="text-sm">{exp.expenseParticular} ({exp.amount})</span>
                                    {!isDetailsLocked && <button type="button" onClick={() => setFormData(prev => ({...prev, expenses: prev.expenses.filter((_, i) => i !== idx)}))} className="text-red-500">&times;</button>}
                                </div>
                            ))}
                        </div>
                        
                        {!isDetailsLocked && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end border-t pt-4">
                                {/* Expense Inputs Reused from ActivityDetail logic... simplified here for brevity */}
                                <div><label className="block text-xs font-medium">Object Type</label><select name="objectType" value={currentExpense.objectType} onChange={handleExpenseChange} className={commonInputClasses}>{objectTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                <div><label className="block text-xs font-medium">Particular</label><select name="expenseParticular" value={currentExpense.expenseParticular} onChange={handleExpenseChange} className={commonInputClasses}><option value="">Select</option>{Object.keys(uacsCodes[currentExpense.objectType]).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                                <div><label className="block text-xs font-medium">Amount</label><input type="number" name="amount" value={currentExpense.amount} onChange={handleExpenseChange} className={commonInputClasses} /></div>
                                {/* ... Other fields (UACS, Months) ... */}
                                <div className="md:col-span-3"><button type="button" onClick={handleAddExpense} className="w-full py-2 bg-emerald-600 text-white rounded text-sm">Add Expense</button></div>
                            </div>
                        )}
                     </fieldset>
                )}

                {/* ACCOMPLISHMENT MODE */}
                {mode === 'accomplishment' && (
                     <div className="space-y-6">
                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Actual Conduct</legend>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium">Actual Start Date</label>
                                    <input type="date" name="actualDate" value={formData.actualDate || ''} onChange={handleInputChange} className={commonInputClasses} disabled={isFieldLocked('actualDate')} />
                                </div>
                                {conductType === 'Multi-day' && (
                                    <div>
                                        <label className="block text-sm font-medium">Actual End Date</label>
                                        <input type="date" name="actualEndDate" value={formData.actualEndDate || ''} onChange={handleInputChange} className={commonInputClasses} disabled={isFieldLocked('actualEndDate')} />
                                    </div>
                                )}
                                <div><label className="block text-sm font-medium">Actual Male</label><input type="number" name="actualParticipantsMale" value={formData.actualParticipantsMale} onChange={handleNumericChange} className={commonInputClasses} disabled={isFieldLocked('actualParticipantsMale')} /></div>
                                <div><label className="block text-sm font-medium">Actual Female</label><input type="number" name="actualParticipantsFemale" value={formData.actualParticipantsFemale} onChange={handleNumericChange} className={commonInputClasses} disabled={isFieldLocked('actualParticipantsFemale')} /></div>
                            </div>
                        </fieldset>
                        
                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Budget Utilization</legend>
                            {formData.expenses.map((exp) => (
                                <div key={exp.id} className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700 last:border-0">
                                    <p className="font-semibold text-sm mb-2">{exp.expenseParticular}</p>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs text-gray-500">Actual Obligation</label>
                                            <input 
                                                type="number" 
                                                value={exp.actualObligationAmount || ''} 
                                                onChange={(e) => handleExpenseAccomplishmentChange(exp.id, 'actualObligationAmount', parseFloat(e.target.value))}
                                                disabled={isFieldLocked('actualObligationAmount', initialActivity.expenses.find(ie => ie.id === exp.id))}
                                                className={commonInputClasses} 
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-500">Actual Disbursement</label>
                                            <input 
                                                type="number" 
                                                value={exp.actualDisbursementAmount || ''} 
                                                onChange={(e) => handleExpenseAccomplishmentChange(exp.id, 'actualDisbursementAmount', parseFloat(e.target.value))}
                                                disabled={isFieldLocked('actualDisbursementAmount', initialActivity.expenses.find(ie => ie.id === exp.id))}
                                                className={commonInputClasses} 
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </fieldset>
                     </div>
                )}

                <div className="flex justify-end pt-6 border-t mt-6">
                    <button type="submit" className="px-6 py-2 bg-emerald-600 text-white rounded-md font-bold hover:bg-emerald-700 shadow-md">
                        {mode === 'create' ? 'Create Activity' : 'Save Changes'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default ActivityEdit;
