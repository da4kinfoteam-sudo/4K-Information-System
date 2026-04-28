
// Author: 4K 
import React, { useState, useEffect, useMemo } from 'react';
import { MonthYearPicker } from '../ui/MonthYearPicker';
import { OfficeRequirement, operatingUnits, fundTypes, tiers, objectTypes, ObjectType } from '../../constants';
import { formatCurrency } from '../reports/ReportUtils';
import { useAuth } from '../../contexts/AuthContext';
import { useUserAccess } from '../mainfunctions/TableHooks';
import { supabase } from '../../supabaseClient';

interface OfficeRequirementDetailProps {
    item: OfficeRequirement;
    onBack: () => void;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    onUpdate: (item: OfficeRequirement) => void;
}

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm disabled:bg-gray-100 disabled:dark:bg-gray-800 disabled:cursor-not-allowed disabled:text-gray-500";

const getStatusBadge = (status: OfficeRequirement['status']) => {
    const baseClasses = "px-2 py-0.5 text-xs font-medium rounded-full";
    switch (status) {
        case 'Completed': return `${baseClasses} bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200`;
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

const OfficeRequirementDetail: React.FC<OfficeRequirementDetailProps> = ({ item, onBack, uacsCodes, onUpdate }) => {
    const { currentUser } = useAuth();
    const { canEdit } = useUserAccess('Program Management');
    const isAdmin = currentUser?.role === 'Administrator';
    const canEditDetails = canEdit;
    const canEditAccomplishment = canEdit;
    
    const [editMode, setEditMode] = useState<'none' | 'details' | 'accomplishment'>('none');
    const [formData, setFormData] = useState<OfficeRequirement>(item);
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

    // Reset form data and init selects when switching items or edit modes
    useEffect(() => {
        setFormData(item);
        
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
    }, [item, uacsCodes]);

    useEffect(() => {
        if (editMode !== 'none') {
            setFormData(item);
            setValidationErrors([]);
        }
    }, [editMode, item]);

    const formatDateMonthYear = (dateStr: string | undefined) => {
        if (!dateStr) return 'N/A';
        const parts = dateStr.split('-');
        if (parts.length < 2) return 'N/A';
        const year = parts[0];
        const monthIndex = parseInt(parts[1]) - 1;
        if (monthIndex < 0 || monthIndex > 11) return 'N/A';
        return `${MONTH_NAMES[monthIndex]} ${year}`;
    };


    // Status Automation Effect
    useEffect(() => {
        if (editMode === 'accomplishment') {
             if (formData.actualDate) {
                 if (formData.status !== 'Completed') {
                     setFormData(prev => ({ ...prev, status: 'Completed' }));
                 }
             } else {
                 if (formData.status === 'Completed') {
                     // Revert to Ongoing if date removed, or Proposed if it was proposed before edit
                     // Safe default is Ongoing if user is editing accomplishment
                     setFormData(prev => ({ ...prev, status: 'Ongoing' }));
                 }
             }
        }
    }, [formData.actualDate, editMode]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        
        // Clear validation error for this field
        if (validationErrors.includes(name)) {
            setValidationErrors(prev => prev.filter(f => f !== name));
        }
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
        } else if (name === 'fundYear') {
            const newYear = parseInt(value) || new Date().getFullYear();
            setFormData(prev => ({ ...prev, [name]: newYear }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const getInputClasses = (fieldName: string) => {
        const hasError = validationErrors.includes(fieldName);
        return `${commonInputClasses} ${hasError ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''}`;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setValidationErrors([]);
        
        // Validation for Details mode
        if (editMode === 'details') {
            const requiredFields = [
                { field: 'equipment', label: 'Equipment' },
                { field: 'purpose', label: 'Purpose' },
                { field: 'fundYear', label: 'Fund Year' },
                { field: 'fundType', label: 'Fund Type' },
                { field: 'tier', label: 'Tier' },
                { field: 'uacsCode', label: 'UACS Code' },
                { field: 'physicalDeliveryDate', label: 'Physical Delivery Month' },
                { field: 'obligationDate', label: 'Target Obligation Month' },
                { field: 'disbursementDate', label: 'Target Disbursement Month' },
                { field: 'numberOfUnits', label: 'Number of Units' },
                { field: 'pricePerUnit', label: 'Price per Unit' }
            ];

            const missingFields = requiredFields.filter(f => !formData[f.field as keyof OfficeRequirement]);
            if (missingFields.length > 0) {
                setValidationErrors(missingFields.map(f => f.field));
                alert(`Please fill up the following required fields:\n- ${missingFields.map(f => f.label).join('\n- ')}`);
                return;
            }

            if (!selectedUacsDesc) {
                setValidationErrors(prev => [...prev, 'uacsCode']);
                alert('Please select a valid UACS Code from the list.');
                return;
            }
        }

        const updatedItem: any = {
            ...formData,
            numberOfUnits: Number(formData.numberOfUnits),
            pricePerUnit: Number(formData.pricePerUnit),
            fundYear: Number(formData.fundYear),
            actualAmount: Number(formData.actualAmount) || 0,
            actualObligationAmount: Number(formData.actualObligationAmount) || 0,
            actualDisbursementAmount: Number(formData.actualDisbursementAmount) || 0,
            updated_at: new Date().toISOString()
        };

        if (supabase) {
            // Exclude ID from update payload
            const { id, ...payload } = updatedItem;
            const { error } = await supabase.from('office_requirements').update(payload).eq('id', item.id);
            if (error) {
                alert('Failed to update: ' + error.message);
                return;
            }
        }
        
        onUpdate(updatedItem as OfficeRequirement);
        setEditMode('none');
    };

    if (editMode === 'details') {
        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Editing Details: {item.equipment}</h1>
                    <button onClick={() => setEditMode('none')} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel Editing</button>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-medium text-emerald-700 dark:text-emerald-400">Basic Information</legend>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Operating Unit <span className="text-red-500">*</span></label><select name="operatingUnit" value={formData.operatingUnit} onChange={handleInputChange} className={getInputClasses('operatingUnit')} disabled><option value="">Select OU</option>{operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}</select></div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status <span className="text-red-500">*</span></label>
                                    <select name="status" value={formData.status} onChange={handleInputChange} className={getInputClasses('status')} disabled={formData.status === 'Completed'}>
                                        <option value="Proposed">Proposed</option>
                                        <option value="Ongoing">Ongoing</option>
                                        <option value="Cancelled">Cancelled</option>
                                        {formData.status === 'Completed' && <option value="Completed">Completed</option>}
                                    </select>
                                    {formData.status === 'Completed' && <p className="text-xs text-green-600 mt-1">Status set to Completed automatically based on actual delivery date.</p>}
                                </div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Equipment <span className="text-red-500">*</span></label><input type="text" name="equipment" value={formData.equipment} onChange={handleInputChange} required className={getInputClasses('equipment')} /></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Specifications</label><input type="text" name="specs" value={formData.specs} onChange={handleInputChange} className={getInputClasses('specs')} /></div>
                                <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Purpose <span className="text-red-500">*</span></label><textarea name="purpose" value={formData.purpose} onChange={handleInputChange} rows={2} className={getInputClasses('purpose')} /></div>
                            </div>
                        </fieldset>

                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-medium text-emerald-700 dark:text-emerald-400">Funding & Classification</legend>
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fund Year <span className="text-red-500">*</span></label><input type="number" name="fundYear" value={formData.fundYear} onChange={handleInputChange} className={getInputClasses('fundYear')} /></div>
                                    <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fund Type <span className="text-red-500">*</span></label><select name="fundType" value={formData.fundType} onChange={handleInputChange} className={getInputClasses('fundType')}>{fundTypes.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                                    <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tier <span className="text-red-500">*</span></label><select name="tier" value={formData.tier} onChange={handleInputChange} className={getInputClasses('tier')}>{tiers.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                    <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Object Type <span className="text-red-500">*</span></label><select value={selectedObjectType} onChange={e => { setSelectedObjectType(e.target.value as ObjectType); setSelectedParticular(''); setFormData(prev => ({...prev, uacsCode: ''})); }} className={getInputClasses('objectType')}>{objectTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                    <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Particular <span className="text-red-500">*</span></label><select value={selectedParticular} onChange={e => { setSelectedParticular(e.target.value); setFormData(prev => ({...prev, uacsCode: ''})); }} className={getInputClasses('particular')}><option value="">Select</option>{uacsCodes[selectedObjectType] && Object.keys(uacsCodes[selectedObjectType]).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">UACS Code <span className="text-red-500">*</span></label>
                                        <div className="relative">
                                            <input 
                                                type="text" 
                                                name="uacsCode" 
                                                value={formData.uacsCode} 
                                                onChange={handleInputChange} 
                                                list="uacs-codes-list-detail"
                                                placeholder="Search UACS..."
                                                className={getInputClasses('uacsCode')} 
                                            />
                                            <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                                                <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                                            </div>
                                        </div>
                                        <datalist id="uacs-codes-list-detail">
                                            {availableUacsCodes.map((item) => (
                                                <option key={item.code} value={item.code}>{item.code} - {item.desc}</option>
                                            ))}
                                        </datalist>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                                        <input 
                                            type="text" 
                                            value={selectedUacsDesc} 
                                            readOnly 
                                            className={`${commonInputClasses} bg-gray-50 dark:bg-gray-800 font-medium`}
                                            placeholder="Description will appear here..."
                                        />
                                    </div>
                                </div>
                            </div>
                        </fieldset>

                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-medium text-emerald-700 dark:text-emerald-400">Target Schedule & Cost</legend>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Physical Delivery Month <span className="text-red-500">*</span></label>
                                    <MonthYearPicker 
                                        value={formData.physicalDeliveryDate}
                                        onChange={(val) => {
                                            setFormData(prev => ({ ...prev, physicalDeliveryDate: val }));
                                            if (validationErrors.includes('physicalDeliveryDate')) {
                                                setValidationErrors(prev => prev.filter(f => f !== 'physicalDeliveryDate'));
                                            }
                                        }}
                                        className={validationErrors.includes('physicalDeliveryDate') ? 'border-red-500 ring-red-500' : ''}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Target Obligation Month <span className="text-red-500">*</span></label>
                                    <MonthYearPicker 
                                        value={formData.obligationDate}
                                        onChange={(val) => {
                                            setFormData(prev => ({ ...prev, obligationDate: val }));
                                            if (validationErrors.includes('obligationDate')) {
                                                setValidationErrors(prev => prev.filter(f => f !== 'obligationDate'));
                                            }
                                        }}
                                        className={validationErrors.includes('obligationDate') ? 'border-red-500 ring-red-500' : ''}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Target Disbursement Month <span className="text-red-500">*</span></label>
                                    <MonthYearPicker 
                                        value={formData.disbursementDate}
                                        onChange={(val) => {
                                            setFormData(prev => ({ ...prev, disbursementDate: val }));
                                            if (validationErrors.includes('disbursementDate')) {
                                                setValidationErrors(prev => prev.filter(f => f !== 'disbursementDate'));
                                            }
                                        }}
                                        className={validationErrors.includes('disbursementDate') ? 'border-red-500 ring-red-500' : ''}
                                    />
                                </div>
                            
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Number of Units <span className="text-red-500">*</span></label><input type="number" name="numberOfUnits" value={formData.numberOfUnits} onChange={handleInputChange} min="0" className={getInputClasses('numberOfUnits')} /></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Price per Unit <span className="text-red-500">*</span></label><input type="number" name="pricePerUnit" value={formData.pricePerUnit} onChange={handleInputChange} min="0" step="0.01" className={getInputClasses('pricePerUnit')} /></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Total Amount</label><input type="text" value={formatCurrency((Number(formData.numberOfUnits) || 0) * (Number(formData.pricePerUnit) || 0))} disabled className={`${commonInputClasses} bg-gray-100 dark:bg-gray-800 cursor-not-allowed`} /></div>
                            </div>
                        </fieldset>

                        <div className="flex justify-end gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <button type="button" onClick={() => setEditMode('none')} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600">Cancel</button>
                            <button type="submit" className="px-4 py-2 rounded-md text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700">Save Details</button>
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
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Editing Accomplishment: {item.equipment}</h1>
                    <button onClick={() => setEditMode('none')} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel Editing</button>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-medium text-emerald-700 dark:text-emerald-400">Accomplishment Data</legend>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Date (Delivery)</label>
                                    <MonthYearPicker 
                                        value={formData.actualDate}
                                        onChange={(val) => setFormData(prev => ({ ...prev, actualDate: val }))}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Amount (Misc)</label>
                                    <input type="number" name="actualAmount" value={formData.actualAmount} onChange={handleInputChange} className={commonInputClasses} placeholder="Non-specific actuals" />
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Obligation Month</label>
                                    <MonthYearPicker 
                                        value={formData.actualObligationDate}
                                        onChange={(val) => setFormData(prev => ({ ...prev, actualObligationDate: val }))}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Obligation Amount</label>
                                    <input type="number" name="actualObligationAmount" value={formData.actualObligationAmount} onChange={handleInputChange} className={commonInputClasses} />
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Disbursement Month</label>
                                    <MonthYearPicker 
                                        value={formData.actualDisbursementDate}
                                        onChange={(val) => setFormData(prev => ({ ...prev, actualDisbursementDate: val }))}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Disbursement Amount</label>
                                    <input type="number" name="actualDisbursementAmount" value={formData.actualDisbursementAmount} onChange={handleInputChange} className={commonInputClasses} />
                                </div>
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

    return (
        <div className="space-y-8 animate-fadeIn">
            {/* Header */}
            <header className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">{item.equipment}</h1>
                    <p className="text-md text-gray-500 dark:text-gray-400">{item.operatingUnit} | {item.uid}</p>
                </div>
                <div className="flex items-center gap-4">
                    {canEditDetails && (
                        <button onClick={() => setEditMode('details')} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
                            Edit Details
                        </button>
                    )}
                    {canEditAccomplishment && (
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
                        <DetailItem label="Equipment" value={item.equipment} />
                        <DetailItem label="Status" value={<span className={getStatusBadge(item.status)}>{item.status}</span>} />
                        <DetailItem label="Units" value={item.numberOfUnits} />
                        <div className="col-span-2">
                            <DetailItem label="Specs" value={item.specs} />
                        </div>
                        <div className="col-span-2">
                            <DetailItem label="Purpose" value={item.purpose} />
                        </div>
                        <DetailItem label="Price Per Unit" value={formatCurrency(item.pricePerUnit)} />
                        <DetailItem label="Total Amount" value={formatCurrency(item.pricePerUnit * item.numberOfUnits)} />
                        
                        <DetailItem label="Fund Source" value={`${item.fundType} ${item.fundYear} - ${item.tier}`} />
                        <div className="col-span-2">
                            <DetailItem label="UACS Code" value={`${item.uacsCode} - ${selectedParticular} - ${selectedUacsDesc || 'Lookup Failed'}`} />
                        </div>
                        <DetailItem label="Physical Delivery" value={formatDateMonthYear(item.physicalDeliveryDate)} />
                        <DetailItem label="Target Obligation" value={formatDateMonthYear(item.obligationDate)} />
                        <DetailItem label="Target Disbursement" value={formatDateMonthYear(item.disbursementDate)} />
                        <DetailItem label="Encoded By" value={item.encodedBy} />
                    </div>
                </div>

                {/* Accomplishment Section */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                    <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Accomplishment Report</h3>
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                            <DetailItem label="Actual Delivery Date" value={item.actualDate ? new Date(item.actualDate).toLocaleDateString() : 'N/A'} />
                            <DetailItem label="Actual Amount (Misc)" value={formatCurrency(item.actualAmount || 0)} />
                        </div>
                        
                        <div>
                            <h4 className="font-medium text-gray-600 dark:text-gray-300 mb-2 border-b border-gray-200 dark:border-gray-600 pb-1">Financial Performance</h4>
                            <div className="grid grid-cols-2 gap-4 mt-3">
                                <div className="space-y-3">
                                    <p className="text-xs font-bold uppercase text-gray-400">Obligation</p>
                                    <DetailItem label="Date" value={formatDateMonthYear(item.actualObligationDate)} />
                                    <DetailItem label="Amount" value={formatCurrency(item.actualObligationAmount || 0)} />
                                </div>
                                <div className="space-y-3">
                                    <p className="text-xs font-bold uppercase text-gray-400">Disbursement</p>
                                    <DetailItem label="Date" value={formatDateMonthYear(item.actualDisbursementDate)} />
                                    <DetailItem label="Amount" value={formatCurrency(item.actualDisbursementAmount || 0)} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default OfficeRequirementDetail;
