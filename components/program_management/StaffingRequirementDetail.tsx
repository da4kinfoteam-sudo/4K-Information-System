
// Author: 4K 
import React, { useState, useEffect } from 'react';
import { StaffingRequirement, operatingUnits, fundTypes, tiers, objectTypes, ObjectType } from '../../constants';
import { formatCurrency } from '../reports/ReportUtils';
import { useAuth } from '../../contexts/AuthContext';
import { getUserPermissions } from '../mainfunctions/TableHooks';
import { supabase } from '../../supabaseClient';

interface StaffingRequirementDetailProps {
    item: StaffingRequirement;
    onBack: () => void;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    onUpdate: (item: StaffingRequirement) => void;
}

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm";

const DetailItem: React.FC<{ label: string; value?: string | number | React.ReactNode }> = ({ label, value }) => (
    <div>
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{value || 'N/A'}</dd>
    </div>
);

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const StaffingRequirementDetail: React.FC<StaffingRequirementDetailProps> = ({ item, onBack, uacsCodes, onUpdate }) => {
    const { currentUser } = useAuth();
    const { canEdit } = getUserPermissions(currentUser);
    
    const [editMode, setEditMode] = useState<'none' | 'details' | 'accomplishment'>('none');
    const [formData, setFormData] = useState<StaffingRequirement>(item);
    
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

    // Recalculate Totals when monthly fields change
    useEffect(() => {
        if (editMode === 'details') {
            // @ts-ignore
            const total = months.reduce((sum, m) => sum + (Number(formData[`disbursement${m}`]) || 0), 0);
            if (total !== formData.annualSalary) setFormData(prev => ({ ...prev, annualSalary: total }));
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
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const updatedItem: any = {
            ...formData,
            salaryGrade: Number(formData.salaryGrade),
            annualSalary: Number(formData.annualSalary),
            fundYear: Number(formData.fundYear),
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
            const { error } = await supabase.from('staffing_requirements').update(updatedItem).eq('id', item.id);
            if (error) {
                alert('Failed to update: ' + error.message);
                return;
            }
        }
        
        onUpdate(updatedItem as StaffingRequirement);
        setEditMode('none');
    };

    if (editMode === 'details') {
        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Editing Details: {item.personnelPosition}</h1>
                    <button onClick={() => setEditMode('none')} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel Editing</button>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Basic Info & Targets</legend>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Operating Unit</label><select name="operatingUnit" value={formData.operatingUnit} onChange={handleInputChange} className={commonInputClasses} disabled><option value="">Select OU</option>{operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}</select></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Position</label><input type="text" name="personnelPosition" value={formData.personnelPosition} onChange={handleInputChange} required className={commonInputClasses} /></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label><select name="status" value={formData.status} onChange={handleInputChange} className={commonInputClasses}><option value="Permanent">Permanent</option><option value="Contractual">Contractual</option><option value="COS">COS</option><option value="Job Order">Job Order</option></select></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Salary Grade</label><input type="number" name="salaryGrade" value={formData.salaryGrade} onChange={handleInputChange} min="1" max="33" className={commonInputClasses} /></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Personnel Type</label><select name="personnelType" value={formData.personnelType} onChange={handleInputChange} className={commonInputClasses}><option value="Technical">Technical</option><option value="Administrative">Administrative</option><option value="Support">Support</option></select></div>
                            </div>
                        </fieldset>

                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Funding & Dates</legend>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fund Year</label><input type="number" name="fundYear" value={formData.fundYear} onChange={handleInputChange} className={commonInputClasses} /></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fund Type</label><select name="fundType" value={formData.fundType} onChange={handleInputChange} className={commonInputClasses}>{fundTypes.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tier</label><select name="tier" value={formData.tier} onChange={handleInputChange} className={commonInputClasses}>{tiers.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Object Type</label><select value={selectedObjectType} onChange={e => { setSelectedObjectType(e.target.value as ObjectType); setSelectedParticular(''); setFormData(prev => ({...prev, uacsCode: ''})); }} className={commonInputClasses}>{objectTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Particular</label><select value={selectedParticular} onChange={e => { setSelectedParticular(e.target.value); setFormData(prev => ({...prev, uacsCode: ''})); }} className={commonInputClasses}><option value="">Select</option>{uacsCodes[selectedObjectType] && Object.keys(uacsCodes[selectedObjectType]).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">UACS Code</label><select name="uacsCode" value={formData.uacsCode} onChange={handleInputChange} className={commonInputClasses} disabled={!selectedParticular}><option value="">Select Code</option>{selectedParticular && uacsCodes[selectedObjectType][selectedParticular] && Object.entries(uacsCodes[selectedObjectType][selectedParticular]).map(([code, desc]) => (<option key={code} value={code}>{code} - {desc}</option>))}</select></div>

                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Target Obligation Date</label><input type="date" name="obligationDate" value={formData.obligationDate} onChange={handleInputChange} className={commonInputClasses} /></div>
                            </div>
                        </fieldset>

                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Target Monthly Disbursement (Salary)</legend>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                {months.map(month => (
                                    <div key={month}><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{month}</label><input type="number" name={`disbursement${month}`} 
                                    // @ts-ignore
                                    value={(formData as any)[`disbursement${month}`]} onChange={handleInputChange} min="0" step="0.01" className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-accent focus:border-accent dark:bg-gray-700 dark:text-white" /></div>
                                ))}
                            </div>
                            <div className="mt-4 pt-2 border-t border-gray-200 dark:border-gray-700 flex justify-end items-center gap-2"><span className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Annual Salary:</span><span className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(formData.annualSalary)}</span></div>
                        </fieldset>

                        <div className="flex justify-end gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <button type="button" onClick={() => setEditMode('none')} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600">Cancel</button>
                            <button type="submit" className="px-4 py-2 rounded-md text-sm font-medium text-white bg-accent hover:brightness-95">Save Details</button>
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
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Editing Accomplishment: {item.personnelPosition}</h1>
                    <button onClick={() => setEditMode('none')} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel Editing</button>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Accomplishment Data</legend>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Date</label><input type="date" name="actualDate" value={formData.actualDate} onChange={handleInputChange} className={commonInputClasses} /></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Amount (Misc)</label><input type="number" name="actualAmount" value={formData.actualAmount} onChange={handleInputChange} className={commonInputClasses} placeholder="Non-salary actuals" /></div>
                                
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Obligation Date</label><input type="date" name="actualObligationDate" value={formData.actualObligationDate} onChange={handleInputChange} className={commonInputClasses} /></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Obligation Amount</label><input type="number" name="actualObligationAmount" value={formData.actualObligationAmount} onChange={handleInputChange} className={commonInputClasses} /></div>
                                
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Disbursement Date</label><input type="date" name="actualDisbursementDate" value={formData.actualDisbursementDate} onChange={handleInputChange} className={commonInputClasses} /></div>
                                {/* Actual Disbursement Amount is calculated from schedule below, read-only here for reference or manual override if needed */}
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Total Actual Disbursement</label><input type="number" name="actualDisbursementAmount" value={formData.actualDisbursementAmount} readOnly className={`${commonInputClasses} bg-gray-100 cursor-not-allowed`} /></div>
                            </div>
                        </fieldset>

                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Actual Monthly Disbursement</legend>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                {months.map(month => (
                                    <div key={`actual-${month}`}><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{month}</label><input type="number" name={`actualDisbursement${month}`} 
                                    // @ts-ignore
                                    value={(formData as any)[`actualDisbursement${month}`]} onChange={handleInputChange} min="0" step="0.01" className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-accent focus:border-accent dark:bg-gray-700 dark:text-white" /></div>
                                ))}
                            </div>
                        </fieldset>

                        <div className="flex justify-end gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <button type="button" onClick={() => setEditMode('none')} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600">Cancel</button>
                            <button type="submit" className="px-4 py-2 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700">Save Accomplishment</button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    // --- Read Only View ---

    return (
        <div className="space-y-8">
            {/* Header */}
            <header className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">{item.personnelPosition}</h1>
                    <p className="text-md text-gray-500 dark:text-gray-400">{item.operatingUnit} | {item.uid}</p>
                </div>
                <div className="flex items-center gap-4">
                    {canEdit && (
                        <button onClick={() => setEditMode('details')} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
                            Edit Details
                        </button>
                    )}
                    {canEdit && (
                        <button onClick={() => setEditMode('accomplishment')} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700">
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
                        <DetailItem label="Position" value={item.personnelPosition} />
                        <DetailItem label="Status" value={item.status} />
                        <DetailItem label="Salary Grade" value={`SG-${item.salaryGrade}`} />
                        <DetailItem label="Type" value={item.personnelType} />
                        <DetailItem label="Fund Source" value={`${item.fundType} ${item.fundYear} - ${item.tier}`} />
                        <div className="col-span-2">
                            <DetailItem label="UACS Code" value={`${item.uacsCode} (${selectedParticular || 'Lookup Failed'})`} />
                        </div>
                        <DetailItem label="Target Obligation" value={item.obligationDate} />
                        <DetailItem label="Annual Salary (Target)" value={formatCurrency(item.annualSalary)} />
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

export default StaffingRequirementDetail;
