
// Author: 4K 
import React, { useState, FormEvent, useEffect, useMemo } from 'react';
import { Subproject, IPO, SubprojectDetail, objectTypes, ObjectType, fundTypes, tiers, SubprojectCommodity, referenceCommodityTypes, philippineRegions } from '../constants';
import LocationPicker from './LocationPicker';
import { useAuth } from '../contexts/AuthContext';
import { useLogAction } from '../hooks/useLogAction';
import { useIpoHistory } from '../hooks/useIpoHistory';
import { supabase } from '../supabaseClient';

interface SubprojectEditProps {
    subproject?: Subproject;
    ipos: IPO[];
    setIpos: React.Dispatch<React.SetStateAction<IPO[]>>;
    onBack: () => void;
    onUpdateSubproject: (updated: Subproject) => void;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    particularTypes: { [key: string]: string[] };
    commodityCategories: { [key: string]: string[] };
}

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm text-gray-900 dark:text-white disabled:bg-gray-100 disabled:dark:bg-gray-800 disabled:cursor-not-allowed";

const defaultFormData: Subproject = {
    id: 0,
    uid: '',
    name: '',
    location: '',
    indigenousPeopleOrganization: '',
    status: 'Proposed',
    details: [],
    subprojectCommodities: [],
    packageType: 'Package 1',
    startDate: `${new Date().getFullYear()}-01-01`,
    estimatedCompletionDate: '',
    lat: 0,
    lng: 0,
    fundingYear: new Date().getFullYear(),
    fundType: 'Current',
    tier: 'Tier 1',
    operatingUnit: '',
    encodedBy: ''
};

const calculateTotalBudget = (details: SubprojectDetail[]) => {
    return details.reduce((total, item) => total + (item.pricePerUnit * item.numberOfUnits), 0);
};

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
};

