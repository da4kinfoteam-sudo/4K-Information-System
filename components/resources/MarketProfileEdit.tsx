
// Author: 4K 
import React, { useState, useEffect } from 'react';
import { MarketingPartner, CommodityNeed, philippineRegions, referenceCommodityTypes } from '../../constants';
import LocationPicker, { parseLocation } from '../LocationPicker';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';

interface MarketProfileEditProps {
    partner: MarketingPartner;
    onBack: () => void;
    onUpdatePartner: (partner: MarketingPartner) => void;
    commodityCategories: { [key: string]: string[] };
}

const BUYER_TYPES = ['Private Company', 'Government'];
const PAYMENT_METHODS = ['Bank Transfer', 'Cash', 'Cash on Delivery', 'Voucher'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm text-gray-900 dark:text-white";

// PSGC Region Codes Mapping for Province Fetching
const REGION_CODE_MAP: Record<string, string> = {
    'National Capital Region (NCR)': '130000000',
    'Cordillera Administrative Region (CAR)': '140000000',
    'Region I (Ilocos Region)': '010000000',
    'Region II (Cagayan Valley)': '020000000',
    'Region III (Central Luzon)': '030000000',
    'Region IV-A (CALABARZON)': '040000000',
    'MIMAROPA Region': '170000000',
    'Region V (Bicol Region)': '050000000',
    'Region VI (Western Visayas)': '060000000',
    'Region VII (Central Visayas)': '070000000',
    'Region VIII (Eastern Visayas)': '080000000',
    'Region IX (Zamboanga Peninsula)': '090000000',
    'Region X (Northern Mindanao)': '100000000',
    'Region XI (Davao Region)': '110000000',
    'Region XII (SOCCSKSARGEN)': '120000000',
    'Region XIII (Caraga)': '160000000',
    'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)': '150000000',
    'Negros Island Region (NIR)': '180000000'
};

const MarketProfileEdit: React.FC<MarketProfileEditProps> = ({ partner, onBack, onUpdatePartner, commodityCategories }) => {
    const { currentUser } = useAuth();
    const [formData, setFormData] = useState<MarketingPartner>(partner);
    
    // Inline Commodity Entry State
    const [editingCommodityIdx, setEditingCommodityIdx] = useState<number | null>(null);
    const [tempCommodity, setTempCommodity] = useState<CommodityNeed>({
        id: '', name: '', type: '', sourceRegion: '', sourceProvince: '', qualityStandard: '',
        volumeJan: 0, volumeFeb: 0, volumeMar: 0, volumeApr: 0, volumeMay: 0, volumeJun: 0,
        volumeJul: 0, volumeAug: 0, volumeSep: 0, volumeOct: 0, volumeNov: 0, volumeDec: 0
    });
    const [provinceOptions, setProvinceOptions] = useState<string[]>([]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleLocationChange = (val: string) => {
        const { region } = parseLocation(val);
        setFormData(prev => ({ ...prev, location: val, region }));
    };

    const handlePaymentToggle = (method: string) => {
        setFormData(prev => {
            const existing = prev.paymentMethods || [];
            if (existing.includes(method)) return { ...prev, paymentMethods: existing.filter(m => m !== method) };
            return { ...prev, paymentMethods: [...existing, method] };
        });
    };

    const handleTempCommodityChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setTempCommodity(prev => {
            const updated = { ...prev, [name]: value };
            if (name === 'type') updated.name = '';
            if (name === 'sourceRegion') updated.sourceProvince = '';
            return updated;
        });
    };

    // Region -> Province dropdown logic
    useEffect(() => {
        const regionCode = REGION_CODE_MAP[tempCommodity.sourceRegion];
        if (regionCode) {
            const fetchProvinces = async () => {
                try {
                    const res = await fetch(`https://psgc.gitlab.io/api/regions/${regionCode}/provinces/`);
                    const data = await res.json();
                    setProvinceOptions(data.map((p:any) => p.name).sort());
                } catch {
                    setProvinceOptions([]);
                }
            };
            fetchProvinces();
        } else {
            setProvinceOptions([]);
        }
    }, [tempCommodity.sourceRegion]);

    const saveTempCommodity = () => {
        if (!tempCommodity.name || !tempCommodity.type) return alert("Type and Commodity Name are required.");
        setFormData(prev => {
            const newList = [...(prev.commodityNeeds || [])];
            if (editingCommodityIdx !== null) newList[editingCommodityIdx] = tempCommodity;
            else newList.push({ ...tempCommodity, id: Date.now() });
            return { ...prev, commodityNeeds: newList };
        });
        resetTempCommodity();
    };

    const resetTempCommodity = () => {
        setTempCommodity({
            id: '', name: '', type: '', sourceRegion: '', sourceProvince: '', qualityStandard: '',
            volumeJan: 0, volumeFeb: 0, volumeMar: 0, volumeApr: 0, volumeMay: 0, volumeJun: 0,
            volumeJul: 0, volumeAug: 0, volumeSep: 0, volumeOct: 0, volumeNov: 0, volumeDec: 0
        });
        setEditingCommodityIdx(null);
    };

    const handleEditCommodity = (idx: number) => {
        setTempCommodity({ ...formData.commodityNeeds[idx] });
        setEditingCommodityIdx(idx);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const historyEntry = {
            date: new Date().toISOString(),
            event: 'Profile Details Updated',
            user: currentUser?.fullName || 'System'
        };

        const updatedPartner = { 
            ...formData, 
            history: [...(partner.history || []), historyEntry],
            updated_at: new Date().toISOString() 
        };
        
        if (supabase) {
            try {
                const { id, ...payload } = updatedPartner;
                const { error } = await supabase.from('marketing_partners').update(payload).eq('id', partner.id);
                if (error) throw error;
            } catch (err: any) {
                alert("Failed to update database: " + err.message);
                return;
            }
        }

        onUpdatePartner(updatedPartner);
        onBack();
    };

    return (
        <div className="space-y-6 animate-fadeIn pb-20">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Edit Partner Details</h1>
                    <p className="text-sm text-gray-500">{partner.companyName} | {partner.uid}</p>
                </div>
                <button onClick={onBack} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm font-bold">Back to Profile</button>
            </header>

            <form onSubmit={handleSave} className="space-y-8 bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                        <h3 className="font-bold text-emerald-600 border-b pb-1">Company Profile</h3>
                        <div>
                            <label className="block text-sm font-medium">Company Name</label>
                            <input type="text" name="companyName" value={formData.companyName} onChange={handleInputChange} required className={commonInputClasses} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium">Buyer Type</label>
                                <select name="buyerType" value={formData.buyerType} onChange={handleInputChange} className={commonInputClasses}>
                                    {BUYER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium">Owner / Contact</label>
                                <input type="text" name="ownerName" value={formData.ownerName} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium">Contact Number</label>
                                <input type="text" name="contactNumber" value={formData.contactNumber} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium">Email Address</label>
                                <input type="email" name="email" value={formData.email} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Company Location</label>
                            <LocationPicker value={formData.location} onChange={handleLocationChange} />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="font-bold text-emerald-600 border-b pb-1">Preferences</h3>
                        <div>
                            <label className="block text-sm font-medium mb-2">Preferred Payment Methods</label>
                            <div className="flex flex-wrap gap-2">
                                {PAYMENT_METHODS.map(m => (
                                    <button key={m} type="button" onClick={() => handlePaymentToggle(m)} className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${formData.paymentMethods.includes(m) ? 'bg-emerald-100 border-emerald-500 text-emerald-700' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-500'}`}>{m}</button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium">Remarks</label>
                            <textarea name="remarks" value={formData.remarks} onChange={handleInputChange} rows={5} className={commonInputClasses} />
                        </div>
                    </div>
                </div>

                <div className="space-y-4 border-t pt-6">
                    <h3 className="font-bold text-emerald-600">Commodity Requirements</h3>
                    <div className="bg-gray-50 dark:bg-gray-900/40 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                            <div><label className="block text-xs font-bold uppercase text-gray-500">Type</label><select name="type" value={tempCommodity.type} onChange={handleTempCommodityChange} className={commonInputClasses}><option value="">Select Type</option>{referenceCommodityTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                            <div><label className="block text-xs font-bold uppercase text-gray-500">Commodity Name</label><select name="name" value={tempCommodity.name} onChange={handleTempCommodityChange} disabled={!tempCommodity.type} className={commonInputClasses}><option value="">Select Commodity</option>{tempCommodity.type && commodityCategories[tempCommodity.type]?.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                            <div><label className="block text-xs font-bold uppercase text-gray-500">Source Region</label><select name="sourceRegion" value={tempCommodity.sourceRegion} onChange={handleTempCommodityChange} className={commonInputClasses}><option value="">Select Region</option>{philippineRegions.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                            <div><label className="block text-xs font-bold uppercase text-gray-500">Source Province</label><select name="sourceProvince" value={tempCommodity.sourceProvince} onChange={handleTempCommodityChange} className={commonInputClasses} disabled={provinceOptions.length === 0}><option value="">Select Province</option>{provinceOptions.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><label className="block text-xs font-bold uppercase text-gray-500">Quality Standard</label><input type="text" name="qualityStandard" value={tempCommodity.qualityStandard} onChange={handleTempCommodityChange} className={commonInputClasses} placeholder="Grade A, Organic, etc." /></div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Monthly Volume (Kg/Month)</label>
                                <div className="grid grid-cols-6 gap-2">
                                    {MONTHS.map(m => (
                                        <div key={m}>
                                            <label className="block text-[10px] text-gray-400">{m}</label>
                                            <input type="number" value={(tempCommodity as any)[`volume${m}`] || ''} onChange={e => setTempCommodity({...tempCommodity, [`volume${m}`]: parseFloat(e.target.value) || 0})} className="w-full text-xs p-1 border rounded dark:bg-gray-700 dark:border-gray-600" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            {editingCommodityIdx !== null && <button type="button" onClick={resetTempCommodity} className="px-4 py-1 text-xs font-bold bg-gray-200 text-gray-700 rounded">Cancel Edit</button>}
                            <button type="button" onClick={saveTempCommodity} className="px-6 py-2 bg-emerald-600 text-white rounded font-bold text-sm hover:bg-emerald-700">{editingCommodityIdx !== null ? 'Update Item' : 'Add Requirement'}</button>
                        </div>
                    </div>

                    <div className="space-y-2 mt-4">
                        {formData.commodityNeeds?.map((c, i) => (
                            <div key={i} className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 flex justify-between items-center shadow-sm">
                                <div>
                                    <p className="font-bold text-gray-800 dark:text-white">{c.name} <span className="text-xs font-normal text-gray-400">({c.type})</span></p>
                                    <p className="text-xs text-gray-500">{c.sourceProvince || 'Any Province'}, {c.sourceRegion}</p>
                                </div>
                                <div className="flex gap-4">
                                    <button type="button" onClick={() => handleEditCommodity(i)} className="text-emerald-600 font-bold text-xs">Edit</button>
                                    <button type="button" onClick={() => setFormData(prev => ({...prev, commodityNeeds: prev.commodityNeeds.filter((_, idx) => idx !== i)}))} className="text-red-600 font-bold text-xs">Delete</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="pt-6 flex justify-end border-t">
                    <button type="submit" className="px-10 py-3 bg-emerald-600 text-white rounded-md font-bold hover:bg-emerald-700 shadow-lg transition-all">Save Changes</button>
                </div>
            </form>
        </div>
    );
};

export default MarketProfileEdit;
