
// Author: 4K 
import React, { useState, useMemo } from 'react';
import { MarketingPartner, IPO, MarketLinkage, philippineRegions } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';

interface MarketLinkageEditProps {
    partner: MarketingPartner;
    ipos: IPO[];
    onBack: () => void;
    onUpdatePartner: (partner: MarketingPartner) => void;
}

const NEGOTIATION_STATUSES = ['Agreed', 'Contract Signed', 'Pending Test Buy'];
const AGREEMENT_TYPES = ['Verbal', 'Contract', 'Warehouse Delivery Receipt'];
const TIMEFRAMES = ['Per Week', 'Monthly', 'One-time Transaction'];

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm text-gray-900 dark:text-white";

const MarketLinkageEdit: React.FC<MarketLinkageEditProps> = ({ partner, ipos, onBack, onUpdatePartner }) => {
    const { currentUser } = useAuth();
    const [formData, setFormData] = useState<MarketingPartner>(partner);
    
    // Linkage Entry State
    const [editingLinkageIdx, setEditingLinkageIdx] = useState<number | null>(null);
    const [tempLinkage, setTempLinkage] = useState<MarketLinkage>({
        id: '', region: '', ipoName: '', negotiationStatus: 'Agreed',
        agreedQuantityValue: 0, agreedQuantityTimeframe: 'Monthly',
        agreedPricePerKg: 0, agreementType: 'Verbal', agreementDate: '',
        testBuyConducted: false
    });

    const iposInLinkageRegion = useMemo(() => {
        if (!tempLinkage.region) return [];
        return ipos.filter(i => i.region === tempLinkage.region).sort((a, b) => a.name.localeCompare(b.name));
    }, [tempLinkage.region, ipos]);

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

    const handleEditLinkage = (link: MarketLinkage, idx: number) => {
        setTempLinkage({ ...link });
        setEditingLinkageIdx(idx);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const historyEntry = {
            date: new Date().toISOString(),
            event: 'Market Linkages Updated',
            user: currentUser?.fullName || 'System'
        };

        const updatedPartner = { 
            ...formData, 
            linkedIpoNames: formData.marketingLinkages?.map(l => l.ipoName) || [],
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
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Manage Linkages</h1>
                    <p className="text-sm text-gray-500">{partner.companyName} | {partner.uid}</p>
                </div>
                <button onClick={onBack} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm font-bold">Back to Profile</button>
            </header>

            <form onSubmit={handleSave} className="space-y-8 bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
                <div className="bg-gray-50 dark:bg-gray-900/40 p-6 rounded-lg border border-emerald-200 dark:border-emerald-800 space-y-4">
                    <h3 className="font-bold text-emerald-600 mb-4">{editingLinkageIdx !== null ? 'Update Linkage' : 'Establish New Linkage'}</h3>
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
                                    <textarea value={tempLinkage.testBuyFeedback || ''} onChange={e => setTempLinkage({...tempLinkage, testBuyFeedback: e.target.value})} rows={3} className={commonInputClasses} />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-2">
                        {editingLinkageIdx !== null && <button type="button" onClick={resetTempLinkage} className="px-4 py-1 text-xs font-bold bg-gray-200 text-gray-700 rounded">Cancel</button>}
                        <button type="button" onClick={handleSaveLinkage} className="px-6 py-2 bg-emerald-600 text-white rounded font-bold text-sm shadow-md hover:bg-emerald-700 transition-all">
                            {editingLinkageIdx !== null ? 'Update Item' : 'Add Linkage to List'}
                        </button>
                    </div>
                </div>

                <div className="space-y-3">
                    <h3 className="font-bold text-gray-700 dark:text-gray-200">Established Linkages List</h3>
                    {(formData.marketingLinkages || []).map((link, idx) => (
                        <div key={idx} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 flex justify-between items-center shadow-sm">
                            <div>
                                <p className="font-bold text-gray-800 dark:text-white">{link.ipoName}</p>
                                <p className="text-xs text-gray-500">{link.negotiationStatus} • {link.agreedQuantityValue}Kg {link.agreedQuantityTimeframe} • {link.region}</p>
                            </div>
                            <div className="flex gap-4">
                                <button type="button" onClick={() => handleEditLinkage(link, idx)} className="text-emerald-600 font-bold text-xs">Edit</button>
                                <button type="button" onClick={() => setFormData(prev => ({...prev, marketingLinkages: prev.marketingLinkages?.filter((_, i) => i !== idx)}))} className="text-red-600 font-bold text-xs">Remove</button>
                            </div>
                        </div>
                    ))}
                    {(formData.marketingLinkages || []).length === 0 && (
                        <p className="text-sm text-gray-400 italic text-center py-6">No linkages in the list.</p>
                    )}
                </div>

                <div className="pt-6 flex justify-end border-t">
                    <button type="submit" className="px-10 py-3 bg-emerald-600 text-white rounded-md font-bold hover:bg-emerald-700 shadow-lg transition-all">Save All Linkages</button>
                </div>
            </form>
        </div>
    );
};

export default MarketLinkageEdit;
