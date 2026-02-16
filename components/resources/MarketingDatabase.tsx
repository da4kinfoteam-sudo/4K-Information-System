
// Author: 4K 
import React, { useState, useMemo, useEffect } from 'react';
import { MarketingPartner, philippineRegions, CommodityNeed, referenceCommodityTypes } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { usePagination, useSelection } from '../mainfunctions/TableHooks';
import LocationPicker, { parseLocation } from '../LocationPicker';
import useLocalStorageState from '../../hooks/useLocalStorageState';
import { supabase } from '../../supabaseClient';

declare const XLSX: any;

const BUYER_TYPES = ['Private Company', 'Government'];
const PAYMENT_METHODS = ['Bank Transfer', 'Cash', 'Cash on Delivery', 'Voucher'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm text-gray-900 dark:text-white";

interface MarketingDatabaseProps {
    partners: MarketingPartner[];
    setPartners: React.Dispatch<React.SetStateAction<MarketingPartner[]>>;
    onSelectPartner: (partner: MarketingPartner) => void;
    commodityCategories: { [key: string]: string[] };
}

const MarketingDatabase: React.FC<MarketingDatabaseProps> = ({ partners, setPartners, onSelectPartner, commodityCategories }) => {
    const { currentUser } = useAuth();
    const isAdmin = currentUser?.role === 'Administrator';
    
    const [view, setView] = useState<'list' | 'add'>('list');
    const [searchTerm, setSearchTerm] = useLocalStorageState('market_search', '');
    const [regionFilter, setRegionFilter] = useLocalStorageState('market_region', 'All');
    const [isUploading, setIsUploading] = useState(false);

    // Multi-Delete State using Shared Hook (adapted for MarketingPartner)
    const { 
        isSelectionMode, selectedIds, toggleSelectionMode, 
        handleSelectAll, handleSelectRow, resetSelection 
    } = useSelection<MarketingPartner>();
    const [isMultiDeleteModalOpen, setIsMultiDeleteModalOpen] = useState(false);

    // Form State
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
        encodedBy: currentUser?.fullName || '',
        history: [],
        marketingLinkages: []
    });

    // Inline Commodity Entry State
    const [editingCommodityIdx, setEditingCommodityIdx] = useState<number | null>(null);
    const [tempCommodity, setTempCommodity] = useState<CommodityNeed>({
        id: '',
        name: '',
        type: '',
        sourceRegion: '',
        sourceProvince: '',
        qualityStandard: '',
        volumeJan: 0, volumeFeb: 0, volumeMar: 0, volumeApr: 0, volumeMay: 0, volumeJun: 0,
        volumeJul: 0, volumeAug: 0, volumeSep: 0, volumeOct: 0, volumeNov: 0, volumeDec: 0
    });

    // Commodity Selection Cascading State
    const [provinceOptions, setProvinceOptions] = useState<string[]>([]);

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
        setTempCommodity(prev => {
            const updated = { ...prev, [name]: value };
            
            // Cascaded Commodity Logic
            if (name === 'type') {
                updated.name = '';
            }
            if (name === 'sourceRegion') {
                updated.sourceProvince = '';
            }
            
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
            const newList = [...prev.commodityNeeds];
            const itemToSave = { ...tempCommodity };
            
            if (editingCommodityIdx !== null) {
                newList[editingCommodityIdx] = itemToSave;
            } else {
                newList.push({ ...itemToSave, id: Date.now() });
            }
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
        const c = formData.commodityNeeds[idx];
        setTempCommodity({ ...c });
        setEditingCommodityIdx(idx);
    };

    const handleMultiDelete = async () => {
        if (!window.confirm(`Delete ${selectedIds.length} partners?`)) return;
        if (supabase) {
            const { error } = await supabase.from('marketing_partners').delete().in('id', selectedIds);
            if (error) return alert(error.message);
        }
        setPartners(prev => prev.filter(p => !selectedIds.includes(p.id)));
        resetSelection();
        setIsMultiDeleteModalOpen(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const year = new Date().getFullYear();
        const uid = `MP-${year}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
        
        const historyEntry = {
            date: new Date().toISOString(),
            event: 'Profile Created',
            user: currentUser?.fullName || 'System'
        };

        const newPartnerPayload = {
            ...formData,
            uid,
            history: [historyEntry],
            created_at: new Date().toISOString()
        };

        if (supabase) {
            try {
                const { data, error } = await supabase.from('marketing_partners').insert([newPartnerPayload]).select().single();
                if (error) throw error;
                if (data) setPartners(prev => [data, ...prev]);
            } catch (err: any) {
                alert("Failed to save: " + err.message);
                return;
            }
        } else {
            setPartners(prev => [{ ...newPartnerPayload, id: Date.now() } as MarketingPartner, ...prev]);
        }
        
        setView('list');
        setFormData({
            uid: '', companyName: '', ownerName: '', contactNumber: '', email: '', 
            location: '', region: '', buyerType: 'Private Company', paymentMethods: [],
            commodityNeeds: [], linkedIpoNames: [], remarks: '', encodedBy: currentUser?.fullName || '', history: [], marketingLinkages: []
        });
    };

    const handleDownloadTemplate = () => {
        const headers = ['companyName', 'ownerName', 'contactNumber', 'email', 'location', 'buyerType', 'paymentMethods', 'commodityNeeds', 'remarks'];
        const exampleData = [{
            companyName: 'Sample Trade Corp', ownerName: 'Juan Dela Cruz', contactNumber: '09171234567', email: 'juan@sample.com',
            location: 'Tanay, Rizal', buyerType: 'Private Company', paymentMethods: 'Cash; Bank Transfer',
            commodityNeeds: '[]', remarks: 'Prefers bulk purchases'
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
                    const uid = `MP-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}${index}`;
                    const { region } = parseLocation(row.location || '');
                    return {
                        uid,
                        companyName: String(row.companyName || 'Unnamed Partner'),
                        ownerName: String(row.ownerName || ''),
                        contactNumber: String(row.contactNumber || ''),
                        email: String(row.email || ''),
                        region,
                        location: String(row.location || ''),
                        buyerType: row.buyerType || 'Private Company',
                        paymentMethods: row.paymentMethods ? row.paymentMethods.split(';').map((p:string) => p.trim()) : [],
                        commodityNeeds: row.commodityNeeds ? JSON.parse(row.commodityNeeds) : [],
                        linkedIpoNames: [],
                        marketingLinkages: [],
                        history: [{ date: new Date().toISOString(), event: 'Imported from Excel', user: currentUser?.fullName || 'System' }],
                        encodedBy: currentUser?.fullName || 'Excel Import',
                        created_at: new Date().toISOString()
                    };
                });
                if (supabase) {
                    const { data, error } = await supabase.from('marketing_partners').insert(newPartners).select();
                    if (error) throw error;
                    if (data) setPartners(prev => [...(data as MarketingPartner[]), ...prev]);
                } else {
                    setPartners(prev => [...newPartners.map((p, i) => ({ ...p, id: Date.now() + i } as MarketingPartner)), ...prev]);
                }
                alert(`Imported ${newPartners.length} partners.`);
            } catch (err: any) { alert("Import failed: " + err.message); } finally { setIsUploading(false); if (e.target) e.target.value = ''; }
        };
        reader.readAsArrayBuffer(file);
    };

    if (view === 'add') {
        return (
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg animate-fadeIn max-w-5xl mx-auto border border-gray-100 dark:border-gray-700">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Add New Marketing Partner</h2>
                    <button onClick={() => setView('list')} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md text-sm font-bold">Cancel</button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <h3 className="font-bold text-emerald-600 border-b pb-1">Company Profile</h3>
                            <div><label className="block text-sm font-medium">Company Name</label><input type="text" name="companyName" value={formData.companyName} onChange={handleInputChange} required className={commonInputClasses} /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium">Buyer Type</label><select name="buyerType" value={formData.buyerType} onChange={handleInputChange} className={commonInputClasses}>{BUYER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                <div><label className="block text-sm font-medium">Owner / Contact</label><input type="text" name="ownerName" value={formData.ownerName} onChange={handleInputChange} className={commonInputClasses} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium">Contact Number</label><input type="text" name="contactNumber" value={formData.contactNumber} onChange={handleInputChange} className={commonInputClasses} /></div>
                                <div><label className="block text-sm font-medium">Email Address</label><input type="email" name="email" value={formData.email} onChange={handleInputChange} className={commonInputClasses} /></div>
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
                            <div><label className="block text-sm font-medium">Remarks</label><textarea name="remarks" value={formData.remarks} onChange={handleInputChange} rows={3} className={commonInputClasses} /></div>
                        </div>
                    </div>

                    <div className="space-y-4 border-t pt-6">
                        <h3 className="font-bold text-emerald-600">Commodity Requirements</h3>
                        <div className="bg-gray-50 dark:bg-gray-900/40 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                                <div><label className="block text-xs font-bold uppercase text-gray-500">Type</label><select name="type" value={tempCommodity.type} onChange={handleTempCommodityChange} className={commonInputClasses}><option value="">Select Type</option>{referenceCommodityTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                <div><label className="block text-xs font-bold uppercase text-gray-500">Commodity Name</label><select name="name" value={tempCommodity.name} onChange={handleTempCommodityChange} disabled={!tempCommodity.type} className={commonInputClasses}><option value="">Select Commodity</option>{tempCommodity.type && commodityCategories[tempCommodity.type]?.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                                <div><label className="block text-xs font-bold uppercase text-gray-500">Source Region</label>
                                    <select name="sourceRegion" value={tempCommodity.sourceRegion} onChange={handleTempCommodityChange} className={commonInputClasses}>
                                        <option value="">Select Region</option>
                                        {philippineRegions.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </div>
                                <div><label className="block text-xs font-bold uppercase text-gray-500">Source Province</label><select name="sourceProvince" value={tempCommodity.sourceProvince} onChange={handleTempCommodityChange} className={commonInputClasses} disabled={provinceOptions.length === 0}><option value="">Select Province</option>{provinceOptions.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="block text-xs font-bold uppercase text-gray-500">Quality Standard</label><input type="text" name="qualityStandard" value={tempCommodity.qualityStandard} onChange={handleTempCommodityChange} className={commonInputClasses} placeholder="Grade A, Organic, etc." /></div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Monthly Volume (Kg/Month)</label>
                                    <div className="grid grid-cols-6 gap-2">
                                        {MONTHS.map(m => (
                                            <div key={m}><label className="block text-[10px] text-gray-400">{m}</label><input type="number" 
                                            // @ts-ignore
                                            value={tempCommodity[`volume${m}`] || ''} onChange={e => setTempCommodity({...tempCommodity, [`volume${m}`]: parseFloat(e.target.value) || 0})} className="w-full text-xs p-1 border rounded dark:bg-gray-700 dark:border-gray-600" /></div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="mt-4 flex justify-end gap-2">
                                {editingCommodityIdx !== null && <button type="button" onClick={resetTempCommodity} className="px-4 py-1 text-xs font-bold bg-gray-200 text-gray-700 rounded">Cancel Edit</button>}
                                <button type="button" onClick={saveTempCommodity} className="px-6 py-2 bg-emerald-600 text-white rounded font-bold text-sm hover:bg-emerald-700">{editingCommodityIdx !== null ? 'Update Item' : 'Add Requirement'}</button>
                            </div>
                        </div>

                        <div className="space-y-2 mt-4 max-h-60 overflow-y-auto">
                            {formData.commodityNeeds.map((c, i) => (
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
                        <button type="submit" className="px-10 py-3 bg-emerald-600 text-white rounded-md font-bold hover:bg-emerald-700 shadow-lg">Save Partner Profile</button>
                    </div>
                </form>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {isMultiDeleteModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full">
                        <h3 className="text-lg font-bold mb-4">Confirm Bulk Deletion</h3>
                        <p className="text-sm text-gray-500 mb-6">Are you sure you want to delete {selectedIds.length} partners? This action cannot be undone.</p>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setIsMultiDeleteModalOpen(false)} className="px-4 py-2 text-sm bg-gray-100 rounded">Cancel</button>
                            <button onClick={handleMultiDelete} className="px-4 py-2 text-sm bg-red-600 text-white rounded">Delete All</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Marketing Database</h2>
                <div className="flex items-center gap-2">
                    {isAdmin && (
                        <button onClick={() => setView('add')} className="px-4 py-2 bg-emerald-600 text-white rounded-md font-bold hover:bg-emerald-700 transition-all shadow-sm">
                            + Add Market Partner
                        </button>
                    )}
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border border-gray-100 dark:border-gray-700">
                <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                    <div className="flex flex-wrap gap-4 items-center flex-1 w-full">
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
                    
                    <div className="flex items-center gap-2">
                        {isSelectionMode && selectedIds.length > 0 && (
                            <button onClick={() => setIsMultiDeleteModalOpen(true)} className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700">
                                Delete Selected ({selectedIds.length})
                            </button>
                        )}
                        {isAdmin && (
                            <>
                                <button onClick={handleDownloadTemplate} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md shadow-sm font-bold hover:bg-gray-300">
                                    Template
                                </button>
                                <label className={`px-4 py-2 bg-emerald-600 text-white rounded-md font-bold hover:bg-emerald-700 transition-all shadow-sm ${isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                                    {isUploading ? 'Uploading...' : 'Upload XLSX'}
                                    <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleFileUpload} disabled={isUploading} />
                                </label>
                                <button 
                                    onClick={toggleSelectionMode} 
                                    className={`inline-flex items-center justify-center p-2 border border-gray-300 dark:border-gray-600 shadow-sm rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 ${isSelectionMode ? 'bg-red-100 dark:bg-red-900 text-red-600' : 'bg-white dark:bg-gray-700 text-gray-500'}`}
                                    title="Toggle Multi-Delete Mode"
                                >
                                    <TrashIcon />
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                {isSelectionMode && <th className="px-6 py-3 text-left w-10"><input type="checkbox" onChange={(e) => handleSelectAll(e, paginatedData)} checked={paginatedData.length > 0 && paginatedData.every(p => selectedIds.includes(p.id))} className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" /></th>}
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Region</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Company Name</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Commodity Needs</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Owner / Contact</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {paginatedData.map((partner) => (
                                <tr key={partner.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${selectedIds.includes(partner.id) ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}>
                                    {isSelectionMode && <td className="px-6 py-4"><input type="checkbox" checked={selectedIds.includes(partner.id)} onChange={() => handleSelectRow(partner.id)} className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" /></td>}
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-medium">{partner.region || 'N/A'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold"><button onClick={() => onSelectPartner(partner)} className="text-emerald-600 hover:text-emerald-700 hover:underline dark:text-emerald-400">{partner.companyName}</button><div className="text-[10px] text-gray-400 font-normal mt-0.5">{partner.uid}</div></td>
                                    <td className="px-6 py-4 whitespace-nowrap text-xs"><span className={`px-2 py-0.5 rounded-full font-bold ${partner.buyerType === 'Government' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>{partner.buyerType || 'Private'}</span></td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-1">
                                            {partner.commodityNeeds?.slice(0, 3).map((c, i) => (
                                                <span key={i} className="px-2 py-0.5 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-md text-[10px] font-bold border border-teal-100 dark:border-teal-800 uppercase">{c.name}</span>
                                            ))}
                                            {(partner.commodityNeeds?.length || 0) > 3 && <span className="text-[10px] text-gray-400 font-bold">+{partner.commodityNeeds.length - 3} more</span>}
                                            {(!partner.commodityNeeds || partner.commodityNeeds.length === 0) && <span className="text-gray-400 text-xs italic">Unspecified</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400"><div className="font-bold text-gray-700 dark:text-gray-300">{partner.ownerName}</div><div>{partner.contactNumber}</div></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                
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
