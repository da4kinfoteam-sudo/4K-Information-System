
// Author: 4K 
import React, { useMemo } from 'react';
import { MarketingPartner, IPO } from '../../constants';
import { usePagination, useUserAccess } from '../mainfunctions/TableHooks';
import { calculateMarketLinkageSales, formatMarketQuantityTotals, summarizeMarketPartnerSales } from '../../lib/marketSalesAggregation';

interface MarketProfileDetailProps {
    partner: MarketingPartner;
    ipos: IPO[];
    onBack: () => void;
    onEditDetails: () => void;
    onAddLinkage: () => void;
    onSelectLinkage: (linkageKey: string | number) => void;
    commodityCategories: { [key: string]: string[] };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MarketProfileDetail: React.FC<MarketProfileDetailProps> = ({ partner, ipos, onBack, onEditDetails, onAddLinkage, onSelectLinkage, commodityCategories }) => {
    const { canEdit } = useUserAccess('Marketing Database');
    
    // Filter and Sort IPOs by Region Proximity (Potential)
    const potentialIpos = useMemo(() => {
        if (!partner.commodityNeeds) return [];
        const needsNames = partner.commodityNeeds.map(c => c.name.toLowerCase());
        const filtered = ipos.filter(ipo => 
            ipo.commodities.some(c => needsNames.includes(c.particular.toLowerCase()))
        );
        const partnerRegion = partner.region;
        return filtered.sort((a, b) => {
            if (a.region === partnerRegion && b.region !== partnerRegion) return -1;
            if (a.region !== partnerRegion && b.region === partnerRegion) return 1;
            if (a.region !== b.region) return a.region.localeCompare(b.region);
            return a.name.localeCompare(b.name);
        });
    }, [partner.commodityNeeds, partner.region, ipos]);

    const marketSalesSummary = useMemo(() => summarizeMarketPartnerSales(partner), [partner]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
    };

    const formatNumber = (amount: number) => {
        return new Intl.NumberFormat('en-US').format(amount);
    };

    const getLinkageCommodityLabel = (link: { commodityName?: string; commodityType?: string }) => (
        link.commodityName ? `${link.commodityName}${link.commodityType ? ` (${link.commodityType})` : ''}` : 'Unassigned'
    );

    const DetailBlock = ({ label, value }: { label: string, value: any }) => (
        <div>
            <dt className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</dt>
            <dd className="text-md font-semibold text-gray-800 dark:text-white mt-0.5">{value || 'N/A'}</dd>
        </div>
    );

    const PaginationControls = ({
        currentPage,
        totalPages,
        onPageChange,
        itemsPerPage,
        onItemsPerPageChange,
        totalItems,
    }: {
        currentPage: number;
        totalPages: number;
        onPageChange: (page: number) => void;
        itemsPerPage: number;
        onItemsPerPageChange: (value: number) => void;
        totalItems: number;
    }) => (
        <div className="flex flex-col sm:flex-row justify-between items-center mt-4 gap-3 text-xs">
            <div className="flex items-center gap-2">
                <span className="text-gray-600 dark:text-gray-400">Show</span>
                <select
                    value={itemsPerPage}
                    onChange={(event) => onItemsPerPageChange(Number(event.target.value))}
                    className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded shadow-sm py-1 px-2 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 text-gray-700 dark:text-gray-200"
                >
                    {[5, 10, 20].map(size => <option key={size} value={size}>{size}</option>)}
                </select>
                <span className="text-gray-600 dark:text-gray-400">entries</span>
            </div>
            <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:gap-4 sm:text-left">
                <span className="text-gray-600 dark:text-gray-400">
                    {totalItems === 0 ? 'No entries' : `Showing ${(currentPage - 1) * itemsPerPage + 1} to ${Math.min(currentPage * itemsPerPage, totalItems)} of ${totalItems}`}
                </span>
                <div className="flex gap-1">
                    <button
                        type="button"
                        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50"
                    >
                        Prev
                    </button>
                    <button
                        type="button"
                        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages || totalPages === 0}
                        className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50"
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );

    const marketingLinkageItems = useMemo(() => (
        (partner.marketingLinkages || []).map((link, index) => ({ link, index }))
    ), [partner.marketingLinkages]);
    const linkagePagination = usePagination(marketingLinkageItems, [partner.id, marketingLinkageItems.length]);
    const matchedIpoPagination = usePagination(potentialIpos, [partner.id, potentialIpos.length]);

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
                            {canEdit && (
                                <button onClick={onEditDetails} className="text-sm text-emerald-600 hover:underline flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                    Edit Details
                                </button>
                            )}
                        </div>

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
                            
                            <div className="md:col-span-2">
                                <dt className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Commodity Needs</dt>
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
                    </div>

