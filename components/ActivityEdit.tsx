
// Author: 4K 
import React, { useState, FormEvent, useEffect, useMemo } from 'react';
import { Activity, ActivityExpense, IPO, objectTypes, ObjectType, fundTypes, FundType, tiers, Tier, otherActivityComponents, ReferenceActivity, philippineRegions, operatingUnits, ouToRegionMap } from '../constants';
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
    // Gender and Inclusivity Actuals
    actualPWD: 0,
    actualMuslim: 0,
    actualLGBTQ: 0,
    actualSoloParent: 0,
    actualSenior: 0,
    actualYouth: 0,
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
    const [initialActivity, setInitialActivity] = useState<Activity>(activity || defaultFormData);

    const [activeTab, setActiveTab] = useState<'details' | 'expenses'>('details');
    const [selectedActivityType, setSelectedActivityType] = useState('');
    const [conductType, setConductType] = useState<'Single' | 'Multi-day' | 'Repeating'>('Single');
    const [repeatingEntries, setRepeatingEntries] = useState<any[]>([]);
    const [currentRepeatingEntry, setCurrentRepeatingEntry] = useState<any>({
        id: 0, date: '', endDate: '', isMultiDay: false, participantsMale: 0, participantsFemale: 0, participatingIpos: []
    });
    
    // Filter state for IPO selection
    const [ipoRegionFilter, setIpoRegionFilter] = useState('All');

    // Expense Edit State
    const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
    const [missingFields, setMissingFields] = useState<string[]>([]);
    const [currentExpense, setCurrentExpense] = useState({
        objectType: 'MOOE' as ObjectType,
        expenseParticular: '',
        uacsCode: '',
        obligationMonth: '',
        disbursementMonth: '',
        amount: ''
    });

    // Helper to get month index from YYYY-MM-DD string
    const getMonthFromDateStr = (dateStr: string) => {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length > 1) return (parseInt(parts[1]) - 1).toString();
        return '';
    };

    // Helper inside component to use state for Expense Form (Targets)
    const updateExpenseDateFromMonth = (field: string, monthIndex: string) => {
        if (monthIndex === '') {
            setCurrentExpense(prev => ({ ...prev, [field]: '' }));
            return;
        }
        const mIndex = parseInt(monthIndex);
        const year = formData.fundingYear || new Date().getFullYear();
        // Construct date as YYYY-MM-01
        const dateStr = `${year}-${String(mIndex + 1).padStart(2, '0')}-01`;
        setCurrentExpense(prev => ({ ...prev, [field]: dateStr }));
    }

    // Helper for Actuals (Accomplishments)
    const updateActualDateFromMonth = (id: number, field: keyof ActivityExpense, monthIndex: string) => {
        setFormData(prev => ({
            ...prev,
            expenses: prev.expenses.map(e => {
                if (e.id === id) {
                    let newValue = '';
                    if (monthIndex !== '') {
                        const mIndex = parseInt(monthIndex);
                        const year = prev.fundingYear || new Date().getFullYear();
                        newValue = `${year}-${String(mIndex + 1).padStart(2, '0')}-01`;
                    }
                    return { ...e, [field]: newValue };
                }
                return e;
            })
        }));
    };

    useEffect(() => {
        if (activity) {
            setFormData(activity);
            setInitialActivity(activity);
            if (activity.endDate && activity.endDate !== activity.date) {
                setConductType('Multi-day');
            } else {
                setConductType('Single');
            }
            if (activity.type === 'Training') {
                const ref = referenceActivities?.find(ra => ra.component === activity.component && ra.type === 'Training');
                setSelectedActivityType(ref ? ref.activity_name : `${activity.component} Training`);
            } else {
                setSelectedActivityType(activity.name);
            }
        } else {
            // Create Mode Defaults
            const userOu = currentUser?.operatingUnit || '';
            setFormData({
                ...defaultFormData,
                type: forcedType || 'Activity',
                operatingUnit: userOu,
                encodedBy: currentUser?.fullName || '',
                status: 'Proposed'
            });
            setConductType('Single');
            setIpoRegionFilter(ouToRegionMap[userOu] || 'All');
        }
        
        if (mode === 'expenses') setActiveTab('expenses');
    }, [activity, mode, forcedType, currentUser]);

    // Derived States
    const activityOptions = useMemo(() => {
        return referenceActivities
            .filter(ra => ra.component === formData.component)
            .filter(ra => forcedType ? ra.type === forcedType : true)
            .map(ra => ra.activity_name);
    }, [formData.component, referenceActivities, forcedType]);

    // Filtered IPO List
    const filteredIpos = useMemo(() => {
        let current = ipos;
        if (ipoRegionFilter !== 'All') {
            current = current.filter(i => i.region === ipoRegionFilter);
        }
        return current.sort((a, b) => a.name.localeCompare(b.name));
    }, [ipos, ipoRegionFilter]);

    // Status Logic
    const availableStatuses = useMemo(() => {
        if (isAdmin) return ['Proposed', 'Ongoing', 'Completed', 'Cancelled'];
        
        // User Role Logic
        const currentStatus = initialActivity.status;
        if (mode === 'create') return ['Proposed'];
        
        if (currentStatus === 'Proposed') return ['Proposed', 'Ongoing', 'Cancelled'];
        if (currentStatus === 'Ongoing') return ['Ongoing', 'Cancelled'];
        if (currentStatus === 'Cancelled') return ['Cancelled'];
        if (currentStatus === 'Completed') return ['Completed']; 
        
        return [currentStatus];
    }, [isAdmin, initialActivity.status, mode]);

    const isDetailsLocked = useMemo(() => {
        if (isAdmin) return false;
        if (mode === 'create') return false;
        // User cannot edit details/expenses if status is Ongoing, Completed or Cancelled (except Admin)
        return ['Ongoing', 'Completed', 'Cancelled'].includes(initialActivity.status);
    }, [isAdmin, initialActivity.status, mode]);

    // Locking Logic for Accomplishment Fields
    // Locked if field HAD a value initially (saved in DB)
    const isFieldLocked = (fieldName: keyof Activity | keyof ActivityExpense, obj: any = initialActivity) => {
        if (isAdmin) return false;
        const val = obj[fieldName];
        // If value exists and is not null/undefined/empty string/0, it is locked
        return val !== null && val !== undefined && val !== '' && val !== 0;
    };

    // --- Handlers ---

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        
        if (name === 'component') {
            setSelectedActivityType('');
        }

        setFormData(prev => {
            const newData = { ...prev, [name]: value };
            if (name === 'operatingUnit') {
                const mappedRegion = ouToRegionMap[value] || 'All';
                setIpoRegionFilter(mappedRegion);
                newData.participatingIpos = [];
            }
            if (name === 'date' && conductType === 'Single') newData.endDate = value;
            if (name === 'actualDate' && conductType === 'Single') newData.actualEndDate = value;
            return newData;
        });
        
        if (missingFields.includes(name)) {
            setMissingFields(prev => prev.filter(f => f !== name));
        }
    };

    const handleNumericChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        const numValue = parseFloat(value) || 0;
        
        setFormData(prev => {
            const newData = { ...prev, [name]: numValue };
            
            if (name === 'fundingYear') {
                newData.expenses = newData.expenses.map(exp => {
                    const updatedExp = { ...exp };
                    if (updatedExp.obligationMonth) {
                        const month = getMonthFromDateStr(updatedExp.obligationMonth);
                        if (month !== '') {
                            updatedExp.obligationMonth = `${numValue}-${String(parseInt(month) + 1).padStart(2, '0')}-01`;
                        }
                    }
                    if (updatedExp.disbursementMonth) {
                        const month = getMonthFromDateStr(updatedExp.disbursementMonth);
                        if (month !== '') {
                            updatedExp.disbursementMonth = `${numValue}-${String(parseInt(month) + 1).padStart(2, '0')}-01`;
                        }
                    }
                    if (updatedExp.actualObligationDate) {
                        const month = getMonthFromDateStr(updatedExp.actualObligationDate);
                        if (month !== '') {
                            updatedExp.actualObligationDate = `${numValue}-${String(parseInt(month) + 1).padStart(2, '0')}-01`;
                        }
                    }
                    if (updatedExp.actualDisbursementDate) {
                        const month = getMonthFromDateStr(updatedExp.actualDisbursementDate);
                        if (month !== '') {
                            updatedExp.actualDisbursementDate = `${numValue}-${String(parseInt(month) + 1).padStart(2, '0')}-01`;
                        }
                    }
                    return updatedExp;
                });
            }
            
            return newData;
        });
    };

    const handleActivityTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedName = e.target.value;
        setSelectedActivityType(selectedName);
        const ref = referenceActivities?.find(ra => ra.activity_name === selectedName && ra.component === formData.component);
        const type = ref?.type || 'Activity'; 
        
        if (missingFields.includes('type')) {
            setMissingFields(prev => prev.filter(f => f !== 'type'));
        }

        setFormData(prev => ({ 
            ...prev, 
            name: type === 'Training' && (!activity || activity.type !== 'Training') ? '' : selectedName, 
            type: type 
        }));
    };

    const handleConductTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value as any;
        setConductType(val);
        setFormData(prev => {
             if (val === 'Single') return { ...prev, endDate: prev.date, actualEndDate: prev.actualDate };
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
        
        if (name === 'date' && !currentRepeatingEntry.isMultiDay) {
             setCurrentRepeatingEntry(prev => ({ ...prev, endDate: value }));
        }
    };
    
    const handleRepeatingIpoSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedOptions = Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value);
        setCurrentRepeatingEntry(prev => ({ ...prev, participatingIpos: selectedOptions }));
    };

    const handleAddRepeatingEntry = () => {
        if (!currentRepeatingEntry.date) {
            alert("Date is required.");
            return;
        }
        const newEntry = { ...currentRepeatingEntry, id: Date.now() };
        setRepeatingEntries(prev => [...prev, newEntry]);
        setCurrentRepeatingEntry({ id: 0, date: '', endDate: '', isMultiDay: false, participantsMale: 0, participantsFemale: 0, participatingIpos: [] });
    };

    // Budget Handlers
    const availableUacsCodes = useMemo(() => {
        let codes: { code: string, desc: string }[] = [];
        if (currentExpense.expenseParticular) {
            const ot = currentExpense.objectType;
            const ep = currentExpense.expenseParticular;
            if (uacsCodes[ot] && uacsCodes[ot][ep]) {
                Object.entries(uacsCodes[ot][ep]).forEach(([code, desc]) => {
                    codes.push({ code, desc: desc as string });
                });
            }
        } else {
            Object.entries(uacsCodes).forEach(([ot, eps]) => {
                Object.entries(eps).forEach(([ep, codesObj]) => {
                    Object.entries(codesObj as Record<string, string>).forEach(([code, desc]) => {
                        codes.push({ code, desc });
                    });
                });
            });
        }
        return codes;
    }, [currentExpense.expenseParticular, currentExpense.objectType, uacsCodes]);

    const getUacsDescription = (ot: string, ep: string, code: string) => {
        if (uacsCodes[ot] && uacsCodes[ot][ep] && uacsCodes[ot][ep][code]) {
            return uacsCodes[ot][ep][code];
        }
        return '';
    };

    const handleExpenseChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'objectType') {
            setCurrentExpense(prev => ({ ...prev, objectType: value as ObjectType, expenseParticular: '', uacsCode: '' }));
        } else if (name === 'expenseParticular') {
            setCurrentExpense(prev => ({ ...prev, expenseParticular: value, uacsCode: '' }));
        } else if (name === 'uacsCode') {
            let foundOt = currentExpense.objectType;
            let foundEp = currentExpense.expenseParticular;
            
            let isMatch = false;
            if (foundEp && uacsCodes[foundOt] && uacsCodes[foundOt][foundEp] && uacsCodes[foundOt][foundEp][value]) {
                isMatch = true;
            }

            if (!isMatch) {
                for (const ot in uacsCodes) {
                    for (const ep in uacsCodes[ot]) {
                        if (uacsCodes[ot][ep][value]) {
                            foundOt = ot as ObjectType;
                            foundEp = ep;
                            break;
                        }
                    }
                }
            }
            
            setCurrentExpense(prev => ({ ...prev, uacsCode: value, objectType: foundOt, expenseParticular: foundEp }));
        } else {
            setCurrentExpense(prev => ({...prev, [name]: value}));
        }
    };

    const handleEditExpense = (expense: ActivityExpense) => {
        setEditingExpenseId(expense.id);
        setCurrentExpense({
            objectType: expense.objectType,
            expenseParticular: expense.expenseParticular,
            uacsCode: expense.uacsCode,
            obligationMonth: expense.obligationMonth,
            disbursementMonth: expense.disbursementMonth,
            amount: String(expense.amount)
        });
    }

    const handleCancelEditExpense = () => {
        setEditingExpenseId(null);
        setCurrentExpense({ objectType: 'MOOE', expenseParticular: '', uacsCode: '', obligationMonth: '', disbursementMonth: '', amount: '' });
    }

    const handleAddExpense = () => {
        if (!currentExpense.amount || !currentExpense.obligationMonth || !currentExpense.disbursementMonth || !currentExpense.uacsCode) {
            alert('Please fill out all expense fields (UACS, Dates, Amount).'); return;
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
        
        if ((mode === 'create' && activeTab === 'details') || mode === 'details') {
            const requiredFields = ['component', 'type', 'date', 'location'];
            if (formData.type === 'Training') requiredFields.push('name');
            if (conductType === 'Multi-day') requiredFields.push('endDate');

            const missing = requiredFields.filter(field => !formData[field as keyof Activity]);
            if (missing.length > 0) {
                setMissingFields(missing);
                alert('Please fill out all required fields before proceeding.');
                return;
            }
        }

        let activitiesToSave: Activity[] = [];
        const currentYear = new Date().getFullYear();
        const prefix = formData.type === 'Training' ? 'TRN' : 'ACT';

        if (mode === 'create') {
             if (conductType === 'Repeating') {
                activitiesToSave = repeatingEntries.map((entry, idx) => ({
                    ...formData,
                    uid: `${prefix}-${currentYear}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}-${idx}`,
                    date: entry.date,
                    endDate: entry.endDate || entry.date, 
                    participantsMale: entry.participantsMale,
                    participantsFemale: entry.participantsFemale,
                    participatingIpos: entry.participatingIpos,
                    expenses: formData.expenses.map((exp, eIdx) => ({ ...exp, id: Date.now() + Math.random() + eIdx })), 
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
            // Auto-complete logic for Accomplishment Mode if actual date is present
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
                for (let i = 0; i < activitiesToSave.length; i++) {
                    const act = activitiesToSave[i];
                    const { id, participating_ipo_ids, ...payload } = act;
                    
                    // Sanitize date fields: convert empty strings to null
                    const sanitizedPayload: any = { ...payload };
                    const dateFields = ['date', 'endDate', 'newTargetDate', 'actualDate', 'actualEndDate'];
                    dateFields.forEach(field => {
                        if (sanitizedPayload[field] === '') {
                            sanitizedPayload[field] = null;
                        }
                    });
                    if (sanitizedPayload.expenses) {
                        sanitizedPayload.expenses = sanitizedPayload.expenses.map((exp: any) => {
                            const sanitizedExp = { ...exp };
                            ['actualObligationDate', 'actualDisbursementDate'].forEach(field => {
                                if (sanitizedExp[field] === '') {
                                    sanitizedExp[field] = null;
                                }
                            });
                            return sanitizedExp;
                        });
                    }

                    if (mode === 'create') {
                         const { data, error } = await supabase.from('activities').insert([sanitizedPayload]).select();
                         if (error) throw error;
                         if (data && data.length > 0) {
                             activitiesToSave[i].id = data[0].id;
                             logAction(`Created ${act.type}`, act.name, undefined, act.type, String(data[0].id));
                         }
                    } else {
                         const { error } = await supabase.from('activities').update(sanitizedPayload).eq('id', activity!.id);
                         if (error) throw error;
                         logAction(`Updated ${act.type}`, act.name, undefined, act.type, String(activity!.id));
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
        } else {
            if (mode === 'create') {
                for (let i = 0; i < activitiesToSave.length; i++) {
                    activitiesToSave[i].id = Date.now() + i;
                }
            }
        }
        
        for (const act of activitiesToSave) {
            onUpdateActivity(act);
        }
        if (mode === 'create') alert(`Saved ${activitiesToSave.length} activities.`);
        onBack();
    };

    const TabButton = ({ name, label }: { name: any, label: string }) => (
        <button type="button" onClick={() => setActiveTab(name)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === name ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{label}</button>
    );

    return (
        <div className="space-y-6 animate-fadeIn pb-20">
             <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white">
                    {mode === 'create' ? 'Create New Activity' : `Edit ${mode === 'expenses' ? 'Expenses' : mode === 'accomplishment' ? 'Accomplishment' : 'Details'}: ${formData.name}`}
                </h1>
                <button onClick={onBack} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 whitespace-nowrap">Back to List</button>
            </div>

            <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-xl shadow-lg">
                
                {/* Mode: Create - Tabs */}
                {mode === 'create' && (
                    <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                        <div className="flex gap-4 overflow-x-auto">
                            <button type="button" onClick={() => setActiveTab('details')} className={`pb-2 border-b-2 text-sm font-medium transition-colors ${activeTab === 'details' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Basic Info</button>
                            <button type="button" onClick={() => setActiveTab('expenses')} className={`pb-2 border-b-2 text-sm font-medium transition-colors ${activeTab === 'expenses' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Expenses</button>
                        </div>
                    </div>
                )}

                {/* CREATE / DETAILS MODE */}
                {((mode === 'create' && activeTab === 'details') || mode === 'details') && (
                    <div className="space-y-6">
                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md" disabled={isDetailsLocked}>
                            <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Basic Information</legend>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium">Status</label>
                                    <select name="status" value={formData.status} onChange={handleInputChange} className={commonInputClasses} disabled={mode === 'create'}>
                                        {availableStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">Operating Unit</label>
                                    <select 
                                        name="operatingUnit" 
                                        value={formData.operatingUnit || ''} 
                                        onChange={handleInputChange} 
                                        className={commonInputClasses} 
                                        disabled={!isAdmin}
                                        title={!isAdmin ? "Only Administrators can edit the Operating Unit" : ""}
                                    >
                                        <option value="">Select Operating Unit</option>
                                        {operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">Component <span className="text-red-500">*</span></label>
                                    <select name="component" value={formData.component} onChange={handleInputChange} className={`${commonInputClasses} ${missingFields.includes('component') ? 'border-red-500 ring-1 ring-red-500' : ''}`}>
                                        {otherActivityComponents.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium">Activity Type <span className="text-red-500">*</span></label>
                                    <select value={selectedActivityType} onChange={handleActivityTypeChange} className={`${commonInputClasses} ${missingFields.includes('type') ? 'border-red-500 ring-1 ring-red-500' : ''}`}>
                                        <option value="">Select Activity</option>
                                        {activityOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                </div>
                                {formData.type === 'Training' && (
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium">Specific Title <span className="text-red-500">*</span></label>
                                        <input type="text" name="name" value={formData.name} onChange={handleInputChange} className={`${commonInputClasses} ${missingFields.includes('name') ? 'border-red-500 ring-1 ring-red-500' : ''}`} required />
                                    </div>
                                )}
                                
                                {(mode === 'create' || mode === 'details') && (
                                    <div>
                                        <label className="block text-sm font-medium">Conduct Type</label>
                                        <select value={conductType} onChange={handleConductTypeChange} className={commonInputClasses} disabled={isDetailsLocked}>
                                            <option value="Single">Single Day</option>
                                            <option value="Multi-day">Multi-Day</option>
                                            {mode === 'create' && <option value="Repeating">Repeating Entries</option>}
                                        </select>
                                    </div>
                                )}

                                {conductType !== 'Repeating' && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-medium">Start Date <span className="text-red-500">*</span></label>
                                            <input type="date" name="date" value={formData.date} onChange={handleInputChange} required className={`${commonInputClasses} ${missingFields.includes('date') ? 'border-red-500 ring-1 ring-red-500' : ''}`} />
                                        </div>
                                        {conductType === 'Multi-day' && (
                                            <div>
                                                <label className="block text-sm font-medium">End Date <span className="text-red-500">*</span></label>
                                                <input type="date" name="endDate" value={formData.endDate} onChange={handleInputChange} required className={`${commonInputClasses} ${missingFields.includes('endDate') ? 'border-red-500 ring-1 ring-red-500' : ''}`} />
                                            </div>
                                        )}
                                    </>
                                )}

                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium">Location <span className="text-red-500">*</span></label>
                                    <div className={missingFields.includes('location') ? 'border-red-500 ring-1 ring-red-500 rounded-md' : ''}>
                                        <LocationPicker value={formData.location} onChange={(val) => {
                                            setFormData(prev => ({...prev, location: val}));
                                            if (missingFields.includes('location')) {
                                                setMissingFields(prev => prev.filter(f => f !== 'location'));
                                            }
                                        }} />
                                    </div>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium">Description</label>
                                    <textarea name="description" value={formData.description} onChange={handleInputChange} className={commonInputClasses} rows={3} />
                                </div>
                            </div>
                        </fieldset>
                        
                        {/* Participants Section */}
                        {conductType !== 'Repeating' && (
                            <>
                                <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md" disabled={isDetailsLocked}>
                                    <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Participants</legend>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div><label className="block text-sm font-medium">Male</label><input type="number" name="participantsMale" value={formData.participantsMale} onChange={handleNumericChange} className={commonInputClasses} /></div>
                                        <div><label className="block text-sm font-medium">Female</label><input type="number" name="participantsFemale" value={formData.participantsFemale} onChange={handleNumericChange} className={commonInputClasses} /></div>
                                        
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium mb-1">Filter IPOs by Region</label>
                                            <select value={ipoRegionFilter} onChange={(e) => setIpoRegionFilter(e.target.value)} className={commonInputClasses}>
                                                <option value="All">All Regions</option>
                                                {philippineRegions.map(r => <option key={r} value={r}>{r}</option>)}
                                            </select>
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium mb-1">Participating IPOs</label>
                                            <select multiple value={formData.participatingIpos} onChange={(e) => setFormData(prev => ({ ...prev, participatingIpos: Array.from(e.target.selectedOptions, (o: HTMLOptionElement) => o.value) }))} className={`${commonInputClasses} h-32`}>
                                                {filteredIpos.map(i => <option key={i.id} value={i.name}>{i.name}</option>)}
                                            </select>
                                            <p className="text-xs text-gray-500 mt-1">Hold Ctrl (Cmd on Mac) to select multiple IPOs.</p>
                                        </div>
                                    </div>
                                </fieldset>

                                <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md" disabled={isDetailsLocked}>
                                    <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Funding</legend>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div><label className="block text-sm font-medium">Fund Year</label><input type="number" name="fundingYear" value={formData.fundingYear} onChange={handleNumericChange} className={commonInputClasses} /></div>
                                        <div><label className="block text-sm font-medium">Fund Type</label><select name="fundType" value={formData.fundType} onChange={handleInputChange} className={commonInputClasses}>{fundTypes.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                                        <div>
                                            <label className="block text-sm font-medium">Tier</label>
                                            <select name="tier" value={formData.tier} onChange={handleInputChange} className={commonInputClasses}>
                                                <option value="">Select Tier</option>
                                                {tiers.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </fieldset>
                            </>
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
                                    
                                    <div className="md:col-span-4">
                                         <label className="block text-xs font-medium mb-1">Filter IPOs by Region</label>
                                         <select value={ipoRegionFilter} onChange={(e) => setIpoRegionFilter(e.target.value)} className={commonInputClasses}>
                                            <option value="All">All Regions</option>
                                            {philippineRegions.map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                    </div>

                                    <div className="md:col-span-4">
                                        <label className="block text-xs font-medium mb-1">IPOs</label>
                                        <select multiple value={currentRepeatingEntry.participatingIpos} onChange={handleRepeatingIpoSelect} className={`${commonInputClasses} h-20`}>{filteredIpos.map(i => <option key={i.id} value={i.name}>{i.name}</option>)}</select>
                                    </div>
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

                {/* EXPENSES MODE (and Create Tab) */}
                {((mode === 'create' && activeTab === 'expenses') || mode === 'expenses') && (
                     <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md mt-6" disabled={isDetailsLocked}>
                        <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Expenses</legend>
                        <div className="mb-4 space-y-2">
                            {formData.expenses.map((exp, idx) => (
                                <div key={idx} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded">
                                    <span className="text-sm">
                                        <strong>{exp.expenseParticular}</strong> ({exp.uacsCode}) - {exp.amount.toLocaleString()} 
                                        {getUacsDescription(exp.objectType, exp.expenseParticular, exp.uacsCode) && (
                                            <span className="block text-xs text-gray-500">{getUacsDescription(exp.objectType, exp.expenseParticular, exp.uacsCode)}</span>
                                        )}
                                        <span className="block text-xs text-gray-500 mt-1">Ob: {exp.obligationMonth} | Disb: {exp.disbursementMonth}</span>
                                    </span>
                                    {!isDetailsLocked && (
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => handleEditExpense(exp)} className="text-blue-500 text-xs font-bold">Edit</button>
                                            <button type="button" onClick={() => setFormData(prev => ({...prev, expenses: prev.expenses.filter((_, i) => i !== idx)}))} className="text-red-500 text-xs font-bold">Remove</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        
                        {!isDetailsLocked && (
                            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded border border-gray-200 dark:border-gray-700">
                                <h4 className="text-xs font-bold uppercase text-gray-500 mb-2">{editingExpenseId !== null ? 'Update Expense' : 'Add New Expense'}</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                                    {/* Row 1: UACS Selection */}
                                    <div><label className="block text-xs font-medium">Object Type</label><select name="objectType" value={currentExpense.objectType} onChange={handleExpenseChange} className={commonInputClasses}>{objectTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                    <div><label className="block text-xs font-medium">Particular</label><select name="expenseParticular" value={currentExpense.expenseParticular} onChange={handleExpenseChange} className={commonInputClasses}><option value="">Select</option>{uacsCodes[currentExpense.objectType] && Object.keys(uacsCodes[currentExpense.objectType]).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                                    <div>
                                        <label className="block text-xs font-medium">UACS Code</label>
                                        <input 
                                            type="text"
                                            name="uacsCode" 
                                            value={currentExpense.uacsCode} 
                                            onChange={handleExpenseChange} 
                                            list="uacs-codes-list-activity-edit"
                                            placeholder="Search UACS..."
                                            className={commonInputClasses}
                                        />
                                        <datalist id="uacs-codes-list-activity-edit">
                                            {availableUacsCodes.map((item) => (
                                                <option key={item.code} value={item.code}>{item.code} - {item.desc}</option>
                                            ))}
                                        </datalist>
                                        {currentExpense.uacsCode && availableUacsCodes.find(c => c.code === currentExpense.uacsCode)?.desc && (
                                            <p className="text-xs text-gray-500 mt-1">{availableUacsCodes.find(c => c.code === currentExpense.uacsCode)?.desc}</p>
                                        )}
                                    </div>
                                    
                                    {/* Row 2: Financial Details */}
                                    <div>
                                        <label className="block text-xs font-medium">Obligation Month</label>
                                        <select 
                                            value={getMonthFromDateStr(currentExpense.obligationMonth)} 
                                            onChange={(e) => updateExpenseDateFromMonth('obligationMonth', e.target.value)} 
                                            className={commonInputClasses}
                                        >
                                            <option value="">Select Month</option>
                                            {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium">Disbursement Month</label>
                                        <select 
                                            value={getMonthFromDateStr(currentExpense.disbursementMonth)} 
                                            onChange={(e) => updateExpenseDateFromMonth('disbursementMonth', e.target.value)} 
                                            className={commonInputClasses}
                                        >
                                            <option value="">Select Month</option>
                                            {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                                        </select>
                                    </div>
                                    <div><label className="block text-xs font-medium">Amount</label><input type="number" name="amount" value={currentExpense.amount} onChange={handleExpenseChange} className={commonInputClasses} /></div>
                                
                                    <div className="md:col-span-3 flex gap-2">
                                        {editingExpenseId !== null && (
                                            <button type="button" onClick={handleCancelEditExpense} className="flex-1 py-2 bg-gray-400 text-white rounded text-sm hover:bg-gray-500">Cancel</button>
                                        )}
                                        <button type="button" onClick={handleAddExpense} className="flex-1 py-2 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700">
                                            {editingExpenseId !== null ? 'Update Expense' : 'Add Expense'}
                                        </button>
                                    </div>
                                </div>
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
                                    <p className="font-semibold text-sm mb-2">
                                        {exp.expenseParticular} ({exp.uacsCode})
                                        {getUacsDescription(exp.objectType, exp.expenseParticular, exp.uacsCode) && (
                                            <span className="block text-xs text-gray-500 font-normal">{getUacsDescription(exp.objectType, exp.expenseParticular, exp.uacsCode)}</span>
                                        )}
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Actual Obligation Group */}
                                        <div className="space-y-2 p-3 bg-blue-50 dark:bg-blue-900/10 rounded border border-blue-100 dark:border-blue-800">
                                            <p className="text-xs font-bold text-blue-700 uppercase">Obligation</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="block text-xs text-gray-500">Date (Month)</label>
                                                    <select 
                                                        value={getMonthFromDateStr(exp.actualObligationDate)} 
                                                        onChange={(e) => updateActualDateFromMonth(exp.id, 'actualObligationDate', e.target.value)} 
                                                        disabled={isFieldLocked('actualObligationDate', initialActivity.expenses.find(ie => ie.id === exp.id))}
                                                        className={commonInputClasses}
                                                    >
                                                        <option value="">Select</option>
                                                        {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-500">Amount</label>
                                                    <input 
                                                        type="number" 
                                                        value={exp.actualObligationAmount || ''} 
                                                        onChange={(e) => handleExpenseAccomplishmentChange(exp.id, 'actualObligationAmount', parseFloat(e.target.value))}
                                                        disabled={isFieldLocked('actualObligationAmount', initialActivity.expenses.find(ie => ie.id === exp.id))}
                                                        className={commonInputClasses} 
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actual Disbursement Group */}
                                        <div className="space-y-2 p-3 bg-green-50 dark:bg-green-900/10 rounded border border-green-100 dark:border-green-800">
                                            <p className="text-xs font-bold text-green-700 uppercase">Disbursement</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="block text-xs text-gray-500">Date (Month)</label>
                                                    <select 
                                                        value={getMonthFromDateStr(exp.actualDisbursementDate)} 
                                                        onChange={(e) => updateActualDateFromMonth(exp.id, 'actualDisbursementDate', e.target.value)} 
                                                        disabled={isFieldLocked('actualDisbursementDate', initialActivity.expenses.find(ie => ie.id === exp.id))}
                                                        className={commonInputClasses}
                                                    >
                                                        <option value="">Select</option>
                                                        {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-500">Amount</label>
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
                                    </div>
                                </div>
                            ))}
                        </fieldset>

                        {/* Gender and Inclusivity Section */}
                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Gender and Inclusivity</legend>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300">PWD</label><input type="number" name="actualPWD" value={formData.actualPWD || ''} onChange={handleNumericChange} className={commonInputClasses} disabled={isFieldLocked('actualPWD')} placeholder="0" /></div>
                                <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Muslim</label><input type="number" name="actualMuslim" value={formData.actualMuslim || ''} onChange={handleNumericChange} className={commonInputClasses} disabled={isFieldLocked('actualMuslim')} placeholder="0" /></div>
                                <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300">LGBTQ+</label><input type="number" name="actualLGBTQ" value={formData.actualLGBTQ || ''} onChange={handleNumericChange} className={commonInputClasses} disabled={isFieldLocked('actualLGBTQ')} placeholder="0" /></div>
                                <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Solo Parents</label><input type="number" name="actualSoloParent" value={formData.actualSoloParent || ''} onChange={handleNumericChange} className={commonInputClasses} disabled={isFieldLocked('actualSoloParent')} placeholder="0" /></div>
                                <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Senior</label><input type="number" name="actualSenior" value={formData.actualSenior || ''} onChange={handleNumericChange} className={commonInputClasses} disabled={isFieldLocked('actualSenior')} placeholder="0" /></div>
                                <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Youth</label><input type="number" name="actualYouth" value={formData.actualYouth || ''} onChange={handleNumericChange} className={commonInputClasses} disabled={isFieldLocked('actualYouth')} placeholder="0" /></div>
                            </div>
                        </fieldset>
                     </div>
                )}

                <div className="flex justify-end gap-3 pt-6 border-t mt-6">
                    <button type="button" onClick={onBack} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white rounded-md font-bold hover:bg-gray-300 dark:hover:bg-gray-600 shadow-sm">
                        Cancel
                    </button>
                    <button type="submit" className="px-6 py-2 bg-emerald-600 text-white rounded-md font-bold hover:bg-emerald-700 shadow-md">
                        {mode === 'create' ? 'Create Activity' : 'Save Changes'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default ActivityEdit;