const SubprojectEdit: React.FC<SubprojectEditProps> = ({ 
    subproject, ipos, setIpos, onBack, onUpdateSubproject, uacsCodes, particularTypes, commodityCategories 
}) => {
    const { currentUser } = useAuth();
    const { logAction } = useLogAction();
    const { addIpoHistory } = useIpoHistory();
    
    const [formData, setFormData] = useState<Subproject>(subproject || defaultFormData);
    const [activeTab, setActiveTab] = useState<'details' | 'commodity' | 'budget'>('details');
    const [selectedRegion, setSelectedRegion] = useState('');
    const [dateError, setDateError] = useState('');
    
    // Budget Form State
    const [currentDetail, setCurrentDetail] = useState<Omit<SubprojectDetail, 'id'>>({
        type: '', particulars: '', deliveryDate: '', unitOfMeasure: 'pcs', pricePerUnit: 0, numberOfUnits: 0, objectType: 'MOOE', expenseParticular: '', uacsCode: '', obligationMonth: '', disbursementMonth: ''
    });
    const [editingDetailId, setEditingDetailId] = useState<number | null>(null);

    // Commodity Form State
    const [currentCommodity, setCurrentCommodity] = useState<SubprojectCommodity>({
        typeName: '', name: '', area: 0, averageYield: 0
    });
    const [editingCommodityIndex, setEditingCommodityIndex] = useState<number | null>(null);

    // Initialize logic
    useEffect(() => {
        if (subproject) {
            setFormData(subproject);
            const linkedIpo = ipos.find(i => i.name === subproject.indigenousPeopleOrganization);
            if (linkedIpo) setSelectedRegion(linkedIpo.region);
        } else {
            setFormData({
                ...defaultFormData,
                operatingUnit: currentUser?.operatingUnit || '',
                encodedBy: currentUser?.fullName || ''
            });
        }
    }, [subproject, ipos, currentUser]);

    // Filter IPOs
    const filteredIpos = useMemo(() => {
        if (!selectedRegion) return [];
        return ipos.filter(ipo => ipo.region === selectedRegion).sort((a, b) => a.name.localeCompare(b.name));
    }, [ipos, selectedRegion]);

    // Handlers
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => {
            const newData = { ...prev, [name]: value };
            if (name === 'indigenousPeopleOrganization') {
                const selectedIpo = ipos.find(ipo => ipo.name === value);
                if (selectedIpo) {
                    newData.location = selectedIpo.location;
                    newData.ipo_id = selectedIpo.id;
                } else {
                    newData.location = '';
                    newData.ipo_id = undefined;
                }
            }
            return newData;
        });
    };

    // Helper for Months
    const getMonthFromDateStr = (dateStr: string) => {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length > 1) return (parseInt(parts[1]) - 1).toString();
        return '';
    };

    const updateDetailDateFromMonth = (field: string, monthIndex: string) => {
        if (monthIndex === '') {
            setCurrentDetail(prev => ({ ...prev, [field]: '' }));
            return;
        }
        const mIndex = parseInt(monthIndex);
        const year = formData.fundingYear || new Date().getFullYear();
        const dateStr = `${year}-${String(mIndex + 1).padStart(2, '0')}-01`;
        setCurrentDetail(prev => ({ ...prev, [field]: dateStr }));
    }

    const handleDetailChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'type') setCurrentDetail(prev => ({ ...prev, type: value, particulars: '' }));
        else if (name === 'objectType') setCurrentDetail(prev => ({ ...prev, objectType: value as ObjectType, expenseParticular: '', uacsCode: '' }));
        else if (name === 'expenseParticular') setCurrentDetail(prev => ({ ...prev, expenseParticular: value, uacsCode: '' }));
        else setCurrentDetail(prev => ({ ...prev, [name]: value }));
    };

    const handleAddDetail = () => {
        setDateError('');
        if (!currentDetail.particulars || !currentDetail.uacsCode || !currentDetail.pricePerUnit || !currentDetail.numberOfUnits) {
            alert("Please fill in required detail fields."); return;
        }
        if (currentDetail.deliveryDate && formData.startDate && new Date(currentDetail.deliveryDate) < new Date(formData.startDate)) {
            setDateError('Delivery date cannot be before start date.'); return;
        }

        let updatedDetails: SubprojectDetail[] = [];
        const newItem = { 
            ...currentDetail, 
            pricePerUnit: Number(currentDetail.pricePerUnit), 
            numberOfUnits: Number(currentDetail.numberOfUnits) 
        };

        if (editingDetailId !== null) {
            updatedDetails = formData.details.map(d => d.id === editingDetailId ? { ...d, ...newItem } : d);
            setEditingDetailId(null);
        } else {
            updatedDetails = [...formData.details, { id: Date.now(), ...newItem } as SubprojectDetail];
        }

        // Auto update estimated completion
        let newEstimatedCompletionDate = formData.estimatedCompletionDate;
        const deliveryDates = updatedDetails.map(d => d.deliveryDate).filter(d => d).map(d => new Date(d).getTime());
        if (deliveryDates.length > 0) {
            newEstimatedCompletionDate = new Date(Math.max(...deliveryDates)).toISOString().split('T')[0];
        }

        setFormData(prev => ({ ...prev, details: updatedDetails, estimatedCompletionDate: newEstimatedCompletionDate }));
        setCurrentDetail({ type: '', particulars: '', deliveryDate: '', unitOfMeasure: 'pcs', pricePerUnit: 0, numberOfUnits: 0, objectType: 'MOOE', expenseParticular: '', uacsCode: '', obligationMonth: '', disbursementMonth: '' });
    };

    const handleEditDetail = (id: number) => {
        const d = formData.details.find(d => d.id === id);
        if (d) {
            setCurrentDetail(d);
            setEditingDetailId(id);
        }
    };

    const handleRemoveDetail = (id: number) => {
        setFormData(prev => ({ ...prev, details: prev.details.filter(d => d.id !== id) }));
        if (editingDetailId === id) {
            setEditingDetailId(null);
            setCurrentDetail({ type: '', particulars: '', deliveryDate: '', unitOfMeasure: 'pcs', pricePerUnit: 0, numberOfUnits: 0, objectType: 'MOOE', expenseParticular: '', uacsCode: '', obligationMonth: '', disbursementMonth: '' });
        }
    };

    const handleCancelEditDetail = () => {
        setEditingDetailId(null);
        setCurrentDetail({ type: '', particulars: '', deliveryDate: '', unitOfMeasure: 'pcs', pricePerUnit: 0, numberOfUnits: 0, objectType: 'MOOE', expenseParticular: '', uacsCode: '', obligationMonth: '', disbursementMonth: '' });
    };

    const handleCommodityChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'typeName') setCurrentCommodity(prev => ({ ...prev, typeName: value, name: '' }));
        else setCurrentCommodity(prev => ({ ...prev, [name]: value }));
    };

    const handleAddCommodity = () => {
        const isAnimal = currentCommodity.typeName === 'Animal Commodity';
        if (!currentCommodity.typeName || !currentCommodity.name || !currentCommodity.area) {
            alert("Please fill in required commodity fields."); return;
        }
        const newCom: SubprojectCommodity = { ...currentCommodity, area: Number(currentCommodity.area), averageYield: isAnimal ? undefined : Number(currentCommodity.averageYield) };
        
        let updatedCommodities = [...(formData.subprojectCommodities || [])];
        if (editingCommodityIndex !== null) {
            updatedCommodities[editingCommodityIndex] = newCom;
            setEditingCommodityIndex(null);
        } else {
            updatedCommodities.push(newCom);
        }
        setFormData(prev => ({ ...prev, subprojectCommodities: updatedCommodities }));
        setCurrentCommodity({ typeName: '', name: '', area: 0, averageYield: 0 });
    };

    const handleEditCommodity = (idx: number) => {
        if (formData.subprojectCommodities) {
            setCurrentCommodity(formData.subprojectCommodities[idx]);
            setEditingCommodityIndex(idx);
        }
    };

    const handleRemoveCommodity = (idx: number) => {
        setFormData(prev => ({ ...prev, subprojectCommodities: prev.subprojectCommodities?.filter((_, i) => i !== idx) }));
        if (editingCommodityIndex === idx) {
             setEditingCommodityIndex(null);
             setCurrentCommodity({ typeName: '', name: '', area: 0, averageYield: 0 });
        }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        
        const timestamp = new Date().toISOString();
        const historyEntry = { date: timestamp, event: subproject ? "Subproject Updated" : "Subproject Created", user: currentUser?.fullName || "System" };
        
        // Resolve ID logic for Offline mode
        // For online, Supabase handles ID
        let resolvedIpoId = formData.ipo_id;
        if (!resolvedIpoId && formData.indigenousPeopleOrganization) {
            const matched = ipos.find(i => i.name === formData.indigenousPeopleOrganization);
            if (matched) resolvedIpoId = matched.id;
        }

        const payload: any = { ...formData, ipo_id: resolvedIpoId, updated_at: timestamp };
        if (!subproject) {
            payload.created_at = timestamp;
            payload.uid = formData.uid || `SP-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
            payload.history = [historyEntry];
        } else {
            payload.history = [...(subproject.history || []), historyEntry];
        }

        // DB Operations
        if (supabase) {
            const { id, ...dbPayload } = payload; // Remove ID for insert/update handled by DB
            if (!subproject) {
                const { data, error } = await supabase.from('subprojects').insert([dbPayload]).select().single();
                if (error) { alert("Error saving: " + error.message); return; }
                if (data) {
                    onUpdateSubproject(data);
                    logAction('Created Subproject', data.name, data.indigenousPeopleOrganization);
                    if (resolvedIpoId) addIpoHistory(resolvedIpoId, `Subproject Created: ${data.name}`);
                }
            } else {
                const { data, error } = await supabase.from('subprojects').update(dbPayload).eq('id', subproject.id).select().single();
                if (error) { alert("Error saving: " + error.message); return; }
                if (data) {
                    onUpdateSubproject(data);
                    logAction('Updated Subproject', data.name, data.indigenousPeopleOrganization);
                }
            }
        } else {
             // Offline fallback
             const offlinePayload = { ...payload, id: subproject ? subproject.id : Date.now() };
             onUpdateSubproject(offlinePayload);
        }

        // Sync Commodities to IPO
        if (payload.subprojectCommodities && payload.subprojectCommodities.length > 0) {
            setIpos(prev => prev.map(ipo => {
                if (ipo.name === payload.indigenousPeopleOrganization) {
                    const newComs = [...ipo.commodities];
                    let changed = false;
                    payload.subprojectCommodities.forEach((sc: SubprojectCommodity) => {
                         const exists = newComs.some(c => c.particular === sc.name && c.type === sc.typeName);
                         if (!exists) {
                             newComs.push({ type: sc.typeName, particular: sc.name, value: sc.area, isScad: false });
                             changed = true;
                         }
                    });
                    if (changed) return { ...ipo, commodities: newComs };
                }
                return ipo;
            }));
        }

        onBack();
    };

    const TabButton = ({ name, label }: { name: any, label: string }) => (
        <button type="button" onClick={() => setActiveTab(name)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === name ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{label}</button>
    );

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8 animate-fadeIn">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-semibold text-gray-800 dark:text-white">{subproject ? 'Edit Subproject' : 'Add New Subproject'}</h3>
                <button onClick={onBack} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600">Back to List</button>
            </div>
            <form onSubmit={handleSubmit}>
                <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                    <nav className="-mb-px flex space-x-4"><TabButton name="details" label="Subproject Details" /><TabButton name="commodity" label="Subproject Commodity" /><TabButton name="budget" label="Budget Items" /></nav>
                </div>
                <div className="min-h-[400px]">
                    {activeTab === 'details' && (
                         <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium">Subproject Name</label><input type="text" name="name" value={formData.name} onChange={handleInputChange} className={commonInputClasses} required /></div>
                                <div><label className="block text-sm font-medium">Region</label><select value={selectedRegion} onChange={(e) => { setSelectedRegion(e.target.value); setFormData(prev => ({...prev, indigenousPeopleOrganization: ''})); }} className={commonInputClasses}><option value="">Select Region</option>{philippineRegions.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                                <div><label className="block text-sm font-medium">IPO</label><select name="indigenousPeopleOrganization" value={formData.indigenousPeopleOrganization} onChange={handleInputChange} className={commonInputClasses} disabled={!selectedRegion} required><option value="">Select IPO</option>{filteredIpos.map(ipo => <option key={ipo.id} value={ipo.name}>{ipo.name}</option>)}</select></div>
                                <div><label className="block text-sm font-medium">Status</label><select name="status" value={formData.status} onChange={handleInputChange} className={commonInputClasses} disabled={currentUser?.role === 'User' && !subproject}><option value="Proposed">Proposed</option><option value="Ongoing">Ongoing</option><option value="Cancelled">Cancelled</option>{formData.status === 'Completed' && <option value="Completed">Completed</option>}</select></div>
                                <div><label className="block text-sm font-medium">Package</label><select name="packageType" value={formData.packageType} onChange={handleInputChange} className={commonInputClasses}>{Array.from({ length: 7 }, (_, i) => `Package ${i + 1}`).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium">Start Date</label><input type="date" name="startDate" value={formData.startDate} onChange={handleInputChange} className={commonInputClasses} required /></div>
                                <div><label className="block text-sm font-medium">Est. Completion</label><input type="date" name="estimatedCompletionDate" value={formData.estimatedCompletionDate} onChange={handleInputChange} className={commonInputClasses} required /></div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div><label className="block text-sm font-medium">Fund Year</label><input type="number" name="fundingYear" value={formData.fundingYear} onChange={handleInputChange} className={commonInputClasses} /></div>
                                <div><label className="block text-sm font-medium">Fund Type</label><select name="fundType" value={formData.fundType} onChange={handleInputChange} className={commonInputClasses}>{fundTypes.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                                <div><label className="block text-sm font-medium">Tier</label><select name="tier" value={formData.tier} onChange={handleInputChange} className={commonInputClasses}>{tiers.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                            </div>
                            {formData.estimatedCompletionDate && new Date() > new Date(formData.estimatedCompletionDate) && formData.status !== 'Completed' && (
                                <div className="border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10 p-4 rounded-md mt-4">
                                    <h4 className="font-semibold text-red-600 dark:text-red-400 mb-2">Catch Up Plan</h4>
                                    <p className="text-xs text-red-500 mb-4">Project is delayed. Please provide a catch-up plan.</p>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Remarks / Justification</label>
                                            <textarea name="catchUpPlanRemarks" value={formData.catchUpPlanRemarks || ''} onChange={handleInputChange} rows={3} className={commonInputClasses} placeholder="Describe actions taken or justification for delay..." />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">New Target Completion Date</label>
                                            <input type="date" name="newTargetCompletionDate" value={formData.newTargetCompletionDate || ''} onChange={handleInputChange} className={commonInputClasses} />
                                        </div>
                                    </div>
                                </div>
                            )}
                         </div>
                    )}
                    {activeTab === 'commodity' && (
                        <div className="space-y-4">
                            {formData.subprojectCommodities && formData.subprojectCommodities.length > 0 ? (
                                formData.subprojectCommodities.map((c, i) => (
                                    <div key={i} className={`flex items-center justify-between p-2 rounded-md text-sm ${i === editingCommodityIndex ? 'bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-700' : 'bg-gray-50 dark:bg-gray-700/50'}`}>
                                        <div>
                                            <span className="font-semibold">{c.name}</span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">({c.typeName || 'N/A'})</span>
                                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                                {c.typeName === 'Animal Commodity' ? 'Heads' : 'Area'}: {c.area} {c.typeName !== 'Animal Commodity' && `| Yield: ${c.averageYield}`}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button type="button" onClick={() => handleEditCommodity(i)} className="text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
                                            </button>
                                            <button type="button" onClick={() => handleRemoveCommodity(i)} className="text-red-500 hover:text-red-700">&times;</button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-gray-500 dark:text-gray-400 italic">No commodities added.</p>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end border-t pt-4">
                                <div><label className="block text-xs font-medium">Type</label><select name="typeName" value={currentCommodity.typeName} onChange={handleCommodityChange} className={commonInputClasses + " py-1.5"}><option value="">Select Type</option>{referenceCommodityTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                <div><label className="block text-xs font-medium">Commodity</label><select name="name" value={currentCommodity.name} onChange={handleCommodityChange} disabled={!currentCommodity.typeName} className={commonInputClasses + " py-1.5"}><option value="">Select Commodity</option>{currentCommodity.typeName && commodityCategories[currentCommodity.typeName]?.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                                <div><label className="block text-xs font-medium">{currentCommodity.typeName === 'Animal Commodity' ? 'No. of Heads' : 'Area (Hectares)'}</label><input type="number" name="area" value={currentCommodity.area} onChange={handleCommodityChange} className={commonInputClasses + " py-1.5"} /></div>
                                <div className="flex gap-2 items-end">
                                    {currentCommodity.typeName !== 'Animal Commodity' && (
                                        <div className="flex-grow">
                                            <label className="block text-xs font-medium">Yield (Kg/Hectares)</label>
                                            <input type="number" name="averageYield" value={currentCommodity.averageYield} onChange={handleCommodityChange} className={commonInputClasses + " py-1.5"} />
                                        </div>
                                    )}
                                    <button type="button" onClick={handleAddCommodity} className="h-9 w-9 flex-shrink-0 inline-flex items-center justify-center rounded-full bg-emerald-100 text-emerald-600 hover:bg-emerald-200">+</button>
                                </div>
                            </div>
                        </div>
                    )}
                    {activeTab === 'budget' && (
                        <div className="space-y-4">
                             {formData.details.map((d) => (
                                <div key={d.id} className={`flex justify-between items-center p-2 rounded ${d.id === editingDetailId ? 'bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-700' : 'bg-gray-50 dark:bg-gray-700/50'}`}>
                                    <span className="text-sm">{d.particulars} - {formatCurrency(d.pricePerUnit * d.numberOfUnits)}</span>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => { setCurrentDetail(d); setEditingDetailId(d.id); }} className="text-blue-500 text-xs">Edit</button>
                                        <button type="button" onClick={() => handleRemoveDetail(d.id)} className="text-red-500 text-xs">Remove</button>
                                    </div>
                                </div>
                             ))}
                             <div className="text-right font-bold text-gray-900 dark:text-white">Total: {formatCurrency(calculateTotalBudget(formData.details))}</div>
                             
                             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-end border-t pt-4 mt-4 border-gray-200 dark:border-gray-700">
                                <div className="lg:col-span-2"><label className="block text-xs font-medium">Item Type</label><select name="type" value={currentDetail.type} onChange={handleDetailChange} className={commonInputClasses + " py-1.5"}><option value="">Select Type</option>{Object.keys(particularTypes).map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                <div className="lg:col-span-2"><label className="block text-xs font-medium">Particulars</label><select name="particulars" value={currentDetail.particulars} onChange={handleDetailChange} disabled={!currentDetail.type} className={commonInputClasses + " py-1.5"}><option value="">Select Item</option>{currentDetail.type && particularTypes[currentDetail.type]?.map(i => <option key={i} value={i}>{i}</option>)}</select></div>
                                
                                <div className="lg:col-span-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div><label className="block text-xs font-medium">Object Type</label><select name="objectType" value={currentDetail.objectType} onChange={handleDetailChange} className={commonInputClasses + " py-1.5"}>{objectTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                    <div><label className="block text-xs font-medium">Expense Particular</label><select name="expenseParticular" value={currentDetail.expenseParticular} onChange={handleDetailChange} className={commonInputClasses + " py-1.5"}><option value="">Select Particular</option>{Object.keys(uacsCodes[currentDetail.objectType]).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                                    <div><label className="block text-xs font-medium">UACS Code</label><select name="uacsCode" value={currentDetail.uacsCode} onChange={handleDetailChange} disabled={!currentDetail.expenseParticular} className={commonInputClasses + " py-1.5"}><option value="">Select UACS</option>{currentDetail.expenseParticular && uacsCodes[currentDetail.objectType]?.[currentDetail.expenseParticular] && Object.entries(uacsCodes[currentDetail.objectType][currentDetail.expenseParticular]).map(([code, d]) => <option key={code} value={code}>{code} - {d}</option>)}</select></div>
                                </div>

                                <div><label className="block text-xs font-medium">Delivery Date</label><input type="date" name="deliveryDate" value={currentDetail.deliveryDate} onChange={handleDetailChange} className={commonInputClasses + " py-1.5 text-sm"} />{dateError && <p className="text-xs text-red-500 mt-1">{dateError}</p>}</div>
                                
                                <div>
                                    <label className="block text-xs font-medium">Obligation Month</label>
                                    <select value={getMonthFromDateStr(currentDetail.obligationMonth)} onChange={(e) => updateDetailDateFromMonth('obligationMonth', e.target.value)} className={commonInputClasses + " py-1.5 text-sm"}>
                                        <option value="">Select Month</option>
                                        {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium">Disbursement Month</label>
                                    <select value={getMonthFromDateStr(currentDetail.disbursementMonth)} onChange={(e) => updateDetailDateFromMonth('disbursementMonth', e.target.value)} className={commonInputClasses + " py-1.5 text-sm"}>
                                        <option value="">Select Month</option>
                                        {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                                    </select>
                                </div>
                                
                                <div><label className="block text-xs font-medium">Unit of Measure</label><select name="unitOfMeasure" value={currentDetail.unitOfMeasure} onChange={handleDetailChange} className={commonInputClasses + " py-1.5 text-sm"}><option value="pcs">pcs</option><option value="kg">kg</option><option value="liters">liters</option><option value="boxes">boxes</option><option value="sets">sets</option><option value="pax">pax</option><option value="months">months</option><option value="days">days</option><option value="ha">ha</option><option value="bags">bags</option><option value="bottles">bottles</option><option value="sachets">sachets</option><option value="rolls">rolls</option><option value="meters">meters</option><option value="units">units</option><option value="lots">lots</option></select></div>
                                <div><label className="block text-xs font-medium">Price per Unit</label><input type="number" name="pricePerUnit" value={currentDetail.pricePerUnit} onChange={handleDetailChange} className={commonInputClasses + " py-1.5 text-sm"} /></div>
                                <div><label className="block text-xs font-medium">No. of Units</label><input type="number" name="numberOfUnits" value={currentDetail.numberOfUnits} onChange={handleDetailChange} className={commonInputClasses + " py-1.5 text-sm"} /></div>
                                
                                <div className="flex gap-2 items-end">
                                    {editingDetailId !== null && (
                                        <button type="button" onClick={handleCancelEditDetail} className="h-9 px-3 flex-shrink-0 inline-flex items-center justify-center rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 text-sm font-medium">Cancel</button>
                                    )}
                                    <button type="button" onClick={handleAddDetail} className="h-9 w-9 flex-shrink-0 inline-flex items-center justify-center rounded-full bg-emerald-100 text-emerald-600 hover:bg-emerald-200">{editingDetailId !== null ? '✓' : '+'}</button>
                                </div>
                             </div>
                        </div>
                    )}
                </div>
                <div className="flex justify-end gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button type="submit" className="px-4 py-2 rounded-md text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700">Save Subproject</button>
                </div>
            </form>
        </div>
    );
};

export default SubprojectEdit;
