// Author: 4K
import React, { useMemo, useState } from 'react';
import { IPO, MarketLinkage, MarketingPartner, philippineRegions } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';

interface MarketLinkageEditProps {
    partner: MarketingPartner;
    ipos: IPO[];
    onBack: () => void;
    onUpdatePartner: (partner: MarketingPartner) => void;
}

const NEGOTIATION_STATUSES = ['Agreed', 'Contract Signed', 'Pending Test Buy'] as const;
const AGREEMENT_TYPES = ['Verbal', 'Contract', 'Warehouse Delivery Receipt'] as const;
const TIMEFRAMES = ['Per Week', 'Monthly', 'One-time Transaction'] as const;

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm text-gray-900 dark:text-white";

const createBlankLinkage = (): MarketLinkage => ({
    id: '',
    region: '',
    ipoName: '',
    commodityNeedId: null,
    commodityName: '',
    commodityType: '',
    negotiationStatus: 'Agreed',
    agreedQuantityValue: 0,
    agreedQuantityTimeframe: 'Monthly',
    agreedPricePerKg: 0,
    agreementType: 'Verbal',
    agreementDate: '',
    testBuyConducted: false,
});

const getCommodityLabel = (name?: string, type?: string) => (
    name ? `${name}${type ? ` (${type})` : ''}` : 'Unassigned'
);

const getLinkedIpoNames = (linkages: MarketLinkage[]) => (
    Array.from(new Set(linkages.map(link => link.ipoName).filter(Boolean)))
);

