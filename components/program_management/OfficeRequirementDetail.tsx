
// Author: 4K 
import React, { useState } from 'react';
import { OfficeRequirement, operatingUnits, fundTypes, tiers, objectTypes, ObjectType, FundType, Tier } from '../../constants';
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

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm";

const OfficeRequirementDetail: React.FC<OfficeRequirementDetailProps> = ({ item, onBack, uacsCodes, onUpdate }) => {
    const { currentUser } = useAuth();
    const { canEdit } = getUserPermissions(currentUser);
    
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<OfficeRequirement>(item);
    
    // For selects
    const [selectedObjectType, setSelectedObjectType] = useState<ObjectType>('MOOE');
    const [selectedParticular, setSelectedParticular] = useState('');

    // Init selects based on current uacsCode
    React.useEffect(() => {
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

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const updatedItem = {
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
            const { error } = await supabase.from('office_requirements').update(updatedItem).eq('id', item.id);
            if (error) {
                alert('Failed to update: ' + error.message);
                return;
            }
        }
        
        onUpdate(updatedItem);
        setIsEditing(false);
    };

    const DetailRow = ({ label, value }: { label: string, value: any }) => (
        <div className="py-2 border-b border-gray-100 dark:border-gray-700">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400 block">{label}</span>
            <span className="text-sm text-gray-900 dark:text-white block mt-1">{value || 'N/A'}</span>
        </div>
    );

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-800 dark:text-white">{isEditing ? 'Edit Office Requirement' : 'Office Requirement Details'}</h3>
                <div className="flex gap-2">
                    {isEditing ? (
                        <>
                            <button onClick={() => { setIsEditing(false); setFormData(item); }} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md text-sm">Cancel</button>
                            <button onClick={handleSubmit} className="px-4 py-2 bg-accent text-white rounded-md text-sm hover:brightness-95">Save</button>
                        </>
                    ) : (
                        <>
                            {canEdit && <button onClick={() => setIsEditing(true)} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">Edit</button>}
                            <button onClick={onBack} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md text-sm">Back</button>
                        </>
                    )}
                </div>
            </div>

            {isEditing ? (
                <form className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Fields matching OfficeRequirementsTab form */}
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Operating Unit</label><select name="operatingUnit" value={formData.operatingUnit} onChange={handleInputChange} className={commonInputClasses} disabled><option value="">Select OU</option>{operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}</select></div>
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Equipment</label><input type="text" name="equipment" value={formData.equipment} onChange={handleInputChange} className={commonInputClasses} /></div>
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Specifications</label><input type="text" name="specs" value={formData.specs} onChange={handleInputChange} className={commonInputClasses} /></div>
                        <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Purpose</label><textarea name="purpose" value={formData.purpose} onChange={handleInputChange} className={commonInputClasses} rows={2}/></div>
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">No. of Units</label><input type="number" name="numberOfUnits" value={formData.numberOfUnits} onChange={handleInputChange} className={commonInputClasses} /></div>
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Price/Unit</label><input type="number" name="pricePerUnit" value={formData.pricePerUnit} onChange={handleInputChange} className={commonInputClasses} /></div>
                        
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fund Year</label><input type="number" name="fundYear" value={formData.fundYear} onChange={handleInputChange} className={commonInputClasses} /></div>
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fund Type</label><select name="fundType" value={formData.fundType} onChange={handleInputChange} className={commonInputClasses}>{fundTypes.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tier</label><select name="tier" value={formData.tier} onChange={handleInputChange} className={commonInputClasses}>{tiers.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                        
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Object Type</label><select value={selectedObjectType} onChange={e => { setSelectedObjectType(e.target.value as ObjectType); setSelectedParticular(''); setFormData(prev => ({...prev, uacsCode: ''})); }} className={commonInputClasses}>{objectTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Particular</label><select value={selectedParticular} onChange={e => { setSelectedParticular(e.target.value); setFormData(prev => ({...prev, uacsCode: ''})); }} className={commonInputClasses}><option value="">Select</option>{uacsCodes[selectedObjectType] && Object.keys(uacsCodes[selectedObjectType]).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">UACS Code</label><select name="uacsCode" value={formData.uacsCode} onChange={handleInputChange} className={commonInputClasses} disabled={!selectedParticular}><option value="">Select Code</option>{selectedParticular && uacsCodes[selectedObjectType][selectedParticular] && Object.entries(uacsCodes[selectedObjectType][selectedParticular]).map(([code, desc]) => (<option key={code} value={code}>{code} - {desc}</option>))}</select></div>

                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Obligation Date</label><input type="date" name="obligationDate" value={formData.obligationDate} onChange={handleInputChange} className={commonInputClasses} /></div>
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Disbursement Date</label><input type="date" name="disbursementDate" value={formData.disbursementDate} onChange={handleInputChange} className={commonInputClasses} /></div>
                    </div>

                    <div className="border-t pt-4 mt-4">
                        <h4 className="font-semibold mb-2">Accomplishment</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Date</label><input type="date" name="actualDate" value={formData.actualDate} onChange={handleInputChange} className={commonInputClasses} /></div>
                            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Amount</label><input type="number" name="actualAmount" value={formData.actualAmount} onChange={handleInputChange} className={commonInputClasses} /></div>
                            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Obligation Date</label><input type="date" name="actualObligationDate" value={formData.actualObligationDate} onChange={handleInputChange} className={commonInputClasses} /></div>
                            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Obligation Amount</label><input type="number" name="actualObligationAmount" value={formData.actualObligationAmount} onChange={handleInputChange} className={commonInputClasses} /></div>
                            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Disbursement Date</label><input type="date" name="actualDisbursementDate" value={formData.actualDisbursementDate} onChange={handleInputChange} className={commonInputClasses} /></div>
                            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Disbursement Amount</label><input type="number" name="actualDisbursementAmount" value={formData.actualDisbursementAmount} onChange={handleInputChange} className={commonInputClasses} /></div>
                        </div>
                    </div>
                </form>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                    <DetailRow label="Equipment" value={item.equipment} />
                    <DetailRow label="Specifications" value={item.specs} />
                    <DetailRow label="Purpose" value={item.purpose} />
                    <DetailRow label="Operating Unit" value={item.operatingUnit} />
                    <DetailRow label="Units" value={item.numberOfUnits} />
                    <DetailRow label="Price/Unit" value={formatCurrency(item.pricePerUnit)} />
                    <DetailRow label="Total Amount" value={formatCurrency(item.numberOfUnits * item.pricePerUnit)} />
                    <DetailRow label="Fund Source" value={`${item.fundType} ${item.fundYear} - ${item.tier}`} />
                    <DetailRow label="UACS" value={item.uacsCode} />
                    <DetailRow label="Obligation Date" value={item.obligationDate} />
                    <DetailRow label="Disbursement Date" value={item.disbursementDate} />
                    <DetailRow label="Encoded By" value={item.encodedBy} />
                    
                    <div className="md:col-span-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                        <h4 className="font-bold text-lg mb-2">Accomplishment</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <DetailRow label="Actual Date" value={item.actualDate} />
                            <DetailRow label="Actual Amount" value={formatCurrency(item.actualAmount || 0)} />
                            <DetailRow label="Actual Obligation Date" value={item.actualObligationDate} />
                            <DetailRow label="Actual Obligation Amount" value={formatCurrency(item.actualObligationAmount || 0)} />
                            <DetailRow label="Actual Disbursement Date" value={item.actualDisbursementDate} />
                            <DetailRow label="Actual Disbursement Amount" value={formatCurrency(item.actualDisbursementAmount || 0)} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OfficeRequirementDetail;
