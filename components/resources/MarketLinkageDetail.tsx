// Author: 4K
import React, { useEffect, useMemo, useState } from 'react';
import { IPO, MarketLinkage, MarketingPartner, philippineRegions } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { calculateMarketLinkageSales } from '../../lib/marketSalesAggregation';
import { supabase } from '../../supabaseClient';
import { useUserAccess } from '../mainfunctions/TableHooks';

interface MarketLinkageDetailProps {
    partner: MarketingPartner;
    linkageKey: string | number;
    ipos: IPO[];
    onBack: () => void;
    onUpdatePartner: (partner: MarketingPartner) => void;
}

const NEGOTIATION_STATUSES = ['Agreed', 'Contract Signed', 'Pending Test Buy'] as const;
const AGREEMENT_TYPES = ['Verbal', 'Contract', 'Warehouse Delivery Receipt'] as const;
const TIMEFRAMES = ['Per Week', 'Monthly', 'One-time Transaction'] as const;

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm text-gray-900 dark:text-white";

const getCommodityLabel = (name?: string, type?: string) => (
    name ? `${name}${type ? ` (${type})` : ''}` : 'Unassigned'
);

const getLinkedIpoNames = (linkages: MarketLinkage[]) => (
    Array.from(new Set(linkages.map(link => link.ipoName).filter(Boolean)))
);

const findLinkageIndex = (linkages: MarketLinkage[], linkageKey: string | number) => (
    linkages.findIndex((link, idx) => {
        const stableKey = link.id !== undefined && link.id !== null && String(link.id) !== '' ? link.id : idx;
        return String(stableKey) === String(linkageKey);
    })
);

const formatCurrency = (amount: number) => (
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number.isFinite(amount) ? amount : 0)
);

const formatNumber = (amount: number) => (
    new Intl.NumberFormat('en-US').format(Number.isFinite(amount) ? amount : 0)
);

const DetailBlock = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
        <dt className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm font-semibold text-gray-800 dark:text-white">{value || 'N/A'}</dd>
    </div>
);