const MarketLinkageEdit: React.FC<MarketLinkageEditProps> = ({ partner, ipos, onBack, onUpdatePartner }) => {
    const { currentUser } = useAuth();
    const [tempLinkage, setTempLinkage] = useState<MarketLinkage>(createBlankLinkage);
    const [isSaving, setIsSaving] = useState(false);
    const commodityNeeds = partner.commodityNeeds || [];

    const iposInLinkageRegion = useMemo(() => {
        if (!tempLinkage.region) return [];
        return ipos.filter(i => i.region === tempLinkage.region).sort((a, b) => a.name.localeCompare(b.name));
    }, [tempLinkage.region, ipos]);

    const handleCommoditySoldChange = (commodityNeedId: string) => {
        const selectedNeed = commodityNeeds.find(need => String(need.id) === commodityNeedId);
        setTempLinkage(prev => ({
            ...prev,
            commodityNeedId: selectedNeed?.id ?? null,
            commodityName: selectedNeed?.name || '',
            commodityType: selectedNeed?.type || '',
        }));
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();
        if (commodityNeeds.length === 0) {
            alert('Add at least one company commodity need before creating a market linkage.');
            return;
        }
        if (!tempLinkage.region || !tempLinkage.ipoName) {
            alert('Region and IPO are required.');
            return;
        }
        if (!tempLinkage.commodityNeedId || !tempLinkage.commodityName) {
            alert('Commodity Sold is required.');
            return;
        }

        const newLinkage: MarketLinkage = {
            ...tempLinkage,
            id: tempLinkage.id || Date.now(),
        };
        const marketingLinkages = [...(partner.marketingLinkages || []), newLinkage];
        const updatedPartner: MarketingPartner = {
            ...partner,
            marketingLinkages,
            linkedIpoNames: getLinkedIpoNames(marketingLinkages),
            history: [
                ...(partner.history || []),
                {
                    date: new Date().toISOString(),
                    event: `Market Linkage Added: ${newLinkage.ipoName}`,
                    user: currentUser?.fullName || 'System',
                },
            ],
            updated_at: new Date().toISOString(),
        };

        setIsSaving(true);
        if (supabase) {
            try {
                const { id, ...payload } = updatedPartner;
                const { error } = await supabase.from('marketing_partners').update(payload).eq('id', partner.id);
                if (error) throw error;
            } catch (err: any) {
                alert(`Failed to update database: ${err.message}`);
                setIsSaving(false);
                return;
            }
        }

        onUpdatePartner(updatedPartner);
        setIsSaving(false);
        onBack();
    };

    return (
        <div className="space-y-6 animate-fadeIn pb-20">
            <header className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Add Market Linkage</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{partner.companyName} | {partner.uid}</p>
                </div>
                <button onClick={onBack} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm font-bold dark:bg-gray-700 dark:text-gray-100">Back to Profile</button>
            </header>

            <form onSubmit={handleSave} className="space-y-6 bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
                <div className="bg-gray-50 dark:bg-gray-900/40 p-6 rounded-lg border border-emerald-200 dark:border-emerald-800 space-y-4">
                    <h3 className="font-bold text-emerald-600 dark:text-emerald-400">Establish New Linkage</h3>
                    {commodityNeeds.length === 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                            Add company commodity needs first before creating market linkages.
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-500">Region</label>
                            <select value={tempLinkage.region} onChange={e => setTempLinkage({ ...tempLinkage, region: e.target.value, ipoName: '' })} className={commonInputClasses}>
                                <option value="">Select Region</option>
                                {philippineRegions.map(region => <option key={region} value={region}>{region}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-500">IPO</label>
                            <select value={tempLinkage.ipoName} onChange={e => setTempLinkage({ ...tempLinkage, ipoName: e.target.value })} disabled={!tempLinkage.region} className={commonInputClasses}>
                                <option value="">Select IPO</option>
                                {iposInLinkageRegion.map(ipo => <option key={ipo.id} value={ipo.name}>{ipo.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-500">Negotiation Status</label>
                            <select value={tempLinkage.negotiationStatus} onChange={e => setTempLinkage({ ...tempLinkage, negotiationStatus: e.target.value as MarketLinkage['negotiationStatus'] })} className={commonInputClasses}>
                                {NEGOTIATION_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase text-gray-500">Agreement Type</label>
                            <select value={tempLinkage.agreementType} onChange={e => setTempLinkage({ ...tempLinkage, agreementType: e.target.value as MarketLinkage['agreementType'] })} className={commonInputClasses}>
                                {AGREEMENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold uppercase text-gray-500">Commodity Sold</label>
                            <select value={tempLinkage.commodityNeedId ? String(tempLinkage.commodityNeedId) : ''} onChange={e => handleCommoditySoldChange(e.target.value)} disabled={commodityNeeds.length === 0} className={commonInputClasses}>
                                <option value="">{commodityNeeds.length === 0 ? 'No company commodity needs encoded' : 'Select commodity'}</option>
                                {commodityNeeds.map(need => <option key={need.id} value={String(need.id)}>{getCommodityLabel(need.name, need.type)}</option>)}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500">Agreed Qty (Kg)</label>
                                <input type="number" value={tempLinkage.agreedQuantityValue || ''} onChange={e => setTempLinkage({ ...tempLinkage, agreedQuantityValue: parseFloat(e.target.value) || 0 })} className={commonInputClasses} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500">Timeframe</label>
                                <select value={tempLinkage.agreedQuantityTimeframe} onChange={e => setTempLinkage({ ...tempLinkage, agreedQuantityTimeframe: e.target.value as MarketLinkage['agreedQuantityTimeframe'] })} className={commonInputClasses}>
                                    {TIMEFRAMES.map(timeframe => <option key={timeframe} value={timeframe}>{timeframe}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500">Agreed Price (PHP/Kg)</label>
                                <input type="number" value={tempLinkage.agreedPricePerKg || ''} onChange={e => setTempLinkage({ ...tempLinkage, agreedPricePerKg: parseFloat(e.target.value) || 0 })} className={commonInputClasses} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500">Agreement Date</label>
                                <input type="date" value={tempLinkage.agreementDate} onChange={e => setTempLinkage({ ...tempLinkage, agreementDate: e.target.value })} className={commonInputClasses} />
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t dark:border-gray-700">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={tempLinkage.testBuyConducted} onChange={e => setTempLinkage({ ...tempLinkage, testBuyConducted: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                            <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Test Buy Information</span>
                        </label>
                        {tempLinkage.testBuyConducted && (
                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-gray-500">Test Buy Date</label>
                                    <input type="date" value={tempLinkage.testBuyDate || ''} onChange={e => setTempLinkage({ ...tempLinkage, testBuyDate: e.target.value })} className={commonInputClasses} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-gray-500">Test Buy Qty (Kg)</label>
                                    <input type="number" value={tempLinkage.testBuyQuantity || ''} onChange={e => setTempLinkage({ ...tempLinkage, testBuyQuantity: parseFloat(e.target.value) || 0 })} className={commonInputClasses} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold uppercase text-gray-500">Test Buy Feedback</label>
                                    <textarea value={tempLinkage.testBuyFeedback || ''} onChange={e => setTempLinkage({ ...tempLinkage, testBuyFeedback: e.target.value })} rows={3} className={commonInputClasses} />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="pt-6 flex justify-end gap-3 border-t dark:border-gray-700">
                    <button type="button" onClick={onBack} className="px-5 py-2 bg-gray-100 text-gray-700 rounded-md font-bold text-sm hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600">Cancel</button>
                    <button type="submit" disabled={isSaving || commodityNeeds.length === 0} className="px-8 py-2 bg-emerald-600 text-white rounded-md font-bold text-sm shadow-md hover:bg-emerald-700 transition-all disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500">
                        {isSaving ? 'Saving...' : 'Save Linkage'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default MarketLinkageEdit;
