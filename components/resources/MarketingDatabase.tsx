
// Author: 4K 
import React, { useState, useMemo, useEffect } from 'react';
import { MarketingPartner, philippineRegions } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { usePagination, getUserPermissions } from '../mainfunctions/TableHooks';
import LocationPicker, { parseLocation } from '../LocationPicker';
import useLocalStorageState from '../../hooks/useLocalStorageState';

interface MarketingDatabaseProps {
    partners: MarketingPartner[];
    setPartners: React.Dispatch<React.SetStateAction<MarketingPartner[]>>;
    onSelectPartner: (partner: MarketingPartner) => void;
}

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm text-gray-900 dark:text-white";

const MarketingDatabase: React.FC<MarketingDatabaseProps> = ({ partners, setPartners, onSelectPartner }) => {
    const { currentUser } = useAuth();
    const { canEdit } = getUserPermissions(currentUser);
    
    const [view, setView] = useState<'list' | 'add'>('list');
    const [searchTerm, setSearchTerm] = useLocalStorageState('market_search', '');
    const [regionFilter, setRegionFilter] = useLocalStorageState('market_region', 'All');

    // Add Form State
    const [formData, setFormData] = useState<Omit<MarketingPartner, 'id'>>({
        uid: '',
        companyName: '',
        ownerName: '',
        contactNumber: '',
        email: '',
        location: '',
        region: '',
        commodityNeeds: [],
        linkedIpoNames: [],
        remarks: '',
        encodedBy: currentUser?.fullName || ''
    });

    const [newCommodity, setNewCommodity] = useState('');

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
                p.commodityNeeds.some(c => c.toLowerCase().includes(low))
            );
        }
        return list.sort((a, b) => a.companyName.localeCompare(b.companyName));
    }, [partners, regionFilter, searchTerm]);

    const { currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData } = usePagination(filteredPartners, [regionFilter, searchTerm]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleAddCommodity = () => {
        if (!newCommodity.trim()) return;
        setFormData(prev => ({ ...prev, commodityNeeds: [...prev.commodityNeeds, newCommodity.trim()] }));
        setNewCommodity('');
    };

    const removeCommodity = (idx: number) => {
        setFormData(prev => ({ ...prev, commodityNeeds: prev.commodityNeeds.filter((_, i) => i !== idx) }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const id = Date.now();
        const uid = `MP-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
        const newPartner: MarketingPartner = {
            ...formData,
            id,
            uid,
            created_at: new Date().toISOString()
        };
        setPartners(prev => [newPartner, ...prev]);
        setView('list');
        setFormData({
            uid: '', companyName: '', ownerName: '', contactNumber: '', email: '', 
            location: '', region: '', commodityNeeds: [], linkedIpoNames: [], remarks: '', encodedBy: currentUser?.fullName || ''
        });
    };

    if (view === 'add') {
        return (
            <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg animate-fadeIn max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Add New Marketing Partner</h2>
                    <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-700">Cancel</button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium">Company Name</label>
                            <input type="text" name="companyName" value={formData.companyName} onChange={handleInputChange} required className={commonInputClasses} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium">Owner / Contact Person</label>
                            <input type="text" name="ownerName" value={formData.ownerName} onChange={handleInputChange} className={commonInputClasses} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium">Contact Number</label>
                            <input type="text" name="contactNumber" value={formData.contactNumber} onChange={handleInputChange} className={commonInputClasses} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium">Email Address</label>
                            <input type="email" name="email" value={formData.email} onChange={handleInputChange} className={commonInputClasses} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium">Region</label>
                            <select name="region" value={formData.region} onChange={handleInputChange} className={commonInputClasses}>
                                <option value="">Select Region</option>
                                {philippineRegions.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium mb-1">Office Location</label>
                            <LocationPicker value={formData.location} onChange={(val) => setFormData(prev => ({...prev, location: val}))} />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium">Commodity Needs</label>
                            <div className="flex gap-2 mt-1">
                                <input 
                                    type="text" 
                                    value={newCommodity} 
                                    onChange={(e) => setNewCommodity(e.target.value)} 
                                    className={commonInputClasses} 
                                    placeholder="e.g. Coffee Beans" 
                                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCommodity())}
                                />
                                <button type="button" onClick={handleAddCommodity} className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700">+</button>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-3">
                                {formData.commodityNeeds.map((c, i) => (
                                    <span key={i} className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-semibold flex items-center gap-2">
                                        {c}
                                        <button type="button" onClick={() => removeCommodity(i)} className="hover:text-red-600">&times;</button>
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium">Remarks</label>
                            <textarea name="remarks" value={formData.remarks} onChange={handleInputChange} rows={3} className={commonInputClasses} />
                        </div>
                    </div>
                    <div className="pt-4 flex justify-end">
                        <button type="submit" className="px-6 py-2 bg-emerald-600 text-white rounded-md font-bold hover:bg-emerald-700 shadow-md transition-all">Save Partner Profile</button>
                    </div>
                </form>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Marketing Database</h2>
                {canEdit && (
                    <button onClick={() => setView('add')} className="px-4 py-2 bg-emerald-600 text-white rounded-md font-semibold hover:bg-emerald-700 transition-all shadow-sm">
                        + Add Market Partner
                    </button>
                )}
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
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Commodity Needs</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Owner / Contact</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Details</th>
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
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-1">
                                            {partner.commodityNeeds.map((c, i) => (
                                                <span key={i} className="px-2 py-0.5 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-md text-[10px] font-bold border border-teal-100 dark:border-teal-800 uppercase">
                                                    {c}
                                                </span>
                                            ))}
                                            {partner.commodityNeeds.length === 0 && <span className="text-gray-400 text-xs italic">Unspecified</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                                        {partner.ownerName || 'N/A'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                        <div className="font-medium text-gray-700 dark:text-gray-300">{partner.contactNumber}</div>
                                        <div>{partner.email}</div>
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