const MarketLinkageDetail: React.FC<MarketLinkageDetailProps> = ({ partner, linkageKey, ipos, onBack, onUpdatePartner }) => {
    const { currentUser } = useAuth();
    const { canEdit, canDelete } = useUserAccess('Marketing Database');
    const linkages = partner.marketingLinkages || [];
    const linkageIndex = useMemo(() => findLinkageIndex(linkages, linkageKey), [linkages, linkageKey]);
    const linkage = linkageIndex >= 0 ? linkages[linkageIndex] : null;
    const [draft, setDraft] = useState<MarketLinkage | null>(linkage ? { commodityNeedId: null, commodityName: '', commodityType: '', ...linkage } : null);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const commodityNeeds = partner.commodityNeeds || [];

    useEffect(() => {
        setDraft(linkage ? { commodityNeedId: null, commodityName: '', commodityType: '', ...linkage } : null);
        setIsEditing(false);
        setIsDeleteModalOpen(false);
    }, [linkage]);

    const iposInLinkageRegion = useMemo(() => {
        if (!draft?.region) return [];
        return ipos.filter(i => i.region === draft.region).sort((a, b) => a.name.localeCompare(b.name));
    }, [draft?.region, ipos]);

    const sales = calculateMarketLinkageSales(draft || linkage || ({} as MarketLinkage));

    const savePartner = async (updatedPartner: MarketingPartner) => {
        if (supabase) {
            const { id, ...payload } = updatedPartner;
            const { error } = await supabase.from('marketing_partners').update(payload).eq('id', partner.id);
            if (error) throw error;
        }
        onUpdatePartner(updatedPartner);
    };

    const handleCommoditySoldChange = (commodityNeedId: string) => {
        if (!draft) return;
        const selectedNeed = commodityNeeds.find(need => String(need.id) === commodityNeedId);
        setDraft({
            ...draft,
            commodityNeedId: selectedNeed?.id ?? null,
            commodityName: selectedNeed?.name || '',
            commodityType: selectedNeed?.type || '',
        });
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!draft || linkageIndex < 0) return;
        if (!draft.region || !draft.ipoName) {
            alert('Region and IPO are required.');
            return;
        }
        if (!draft.commodityNeedId || !draft.commodityName) {
            alert('Commodity Sold is required before saving this linkage.');
            return;
        }

        const normalizedDraft: MarketLinkage = {
            ...draft,
            id: draft.id || Date.now(),
        };
        const updatedLinkages = linkages.map((link, idx) => idx === linkageIndex ? normalizedDraft : link);
        const updatedPartner: MarketingPartner = {
            ...partner,
            marketingLinkages: updatedLinkages,
            linkedIpoNames: getLinkedIpoNames(updatedLinkages),
            history: [
                ...(partner.history || []),
                {
                    date: new Date().toISOString(),
                    event: `Market Linkage Updated: ${normalizedDraft.ipoName}`,
                    user: currentUser?.fullName || 'System',
                },
            ],
            updated_at: new Date().toISOString(),
        };

        setIsSaving(true);
        try {
            await savePartner(updatedPartner);
            setIsEditing(false);
        } catch (err: any) {
            alert(`Failed to update database: ${err.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!canDelete || linkageIndex < 0 || !linkage) return;
        const updatedLinkages = linkages.filter((_, idx) => idx !== linkageIndex);
        const updatedPartner: MarketingPartner = {
            ...partner,
            marketingLinkages: updatedLinkages,
            linkedIpoNames: getLinkedIpoNames(updatedLinkages),
            history: [
                ...(partner.history || []),
                {
                    date: new Date().toISOString(),
                    event: `Market Linkage Deleted: ${linkage.ipoName}`,
                    user: currentUser?.fullName || 'System',
                },
            ],
            updated_at: new Date().toISOString(),
        };

        setIsSaving(true);
        try {
            await savePartner(updatedPartner);
            setIsDeleteModalOpen(false);
            onBack();
        } catch (err: any) {
            alert(`Failed to delete linkage: ${err.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    if (!linkage || !draft) {
        return (
            <div className="space-y-6 animate-fadeIn">
                <button onClick={onBack} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm font-bold dark:bg-gray-700 dark:text-gray-100">Back to Profile</button>
                <div className="rounded-xl border border-gray-100 bg-white p-8 text-center shadow-lg dark:border-gray-700 dark:bg-gray-800">
                    <h1 className="text-xl font-bold text-gray-800 dark:text-white">Market linkage not found</h1>
                    <p className="mt-2 text-sm text-gray-500">The selected linkage may have been removed or refreshed.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fadeIn pb-20">
            <header className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Market Linkage Details</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{partner.companyName} | {partner.uid}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button onClick={onBack} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm font-bold dark:bg-gray-700 dark:text-gray-100">Back to Profile</button>
                    {!isEditing && canEdit && (
                        <button onClick={() => setIsEditing(true)} className="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-bold shadow-sm hover:bg-emerald-700">Edit Linkage</button>
                    )}
                    {!isEditing && canDelete && (
                        <button onClick={() => setIsDeleteModalOpen(true)} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-bold shadow-sm hover:bg-red-700">Delete</button>
                    )}
                </div>
            </header>

            <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Linked IPO</p>
                        <h2 className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{linkage.ipoName}</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{linkage.region}</p>
                    </div>
                    <div className="text-left md:text-right">
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Commodity Sold</p>
                        <p className={`mt-1 text-lg font-bold ${linkage.commodityName ? 'text-gray-800 dark:text-white' : 'text-amber-600 dark:text-amber-300'}`}>
                            {getCommodityLabel(linkage.commodityName, linkage.commodityType)}
                        </p>
                    </div>
                </div>

                {!isEditing ? (
                    <dl className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <DetailBlock label="Negotiation Status" value={<span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-bold uppercase ${linkage.negotiationStatus === 'Contract Signed' ? 'bg-emerald-100 text-emerald-800' : 'bg-yellow-100 text-yellow-800'}`}>{linkage.negotiationStatus}</span>} />
                        <DetailBlock label="Agreement Type" value={linkage.agreementType} />
                        <DetailBlock label="Agreement Date" value={linkage.agreementDate ? new Date(linkage.agreementDate).toLocaleDateString() : 'N/A'} />
                        <DetailBlock label="Agreed Quantity" value={`${formatNumber(sales.quantityKg)} Kg (${linkage.agreedQuantityTimeframe})`} />
                        <DetailBlock label="Agreed Price" value={`${formatCurrency(sales.pricePerKg)} / Kg`} />
                        <DetailBlock label="Sales Value" value={formatCurrency(sales.salesValue)} />
                        <DetailBlock label="Test Buy" value={linkage.testBuyConducted ? 'Conducted' : 'Not recorded'} />
                        <DetailBlock label="Test Buy Date" value={linkage.testBuyDate ? new Date(linkage.testBuyDate).toLocaleDateString() : 'N/A'} />
                        <DetailBlock label="Test Buy Quantity" value={`${formatNumber(linkage.testBuyQuantity || 0)} Kg`} />
                        <div className="md:col-span-3">
                            <DetailBlock label="Test Buy Feedback" value={<span className="italic text-gray-600 dark:text-gray-300">{linkage.testBuyFeedback || 'No feedback provided.'}</span>} />
                        </div>
                    </dl>
                ) : (
                    <form onSubmit={handleSave} className="space-y-5">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500">Region</label>
                                <select value={draft.region} onChange={e => setDraft({ ...draft, region: e.target.value, ipoName: '' })} className={commonInputClasses}>
                                    <option value="">Select Region</option>
                                    {philippineRegions.map(region => <option key={region} value={region}>{region}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500">IPO</label>
                                <select value={draft.ipoName} onChange={e => setDraft({ ...draft, ipoName: e.target.value })} disabled={!draft.region} className={commonInputClasses}>
                                    <option value="">Select IPO</option>
                                    {iposInLinkageRegion.map(ipo => <option key={ipo.id} value={ipo.name}>{ipo.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500">Negotiation Status</label>
                                <select value={draft.negotiationStatus} onChange={e => setDraft({ ...draft, negotiationStatus: e.target.value as MarketLinkage['negotiationStatus'] })} className={commonInputClasses}>
                                    {NEGOTIATION_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500">Agreement Type</label>
                                <select value={draft.agreementType} onChange={e => setDraft({ ...draft, agreementType: e.target.value as MarketLinkage['agreementType'] })} className={commonInputClasses}>
                                    {AGREEMENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold uppercase text-gray-500">Commodity Sold</label>
                                <select value={draft.commodityNeedId ? String(draft.commodityNeedId) : ''} onChange={e => handleCommoditySoldChange(e.target.value)} disabled={commodityNeeds.length === 0} className={commonInputClasses}>
                                    <option value="">{commodityNeeds.length === 0 ? 'No company commodity needs encoded' : 'Select commodity'}</option>
                                    {commodityNeeds.map(need => <option key={need.id} value={String(need.id)}>{getCommodityLabel(need.name, need.type)}</option>)}
                                </select>
                                {!draft.commodityName && (
                                    <p className="mt-1 text-xs font-semibold text-amber-600 dark:text-amber-300">This linkage is unassigned. Select a commodity before saving changes.</p>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-gray-500">Agreed Qty (Kg)</label>
                                    <input type="number" value={draft.agreedQuantityValue || ''} onChange={e => setDraft({ ...draft, agreedQuantityValue: parseFloat(e.target.value) || 0 })} className={commonInputClasses} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-gray-500">Timeframe</label>
                                    <select value={draft.agreedQuantityTimeframe} onChange={e => setDraft({ ...draft, agreedQuantityTimeframe: e.target.value as MarketLinkage['agreedQuantityTimeframe'] })} className={commonInputClasses}>
                                        {TIMEFRAMES.map(timeframe => <option key={timeframe} value={timeframe}>{timeframe}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-gray-500">Agreed Price (PHP/Kg)</label>
                                    <input type="number" value={draft.agreedPricePerKg || ''} onChange={e => setDraft({ ...draft, agreedPricePerKg: parseFloat(e.target.value) || 0 })} className={commonInputClasses} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-gray-500">Agreement Date</label>
                                    <input type="date" value={draft.agreementDate} onChange={e => setDraft({ ...draft, agreementDate: e.target.value })} className={commonInputClasses} />
                                </div>
                            </div>
                        </div>

                        <div className="border-t pt-4 dark:border-gray-700">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={draft.testBuyConducted} onChange={e => setDraft({ ...draft, testBuyConducted: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Test Buy Information</span>
                            </label>
                            {draft.testBuyConducted && (
                                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-gray-500">Test Buy Date</label>
                                        <input type="date" value={draft.testBuyDate || ''} onChange={e => setDraft({ ...draft, testBuyDate: e.target.value })} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-gray-500">Test Buy Qty (Kg)</label>
                                        <input type="number" value={draft.testBuyQuantity || ''} onChange={e => setDraft({ ...draft, testBuyQuantity: parseFloat(e.target.value) || 0 })} className={commonInputClasses} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold uppercase text-gray-500">Test Buy Feedback</label>
                                        <textarea value={draft.testBuyFeedback || ''} onChange={e => setDraft({ ...draft, testBuyFeedback: e.target.value })} rows={3} className={commonInputClasses} />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 border-t pt-5 dark:border-gray-700">
                            <button type="button" onClick={() => { setDraft({ commodityNeedId: null, commodityName: '', commodityType: '', ...linkage }); setIsEditing(false); }} className="px-5 py-2 bg-gray-100 text-gray-700 rounded-md font-bold text-sm hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600">Cancel</button>
                            <button type="submit" disabled={isSaving} className="px-8 py-2 bg-emerald-600 text-white rounded-md font-bold text-sm shadow-md hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500">
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </form>
                )}
            </section>

            {isDeleteModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-gray-800">
                        <h3 className="text-lg font-bold text-red-600 dark:text-red-400">Delete Market Linkage</h3>
                        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                            Delete the linkage with <span className="font-bold text-gray-800 dark:text-white">{linkage.ipoName}</span>? This removes only this nested linkage record.
                        </p>
                        <div className="mt-6 flex justify-end gap-3">
                            <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 text-sm font-bold bg-gray-100 rounded dark:bg-gray-700 dark:text-gray-100">Cancel</button>
                            <button onClick={handleDelete} disabled={isSaving} className="px-4 py-2 text-sm font-bold bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-300">
                                {isSaving ? 'Deleting...' : 'Delete Linkage'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MarketLinkageDetail;
