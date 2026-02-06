
// Author: 4K 
import React, { useState, useEffect } from 'react';
import { OfficeRequirement, operatingUnits, fundTypes, tiers, objectTypes, ObjectType } from '../../constants';
import { formatCurrency } from '../reports/ReportUtils';
import { useAuth } from '../../contexts/AuthContext';
import { getUserPermissions } from '../mainfunctions/TableHooks';
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

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm";

const DetailItem: React.FC<{ label: string; value?: string | number | React.ReactNode }> = ({ label, value }) => (
    <div>
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{value || 'N/A'}</dd>
    </div>
);

const OfficeRequirementDetail: React.FC<OfficeRequirementDetailProps> = ({ item, onBack, uacsCodes, onUpdate }) => {
    const { currentUser } = useAuth();
    const { canEdit } = getUserPermissions(currentUser);
    
    const [editMode, setEditMode] = useState<'none' | 'details' | 'accomplishment'>('none');
    const [formData, setFormData] = useState<OfficeRequirement>(item);
    
    // For selects
    const [selectedObjectType, setSelectedObjectType] = useState<ObjectType>('MOOE');
    const [selectedParticular, setSelectedParticular] = useState('');

    // Init selects based on current uacsCode
    useEffect(() => {
        let foundType: ObjectType = 'MOOE'; 
        let foundParticular = '';
        outerLoop: 
        for (const type of objectTypes) { 
            if(uacsCodes[type]) { 
                for (const part in uacsCodes[type]) { 
                    if (uacsCodes[type][part].hasOwnProperty(formData.uacsCode)) { 
                        foundType = type; 
                        foundParticular = part; 
                        break outerLoop; 
                    } 
                } 
            } 
        }
        setSelectedObjectType(foundType); 
        setSelectedParticular(foundParticular);
    }, [formData.uacsCode, uacsCodes]);

    // Reset form data when switching edit modes or items
    useEffect(() => {
        setFormData(item);
    }, [item, editMode]);

    // Helper to get month index from YYYY-MM-DD string
    const getMonthFromDateStr = (dateStr: string | undefined) => {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length > 1) return (parseInt(parts[1]) - 1).toString();
        return '';
    };

    // Helper to construct date string based on Fund Year and Selected Month
    const updateDateFromMonth = (field: string, monthIndex: string) => {
        if (monthIndex === '') {
            setFormData(prev => ({ ...prev, [field]: '' }));
            return;
        }
        const mIndex = parseInt(monthIndex);
        const year = formData.fundYear || new Date().getFullYear();
        // Construct date as YYYY-MM-01
        const dateStr = `${year}-${String(mIndex + 1).padStart(2, '0')}-01`;
        setFormData(prev => ({ ...prev, [field]: dateStr }));
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        
        // If Fund Year changes in details, update existing dates
        if (name === 'fundYear') {
            const newYear = parseInt(value) || new Date().getFullYear();
            setFormData(prev => {
                const newData = { ...prev, [name]: newYear };
                if (prev.obligationDate) {
                    const m = prev.obligationDate.split('-')[1];
                    if (m) newData.obligationDate = `${newYear}-${m}-01`;
                }
                if (prev.disbursementDate) {
                    const m = prev.disbursementDate.split('-')[1];
                    if (m) newData.disbursementDate = `${newYear}-${m}-01`;
                }
                // Actuals also depend on fund year per requirement
                if (prev.actualObligationDate) {
                    const m = prev.actualObligationDate.split('-')[1];
                    if (m) newData.actualObligationDate = `${newYear}-${m}-01`;
                }
                if (prev.actualDisbursementDate) {
                    const m = prev.actualDisbursementDate.split('-')[1];
                    if (m) newData.actualDisbursementDate = `${newYear}-${m}-01`;
                }
                return newData;
            });
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const updatedItem: any = {
            ...formData,
            numberOfUnits: Number(formData.numberOfUnits),
            pricePerUnit: Number(formData.pricePerUnit),
            fundYear: Number(formData.fundYear),
            actualAmount: Number(formData.actualAmount),
            actualObligationAmount: Number(formData.actualObligationAmount),
            actualDisbursementAmount: Number(formData.actualDisbursementAmount),
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
                            <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Basic Info</legend>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Operating Unit</label><select name="operatingUnit" value={formData.operatingUnit} onChange={handleInputChange} className={commonInputClasses} disabled><option value="">Select OU</option>{operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}</select></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Equipment</label><input type="text" name="equipment" value={formData.equipment} onChange={handleInputChange} required className={commonInputClasses} /></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Specifications</label><input type="text" name="specs" value={formData.specs} onChange={handleInputChange} className={commonInputClasses} /></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Purpose</label><textarea name="purpose" value={formData.purpose} onChange={handleInputChange} rows={2} className={commonInputClasses} /></div>
                            </div>
                        </fieldset>

                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Funding & Targets</legend>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fund Year</label><input type="number" name="fundYear" value={formData.fundYear} onChange={handleInputChange} className={commonInputClasses} /></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fund Type</label><select name="fundType" value={formData.fundType} onChange={handleInputChange} className={commonInputClasses}>{fundTypes.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tier</label><select name="tier" value={formData.tier} onChange={handleInputChange} className={commonInputClasses}>{tiers.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Object Type</label><select value={selectedObjectType} onChange={e => { setSelectedObjectType(e.target.value as ObjectType); setSelectedParticular(''); setFormData(prev => ({...prev, uacsCode: ''})); }} className={commonInputClasses}>{objectTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Particular</label><select value={selectedParticular} onChange={e => { setSelectedParticular(e.target.value); setFormData(prev => ({...prev, uacsCode: ''})); }} className={commonInputClasses}><option value="">Select</option>{uacsCodes[selectedObjectType] && Object.keys(uacsCodes[selectedObjectType]).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">UACS Code</label><select name="uacsCode" value={formData.uacsCode} onChange={handleInputChange} className={commonInputClasses} disabled={!selectedParticular}><option value="">Select Code</option>{selectedParticular && uacsCodes[selectedObjectType][selectedParticular] && Object.entries(uacsCodes[selectedObjectType][selectedParticular]).map(([code, desc]) => (<option key={code} value={code}>{code} - {desc}</option>))}</select></div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Target Obligation Month</label>
                                    <select 
                                        value={getMonthFromDateStr(formData.obligationDate)} 
                                        onChange={(e) => updateDateFromMonth('obligationDate', e.target.value)} 
                                        className={commonInputClasses}
                                    >
                                        <option value="">Select Month</option>
                                        {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Target Disbursement Month</label>
                                    <select 
                                        value={getMonthFromDateStr(formData.disbursementDate)} 
                                        onChange={(e) => updateDateFromMonth('disbursementDate', e.target.value)} 
                                        className={commonInputClasses}
                                    >
                                        <option value="">Select Month</option>
                                        {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                                    </select>
                                </div>
                            
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">No. of Units</label><input type="number" name="numberOfUnits" value={formData.numberOfUnits} onChange={handleInputChange} min="0" className={commonInputClasses} /></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Price per Unit</label><input type="number" name="pricePerUnit" value={formData.pricePerUnit} onChange={handleInputChange} min="0" step="0.01" className={commonInputClasses} /></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Total Amount</label><input type="text" value={formatCurrency((Number(formData.numberOfUnits) || 0) * (Number(formData.pricePerUnit) || 0))} disabled className={`${commonInputClasses} bg-gray-100 dark:bg-gray-800 cursor-not-allowed`} /></div>
                            </div>
                        </fieldset>

                        <div className="flex justify-end gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <button type="button" onClick={() => setEditMode('none')} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600">Cancel</button>
                            <button type="submit" className="px-4 py-2 rounded-md text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 hover:brightness-95">Save Details</button>
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
                            <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Accomplishment Data</legend>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Date (Misc)</label><input type="date" name="actualDate" value={formData.actualDate} onChange={handleInputChange} className={commonInputClasses} /></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Amount (Misc)</label><input type="number" name="actualAmount" value={formData.actualAmount} onChange={handleInputChange} className={commonInputClasses} placeholder="Non-specific actuals" /></div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Obligation Month</label>
                                    <select 
                                        value={getMonthFromDateStr(formData.actualObligationDate)} 
                                        onChange={(e) => updateDateFromMonth('actualObligationDate', e.target.value)} 
                                        className={commonInputClasses}
                                    >
                                        <option value="">Select Month</option>
                                        {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                                    </select>
                                </div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Obligation Amount</label><input type="number" name="actualObligationAmount" value={formData.actualObligationAmount} onChange={handleInputChange} className={commonInputClasses} /></div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Disbursement Month</label>
                                    <select 
                                        value={getMonthFromDateStr(formData.actualDisbursementDate)} 
                                        onChange={(e) => updateDateFromMonth('actualDisbursementDate', e.target.value)} 
                                        className={commonInputClasses}
                                    >
                                        <option value="">Select Month</option>
                                        {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                                    </select>
                                </div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Disbursement Amount</label><input type="number" name="actualDisbursementAmount" value={formData.actualDisbursementAmount} onChange={handleInputChange} className={commonInputClasses} /></div>
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
                        <DetailItem label="Equipment" value={item.equipment} />
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
                            <DetailItem label="UACS Code" value={`${item.uacsCode} (${selectedParticular || 'Lookup Failed'})`} />
                        </div>
                        <DetailItem label="Target Obligation" value={item.obligationDate} />
                        <DetailItem label="Target Disbursement" value={item.disbursementDate} />
                        <DetailItem label="Encoded By" value={item.encodedBy} />
                    </div>
                </div>

                {/* Accomplishment Section */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                    <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Accomplishment Report</h3>
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                            <DetailItem label="Actual Date" value={item.actualDate} />
                            <DetailItem label="Actual Amount (Misc)" value={formatCurrency(item.actualAmount || 0)} />
                        </div>
                        
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
                                    <DetailItem label="Date" value={item.actualDisbursementDate} />
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
