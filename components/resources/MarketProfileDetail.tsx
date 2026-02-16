
// Author: 4K 
import React, { useState, useMemo } from 'react';
import { MarketingPartner, IPO, philippineRegions, CommodityNeed } from '../../constants';
import LocationPicker from '../LocationPicker';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';

interface MarketProfileDetailProps {
    partner: MarketingPartner;
    ipos: IPO[];
    onBack: () => void;
    onUpdatePartner: (partner: MarketingPartner) => void;
    setPartners: React.Dispatch<React.SetStateAction<MarketingPartner[]>>;
}

const BUYER_TYPES = ['Private Company', 'Government'];
const PAYMENT_METHODS = ['Bank Transfer', 'Cash', 'Cash on Delivery', 'Voucher'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm text-gray-900 dark:text-white";

const MarketProfileDetail: React.FC<MarketProfileDetailProps> = ({ partner, ipos, onBack, onUpdatePartner, setPartners }) => {
    const { currentUser } = useAuth();
    const isAdmin = currentUser?.role === 'Administrator';
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<MarketingPartner>(partner);

    // Commodity Form State
    const [showCommodityModal, setShowCommodityModal] = useState(false);
    const [editingCommodityIdx, setEditingCommodityIdx] = useState<number | null>(null);
    const [tempCommodity, setTempCommodity] = useState<CommodityNeed>({
        id: '',
        name: '',
        sourceProvince: '',
        qualityStandard: '',
        volumeJan: 0, volumeFeb: 0, volumeMar: 0, volumeApr: 0, volumeMay: 0, volumeJun: 0,
        volumeJul: 0, volumeAug: 0, volumeSep: 0, volumeOct: 0, volumeNov: 0, volumeDec: 0
    });

    const potentialIpos = useMemo(() => {
        if (!formData.commodityNeeds) return [];
        const needsNames = formData.commodityNeeds.map(c => c.name.toLowerCase());
        return ipos.filter(ipo => 
            ipo.commodities.some(c => needsNames.includes(c.particular.toLowerCase()))
        );
    }, [formData.commodityNeeds, ipos]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handlePaymentToggle = (method: string) => {
        setFormData(prev => {
            const existing = prev.paymentMethods || [];
            if (existing.includes(method)) {
                return { ...prev, paymentMethods: existing.filter(m => m !== method) };
            }
            return { ...prev, paymentMethods: [...existing, method] };
        });
    };

    const handleAddCommodity = () => {
        setTempCommodity({
            id: Date.now(),
            name: '',
            sourceProvince: '',
            qualityStandard: '',
            volumeJan: 0, volumeFeb: 0, volumeMar: 0, volumeApr: 0, volumeMay: 0, volumeJun: 0,
            volumeJul: 0, volumeAug: 0, volumeSep: 0, volumeOct: 0, volumeNov: 0, volumeDec: 0
        });
        setEditingCommodityIdx(null);
        setShowCommodityModal(true);
    };

    const handleEditCommodity = (idx: number) => {
        setTempCommodity({ ...formData.commodityNeeds[idx] });
        setEditingCommodityIdx(idx);
        setShowCommodityModal(true);
    };

    const saveTempCommodity = () => {
        if (!tempCommodity.name) return alert("Commodity Name is required.");
        
        setFormData(prev => {
            const newList = [...(prev.commodityNeeds || [])];
            if (editingCommodityIdx !== null) {
                newList[editingCommodityIdx] = tempCommodity;
            } else {
                newList.push(tempCommodity);
            }
            return { ...prev, commodityNeeds: newList };
        });
        setShowCommodityModal(false);
    };

    const removeCommodity = (idx: number) => {
        if (!confirm("Remove this requirement?")) return;
        setFormData(prev => ({ ...prev, commodityNeeds: prev.commodityNeeds.filter((_, i) => i !== idx) }));
    };

    const handleSave = async () => {
        const updatedPartner = { ...formData, updated_at: new Date().toISOString() };
        
        if (supabase) {
            try {
                const { id, ...payload } = updatedPartner;
                const { error } = await supabase.from('marketing_partners').update(payload).eq('id', id);
                if (error) throw error;
            } catch (err: any) {
                alert("Failed to update database: " + err.message);
                return;
            }
        }

        onUpdatePartner(updatedPartner);
        setIsEditing(false);
    };

    const handleDelete = async () => {
        if (!window.confirm("Are you sure you want to delete this marketing partner?")) return;

        if (supabase) {
            try {
                const { error } = await supabase.from('marketing_partners').delete().eq('id', partner.id);
                if (error) throw error;
            } catch (err: any) {
                alert("Failed to delete from database: " + err.message);
                return;
            }
        }

        setPartners(prev => prev.filter(p => p.id !== partner.id));
        onBack();
    };

    const DetailBlock = ({ label, value }: { label: string, value: any }) => (
        <div>
            <dt className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</dt>
            <dd className="text-md font-semibold text-gray-800 dark:text-white mt-0.5">{value || 'N/A'}</dd>
        </div>
    );

    return (
        <div className="space-y-8 animate-fadeIn">
            {showCommodityModal && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl max-w-2xl w-full">
                        <h3 className="text-xl font-bold mb-4">Detailed Commodity Requirement</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold uppercase text-gray-500">Commodity Name</label>
                                <input type="text" value={tempCommodity.name} onChange={e => setTempCommodity({...tempCommodity, name: e.target.value})} className={commonInputClasses} placeholder="e.g. Arabica Coffee" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500">Source of Supply (Province)</label>
                                <input type="text" value={tempCommodity.sourceProvince} onChange={e => setTempCommodity({...tempCommodity, sourceProvince: e.target.value})} className={commonInputClasses} placeholder="e.g. Benguet" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500">Quality Standard</label>
                                <input type="text" value={tempCommodity.qualityStandard} onChange={e => setTempCommodity({...tempCommodity, qualityStandard: e.target.value})} className={commonInputClasses} placeholder="e.g. Grade A, Organic" />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Monthly Volume Requirement (Kg/Month)</label>
                                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                                    {MONTHS.map((m, i) => (
                                        <div key={m}>
                                            <label className="block text-[10px] text-gray-400">{m}</label>
                                            <input 
                                                type="number" 
                                                // @ts-ignore
                                                value={tempCommodity[`volume${m}`] || 0} 
                                                onChange={e => setTempCommodity({...tempCommodity, [`volume${m}`]: parseFloat(e.target.value) || 0})}
                                                className="w-full text-xs p-1 border rounded dark:bg-gray-700 dark:border-gray-600" 
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-2">
                            <button onClick={() => setShowCommodityModal(false)} className="px-4 py-2 text-sm font-bold bg-gray-100 text-gray-700 rounded-md">Cancel</button>
                            <button onClick={saveTempCommodity} className="px-4 py-2 text-sm font-bold bg-emerald-600 text-white rounded-md">Save Commodity</button>
                        </div>
                    </div>
                </div>
            )}

            <header className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-gray-200 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    </button>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800 dark:text-white">{partner.companyName}</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Marketing Partner Profile | {partner.uid}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    {isAdmin && !isEditing && (
                        <>
                            <button onClick={() => setIsEditing(true)} className="px-4 py-2 bg-emerald-600 text-white rounded-md font-bold hover:bg-emerald-700 shadow-md">
                                Edit Profile
                            </button>
                            <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded-md font-bold hover:bg-red-700 shadow-md">
                                Delete Partner
                            </button>
                        </>
                    )}
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border-t-4 border-emerald-500">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-800 dark:text-white">General Information</h3>
                            {isEditing && (
                                <div className="flex gap-2">
                                    <button onClick={() => setIsEditing(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md text-sm font-bold">Cancel</button>
                                    <button onClick={handleSave} className="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-bold">Save Changes</button>
                                </div>
                            )}
                        </div>

                        {isEditing ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-gray-500">Company Name</label>
                                    <input type="text" name="companyName" value={formData.companyName} onChange={handleInputChange} className={commonInputClasses} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500">Buyer Type</label>
                                    <select name="buyerType" value={formData.buyerType} onChange={handleInputChange} className={commonInputClasses}>
                                        {BUYER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500">Owner Name</label>
                                    <input type="text" name="ownerName" value={formData.ownerName} onChange={handleInputChange} className={commonInputClasses} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500">Contact Number</label>
                                    <input type="text" name="contactNumber" value={formData.contactNumber} onChange={handleInputChange} className={commonInputClasses} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500">Email</label>
                                    <input type="email" name="email" value={formData.email} onChange={handleInputChange} className={commonInputClasses} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500">Region</label>
                                    <select name="region" value={formData.region} onChange={handleInputChange} className={commonInputClasses}>
                                        {philippineRegions.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Location</label>
                                    <LocationPicker value={formData.location} onChange={(v) => setFormData(p => ({...p, location: v}))} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 mb-2">Payment Methods</label>
                                    <div className="flex flex-wrap gap-2">
                                        {PAYMENT_METHODS.map(m => (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() => handlePaymentToggle(m)}
                                                className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${formData.paymentMethods.includes(m) ? 'bg-emerald-100 border-emerald-500 text-emerald-700' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-500'}`}
                                            >
                                                {m}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="md:col-span-2">
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="block text-xs font-bold text-gray-500">Commodity Needs</label>
                                        <button type="button" onClick={handleAddCommodity} className="text-xs bg-emerald-600 text-white px-2 py-1 rounded font-bold">Add New</button>
                                    </div>
                                    <div className="space-y-2">
                                        {(formData.commodityNeeds || []).map((c, i) => (
                                            <div key={i} className="flex justify-between items-center bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg border border-gray-200 dark:border-gray-600">
                                                <div>
                                                    <p className="font-bold text-sm text-gray-800 dark:text-white">{c.name}</p>
                                                    <p className="text-xs text-gray-500">Source: {c.sourceProvince || 'Any'}</p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button type="button" onClick={() => handleEditCommodity(i)} className="text-xs text-emerald-600 font-bold">Edit</button>
                                                    <button type="button" onClick={() => removeCommodity(i)} className="text-xs text-red-600 font-bold">Delete</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-gray-500">Remarks</label>
                                    <textarea name="remarks" value={formData.remarks} onChange={handleInputChange} rows={3} className={commonInputClasses} />
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-8">
                                <DetailBlock label="Buyer Type" value={<span className={`px-2 py-0.5 rounded-full font-bold text-xs ${partner.buyerType === 'Government' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>{partner.buyerType || 'Private'}</span>} />
                                <DetailBlock label="Owner / Principal" value={partner.ownerName} />
                                <DetailBlock label="Payment Methods" value={
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {partner.paymentMethods?.map(m => <span key={m} className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-[10px] font-bold uppercase">{m}</span>)}
                                        {(!partner.paymentMethods || partner.paymentMethods.length === 0) && <span className="text-gray-400 italic text-xs">Unspecified</span>}
                                    </div>
                                } />
                                <DetailBlock label="Contact Number" value={partner.contactNumber} />
                                <DetailBlock label="Email Address" value={partner.email} />
                                <DetailBlock label="Region" value={partner.region} />
                                <div className="md:col-span-2">
                                    <DetailBlock label="Location" value={partner.location} />
                                </div>
                                <div className="md:col-span-2">
                                    <dt className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Detailed Commodity Needs</dt>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {partner.commodityNeeds?.map((c, i) => {
                                            const totalVolume = MONTHS.reduce((sum, m) => sum + (Number((c as any)[`volume${m}`]) || 0), 0);
                                            return (
                                                <div key={i} className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm space-y-3">
                                                    <div className="flex justify-between items-start">
                                                        <h4 className="font-bold text-gray-800 dark:text-white">{c.name}</h4>
                                                        <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold uppercase">{c.sourceProvince || 'Any Source'}</span>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase">Quality Standard</p>
                                                        <p className="text-xs text-gray-700 dark:text-gray-300 italic">"{c.qualityStandard || 'None specified.'}"</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase flex justify-between">
                                                            Monthly Volumes
                                                            <span className="text-emerald-600">Total: {totalVolume.toLocaleString()} Kg/Yr</span>
                                                        </p>
                                                        <div className="grid grid-cols-6 gap-1 mt-1">
                                                            {MONTHS.map(m => {
                                                                const val = (c as any)[`volume${m}`] || 0;
                                                                return (
                                                                    <div key={m} className="flex flex-col items-center bg-white dark:bg-gray-800 p-0.5 rounded border border-gray-100 dark:border-gray-700">
                                                                        <span className="text-[8px] text-gray-400 uppercase">{m}</span>
                                                                        <span className={`text-[9px] font-bold ${val > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>{val > 0 ? val.toLocaleString() : '-'}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {(!partner.commodityNeeds || partner.commodityNeeds.length === 0) && (
                                            <p className="col-span-2 text-center py-4 text-gray-400 italic text-sm">No commodity requirements listed.</p>
                                        )}
                                    </div>
                                </div>
                                <div className="md:col-span-2">
                                    <DetailBlock label="Remarks" value={<p className="italic text-gray-600 dark:text-gray-400">{partner.remarks || 'No additional remarks.'}</p>} />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                <span className="w-1.5 h-6 bg-teal-500 rounded-full"></span>
                                Matched IPO Producers
                            </h3>
                            <span className="px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 text-xs font-bold">{potentialIpos.length} Matches</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {potentialIpos.map(ipo => {
                                const matchingComms = ipo.commodities.filter(c => 
                                    formData.commodityNeeds?.map(n => n.name.toLowerCase()).includes(c.particular.toLowerCase())
                                );
                                return (
                                    <div key={ipo.id} className="p-4 bg-gray-50 dark:bg-gray-700/30 border border-gray-100 dark:border-gray-700 rounded-lg group hover:border-teal-400 transition-colors">
                                        <h4 className="font-bold text-gray-800 dark:text-white group-hover:text-teal-600 transition-colors">{ipo.name}</h4>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{ipo.location}</p>
                                        <div className="mt-3 space-y-1">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase">Produces Matches:</p>
                                            <div className="flex flex-wrap gap-1">
                                                {matchingComms.map((mc, idx) => (
                                                    <span key={idx} className="text-[10px] bg-white dark:bg-gray-800 px-2 py-0.5 rounded border border-teal-200 dark:border-teal-800 text-teal-600 font-bold">
                                                        {mc.particular}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {potentialIpos.length === 0 && (
                                <div className="col-span-2 text-center py-8 text-gray-400 italic text-sm">
                                    No IPOs found in the system that produce the commodities needed by this partner.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-8">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border-b-4 border-emerald-500">
                        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">Metadata</h3>
                        <div className="space-y-4">
                            <DetailBlock label="Encoded By" value={partner.encodedBy} />
                            <DetailBlock label="Last Updated" value={partner.updated_at ? new Date(partner.updated_at).toLocaleString() : 'Never'} />
                            <DetailBlock label="Profile Created" value={new Date(partner.created_at || '').toLocaleString()} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MarketProfileDetail;
