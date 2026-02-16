
// Author: 4K 
import React, { useState, useMemo } from 'react';
import { MarketingPartner, IPO, philippineRegions } from '../../constants';
import LocationPicker from '../LocationPicker';
import { useAuth } from '../../contexts/AuthContext';
import { getUserPermissions } from '../mainfunctions/TableHooks';

interface MarketProfileDetailProps {
    partner: MarketingPartner;
    ipos: IPO[];
    onBack: () => void;
    onUpdatePartner: (partner: MarketingPartner) => void;
}

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm text-gray-900 dark:text-white";

const MarketProfileDetail: React.FC<MarketProfileDetailProps> = ({ partner, ipos, onBack, onUpdatePartner }) => {
    const { currentUser } = useAuth();
    const { canEdit } = getUserPermissions(currentUser);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<MarketingPartner>(partner);
    const [newCommodity, setNewCommodity] = useState('');

    // Logic: Find IPOs that produce the commodities needed by this partner
    const potentialIpos = useMemo(() => {
        const needs = partner.commodityNeeds.map(c => c.toLowerCase());
        return ipos.filter(ipo => 
            ipo.commodities.some(c => needs.includes(c.particular.toLowerCase()))
        );
    }, [partner.commodityNeeds, ipos]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleAddCommodity = () => {
        if (!newCommodity.trim()) return;
        if (formData.commodityNeeds.includes(newCommodity.trim())) return;
        setFormData(prev => ({ ...prev, commodityNeeds: [...prev.commodityNeeds, newCommodity.trim()] }));
        setNewCommodity('');
    };

    const removeCommodity = (idx: number) => {
        setFormData(prev => ({ ...prev, commodityNeeds: prev.commodityNeeds.filter((_, i) => i !== idx) }));
    };

    const handleSave = () => {
        onUpdatePartner({ ...formData, updated_at: new Date().toISOString() });
        setIsEditing(false);
    };

    const DetailBlock = ({ label, value }: { label: string, value: any }) => (
        <div>
            <dt className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</dt>
            <dd className="text-md font-semibold text-gray-800 dark:text-white mt-0.5">{value || 'N/A'}</dd>
        </div>
    );

    return (
        <div className="space-y-8 animate-fadeIn">
            {/* Header */}
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
                {canEdit && !isEditing && (
                    <button onClick={() => setIsEditing(true)} className="px-4 py-2 bg-emerald-600 text-white rounded-md font-semibold hover:bg-emerald-700 shadow-md">
                        Edit Profile
                    </button>
                )}
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Info Card */}
                <div className="lg:col-span-2 space-y-8">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border-t-4 border-emerald-500">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-800 dark:text-white">General Information</h3>
                            {isEditing && (
                                <div className="flex gap-2">
                                    <button onClick={() => setIsEditing(false)} className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 rounded">Cancel</button>
                                    <button onClick={handleSave} className="px-3 py-1 text-sm bg-emerald-600 text-white rounded">Save</button>
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
                                    <label className="block text-xs font-bold text-gray-500">Commodity Needs</label>
                                    <div className="flex gap-2 mt-1">
                                        <input type="text" value={newCommodity} onChange={e => setNewCommodity(e.target.value)} className={commonInputClasses} placeholder="Add requirement..." />
                                        <button type="button" onClick={handleAddCommodity} className="px-4 py-2 bg-emerald-600 text-white rounded-md">+</button>
                                    </div>
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        {formData.commodityNeeds.map((c, i) => (
                                            <span key={i} className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold flex items-center gap-2">
                                                {c}
                                                <button type="button" onClick={() => removeCommodity(i)}>&times;</button>
                                            </span>
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
                                <DetailBlock label="Owner / Principal" value={partner.ownerName} />
                                <DetailBlock label="Contact Number" value={partner.contactNumber} />
                                <DetailBlock label="Email Address" value={partner.email} />
                                <DetailBlock label="Region" value={partner.region} />
                                <div className="md:col-span-2">
                                    <DetailBlock label="Location" value={partner.location} />
                                </div>
                                <div className="md:col-span-2">
                                    <dt className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Commodity Needs</dt>
                                    <div className="flex flex-wrap gap-2">
                                        {partner.commodityNeeds.map((c, i) => (
                                            <span key={i} className="px-3 py-1 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 rounded-lg text-sm font-bold border border-teal-100 dark:border-teal-800">
                                                {c}
                                            </span>
                                        ))}
                                        {partner.commodityNeeds.length === 0 && <span className="text-gray-400 italic text-sm">None specified</span>}
                                    </div>
                                </div>
                                <div className="md:col-span-2">
                                    <DetailBlock label="Remarks" value={<p className="italic text-gray-600 dark:text-gray-400">{partner.remarks || 'No additional remarks.'}</p>} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Potential Partners Section */}
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
                                    partner.commodityNeeds.map(n => n.toLowerCase()).includes(c.particular.toLowerCase())
                                );
                                return (
                                    <div key={ipo.id} className="p-4 bg-gray-50 dark:bg-gray-700/30 border border-gray-100 dark:border-gray-700 rounded-lg group hover:border-teal-400 transition-colors">
                                        <h4 className="font-bold text-gray-800 dark:text-white group-hover:text-teal-600 transition-colors">{ipo.name}</h4>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{ipo.location}</p>
                                        <div className="mt-3 space-y-1">
                                            <p className="text-[10px] font-bold text-gray-400 uppercase">Produces Matches:</p>
                                            <div className="flex flex-wrap gap-1">
                                                {matchingComms.map((mc, idx) => (
                                                    <span key={idx} className="text-[10px] bg-white dark:bg-gray-800 px-2 py-0.5 rounded border border-teal-200 dark:border-teal-800 text-teal-600 font-medium">
                                                        {mc.particular}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {potentialIpos.length === 0 && (
                                <div className="col-span-2 text-center py-8 text-gray-400 italic">
                                    No IPOs found in the system that produce the commodities needed by this partner.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Encoded By & History */}
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
