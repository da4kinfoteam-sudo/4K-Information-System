// Author: 4K 
import React, { useState, useEffect, useMemo } from 'react';
import { MonthYearPicker } from '../ui/MonthYearPicker';
import { OtherProgramExpense, operatingUnits, fundTypes, tiers, objectTypes, ObjectType } from '../../constants';
import { formatCurrency } from '../reports/ReportUtils';
import { useAuth } from '../../contexts/AuthContext';
import { getUserPermissions } from '../mainfunctions/TableHooks';
import { supabase } from '../../supabaseClient';

interface OtherExpenseDetailProps {
    item: OtherProgramExpense;
    onBack: () => void;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    onUpdate: (item: OtherProgramExpense) => void;
}

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm";

const DetailItem: React.FC<{ label: string; value?: string | number | React.ReactNode }> = ({ label, value }) => (
    <div>
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{value || 'N/A'}</dd>
    </div>
);

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const OtherExpenseDetail: React.FC<OtherExpenseDetailProps> = ({ item, onBack, uacsCodes, onUpdate }) => {
    const { currentUser } = useAuth();
    const { canEdit } = getUserPermissions(currentUser);
    
    const [editMode, setEditMode] = useState<'none' | 'details' | 'accomplishment'>('none');
    const [formData, setFormData] = useState<OtherProgramExpense>(item);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    
    // For selects
    const [selectedObjectType, setSelectedObjectType] = useState<ObjectType>('MOOE');
    const [selectedParticular, setSelectedParticular] = useState('');

    const availableUacsCodes = useMemo(() => {
        let codes: { code: string, desc: string }[] = [];
        if (selectedParticular) {
            const ot = selectedObjectType;
            const ep = selectedParticular;
            if (uacsCodes[ot] && uacsCodes[ot][ep]) {
                Object.entries(uacsCodes[ot][ep]).forEach(([code, desc]) => {
                    codes.push({ code, desc: desc as string });
                });
            }
        } else {
             if (uacsCodes[selectedObjectType]) {
                 Object.entries(uacsCodes[selectedObjectType]).forEach(([ep, codesObj]) => {
                     Object.entries(codesObj).forEach(([code, desc]) => {
                         codes.push({ code, desc });
                     });
                 });
             }
        }
        return codes;
    }, [selectedParticular, selectedObjectType, uacsCodes]);

    const selectedUacsDesc = useMemo(() => {
        return availableUacsCodes.find(c => c.code === formData.uacsCode)?.desc || '';
    }, [formData.uacsCode, availableUacsCodes]);

    // Reset form data and init selects when switching edit modes or items
    useEffect(() => {
        setFormData(item);
        
        if (editMode === 'details') {
            let foundType: ObjectType = 'MOOE'; 
            let foundParticular = '';
            outerLoop: 
            for (const type of objectTypes) { 
                if(uacsCodes[type]) { 
                    for (const part in uacsCodes[type]) { 
                        if (uacsCodes[type][part].hasOwnProperty(item.uacsCode)) { 
                            foundType = type; 
                            foundParticular = part; 
                            break outerLoop; 
                        } 
                    } 
                } 
            }
            setSelectedObjectType(foundType); 
            setSelectedParticular(foundParticular);
        }
    }, [item, editMode, uacsCodes]);

    // Recalculate Totals when monthly fields change
    useEffect(() => {
        if (editMode === 'details') {
            // @ts-ignore
            const total = months.reduce((sum, m) => sum + (Number(formData[`disbursement${m}`]) || 0), 0);
            // Optional: Sync obligatedAmount with schedule if strictly enforced
        } else if (editMode === 'accomplishment') {
            // @ts-ignore
            const total = months.reduce((sum, m) => sum + (Number(formData[`actualDisbursement${m}`]) || 0), 0);
            if (total !== formData.actualDisbursementAmount) setFormData(prev => ({ ...prev, actualDisbursementAmount: total }));
        }
    }, [
        ...months.map(m => (formData as any)[`disbursement${m}`]),
        ...months.map(m => (formData as any)[`actualDisbursement${m}`]),
        editMode
    ]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        
        if (name === 'uacsCode') {
            setFormData(prev => ({ ...prev, [name]: value }));
            
            // Auto-select particular if a valid code is entered
            if (value && uacsCodes[selectedObjectType]) {
                const trimmedValue = value.trim();
                let foundParticular = '';
                
                // First check if the code exists in the CURRENT selected particular (optimization)
                if (selectedParticular && uacsCodes[selectedObjectType][selectedParticular] && uacsCodes[selectedObjectType][selectedParticular][trimmedValue]) {
                    foundParticular = selectedParticular;
                } else {
                    // Search all particulars
                    for (const [particular, codes] of Object.entries(uacsCodes[selectedObjectType])) {
                        if (codes[trimmedValue]) {
                            foundParticular = particular;
                            break;
                        }
                    }
                }

                if (foundParticular && foundParticular !== selectedParticular) {
                    setSelectedParticular(foundParticular);
                }
            }
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const getInputClasses = (fieldName: string) => {
        const baseClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm transition-all";
        if (validationErrors.includes(fieldName)) {
            return `${baseClasses} border-red-500 ring-2 ring-red-200 dark:ring-red-900/30`;
        }
        return `${baseClasses} border-gray-300 dark:border-gray-600`;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (editMode === 'details') {
            const requiredFields = [
                { key: 'operatingUnit', label: 'Operating Unit' },
                { key: 'status', label: 'Status' },
                { key: 'uacsCode', label: 'UACS Code' },
                { key: 'particulars', label: 'Particular' },
                { key: 'obligationDate', label: 'Obligation Date' },
                { key: 'amount', label: 'Target Allocation Amount' }
            ];

            const errors: string[] = [];
            const missingLabels: string[] = [];

            requiredFields.forEach(field => {
                if (!formData[field.key as keyof OtherProgramExpense]) {
                    errors.push(field.key);
                    missingLabels.push(field.label);
                }
            });

            if (errors.length > 0) {
                setValidationErrors(errors);
                alert(`Please fill in the following required fields:\n- ${missingLabels.join('\n- ')}`);
                return;
            }
        }

        setValidationErrors([]);
        
        const updatedItem: any = {
            ...formData,
            fundYear: Number(formData.fundYear),
            amount: Number(formData.amount),
            obligatedAmount: Number(formData.amount), // Sync obligatedAmount with amount
            actualAmount: Number(formData.actualAmount),
            actualObligationAmount: Number(formData.actualObligationAmount),
            actualDisbursementAmount: Number(formData.actualDisbursementAmount),
            updated_at: new Date().toISOString()
        };

        // Ensure month fields are numbers
        months.forEach(m => {
            updatedItem[`disbursement${m}`] = Number((formData as any)[`disbursement${m}`]);
            updatedItem[`actualDisbursement${m}`] = Number((formData as any)[`actualDisbursement${m}`]);
        });

        if (supabase) {
            // Exclude ID from payload to avoid "column id can only be updated to DEFAULT" error
            const { id, ...payload } = updatedItem;
            const { error } = await supabase.from('other_program_expenses').update(payload).eq('id', item.id);
            if (error) {
                alert('Failed to update: ' + error.message);
                return;
            }
        }
        
        onUpdate(updatedItem as OtherProgramExpense);
        setEditMode('none');
    };

    if (editMode === 'details') {
        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Editing Details: {item.particulars}</h1>
                    <button onClick={() => { setEditMode('none'); setValidationErrors([]); }} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Cancel Editing</button>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
                    <form onSubmit={handleSubmit} className="space-y-8">
                        {/* Section 1: Basic Information */}
                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-medium text-emerald-700 dark:text-emerald-400">Basic Information</legend>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Operating Unit <span className="text-red-500">*</span></label>
                                    <select 
                                        name="operatingUnit" 
                                        value={formData.operatingUnit} 
                                        onChange={handleInputChange} 
                                        className={`${getInputClasses('operatingUnit')} disabled:bg-gray-100 disabled:cursor-not-allowed`} 
                                        disabled
                                    >
                                        <option value="">Select OU</option>
                                        {operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status <span className="text-red-500">*</span></label>
                                    <select name="status" value={formData.status} onChange={handleInputChange} className={getInputClasses('status')}>
                                        <option value="Proposed">Proposed</option>
                                        <option value="Ongoing">Ongoing</option>
                                        <option value="Completed">Completed</option>
                                        <option value="Cancelled">Cancelled</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Particular <span className="text-red-500">*</span></label>
                                    <input type="text" name="particulars" value={formData.particulars} onChange={handleInputChange} placeholder="Enter particulars" className={getInputClasses('particulars')} />
                                </div>
                            </div>
                        </fieldset>

                        {/* Section 2: Funding */}
                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-medium text-emerald-700 dark:text-emerald-400">Funding</legend>
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fund Year <span className="text-red-500">*</span></label>
                                        <input type="number" name="fundYear" value={formData.fundYear} onChange={handleInputChange} className={getInputClasses('fundYear')} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fund Type <span className="text-red-500">*</span></label>
                                        <select name="fundType" value={formData.fundType} onChange={handleInputChange} className={commonInputClasses}>
                                            {fundTypes.map(f => <option key={f} value={f}>{f}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tier <span className="text-red-500">*</span></label>
                                        <select name="tier" value={formData.tier} onChange={handleInputChange} className={commonInputClasses}>
                                            {tiers.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* UACS Row */}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Object Type <span className="text-red-500">*</span></label>
                                        <select 
                                            value={selectedObjectType} 
                                            onChange={e => { setSelectedObjectType(e.target.value as ObjectType); setSelectedParticular(''); setFormData(prev => ({...prev, uacsCode: ''})); }} 
                                            className={commonInputClasses}
                                        >
                                            {objectTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Particular <span className="text-red-500">*</span></label>
                                        <select 
                                            value={selectedParticular} 
                                            onChange={e => { 
                                                setSelectedParticular(e.target.value); 
                                                const ot = selectedObjectType;
                                                const ep = e.target.value;
                                                if (uacsCodes[ot] && uacsCodes[ot][ep]) {
                                                    const firstCode = Object.keys(uacsCodes[ot][ep])[0];
                                                    setFormData(prev => ({...prev, uacsCode: firstCode}));
                                                } else {
                                                    setFormData(prev => ({...prev, uacsCode: ''}));
                                                }
                                            }} 
                                            className={commonInputClasses}
                                        >
                                            <option value="">Select Particular</option>
                                            {uacsCodes[selectedObjectType] && Object.keys(uacsCodes[selectedObjectType]).map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                    </div>
                                    <div className="relative">
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">UACS Code <span className="text-red-500">*</span></label>
                                        <div className="relative">
                                            <input 
                                                type="text" 
                                                name="uacsCode" 
                                                value={formData.uacsCode} 
                                                onChange={handleInputChange} 
                                                list="uacs-codes-list-detail"
                                                className={`${getInputClasses('uacsCode')} pr-10`} 
                                            />
                                            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                                                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </div>
                                        </div>
                                        <datalist id="uacs-codes-list-detail">
                                            {availableUacsCodes.map((item) => (
                                                <option key={item.code} value={item.code}>{item.code} - {item.desc}</option>
                                            ))}
                                        </datalist>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                                        <input 
                                            type="text" 
                                            value={selectedUacsDesc} 
                                            readOnly 
                                            className={`${commonInputClasses} bg-gray-50 dark:bg-gray-800/50 cursor-not-allowed font-normal`} 
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Obligation Date <span className="text-red-500">*</span></label>
                                        <MonthYearPicker 
                                            value={formData.obligationDate} 
                                            onChange={(val) => {
                                                setFormData(prev => ({...prev, obligationDate: val}));
                                                if (validationErrors.includes('obligationDate')) {
                                                    setValidationErrors(prev => prev.filter(f => f !== 'obligationDate'));
                                                }
                                            }} 
                                            className={validationErrors.includes('obligationDate') ? 'border-red-500 ring-red-500' : ''}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Allocation Amount <span className="text-red-500">*</span></label>
                                        <input type="number" name="amount" value={formData.amount} onChange={handleInputChange} placeholder="0.00" className={getInputClasses('amount')} />
                                    </div>
                                </div>

                                <div className="mt-8">
                                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 uppercase tracking-wider">Monthly Disbursement Schedule <span className="text-red-500">*</span></h4>
                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                        {months.map(month => (
                                            <div key={month}>
                                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{month}</label>
                                                <input 
                                                    type="number" 
                                                    name={`disbursement${month}`} 
                                                    value={(formData as any)[`disbursement${month}`] || 0} 
                                                    onChange={handleInputChange} 
                                                    className={getInputClasses(`disbursement${month}`)} 
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </fieldset>

                        <div className="flex justify-end pt-6 border-t border-gray-100 dark:border-gray-700">
                            <button type="submit" className="px-6 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors font-medium shadow-sm">
                                Save
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    if (editMode === 'accomplishment') {
        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Editing Accomplishment: {item.particulars}</h1>
                    <button onClick={() => setEditMode('none')} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel Editing</button>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Accomplishment Data</legend>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Obligation Date</label><input type="date" name="actualObligationDate" value={formData.actualObligationDate} onChange={handleInputChange} className={commonInputClasses} /></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Obligation Amount</label><input type="number" name="actualObligationAmount" value={formData.actualObligationAmount} onChange={handleInputChange} className={commonInputClasses} /></div>
                            </div>
                        </fieldset>

                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Actual Monthly Disbursement</legend>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                {months.map(month => (
                                    <div key={`actual-${month}`}><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{month}</label><input type="number" name={`actualDisbursement${month}`} 
                                    // @ts-ignore
                                    value={(formData as any)[`actualDisbursement${month}`]} onChange={handleInputChange} min="0" step="0.01" className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-emerald-500 focus:border-emerald-500 dark:bg-gray-700 dark:text-white" /></div>
                                ))}
                            </div>
                            <div className="mt-4 pt-2 border-t border-gray-200 dark:border-gray-700 flex justify-end items-center gap-2">
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Actual Disbursement:</span>
                                <span className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(formData.actualDisbursementAmount || 0)}</span>
                            </div>
                        </fieldset>

                        <div className="flex justify-end gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <button type="button" onClick={() => setEditMode('none')} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600">Cancel</button>
                            <button type="submit" className="px-4 py-2 rounded-md text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700">Save Accomplishment</button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    // --- Read Only View ---
    const totalTargetDisbursement = months.reduce((sum, m) => sum + (Number((item as any)[`disbursement${m}`]) || 0), 0);

    return (
        <div className="space-y-8">
            {/* Header */}
            <header className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white truncate max-w-2xl" title={item.particulars}>{item.particulars}</h1>
                    <p className="text-md text-gray-500 dark:text-gray-400">{item.operatingUnit} | {item.uid}</p>
                </div>
                <div className="flex items-center gap-4">
                    {canEdit && (
                        <button onClick={() => setEditMode('details')} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
                            Edit Details
                        </button>
                    )}
                    {canEdit && (
                        <button onClick={() => setEditMode('accomplishment')} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Edit Accomplishment
                        </button>
                    )}
                    <button onClick={onBack} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        Back
                    </button>
                </div>
            </header>

            {/* Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Details Section */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                    <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Requirement Details</h3>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="col-span-2">
                            <DetailItem label="Particulars" value={item.particulars} />
                        </div>
                        <DetailItem label="Status" value={
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                item.status === 'Completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                item.status === 'Ongoing' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                                item.status === 'Cancelled' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                                'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                            }`}>
                                {item.status}
                            </span>
                        } />
                        <DetailItem label="Fund Source" value={`${item.fundType} ${item.fundYear} - ${item.tier}`} />
                        <div className="col-span-2">
                            <DetailItem label="UACS Code" value={`${item.uacsCode} - ${selectedParticular || 'N/A'} - ${selectedUacsDesc || 'N/A'}`} />
                        </div>
                        <DetailItem label="Target Obligation Date" value={item.obligationDate} />
                        
                        {/* Aligned Financial Targets */}
                        <DetailItem label="Target Allocation Amount" value={formatCurrency(item.amount)} />
                        <DetailItem label="Target Obligated Amount" value={formatCurrency(item.obligatedAmount || 0)} />
                        <DetailItem label="Target Disbursement Amount" value={formatCurrency(totalTargetDisbursement)} />
                        
                        <DetailItem label="Encoded By" value={item.encodedBy} />
                    </div>
                    
                    <div className="mt-6">
                        <h4 className="font-medium text-gray-600 dark:text-gray-300 mb-2 border-b border-gray-200 dark:border-gray-600 pb-1">Target Monthly Disbursement</h4>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-xs">
                            {months.map(m => (
                                <div key={m} className="flex flex-col p-2 bg-gray-50 dark:bg-gray-700/30 rounded">
                                    <span className="font-semibold text-gray-500">{m}</span>
                                    <span>{formatCurrency((item as any)[`disbursement${m}`] || 0)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Accomplishment Section */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                    <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Accomplishment Report</h3>
                    <div className="space-y-6">
                        
                        <div>
                            <h4 className="font-medium text-gray-600 dark:text-gray-300 mb-2 border-b border-gray-200 dark:border-gray-600 pb-1">Financial Performance</h4>
                            <div className="grid grid-cols-2 gap-4 mt-3">
                                <div className="space-y-3">
                                    <p className="text-xs font-bold uppercase text-gray-400">Obligation</p>
                                    <DetailItem label="Date" value={item.actualObligationDate} />
                                    <DetailItem label="Amount" value={formatCurrency(item.actualObligationAmount || 0)} />
                                </div>
                                <div className="space-y-3">
                                    <p className="text-xs font-bold uppercase text-gray-400">Disbursement</p>
                                    {/* Disbursement Date removed as redundant */}
                                    <DetailItem label="Total Amount" value={formatCurrency(item.actualDisbursementAmount || 0)} />
                                </div>
                            </div>
                        </div>

                        <div className="mt-2">
                            <h4 className="font-medium text-gray-600 dark:text-gray-300 mb-2 border-b border-gray-200 dark:border-gray-600 pb-1">Actual Monthly Disbursement</h4>
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-xs">
                                {months.map(m => (
                                    <div key={m} className="flex flex-col p-2 bg-green-50 dark:bg-green-900/10 rounded border border-green-100 dark:border-green-900/30">
                                        <span className="font-semibold text-gray-500">{m}</span>
                                        <span className="font-medium text-green-700 dark:text-green-400">{formatCurrency((item as any)[`actualDisbursement${m}`] || 0)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default OtherExpenseDetail;