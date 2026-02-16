
// Author: 4K 
import React, { useState, useMemo, useEffect } from 'react';
import { MarketingPartner, philippineRegions, CommodityNeed } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { usePagination } from '../mainfunctions/TableHooks';
import LocationPicker from '../LocationPicker';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import { supabase } from '../../supabaseClient';

declare const XLSX: any;

interface MarketingDatabaseProps {
    partners: MarketingPartner[];
    setPartners: React.Dispatch<React.SetStateAction<MarketingPartner[]>>;
    onSelectPartner: (partner: MarketingPartner) => void;
}

const BUYER_TYPES = ['Private Company', 'Government'];
const PAYMENT_METHODS = ['Bank Transfer', 'Cash', 'Cash on Delivery', 'Voucher'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm text-gray-900 dark:text-white";

const MarketingDatabase: React.FC<MarketingDatabaseProps> = ({ partners, setPartners, onSelectPartner }) => {
    const { currentUser } = useAuth();
    const isAdmin = currentUser?.role === 'Administrator';
    
    const [view, setView] = useState<'list' | 'add'>('list');
    const [searchTerm, setSearchTerm] = useLocalStorageState('market_search', '');
    const [regionFilter, setRegionFilter] = useLocalStorageState('market_region', 'All');
    const [isUploading, setIsUploading] = useState(false);

    // Add Form State
    const [formData, setFormData] = useState<Omit<MarketingPartner, 'id'>>({
        uid: '',
        companyName: '',
        ownerName: '',
        contactNumber: '',
        email: '',
        location: '',
        region: '',
        buyerType: 'Private Company',
        paymentMethods: [],
        commodityNeeds: [],
        linkedIpoNames: [],
        remarks: '',
        encodedBy: currentUser?.fullName || ''
    });

    // New Commodity Form State
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

    const filteredPartners = useMemo(() => {
        let list = [...partners];
        if (regionFilter !== 'All') {
            list = list.filter(p => p.region === regionFilter);
        }
        if (searchTerm) {
            const low = searchTerm.toLowerCase();
            list = list.filter(p => 
                p.companyName.toLowerCase().includes(low) ||
                p.ownerName.toLowerCase().includes(low) ||
                p.commodityNeeds.some(c => c.name.toLowerCase().includes(low))
            );
        }
        return list.sort((a, b) => a.companyName.localeCompare(b.companyName));
    }, [partners, regionFilter, searchTerm]);

    const { currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData } = usePagination(filteredPartners, [regionFilter, searchTerm]);

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
            const newList = [...prev.commodityNeeds];
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
        setFormData(prev => ({ ...prev, commodityNeeds: prev.commodityNeeds.filter((_, i) => i !== idx) }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const uid = `MP-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
        const newPartnerPayload = {
            ...formData,
            uid,
            created_at: new Date().toISOString()
        };

        if (supabase) {
            try {
                const { data, error } = await supabase.from('marketing_partners').insert([newPartnerPayload]).select().single();
                if (error) throw error;
                if (data) setPartners(prev => [data, ...prev]);
            } catch (err: any) {
                alert("Failed to save to database: " + err.message);
                return;
            }
        } else {
            const newPartner: MarketingPartner = { ...newPartnerPayload, id: Date.now() };
            setPartners(prev => [newPartner, ...prev]);
        }
        
        setView('list');
        setFormData({
            uid: '', companyName: '', ownerName: '', contactNumber: '', email: '', 
            location: '', region: '', buyerType: 'Private Company', paymentMethods: [],
            commodityNeeds: [], linkedIpoNames: [], remarks: '', encodedBy: currentUser?.fullName || ''
        });
    };

    const handleDownloadTemplate = () => {
        const headers = ['companyName', 'ownerName', 'contactNumber', 'email', 'region', 'location', 'buyerType', 'paymentMethods', 'commodityNeeds', 'remarks'];
        const exampleData = [{
            companyName: 'Sample Trade Corp',
            ownerName: 'Juan Dela Cruz',
            contactNumber: '09171234567',
            email: 'juan@sample.com',
            region: 'Region IV-A (CALABARZON)',
            location: 'Tanay, Rizal',
            buyerType: 'Private Company',
            paymentMethods: 'Cash; Bank Transfer',
            commodityNeeds: 'JSON STRING of detailed needs',
            remarks: 'Prefers bulk purchases'
        }];
        const ws = XLSX.utils.json_to_sheet(exampleData, { header: headers });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, "Marketing_Partner_Template.xlsx");
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = event.target?.result;
                const workbook = XLSX.read(data, { type: 'array' });
                const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as any[];

                const newPartners = jsonData.map((row: any, index: number) => {
                    const year = new Date().getFullYear();
                    const uid = `MP-${year}-${Date.now().toString().slice(-4)}${index}`;
                    
                    let needs = [];
                    try {
                        needs = typeof row.commodityNeeds === 'string' ? JSON.parse(row.commodityNeeds) : [];
                    } catch {
                        // fallback to empty if JSON fails
                    }

                    return {
                        uid,
                        companyName: String(row.companyName || 'Unnamed Partner'),
                        ownerName: String(row.ownerName || ''),
                        contactNumber: String(row.contactNumber || ''),
                        email: String(row.email || ''),
                        region: String(row.region || ''),
                        location: String(row.location || ''),
                        buyerType: row.buyerType || 'Private Company',
                        paymentMethods: row.paymentMethods ? row.paymentMethods.split(';').map((p:string) => p.trim()) : [],
                        commodityNeeds: needs,
                        linkedIpoNames: [],
                        remarks: String(row.remarks || ''),
                        encodedBy: currentUser?.fullName || 'Excel Import',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };
                });

                if (supabase) {
                    const { data, error } = await supabase.from('marketing_partners').insert(newPartners).select();
                    if (error) throw error;
                    if (data) setPartners(prev => [...data, ...prev]);
                } else {
                    setPartners(prev => [...newPartners.map((p, i) => ({ ...p, id: Date.now() + i })), ...prev]);
                }
                alert(`Successfully imported ${newPartners.length} partners.`);
            } catch (err: any) {
                alert("Import failed: " + err.message);
            } finally {
                setIsUploading(false);
                if (e.target) e.target.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };

    if (view === 'add') {
        return (
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg animate-fadeIn max-w-5xl mx-auto">
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

                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Add New Marketing Partner</h2>
                    <button onClick={() => setView('list')} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md text-sm font-bold">Cancel</button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <h3 className="font-bold border-b pb-1 text-emerald-600">Company Information</h3>
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
                                    <label className="block text-sm font-medium">Owner / Contact Person</label>
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
                                <label className="block text-sm font-medium">Region</label>
                                <select name="region" value={formData.region} onChange={handleInputChange} className={commonInputClasses}>
                                    <option value="">Select Region</option>
                                    {philippineRegions.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Office Location</label>
                                <LocationPicker value={formData.location} onChange={(val) => setFormData(prev => ({...prev, location: val}))} />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="font-bold border-b pb-1 text-emerald-600">Preferences & Needs</h3>
                            <div>
                                <label className="block text-sm font-medium mb-2">Preferred Payment Methods</label>
                                <div className="flex flex-wrap gap-2">
                                    {PAYMENT_METHODS.map(m => (
                                        <button
                                            key={m}
                                            type="button"
                                            onClick={() => handlePaymentToggle(m)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${formData.paymentMethods.includes(m) ? 'bg-emerald-100 border-emerald-500 text-emerald-700' : 'bg-white border-gray-300 text-gray-500'}`}
                                        >
                                            {m}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="block text-sm font-medium">Commodity Needs</label>
                                    <button type="button" onClick={handleAddCommodity} className="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-bold">Add Item</button>
                                </div>
                                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                    {formData.commodityNeeds.map((c, i) => (
                                        <div key={i} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 flex justify-between items-start">
                                            <div>
                                                <p className="font-bold text-sm text-gray-800 dark:text-white">{c.name}</p>
                                                <p className="text-xs text-gray-500">Source: {c.sourceProvince || 'Any'}</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <button type="button" onClick={() => handleEditCommodity(i)} className="text-emerald-600 text-xs font-bold">Edit</button>
                                                <button type="button" onClick={() => removeCommodity(i)} className="text-red-600 text-xs font-bold">Delete</button>
                                            </div>
                                        </div>
                                    ))}
                                    {formData.commodityNeeds.length === 0 && <p className="text-xs text-gray-400 italic text-center py-4">No commodities added yet.</p>}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium">Remarks</label>
                                <textarea name="remarks" value={formData.remarks} onChange={handleInputChange} rows={3} className={commonInputClasses} />
                            </div>
                        </div>
                    </div>
                    <div className="pt-4 flex justify-end">
                        <button type="submit" className="px-8 py-3 bg-emerald-600 text-white rounded-md font-bold hover:bg-emerald-700 shadow-md transition-all">Save Partner Profile</button>
                    </div>
                </form>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Marketing Database</h2>
                <div className="flex flex-wrap gap-2">
                    {isAdmin && (
                        <>
                            <button onClick={() => setView('add')} className="px-4 py-2 bg-emerald-600 text-white rounded-md font-bold hover:bg-emerald-700 transition-all shadow-sm">
                                Add Market Partner
                            </button>
                            <button onClick={handleDownloadTemplate} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md shadow-sm font-bold hover:bg-gray-300">
                                Template
                            </button>
                            <label className={`px-4 py-2 bg-emerald-600 text-white rounded-md font-bold hover:bg-emerald-700 transition-all shadow-sm ${isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                                {isUploading ? 'Uploading...' : 'Upload XLSX'}
                                <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleFileUpload} disabled={isUploading} />
                            </label>
                        </>
                    )}
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                <div className="flex flex-wrap gap-4 mb-6">
                    <div className="flex-1 min-w-[200px]">
                        <input 
                            type="text" 
                            placeholder="Search by company, owner, or commodity..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={commonInputClasses}
                        />
                    </div>
                    <div className="w-full md:w-64">
                        <select 
                            value={regionFilter} 
                            onChange={(e) => setRegionFilter(e.target.value)} 
                            className={commonInputClasses}
                        >
                            <option value="All">All Regions</option>
                            {philippineRegions.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Region</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Company Name</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Commodity Needs</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Owner / Contact</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {paginatedData.map((partner) => (
                                <tr key={partner.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-medium">
                                        {partner.region || 'N/A'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold">
                                        <button 
                                            onClick={() => onSelectPartner(partner)} 
                                            className="text-emerald-600 hover:text-emerald-700 hover:underline dark:text-emerald-400"
                                        >
                                            {partner.companyName}
                                        </button>
                                        <div className="text-[10px] text-gray-400 font-normal mt-0.5">{partner.uid}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-xs">
                                        <span className={`px-2 py-0.5 rounded-full font-bold ${partner.buyerType === 'Government' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                                            {partner.buyerType || 'Private'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-1">
                                            {partner.commodityNeeds?.slice(0, 3).map((c, i) => (
                                                <span key={i} className="px-2 py-0.5 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-md text-[10px] font-bold border border-teal-100 dark:border-teal-800 uppercase">
                                                    {c.name}
                                                </span>
                                            ))}
                                            {(partner.commodityNeeds?.length || 0) > 3 && (
                                                <span className="text-[10px] text-gray-400 font-bold">+{partner.commodityNeeds.length - 3} more</span>
                                            )}
                                            {(!partner.commodityNeeds || partner.commodityNeeds.length === 0) && <span className="text-gray-400 text-xs italic">Unspecified</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                        <div className="font-bold text-gray-700 dark:text-gray-300">{partner.ownerName}</div>
                                        <div>{partner.contactNumber}</div>
                                    </td>
                                </tr>
                            ))}
                            {paginatedData.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-10 text-center text-gray-500 italic">No market partners found matching your criteria.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                
                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="py-4 flex items-center justify-between border-t border-gray-100 dark:border-gray-700 mt-4">
                        <p className="text-sm text-gray-500 dark:text-gray-400">Page {currentPage} of {totalPages}</p>
                        <div className="flex gap-2">
                            <button onClick={() => setCurrentPage(p => Math.max(1, p-1))} disabled={currentPage === 1} className="px-3 py-1 border rounded disabled:opacity-50">Prev</button>
                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p+1))} disabled={currentPage === totalPages} className="px-3 py-1 border rounded disabled:opacity-50">Next</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MarketingDatabase;
