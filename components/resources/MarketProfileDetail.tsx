
// Author: 4K 
import React, { useState, useMemo, useEffect } from 'react';
import { MarketingPartner, IPO, philippineRegions, CommodityNeed, MarketLinkage, referenceCommodityTypes } from '../../constants';
import LocationPicker, { parseLocation } from '../LocationPicker';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';

interface MarketProfileDetailProps {
    partner: MarketingPartner;
    ipos: IPO[];
    onBack: () => void;
    onUpdatePartner: (partner: MarketingPartner) => void;
    setPartners: React.Dispatch<React.SetStateAction<MarketingPartner[]>>;
    commodityCategories: { [key: string]: string[] };
}

const BUYER_TYPES = ['Private Company', 'Government'];
const PAYMENT_METHODS = ['Bank Transfer', 'Cash', 'Cash on Delivery', 'Voucher'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const NEGOTIATION_STATUSES = ['Agreed', 'Contract Signed', 'Pending Test Buy'];
const AGREEMENT_TYPES = ['Verbal', 'Contract', 'Warehouse Delivery Receipt'];
const TIMEFRAMES = ['Per Week', 'Monthly', 'One-time Transaction'];

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm text-gray-900 dark:text-white";

const MarketProfileDetail: React.FC<MarketProfileDetailProps> = ({ partner, ipos, onBack, onUpdatePartner, setPartners, commodityCategories }) => {
    const { currentUser } = useAuth();
    const isAdmin = currentUser?.role === 'Administrator';
    
    // Modes
    const [editMode, setEditMode] = useState<'none' | 'details' | 'linkages'>('none');
    const [formData, setFormData] = useState<MarketingPartner>(partner);

    // Inline Commodity Entry State (for Details edit mode)
    const [editingCommodityIdx, setEditingCommodityIdx] = useState<number | null>(null);
    const [tempCommodity, setTempCommodity] = useState<CommodityNeed>({
        id: '', name: '', type: '', sourceRegion: '', sourceProvince: '', qualityStandard: '',
        volumeJan: 0, volumeFeb: 0, volumeMar: 0, volumeApr: 0, volumeMay: 0, volumeJun: 0,
        volumeJul: 0, volumeAug: 0, volumeSep: 0, volumeOct: 0, volumeNov: 0, volumeDec: 0
    });
    const [provinceOptions, setProvinceOptions] = useState<string[]>([]);

    // Linkage Entry State
    const [editingLinkageIdx, setEditingLinkageIdx] = useState<number | null>(null);
    const [tempLinkage, setTempLinkage] = useState<MarketLinkage>({
        id: '', region: '', ipoName: '', negotiationStatus: 'Agreed',
        agreedQuantityValue: 0, agreedQuantityTimeframe: 'Monthly',
        agreedPricePerKg: 0, agreementType: 'Verbal', agreementDate: '',
        testBuyConducted: false
    });

    // Filter and Sort IPOs by Region Proximity (Potential)
    const potentialIpos = useMemo(() => {
        if (!formData.commodityNeeds) return [];
        const needsNames = formData.commodityNeeds.map(c => c.name.toLowerCase());
        const filtered = ipos.filter(ipo => 
            ipo.commodities.some(c => needsNames.includes(c.particular.toLowerCase()))
        );
        const partnerRegion = formData.region;
        return filtered.sort((a, b) => {
            if (a.region === partnerRegion && b.region !== partnerRegion) return -1;
            if (a.region !== partnerRegion && b.region === partnerRegion) return 1;
            if (a.region !== b.region) return a.region.localeCompare(b.region);
            return a.name.localeCompare(b.name);
        });
    }, [formData.commodityNeeds, formData.region, ipos]);

    const iposInLinkageRegion = useMemo(() => {
        if (!tempLinkage.region) return [];
        return ipos.filter(i => i.region === tempLinkage.region).sort((a, b) => a.name.localeCompare(b.name));
    }, [tempLinkage.region, ipos]);

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
            if (existing.includes(method)) {
                return { ...prev, paymentMethods: existing.filter(m => m !== method) };
            }
            return { ...prev, paymentMethods: [...existing, method] };
        });
    };

    const handleTempCommodityChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setTempCommodity(prev => ({ ...prev, [name]: value }));
    };

    // Region -> Province dropdown logic
    useEffect(() => {
        if (tempCommodity.sourceRegion) {
            const fetchProvinces = async () => {
                try {
                    const res = await fetch(`https://psgc.gitlab.io/api/regions/${tempCommodity.sourceRegion.split('|')[0]}/provinces/`);
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
            const cleanSource = tempCommodity.sourceRegion.includes('|') ? tempCommodity.sourceRegion.split('|')[1] : tempCommodity.sourceRegion;
            const itemToSave = { ...tempCommodity, sourceRegion: cleanSource };
            if (editingCommodityIdx !== null) newList[editingCommodityIdx] = itemToSave;
            else newList.push({ ...itemToSave, id: Date.now() });
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

    const handleSaveLinkage = () => {
        if (!tempLinkage.ipoName || !tempLinkage.region) return alert("Region and IPO are required.");
        setFormData(prev => {
            const newList = [...(prev.marketingLinkages || [])];
            if (editingLinkageIdx !== null) newList[editingLinkageIdx] = tempLinkage;
            else newList.push({ ...tempLinkage, id: Date.now() });
            return { ...prev, marketingLinkages: newList };
        });
        resetTempLinkage();
    };

    const resetTempLinkage = () => {
        setTempLinkage({
            id: '', region: '', ipoName: '', negotiationStatus: 'Agreed',
            agreedQuantityValue: 0, agreedQuantityTimeframe: 'Monthly',
            agreedPricePerKg: 0, agreementType: 'Verbal', agreementDate: '',
            testBuyConducted: false
        });
        setEditingLinkageIdx(null);
    };

    const handleSave = async () => {
        const historyEntry = {
            date: new Date().toISOString(),
            event: editMode === 'details' ? 'Profile Details Updated' : 'Market Linkages Updated',
            user: currentUser?.fullName || 'System'
        };

        const updatedPartner = { 
            ...formData, 
            history: [...(partner.history || []), historyEntry],
            updated_at: new Date().toISOString() 
        };
        
        if (supabase) {
            try {
                // Ensure field names exactly match the DB schema (quoted for camelCase)
                const payload = {
                    uid: updatedPartner.uid,
                    companyName: updatedPartner.companyName,
                    ownerName: updatedPartner.ownerName,
                    contactNumber: updatedPartner.contactNumber,
                    email: updatedPartner.email,
                    location: updatedPartner.location,
                    region: updatedPartner.region,
                    buyerType: updatedPartner.buyerType,
                    paymentMethods: updatedPartner.paymentMethods,
                    commodityNeeds: updatedPartner.commodityNeeds,
                    linkedIpoNames: updatedPartner.marketingLinkages?.map(l => l.ipoName) || [],
                    history: updatedPartner.history,
                    marketingLinkages: updatedPartner.marketingLinkages,
                    remarks: updatedPartner.remarks,
                    encodedBy: updatedPartner.encodedBy,
                    updated_at: updatedPartner.updated_at
                };

                const { error } = await supabase.from('marketing_partners').update(payload).eq('id', partner.id);
                if (error) throw error;
            } catch (err: any) {
                alert("Failed to update database: " + err.message);
                return;
            }
        }

        onUpdatePartner(updatedPartner);
        setEditMode('none');
    };

    const DetailBlock = ({ label, value }: { label: string, value: any }) => (
        <div>
            <dt className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</dt>
            <dd className="text-md font-semibold text-gray-800 dark:text-white mt-0.5">{value || 'N/A'}</dd>
        </div>
    );

    return (
        <div className="space-y-8 animate-fadeIn">
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
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    {/* General Information Section */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-800 dark:text-white">General Information</h3>
                            <div className="flex gap-2">
                                {editMode === 'details' ? (
                                    <>
                                        <button onClick={() => setEditMode('none')} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md text-sm font-bold">Cancel</button>
                                        <button onClick={handleSave} className="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-bold shadow-md">Save Changes</button>
                                    </>
                                ) : (
                                    isAdmin && editMode === 'none' && (
                                        <button onClick={() => setEditMode('details')} className="text-sm text-emerald-600 hover:underline flex items-center gap-1">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                            Edit Details
                                        </button>
                                    )
                                )}
                            </div>
                        </div>

                        {editMode === 'details' ? (
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
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Office Location</label>
                                    <LocationPicker value={formData.location} onChange={handleLocationChange} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 mb-2">Payment Methods</label>
                                    <div className="flex flex-wrap gap-2">
                                        {PAYMENT_METHODS.map(m => (
                                            <button key={m} type="button" onClick={() => handlePaymentToggle(m)} className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${formData.paymentMethods.includes(m) ? 'bg-emerald-100 border-emerald-500 text-emerald-700' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-500'}`}>{m}</button>
                                        ))}
                                    </div>
                                </div>
                                <div className="md:col-span-2 space-y-4 border-t pt-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="block text-xs font-bold text-gray-500 uppercase">Manage Commodity Needs</label>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-gray-900/40 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                                            <div><label className="block text-xs font-medium uppercase text-gray-500">Type</label><select name="type" value={tempCommodity.type} onChange={handleTempCommodityChange} className={commonInputClasses}><option value="">Select</option>{referenceCommodityTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                            <div><label className="block text-xs font-medium uppercase text-gray-500">Commodity</label><select name="name" value={tempCommodity.name} onChange={handleTempCommodityChange} disabled={!tempCommodity.type} className={commonInputClasses}><option value="">Select</option>{tempCommodity.type && commodityCategories[tempCommodity.type]?.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                                            <div><label className="block text-xs font-medium uppercase text-gray-500">Source Region</label>
                                                <select name="sourceRegion" value={tempCommodity.sourceRegion} onChange={handleTempCommodityChange} className={commonInputClasses}>
                                                    <option value="">Select Region</option>
                                                    {philippineRegions.map(r => <option key={r} value={r}>{r}</option>)}
                                                </select>
                                            </div>
                                            <div><label className="block text-xs font-medium uppercase text-gray-500">Province</label><select name="sourceProvince" value={tempCommodity.sourceProvince} onChange={handleTempCommodityChange} className={commonInputClasses} disabled={provinceOptions.length === 0}><option value="">Select</option>{provinceOptions.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                                        </div>
                                        <div className="flex justify-end gap-2">
                                            {editingCommodityIdx !== null && <button type="button" onClick={resetTempCommodity} className="px-4 py-1 text-xs font-bold bg-gray-200 text-gray-700 rounded">Cancel</button>}
                                            <button type="button" onClick={saveTempCommodity} className="px-6 py-2 bg-emerald-600 text-white rounded font-bold text-sm">{editingCommodityIdx !== null ? 'Update Item' : 'Add Item'}</button>
                                        </div>
                                    </div>
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
                                <div className="md:col-span-2"><DetailBlock label="Location" value={partner.location} /></div>
                            </div>
                        )}
                    </div>

                    {/* Established Linkages Section */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-800 dark:text-white">Marketing Linkages</h3>
                            <div className="flex gap-2">
                                {editMode === 'linkages' ? (
                                    <>
                                        <button onClick={() => setEditMode('none')} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md text-sm font-bold">Cancel</button>
                                        <button onClick={handleSave} className="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-bold shadow-md">Save Linkages</button>
                                    </>
                                ) : (
                                    isAdmin && editMode === 'none' && (
                                        <button onClick={() => setEditMode('linkages')} className="text-sm text-emerald-600 hover:underline flex items-center gap-1">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                            Edit Market Linkage
                                        </button>
                                    )
                                )}
                            </div>
                        </div>

                        {editMode === 'linkages' ? (
                            <div className="space-y-6">
                                <div className="bg-gray-50 dark:bg-gray-900/40 p-4 rounded-lg border border-emerald-200 dark:border-emerald-800 space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold uppercase text-gray-500">Region</label>
                                            <select value={tempLinkage.region} onChange={e => setTempLinkage({...tempLinkage, region: e.target.value, ipoName: ''})} className={commonInputClasses}>
                                                <option value="">Select Region</option>
                                                {philippineRegions.map(r => <option key={r} value={r}>{r}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold uppercase text-gray-500">IPO</label>
                                            <select value={tempLinkage.ipoName} onChange={e => setTempLinkage({...tempLinkage, ipoName: e.target.value})} disabled={!tempLinkage.region} className={commonInputClasses}>
                                                <option value="">Select IPO</option>
                                                {iposInLinkageRegion.map(i => <option key={i.id} value={i.name}>{i.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold uppercase text-gray-500">Negotiation Status</label>
                                            <select value={tempLinkage.negotiationStatus} onChange={e => setTempLinkage({...tempLinkage, negotiationStatus: e.target.value as any})} className={commonInputClasses}>
                                                {NEGOTIATION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold uppercase text-gray-500">Agreement Type</label>
                                            <select value={tempLinkage.agreementType} onChange={e => setTempLinkage({...tempLinkage, agreementType: e.target.value as any})} className={commonInputClasses}>
                                                {AGREEMENT_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="block text-xs font-bold uppercase text-gray-500">Agreed Qty (Kg)</label>
                                                <input type="number" value={tempLinkage.agreedQuantityValue || ''} onChange={e => setTempLinkage({...tempLinkage, agreedQuantityValue: parseFloat(e.target.value) || 0})} className={commonInputClasses} />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold uppercase text-gray-500">Timeframe</label>
                                                <select value={tempLinkage.agreedQuantityTimeframe} onChange={e => setTempLinkage({...tempLinkage, agreedQuantityTimeframe: e.target.value as any})} className={commonInputClasses}>
                                                    {TIMEFRAMES.map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="block text-xs font-bold uppercase text-gray-500">Agreed Price (₱/Kg)</label>
                                                <input type="number" value={tempLinkage.agreedPricePerKg || ''} onChange={e => setTempLinkage({...tempLinkage, agreedPricePerKg: parseFloat(e.target.value) || 0})} className={commonInputClasses} />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold uppercase text-gray-500">Agreement Date</label>
                                                <input type="date" value={tempLinkage.agreementDate} onChange={e => setTempLinkage({...tempLinkage, agreementDate: e.target.value})} className={commonInputClasses} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Test Buy Information */}
                                    <div className="pt-4 border-t dark:border-gray-700">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={tempLinkage.testBuyConducted} onChange={e => setTempLinkage({...tempLinkage, testBuyConducted: e.target.checked})} className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                                            <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Test Buy Information</span>
                                        </label>
                                        
                                        {tempLinkage.testBuyConducted && (
                                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                                                <div>
                                                    <label className="block text-xs font-bold uppercase text-gray-500">Test Buy Date</label>
                                                    <input type="date" value={tempLinkage.testBuyDate || ''} onChange={e => setTempLinkage({...tempLinkage, testBuyDate: e.target.value})} className={commonInputClasses} />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold uppercase text-gray-500">Test Buy Qty (Kg)</label>
                                                    <input type="number" value={tempLinkage.testBuyQuantity || ''} onChange={e => setTempLinkage({...tempLinkage, testBuyQuantity: parseFloat(e.target.value) || 0})} className={commonInputClasses} />
                                                </div>
                                                <div className="md:col-span-2">
                                                    <label className="block text-xs font-bold uppercase text-gray-500">Test Buy Feedback</label>
                                                    <textarea value={tempLinkage.testBuyFeedback || ''} onChange={e => setTempLinkage({...tempLinkage, testBuyFeedback: e.target.value})} rows={2} className={commonInputClasses} />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex justify-end gap-2">
                                        {editingLinkageIdx !== null && <button type="button" onClick={resetTempLinkage} className="px-4 py-1 text-xs font-bold bg-gray-200 text-gray-700 rounded">Cancel</button>}
                                        <button type="button" onClick={handleSaveLinkage} className="px-6 py-2 bg-emerald-600 text-white rounded font-bold text-sm shadow-md hover:bg-emerald-700">
                                            {editingLinkageIdx !== null ? 'Update Linkage' : 'Establish Linkage'}
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {(formData.marketingLinkages || []).map((link, idx) => (
                                        <div key={idx} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 flex justify-between items-center">
                                            <div>
                                                <p className="font-bold text-gray-800 dark:text-white">{link.ipoName}</p>
                                                <p className="text-xs text-gray-500">{link.negotiationStatus} • {link.agreedQuantityValue}Kg {link.agreedQuantityTimeframe}</p>
                                            </div>
                                            <div className="flex gap-4">
                                                <button type="button" onClick={() => handleEditLinkage(link, idx)} className="text-emerald-600 font-bold text-xs">Edit</button>
                                                <button type="button" onClick={() => setFormData(prev => ({...prev, marketingLinkages: prev.marketingLinkages?.filter((_, i) => i !== idx)}))} className="text-red-600 font-bold text-xs">Remove</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {(partner.marketingLinkages || []).length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {partner.marketingLinkages?.map((link, idx) => (
                                            <div key={idx} className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm space-y-3">
                                                <div className="flex justify-between items-start">
                                                    <h4 className="font-bold text-emerald-600 dark:text-emerald-400">{link.ipoName}</h4>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${link.negotiationStatus === 'Contract Signed' ? 'bg-emerald-100 text-emerald-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                        {link.negotiationStatus}
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-xs">
                                                    <div><p className="text-[10px] text-gray-400 uppercase font-bold">Qty Agreement</p><p className="font-medium text-gray-700 dark:text-gray-200">{link.agreedQuantityValue} Kg ({link.agreedQuantityTimeframe})</p></div>
                                                    <div><p className="text-[10px] text-gray-400 uppercase font-bold">Agreed Price</p><p className="font-medium text-gray-700 dark:text-gray-200">₱{link.agreedPricePerKg}/Kg</p></div>
                                                    <div><p className="text-[10px] text-gray-400 uppercase font-bold">Agreement Type</p><p className="font-medium text-gray-700 dark:text-gray-200">{link.agreementType}</p></div>
                                                    <div><p className="text-[10px] text-gray-400 uppercase font-bold">Effective Date</p><p className="font-medium text-gray-700 dark:text-gray-200">{link.agreementDate ? new Date(link.agreementDate).toLocaleDateString() : 'N/A'}</p></div>
                                                </div>
                                                {link.testBuyConducted && (
                                                    <div className="pt-2 border-t dark:border-gray-600">
                                                        <p className="text-[10px] text-emerald-600 uppercase font-bold mb-1">Test Buy Completed</p>
                                                        <p className="text-xs text-gray-500 italic">"{link.testBuyFeedback || 'No feedback provided.'}"</p>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-10 bg-gray-50 dark:bg-gray-700/20 rounded-xl border-2 border-dashed dark:border-gray-700">
                                        <p className="text-sm text-gray-400 italic">No marketing linkages established yet.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-8">
                    {/* Potential Partners Section (Matched IPOs) */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                <span className="w-1.5 h-6 bg-teal-500 rounded-full"></span>
                                Matched IPO Producers
                            </h3>
                            <span className="px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 text-xs font-bold">{potentialIpos.length} Matches</span>
                        </div>
                        <div className="space-y-3">
                            {potentialIpos.map(ipo => {
                                const matchingComms = ipo.commodities.filter(c => 
                                    formData.commodityNeeds?.map(n => n.name.toLowerCase()).includes(c.particular.toLowerCase())
                                );
                                const isSameRegion = ipo.region === partner.region;
                                return (
                                    <div key={ipo.id} className={`p-4 bg-gray-50 dark:bg-gray-700/30 border border-gray-100 dark:border-gray-700 rounded-lg group hover:border-teal-400 transition-colors ${isSameRegion ? 'ring-2 ring-emerald-100 dark:ring-emerald-900/30' : ''}`}>
                                        <div className="flex justify-between items-start mb-1">
                                            <h4 className="font-bold text-gray-800 dark:text-white group-hover:text-teal-600 transition-colors">{ipo.name}</h4>
                                            {isSameRegion && <span className="text-[9px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-full font-bold uppercase">Nearby</span>}
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{ipo.region}</p>
                                        <div className="mt-3 space-y-1">
                                            <div className="flex flex-wrap gap-1">
                                                {matchingComms.map((mc, idx) => (
                                                    <span key={idx} className="text-[10px] bg-white dark:bg-gray-800 px-2 py-0.5 rounded border border-teal-200 dark:border-teal-800 text-teal-600 font-bold">{mc.particular}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
                        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">Partner History</h3>
                        {partner.history && partner.history.length > 0 ? (
                            <div className="relative border-l-2 border-gray-200 dark:border-gray-700 ml-2 py-2">
                                <ul className="space-y-6">
                                    {partner.history.map((entry, index) => (
                                        <li key={index} className="ml-6 relative">
                                            <span className="absolute flex items-center justify-center w-3 h-3 bg-emerald-500 rounded-full -left-[31px] ring-4 ring-white dark:ring-gray-800"></span>
                                            <time className="mb-1 text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500">{new Date(entry.date).toLocaleDateString()}</time>
                                            <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">{entry.event}</p>
                                            <p className="text-[10px] text-gray-500 dark:text-gray-400">by {entry.user}</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-400 italic">No history available.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    function handleEditLinkage(link: MarketLinkage, idx: number) {
        setTempLinkage({...link});
        setEditingLinkageIdx(idx);
    }
};

export default MarketProfileDetail;