                    {/* Established Linkages Section */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-800 dark:text-white">Marketing Linkages</h3>
                            {canEdit && (
                                <button onClick={onAddLinkage} className="text-sm text-emerald-600 hover:underline flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                    Add Market Linkage
                                </button>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800">
                                    <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">Linked IPOs</p>
                                    <p className="text-xl font-bold text-gray-800 dark:text-white mt-1">{formatNumber(marketSalesSummary.linkedIpoCount)}</p>
                                </div>
                                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800">
                                    <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">Total Quantity Sold</p>
                                    <p className="text-xl font-bold text-gray-800 dark:text-white mt-1">{formatMarketQuantityTotals(marketSalesSummary.totalQuantityByUnit)}</p>
                                </div>
                                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800">
                                    <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">Total Sales from Market Linkage</p>
                                    <p className="text-xl font-bold text-gray-800 dark:text-white mt-1">{formatCurrency(marketSalesSummary.totalSales)}</p>
                                </div>
                            </div>
                            {marketingLinkageItems.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {linkagePagination.paginatedData.map(({ link, index }) => {
                                        const linkSales = calculateMarketLinkageSales(link);
                                        return (
                                        <button
                                            type="button"
                                            key={link.id ?? index}
                                            onClick={() => onSelectLinkage(link.id ?? index)}
                                            className="w-full p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm space-y-3 text-left transition-all hover:border-emerald-300 hover:bg-emerald-50/60 dark:hover:bg-emerald-900/20 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                            title={`Open market linkage details for ${link.ipoName}`}
                                        >
                                            <div className="flex justify-between items-start">
                                                <h4 className="font-bold text-emerald-600 dark:text-emerald-400">{link.ipoName}</h4>
                                                <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${link.negotiationStatus === 'Contract Signed' ? 'bg-emerald-100 text-emerald-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                    {link.negotiationStatus}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <div><p className="text-[10px] text-gray-400 uppercase font-bold">Commodity Sold</p><p className={`font-medium ${link.commodityName ? 'text-gray-700 dark:text-gray-200' : 'text-amber-600 dark:text-amber-300'}`}>{getLinkageCommodityLabel(link)}</p></div>
                                                <div><p className="text-[10px] text-gray-400 uppercase font-bold">Qty Agreement</p><p className="font-medium text-gray-700 dark:text-gray-200">{formatNumber(linkSales.quantity)} {linkSales.unitOfMeasure} ({link.agreedQuantityTimeframe})</p></div>
                                                <div><p className="text-[10px] text-gray-400 uppercase font-bold">Agreed Price</p><p className="font-medium text-gray-700 dark:text-gray-200">{formatCurrency(linkSales.pricePerUnit)}/{linkSales.unitOfMeasure}</p></div>
                                                <div><p className="text-[10px] text-gray-400 uppercase font-bold">Sales Value</p><p className="font-medium text-gray-700 dark:text-gray-200">{formatCurrency(linkSales.salesValue)}</p></div>
                                                <div><p className="text-[10px] text-gray-400 uppercase font-bold">Agreement Type</p><p className="font-medium text-gray-700 dark:text-gray-200">{link.agreementType}</p></div>
                                                <div><p className="text-[10px] text-gray-400 uppercase font-bold">Effective Date</p><p className="font-medium text-gray-700 dark:text-gray-200">{link.agreementDate ? new Date(link.agreementDate).toLocaleDateString() : 'N/A'}</p></div>
                                            </div>
                                            {link.testBuyConducted && (
                                                <div className="pt-2 border-t dark:border-gray-600">
                                                    <p className="text-[10px] text-emerald-600 uppercase font-bold mb-1">Test Buy Completed</p>
                                                    <p className="text-xs text-gray-500 italic">"{link.testBuyFeedback || 'No feedback provided.'}"</p>
                                                </div>
                                            )}
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-300">Open details</p>
                                        </button>
                                        );
                                    })}
                                    <div className="md:col-span-2">
                                        <PaginationControls
                                            currentPage={linkagePagination.currentPage}
                                            totalPages={linkagePagination.totalPages}
                                            onPageChange={linkagePagination.setCurrentPage}
                                            itemsPerPage={linkagePagination.itemsPerPage}
                                            onItemsPerPageChange={linkagePagination.setItemsPerPage}
                                            totalItems={marketingLinkageItems.length}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-10 bg-gray-50 dark:bg-gray-700/20 rounded-xl border-2 border-dashed dark:border-gray-700">
                                    <p className="text-sm text-gray-400 italic">No marketing linkages established yet.</p>
                                </div>
                            )}
                        </div>
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
                            {matchedIpoPagination.paginatedData.map(ipo => {
                                const matchingComms = ipo.commodities.filter(c => 
                                    partner.commodityNeeds?.map(n => n.name.toLowerCase()).includes(c.particular.toLowerCase())
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
                            {potentialIpos.length > 0 && (
                                <PaginationControls
                                    currentPage={matchedIpoPagination.currentPage}
                                    totalPages={matchedIpoPagination.totalPages}
                                    onPageChange={matchedIpoPagination.setCurrentPage}
                                    itemsPerPage={matchedIpoPagination.itemsPerPage}
                                    onItemsPerPageChange={matchedIpoPagination.setItemsPerPage}
                                    totalItems={potentialIpos.length}
                                />
                            )}
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
};

export default MarketProfileDetail;
