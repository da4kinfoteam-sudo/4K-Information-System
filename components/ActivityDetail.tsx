
// Author: 4K 
import React, { useState, FormEvent, useEffect, useMemo } from 'react';
import { Activity, ActivityExpense, IPO, objectTypes, ObjectType, fundTypes, tiers, operatingUnits, ReferenceActivity, ActivityComponentType, otherActivityComponents } from '../constants';
import LocationPicker, { parseLocation } from './LocationPicker';
import { useAuth } from '../contexts/AuthContext';
import { getUserPermissions } from './mainfunctions/TableHooks';
import { useIpoHistory } from '../hooks/useIpoHistory';

interface ActivityDetailProps {
    activity: Activity;
    ipos: IPO[];
    onBack: () => void;
    previousPageName: string;
    onUpdateActivity: (updatedActivity: Activity) => void;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    referenceActivities?: ReferenceActivity[];
}

const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    if (dateString.includes('T')) {
        return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    const date = new Date(dateString + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
}

const getStatusBadge = (status: Activity['status']) => {
    const baseClasses = "px-2 py-0.5 text-xs font-medium rounded-full";
    switch (status) {
        case 'Completed': return `${baseClasses} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`;
        case 'Ongoing': return `${baseClasses} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`;
        case 'Proposed': return `${baseClasses} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`;
        case 'Cancelled': return `${baseClasses} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`;
        default: return `${baseClasses} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200`;
    }
}

const DetailItem: React.FC<{ label: string; value?: string | number | React.ReactNode }> = ({ label, value }) => (
    <div>
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{value || 'N/A'}</dd>
    </div>
);

const ActivityDetail: React.FC<ActivityDetailProps> = ({ activity, ipos, onBack, previousPageName, onUpdateActivity, uacsCodes, referenceActivities = [] }) => {
    const { currentUser } = useAuth();
    const { canEdit } = getUserPermissions(currentUser);
    const { addIpoHistory } = useIpoHistory();
    
    // Modes: 'none' | 'details' | 'expenses' | 'accomplishment'
    const [editMode, setEditMode] = useState<'none' | 'details' | 'expenses' | 'accomplishment'>('none');
    
    const [editedActivity, setEditedActivity] = useState(activity);
    const [selectedActivityType, setSelectedActivityType] = useState('');
    const [isMultiDay, setIsMultiDay] = useState(false);
    
    // Permission Toggles (Future proofing)
    const canEditDetails = canEdit;
    const canEditExpenses = canEdit;
    const canEditAccomplishment = canEdit;

    // Budget Edit State
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
        setEditedActivity(activity);
        
        // Initialize Selected Activity Type for dropdown logic
        if (activity.type === 'Training') {
            const ref = referenceActivities?.find(ra => ra.component === activity.component && ra.type === 'Training');
            if (ref) {
                setSelectedActivityType(ref.activity_name);
            } else {
                setSelectedActivityType(`${activity.component} Training`); // Fallback
            }
        } else {
            setSelectedActivityType(activity.name);
        }

        // Check for multi-day
        if (activity.endDate && activity.endDate !== activity.date) {
            setIsMultiDay(true);
        } else {
            setIsMultiDay(false);
        }
    }, [activity, editMode, referenceActivities]);

    const totalBudget = useMemo(() => {
       return editedActivity.expenses.reduce((acc, item) => acc + item.amount, 0);
    }, [editedActivity.expenses]);

    const activityOptions = useMemo(() => {
        return referenceActivities
            .filter(ra => ra.component === editedActivity.component)
            .map(ra => ra.activity_name);
    }, [editedActivity.component, referenceActivities]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setEditedActivity(prev => {
            const updated = { ...prev, [name]: value };
            
            // If component changed, reset activity type
            if (name === 'component') {
                updated.name = '';
                setSelectedActivityType('');
            }
            
            // Sync end date if not multi-day
            if (name === 'date' && !isMultiDay) {
                updated.endDate = value;
            }

            return updated;
        });
        if (name === 'component') setSelectedActivityType('');
    };

    const handleMultiDayToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
        const checked = e.target.checked;
        setIsMultiDay(checked);
        if (!checked) {
            setEditedActivity(prev => ({ ...prev, endDate: prev.date }));
        }
    };

    const handleActivityTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedName = e.target.value;
        setSelectedActivityType(selectedName);
        
        const ref = referenceActivities.find(ra => ra.activity_name === selectedName && ra.component === editedActivity.component);
        const type = ref?.type || 'Activity'; 
        
        if (type === 'Training') {
            // Check if user is re-selecting the original category for this activity
            const originalRef = referenceActivities.find(ra => ra.component === activity.component && ra.type === 'Training');
            if (activity.type === 'Training' && originalRef && originalRef.activity_name === selectedName) {
                 // Keep original name if it was already set
                 setEditedActivity(prev => ({ ...prev, name: activity.name, type: 'Training' }));
            } else {
                 // Reset name for new training category to allow specific title input
                 setEditedActivity(prev => ({ ...prev, name: '', type: 'Training' }));
            }
        } else {
            setEditedActivity(prev => ({ ...prev, name: selectedName, type: 'Activity' }));
        }
    };

    const handleNumericChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setEditedActivity(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
    };

    const handleIpoSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedOptions = Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value);
        setEditedActivity(prev => ({ ...prev, participatingIpos: selectedOptions }));
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
            alert('Please fill out all expense fields, including UACS classification.');
            return;
        }

        if (editingExpenseId !== null) {
            // Update existing
            setEditedActivity(prev => ({
                ...prev,
                expenses: prev.expenses.map(e => e.id === editingExpenseId ? {
                    ...e,
                    objectType: currentExpense.objectType,
                    expenseParticular: currentExpense.expenseParticular,
                    uacsCode: currentExpense.uacsCode,
                    obligationMonth: currentExpense.obligationMonth,
                    disbursementMonth: currentExpense.disbursementMonth,
                    amount: parseFloat(currentExpense.amount)
                } : e)
            }));
            setEditingExpenseId(null);
        } else {
            // Add new
            const newExpense: ActivityExpense = {
                id: Date.now(),
                objectType: currentExpense.objectType,
                expenseParticular: currentExpense.expenseParticular,
                uacsCode: currentExpense.uacsCode,
                obligationMonth: currentExpense.obligationMonth,
                disbursementMonth: currentExpense.disbursementMonth,
                amount: parseFloat(currentExpense.amount)
            };
            setEditedActivity(prev => ({...prev, expenses: [...prev.expenses, newExpense]}));
        }

        setCurrentExpense({
            objectType: 'MOOE',
            expenseParticular: '',
            uacsCode: '',
            obligationMonth: '',
            disbursementMonth: '',
            amount: ''
        });
    };

    const handleEditExpense = (id: number) => {
        const expenseToEdit = editedActivity.expenses.find(e => e.id === id);
        if (expenseToEdit) {
            setCurrentExpense({
                objectType: expenseToEdit.objectType,
                expenseParticular: expenseToEdit.expenseParticular,
                uacsCode: expenseToEdit.uacsCode,
                obligationMonth: expenseToEdit.obligationMonth,
                disbursementMonth: expenseToEdit.disbursementMonth,
                amount: String(expenseToEdit.amount)
            });
            setEditingExpenseId(id);
        }
    };

    const handleCancelExpenseEdit = () => {
        setEditingExpenseId(null);
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
        setEditedActivity(prev => ({ ...prev, expenses: prev.expenses.filter(exp => exp.id !== id) }));
        if (editingExpenseId === id) {
            handleCancelExpenseEdit();
        }
    };

    // Accomplishment Handlers
    const handleExpenseAccomplishmentChange = (id: number, field: keyof ActivityExpense, value: any) => {
        setEditedActivity(prev => ({
            ...prev,
            expenses: prev.expenses.map(e => e.id === id ? { ...e, [field]: value } : e)
        }));
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        
        let eventType = "Activity Updated";
        if (editMode === 'details') eventType = "Details Updated";
        if (editMode === 'expenses') eventType = "Expenses Updated";
        if (editMode === 'accomplishment') eventType = "Accomplishment Updated";

        const historyEntry = {
            date: new Date().toISOString(),
            event: eventType,
            user: currentUser?.fullName || "System"
        };
        
        // Log to IPO History for each participating IPO
        for (const ipoName of editedActivity.participatingIpos) {
            const ipo = ipos.find(i => i.name === ipoName);
            if (ipo) {
                await addIpoHistory(ipo.id, `${eventType}: ${editedActivity.name}`);
            }
        }

        const finalEndDate = isMultiDay ? editedActivity.endDate : editedActivity.date;

        const updatedActivity = {
            ...editedActivity,
            endDate: finalEndDate,
            history: [...(activity.history || []), historyEntry]
        };
        
        onUpdateActivity(updatedActivity);
        setEditMode('none');
    };

    const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm disabled:bg-gray-100 disabled:dark:bg-gray-800 disabled:cursor-not-allowed";

    if (editMode !== 'none') {
        return (
            <div className="space-y-6 animate-fadeIn">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">
                        {editMode === 'expenses' ? 'Editing Expenses: ' : editMode === 'accomplishment' ? 'Editing Accomplishment: ' : 'Editing Details: '}{activity.name}
                    </h1>
                    <button onClick={() => setEditMode('none')} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel Editing</button>
                </div>
                
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
                    <form onSubmit={handleSubmit}>
                        
                        <div className="min-h-[400px]">
                            {/* DETAILS FORM */}
                            {editMode === 'details' && (
                                <div className="space-y-6">
                                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                        <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Basic Information</legend>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium">Status</label>
                                                <select name="status" value={editedActivity.status} onChange={handleInputChange} className={commonInputClasses}>
                                                    <option value="Proposed">Proposed</option>
                                                    <option value="Ongoing">Ongoing</option>
                                                    <option value="Completed">Completed</option>
                                                    <option value="Cancelled">Cancelled</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium">Component</label>
                                                <select name="component" value={editedActivity.component} onChange={handleInputChange} className={commonInputClasses}>
                                                    {otherActivityComponents.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium">Activity Name</label>
                                                <select value={selectedActivityType} onChange={handleActivityTypeChange} className={commonInputClasses}>
                                                    <option value="">Select Activity</option>
                                                    {activityOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                </select>
                                            </div>
                                            {editedActivity.type === 'Training' && (
                                                <div className="md:col-span-2">
                                                    <label className="block text-sm font-medium">Specific Training Title</label>
                                                    <input type="text" name="name" value={editedActivity.name} onChange={handleInputChange} required className={commonInputClasses} placeholder="Enter specific training title" />
                                                </div>
                                            )}
                                            {editedActivity.type === 'Training' && (
                                                <div className="md:col-span-2">
                                                    <label className="block text-sm font-medium">Facilitator</label>
                                                    <input type="text" name="facilitator" value={editedActivity.facilitator} onChange={handleInputChange} className={commonInputClasses} />
                                                </div>
                                            )}
                                            <div>
                                                <label className="block text-sm font-medium">Start Date</label>
                                                <input type="date" name="date" value={editedActivity.date} onChange={handleInputChange} required className={commonInputClasses} />
                                            </div>
                                            <div className="flex flex-col justify-end">
                                                <label className="flex items-center gap-2 text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={isMultiDay} 
                                                        onChange={handleMultiDayToggle}
                                                        className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                                    />
                                                    <span>Multi-day Activity?</span>
                                                </label>
                                                {isMultiDay && (
                                                    <div>
                                                        <label className="block text-sm font-medium">End Date</label>
                                                        <input type="date" name="endDate" value={editedActivity.endDate || editedActivity.date} onChange={handleInputChange} className={commonInputClasses} />
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium">Location</label>
                                                <LocationPicker value={editedActivity.location} onChange={(val) => setEditedActivity(prev => ({...prev, location: val}))} />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="block text-sm font-medium">Description</label>
                                                <textarea name="description" value={editedActivity.description} onChange={handleInputChange} rows={3} className={commonInputClasses} />
                                            </div>
                                        </div>
                                    </fieldset>

                                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                        <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Participants & IPOs</legend>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium">Male Participants (Target)</label>
                                                <input type="number" name="participantsMale" value={editedActivity.participantsMale} onChange={handleNumericChange} min="0" className={commonInputClasses} />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium">Female Participants (Target)</label>
                                                <input type="number" name="participantsFemale" value={editedActivity.participantsFemale} onChange={handleNumericChange} min="0" className={commonInputClasses} />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium">Total Target</label>
                                                <input type="number" value={(editedActivity.participantsMale || 0) + (editedActivity.participantsFemale || 0)} readOnly className={`${commonInputClasses} bg-gray-100 dark:bg-gray-600 cursor-not-allowed`} />
                                            </div>
                                            <div className="md:col-span-3">
                                                <label className="block text-sm font-medium mb-2">Participating IPOs (Hold Ctrl/Cmd to select multiple)</label>
                                                <select multiple name="participatingIpos" value={editedActivity.participatingIpos} onChange={handleIpoSelectChange} className={`${commonInputClasses} h-40`}>
                                                    {ipos.sort((a,b) => a.name.localeCompare(b.name)).map(ipo => (
                                                        <option key={ipo.id} value={ipo.name}>{ipo.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </fieldset>

                                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                        <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Funding</legend>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div><label className="block text-sm font-medium">Year</label><input type="number" name="fundingYear" value={editedActivity.fundingYear} onChange={handleNumericChange} className={commonInputClasses} /></div>
                                            <div>
                                                <label className="block text-sm font-medium">Type</label>
                                                <select name="fundType" value={editedActivity.fundType} onChange={handleInputChange} className={commonInputClasses}>
                                                    {fundTypes.map(f => <option key={f} value={f}>{f}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium">Tier</label>
                                                <select name="tier" value={editedActivity.tier} onChange={handleInputChange} className={commonInputClasses}>
                                                    {tiers.map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    </fieldset>
                                </div>
                            )}

                            {/* EXPENSES FORM */}
                            {editMode === 'expenses' && (
                                <div className="space-y-6">
                                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                        <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Expenses</legend>
                                        <div className="space-y-2 mb-4">
                                            {editedActivity.expenses.map((exp) => (
                                                <div key={exp.id} className={`flex items-center justify-between p-2 rounded-md text-sm ${editingExpenseId === exp.id ? 'bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-700' : 'bg-gray-50 dark:bg-gray-700/50'}`}>
                                                    <div>
                                                        <span className="font-semibold">{exp.expenseParticular}</span>
                                                        <div className="text-xs text-gray-500">{exp.uacsCode} | Obl: {formatDate(exp.obligationMonth)}</div>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <span className="font-bold">{formatCurrency(exp.amount)}</span>
                                                        <div className="flex items-center gap-2">
                                                            <button type="button" onClick={() => handleEditExpense(exp.id)} className="text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400">
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
                                                            </button>
                                                            <button type="button" onClick={() => handleRemoveExpense(exp.id)} className="text-red-500 hover:text-red-700">&times;</button>
                                                        </div>
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
                                                {editingExpenseId !== null ? (
                                                    <div className="flex gap-1 h-9 items-end">
                                                        <button type="button" onClick={handleAddExpense} className="h-full px-3 inline-flex items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700 text-xs font-medium">Update</button>
                                                        <button type="button" onClick={handleCancelExpenseEdit} className="h-full px-3 inline-flex items-center justify-center rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 text-xs font-medium">Cancel</button>
                                                    </div>
                                                ) : (
                                                    <button type="button" onClick={handleAddExpense} className="h-9 w-9 flex-shrink-0 inline-flex items-center justify-center rounded-full bg-emerald-100 text-emerald-600 hover:bg-emerald-200">+</button>
                                                )}
                                            </div>
                                        </div>
                                    </fieldset>
                                </div>
                            )}

                            {/* ACCOMPLISHMENT FORM */}
                            {editMode === 'accomplishment' && (
                                <div className="space-y-6">
                                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                        <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Actual Accomplishment</legend>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium">Actual Date Conducted</label>
                                                <input type="date" name="actualDate" value={editedActivity.actualDate || ''} onChange={handleInputChange} className={commonInputClasses} />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium">Actual Male Participants</label>
                                                <input type="number" name="actualParticipantsMale" value={editedActivity.actualParticipantsMale || 0} onChange={handleNumericChange} className={commonInputClasses} />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium">Actual Female Participants</label>
                                                <input type="number" name="actualParticipantsFemale" value={editedActivity.actualParticipantsFemale || 0} onChange={handleNumericChange} className={commonInputClasses} />
                                            </div>
                                        </div>
                                    </fieldset>

                                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                        <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Budget Utilization</legend>
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
                                                    {editedActivity.expenses.map((expense) => (
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
                                    {new Date() > new Date(editedActivity.date) && !editedActivity.actualDate && (
                                        <fieldset className="border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10 p-4 rounded-md">
                                            <legend className="px-2 font-semibold text-red-600 dark:text-red-400">Catch Up Plan</legend>
                                            <p className="text-xs text-red-500 mb-2">Activity is delayed. Please provide a catch-up plan.</p>
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Remarks / Justification</label>
                                                    <textarea name="catchUpPlanRemarks" value={editedActivity.catchUpPlanRemarks || ''} onChange={handleInputChange} rows={3} className={commonInputClasses} placeholder="Describe actions taken or justification for delay..." />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">New Target Date</label>
                                                    <input type="date" name="newTargetDate" value={editedActivity.newTargetDate || ''} onChange={handleInputChange} className={commonInputClasses} />
                                                </div>
                                            </div>
                                        </fieldset>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <button type="button" onClick={() => setEditMode('none')} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600">Cancel</button>
                            <button type="submit" className="px-4 py-2 rounded-md text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 hover:brightness-95">Save Changes</button>
                        </div>
                    </form>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-8">
             <header className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">{activity.name}</h1>
                    <p className="text-md text-gray-500 dark:text-gray-400">
                        {activity.location} | {formatDate(activity.date)}
                        {activity.endDate && activity.endDate !== activity.date ? ` - ${formatDate(activity.endDate)}` : ''}
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    {/* Granular Edit Buttons available inside sections now, main header just for Back */}
                    <button onClick={onBack} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        Back to {previousPageName}
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Info & Expenses */}
                <div className="lg:col-span-2 space-y-8">
                    
                    {/* Activity Details Section */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Activity Details</h3>
                            {canEditDetails && (
                                <button onClick={() => setEditMode('details')} className="text-sm text-emerald-600 hover:underline flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                    Edit Details
                                </button>
                            )}
                        </div>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                            <DetailItem label="Status" value={<span className={getStatusBadge(activity.status)}>{activity.status}</span>} />
                            <DetailItem label="UID" value={activity.uid} />
                            <DetailItem label="Type" value={activity.type} />
                            <DetailItem label="Date" value={
                                <>
                                    {formatDate(activity.date)}
                                    {activity.endDate && activity.endDate !== activity.date ? ` to ${formatDate(activity.endDate)}` : ''}
                                </>
                            } />
                            <DetailItem label="Component" value={activity.component} />
                            <DetailItem label="Operating Unit" value={activity.operatingUnit} />
                            <DetailItem label="Funding Year" value={activity.fundingYear} />
                            {activity.type === 'Training' && <DetailItem label="Facilitator" value={activity.facilitator} />}
                            <div className="col-span-2">
                                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Description</dt>
                                <dd className="mt-1 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700/50 p-3 rounded-md">{activity.description || 'No description provided.'}</dd>
                            </div>
                            
                            {/* Target Participants integrated here */}
                            <div className="col-span-2 mt-4 bg-blue-50 dark:bg-blue-900/10 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
                                <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-2">Target Participants</h4>
                                <div className="grid grid-cols-3 gap-2 text-sm text-gray-700 dark:text-gray-200">
                                    <div className="flex flex-col">
                                        <span className="text-xs text-gray-500">Male</span>
                                        <span className="font-semibold">{activity.participantsMale}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-xs text-gray-500">Female</span>
                                        <span className="font-semibold">{activity.participantsFemale}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-xs text-gray-500">Total</span>
                                        <span className="font-semibold">{activity.participantsMale + activity.participantsFemale}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="col-span-2 mt-2">
                                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Participating IPOs</dt>
                                {activity.participatingIpos.length > 0 ? (
                                    <ul className="flex flex-wrap gap-2">
                                        {activity.participatingIpos.map((ipoName, idx) => (
                                            <li key={idx} className="flex items-center gap-2 text-sm bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full">
                                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                                <span className="text-gray-700 dark:text-gray-200">{ipoName}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-gray-500 italic">No participating IPOs selected.</p>
                                )}
                            </div>
                        </dl>
                    </div>

                    {/* Expenses Section */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Expenses & Budget</h3>
                            {canEditExpenses && (
                                <button onClick={() => setEditMode('expenses')} className="text-sm text-emerald-600 hover:underline flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
                                    Edit Expenses
                                </button>
                            )}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase">
                                    <tr>
                                        <th className="px-4 py-2 text-left">Particulars</th>
                                        <th className="px-4 py-2 text-left">UACS Code</th>
                                        <th className="px-4 py-2 text-left">Obligation</th>
                                        <th className="px-4 py-2 text-left">Disbursement</th>
                                        <th className="px-4 py-2 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activity.expenses.length > 0 ? (
                                        activity.expenses.map(exp => (
                                            <tr key={exp.id} className="border-b border-gray-200 dark:border-gray-700">
                                                <td className="px-4 py-2 font-medium">{exp.expenseParticular}</td>
                                                <td className="px-4 py-2">{exp.uacsCode}</td>
                                                <td className="px-4 py-2">{formatDate(exp.obligationMonth)}</td>
                                                <td className="px-4 py-2">{formatDate(exp.disbursementMonth)}</td>
                                                <td className="px-4 py-2 text-right font-medium">{formatCurrency(exp.amount)}</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan={5} className="px-4 py-4 text-center text-gray-500 italic">No expenses recorded.</td></tr>
                                    )}
                                </tbody>
                                <tfoot className="font-bold bg-gray-50 dark:bg-gray-700/50">
                                    <tr>
                                        <td colSpan={4} className="px-4 py-2 text-right">Total Budget</td>
                                        <td className="px-4 py-2 text-right">{formatCurrency(totalBudget)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {/* NEW: Accomplishment Report Section */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Accomplishment Report</h3>
                            {canEditAccomplishment && (
                                <button onClick={() => setEditMode('accomplishment')} className="text-sm text-emerald-600 hover:underline flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    Edit Accomplishment
                                </button>
                            )}
                        </div>
                        <div className="space-y-6">
                            
                            {/* Summary Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-lg border border-emerald-100 dark:border-emerald-800">
                                    <span className="text-sm text-emerald-800 dark:text-emerald-300 font-medium">Actual Date Conducted</span>
                                    <div className="text-xl font-bold text-emerald-900 dark:text-emerald-100 mt-1">{formatDate(activity.actualDate)}</div>
                                </div>
                                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
                                    <span className="text-sm text-blue-800 dark:text-blue-300 font-medium">Actual Participants</span>
                                    <div className="text-xl font-bold text-blue-900 dark:text-blue-100 mt-1">
                                        {(activity.actualParticipantsMale || 0) + (activity.actualParticipantsFemale || 0)} 
                                        <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
                                            (M: {activity.actualParticipantsMale || 0}, F: {activity.actualParticipantsFemale || 0})
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Financial Accomplishment Table */}
                            <div>
                                <h4 className="text-sm font-bold text-gray-600 dark:text-gray-300 mb-2">Financial Performance (Actual)</h4>
                                {activity.expenses.length > 0 ? (
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full text-sm">
                                            <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase">
                                                <tr>
                                                    <th className="px-4 py-2 text-left">Item</th>
                                                    <th className="px-4 py-2 text-left">Actual Obligation</th>
                                                    <th className="px-4 py-2 text-left">Actual Disbursement</th>
                                                    <th className="px-4 py-2 text-right">Actual Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {activity.expenses.map(exp => (
                                                    <tr key={exp.id} className="border-b border-gray-100 dark:border-gray-700">
                                                        <td className="px-4 py-2 font-medium">{exp.expenseParticular}</td>
                                                        <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{formatDate(exp.actualObligationDate)}</td>
                                                        <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{formatDate(exp.actualDisbursementDate)}</td>
                                                        <td className="px-4 py-2 text-right font-medium text-emerald-600 dark:text-emerald-400">
                                                            {exp.actualAmount ? formatCurrency(exp.actualAmount) : '-'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500 italic">No expense items to report on.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: History */}
                <div className="space-y-8">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border-t-4 border-gray-400">
                        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">History</h3>
                        {activity.history && activity.history.length > 0 ? (
                            <div className="relative border-l-2 border-gray-200 dark:border-gray-700 ml-2 py-2">
                                <ul className="space-y-8">
                                    {activity.history.map((entry, index) => (
                                        <li key={index} className="ml-8 relative">
                                            <span className="absolute flex items-center justify-center w-4 h-4 bg-emerald-500 rounded-full -left-[35px] ring-4 ring-white dark:ring-gray-800"></span>
                                            <time className="mb-1 text-sm font-normal leading-none text-gray-400 dark:text-gray-500">{formatDate(entry.date)}</time>
                                            <p className="font-semibold text-gray-900 dark:text-white">{entry.event}</p>
                                            <p className="text-sm font-normal text-gray-500 dark:text-gray-400">by {entry.user}</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400 italic">No historical data available.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ActivityDetail;
