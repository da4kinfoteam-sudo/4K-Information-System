// Author: 4K
import React, { useState, FormEvent, useEffect, useMemo } from 'react';
import { Info } from 'lucide-react';
import { Subproject, IPO, SubprojectDetail, objectTypes, ObjectType, fundTypes, tiers, SubprojectCommodity, philippineRegions, operatingUnits, ouToRegionMap, RefCommodity, RefLivestock } from '../constants';
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
    refCommodities: RefCommodity[];
    refLivestock: RefLivestock[];
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

const formatMonthYear = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
};

const SubprojectEdit: React.FC<SubprojectEditProps> = ({ 
    subproject, ipos, setIpos, onBack, onUpdateSubproject, uacsCodes, particularTypes, commodityCategories, refCommodities, refLivestock
}): React.ReactNode => {
    const { currentUser } = useAuth();
    const { logAction } = useLogAction();
    const { addIpoHistory } = useIpoHistory();
    
    const [formData, setFormData] = useState<Subproject>(subproject || defaultFormData);
    const [activeTab, setActiveTab] = useState<'details' | 'commodity' | 'budget' | 'summary'>('details');
    const [selectedRegion, setSelectedRegion] = useState('');
    
    const [currentDetail, setCurrentDetail] = useState<Omit<SubprojectDetail, 'id'>>({
        type: '', particulars: '', deliveryDate: '', unitOfMeasure: 'pcs', pricePerUnit: 0, numberOfUnits: 0, objectType: 'MOOE', expenseParticular: '', uacsCode: '', obligationMonth: '', disbursementMonth: ''
    });
    const [editingDetailId, setEditingDetailId] = useState<number | null>(null);

    const [currentCommodity, setCurrentCommodity] = useState<SubprojectCommodity>({
        typeName: '', name: '', area: 0, averageYield: 0
    });
    const [editingCommodityIndex, setEditingCommodityIndex] = useState<number | null>(null);
    const [missingFields, setMissingFields] = useState<string[]>([]);
    const [confirmDeliveryDate, setConfirmDeliveryDate] = useState<{field: string, dateStr: string} | null>(null);

    const validationErrors = useMemo(() => {
        const errors: string[] = [];
        if (!formData.name?.trim()) errors.push('name');
        if (!formData.indigenousPeopleOrganization) errors.push('indigenousPeopleOrganization');
        if (!formData.status) errors.push('status');
        if (!formData.estimatedCompletionDate) errors.push('estimatedCompletionDate');
        if (!formData.details || formData.details.length === 0) errors.push('details');
        if (!formData.subprojectCommodities || formData.subprojectCommodities.length === 0) errors.push('commodities');
        return errors;
    }, [formData]);

    useEffect(() => {
        if (subproject) {
            setFormData(subproject);
            const linkedIpo = ipos.find(i => i.name === subproject.indigenousPeopleOrganization);
            if (linkedIpo) setSelectedRegion(linkedIpo.region);
        } else {
            const defaultOu = currentUser?.operatingUnit || '';
            const defaultRegion = ouToRegionMap[defaultOu] || '';
            setFormData({
                ...defaultFormData,
                operatingUnit: defaultOu,
                encodedBy: currentUser?.fullName || ''
            });
            setSelectedRegion(defaultRegion);
        }
    }, [subproject, ipos, currentUser]);

    const filteredIpos = useMemo(() => {
        if (!selectedRegion) return [];
        return ipos.filter(ipo => ipo.region === selectedRegion).sort((a, b) => a.name.localeCompare(b.name));
    }, [ipos, selectedRegion]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>): void => {
        const { name, value } = e.target;
        setMissingFields(prev => prev.filter(f => f !== name));
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
            } else if (name === 'operatingUnit') {
                const mappedRegion = ouToRegionMap[value] || '';
                setSelectedRegion(mappedRegion);
                newData.indigenousPeopleOrganization = '';
            } else if (name === 'fundingYear') {
                const year = parseInt(value) || new Date().getFullYear();
                newData.startDate = `${year}-01-01`;
                if (newData.estimatedCompletionDate) {
                    const month = getMonthFromDateStr(newData.estimatedCompletionDate);
                    newData.estimatedCompletionDate = `${year}-${String(parseInt(month) + 1).padStart(2, '0')}-01`;
                }
            }
            return newData;
        });
    };

    const getMonthFromDateStr = (dateStr: string): string => {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length > 1) return (parseInt(parts[1]) - 1).toString();
        return '';
    };

    const getYearFromDateStr = (dateStr: string): string => {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length > 0) return parts[0];
        return '';
    };

    const updateDetailDateFromMonth = (field: string, monthIndex: string): void => {
        if (monthIndex === '') {
            setCurrentDetail(prev => ({ ...prev, [field]: '' }));
            return;
        }
        const mIndex = parseInt(monthIndex);
        const year = formData.fundingYear || new Date().getFullYear();
        const dateStr = `${year}-${String(mIndex + 1).padStart(2, '0')}-01`;
        
        if (field === 'deliveryDate' && formData.estimatedCompletionDate) {
            const estCompDate = new Date(formData.estimatedCompletionDate);
            const selectedDate = new Date(dateStr);
            if (selectedDate.getFullYear() > estCompDate.getFullYear() || 
                (selectedDate.getFullYear() === estCompDate.getFullYear() && selectedDate.getMonth() > estCompDate.getMonth())) {
                setConfirmDeliveryDate({ field, dateStr });
                return;
            }
        }
        
        setCurrentDetail(prev => ({ ...prev, [field]: dateStr }));
    }

    const handleConfirmDeliveryDate = (): void => {
        if (confirmDeliveryDate) {
            setFormData(prev => ({ ...prev, estimatedCompletionDate: confirmDeliveryDate.dateStr }));
            setCurrentDetail(prev => ({ ...prev, [confirmDeliveryDate.field]: confirmDeliveryDate.dateStr }));
            setConfirmDeliveryDate(null);
        }
    };

    const handleCancelDeliveryDate = (): void => {
        setConfirmDeliveryDate(null);
    };

    const handleEstimatedCompletionMonthChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
        const monthIndex = e.target.value;
        if (monthIndex === '') {
            setFormData(prev => ({ ...prev, estimatedCompletionDate: '' }));
            return;
        }
        const mIndex = parseInt(monthIndex);
        const currentYear = getYearFromDateStr(formData.estimatedCompletionDate) || formData.fundingYear || new Date().getFullYear();
        const dateStr = `${currentYear}-${String(mIndex + 1).padStart(2, '0')}-01`;
        setFormData(prev => ({ ...prev, estimatedCompletionDate: dateStr }));
        
        if (!currentDetail.deliveryDate) {
            setCurrentDetail(prev => ({ ...prev, deliveryDate: dateStr }));
        }
    };

    const handleEstimatedCompletionYearChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
        const year = e.target.value;
        if (!formData.estimatedCompletionDate) {
            const dateStr = `${year}-01-01`;
            setFormData(prev => ({ ...prev, estimatedCompletionDate: dateStr }));
            return;
        }
        const month = getMonthFromDateStr(formData.estimatedCompletionDate);
        const dateStr = `${year}-${String(parseInt(month) + 1).padStart(2, '0')}-01`;
        setFormData(prev => ({ ...prev, estimatedCompletionDate: dateStr }));
    };

    const availableUacsCodes = useMemo(() => {
        let codes: { code: string, desc: string }[] = [];
        if (currentDetail.expenseParticular) {
            const ot = currentDetail.objectType;
            const ep = currentDetail.expenseParticular;
            if (uacsCodes[ot] && uacsCodes[ot][ep]) {
                Object.entries(uacsCodes[ot][ep]).forEach(([code, desc]) => {
                    codes.push({ code, desc: desc as string });
                });
            }
        } else {
            Object.entries(uacsCodes).forEach(([ot, eps]) => {
                Object.entries(eps).forEach(([ep, codesObj]) => {
                    Object.entries(codesObj as Record<string, string>).forEach(([code, desc]) => {
                        codes.push({ code, desc });
                    });
                });
            });
        }
        return codes;
    }, [currentDetail.expenseParticular, currentDetail.objectType, uacsCodes]);

    const handleDetailChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>): void => {
        const { name, value } = e.target;
        if (name === 'type') setCurrentDetail(prev => ({ ...prev, type: value, particulars: '' }));
        else if (name === 'objectType') setCurrentDetail(prev => ({ ...prev, objectType: value as ObjectType, expenseParticular: '', uacsCode: '' }));
        else if (name === 'expenseParticular') setCurrentDetail(prev => ({ ...prev, expenseParticular: value, uacsCode: '' }));
        else if (name === 'uacsCode') {
            let foundOt = currentDetail.objectType;
            let foundEp = currentDetail.expenseParticular;
            
            let isMatch = false;
            if (foundEp && uacsCodes[foundOt] && uacsCodes[foundOt][foundEp] && uacsCodes[foundOt][foundEp][value]) {
                isMatch = true;
            }

            if (!isMatch) {
                for (const ot in uacsCodes) {
                    for (const ep in uacsCodes[ot]) {
                        if (uacsCodes[ot][ep][value]) {
                            foundOt = ot as ObjectType;
                            foundEp = ep;
                            break;
                        }
                    }
                }
            }
            
            setCurrentDetail(prev => ({ ...prev, uacsCode: value, objectType: foundOt, expenseParticular: foundEp }));
        }
        else setCurrentDetail(prev => ({ ...prev, [name]: value }));
    };

    const handleAddDetail = (): void => {
        if (!currentDetail.particulars || !currentDetail.uacsCode || !currentDetail.pricePerUnit || !currentDetail.numberOfUnits || !currentDetail.deliveryDate || !currentDetail.obligationMonth || !currentDetail.disbursementMonth) {
            alert("Please fill in all required detail fields, including delivery date and monthly targets."); return;
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

        let newEstimatedCompletionDate = formData.estimatedCompletionDate;
        const deliveryDates = updatedDetails.map(d => d.deliveryDate).filter(d => d).map(d => new Date(d).getTime());
        if (deliveryDates.length > 0) {
            const maxDate = new Date(Math.max(...deliveryDates)).toISOString().split('T')[0];
            if (!newEstimatedCompletionDate || new Date(maxDate) > new Date(newEstimatedCompletionDate)) {
                newEstimatedCompletionDate = maxDate;
            }
        }

        setFormData(prev => ({ ...prev, details: updatedDetails, estimatedCompletionDate: newEstimatedCompletionDate }));
        setCurrentDetail({ type: '', particulars: '', deliveryDate: '', unitOfMeasure: 'pcs', pricePerUnit: 0, numberOfUnits: 0, objectType: 'MOOE', expenseParticular: '', uacsCode: '', obligationMonth: '', disbursementMonth: '' });
    };

    const handleEditDetail = (id: number): void => {
        const d = formData.details.find(d => d.id === id);
        if (d) {
            setCurrentDetail(d);
            setEditingDetailId(id);
        }
    };

    const handleRemoveDetail = (id: number): void => {
        setFormData(prev => ({ ...prev, details: prev.details.filter(d => d.id !== id) }));
        if (editingDetailId === id) {
            setEditingDetailId(null);
            setCurrentDetail({ type: '', particulars: '', deliveryDate: '', unitOfMeasure: 'pcs', pricePerUnit: 0, numberOfUnits: 0, objectType: 'MOOE', expenseParticular: '', uacsCode: '', obligationMonth: '', disbursementMonth: '' });
        }
    };

    const handleCancelEditDetail = (): void => {
        setEditingDetailId(null);
        setCurrentDetail({ type: '', particulars: '', deliveryDate: '', unitOfMeasure: 'pcs', pricePerUnit: 0, numberOfUnits: 0, objectType: 'MOOE', expenseParticular: '', uacsCode: '', obligationMonth: '', disbursementMonth: '' });
    };

    const handleCommodityChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>): void => {
        const { name, value } = e.target;
        if (name === 'typeName') {
            setCurrentCommodity(prev => ({ ...prev, typeName: value, name: '', area: 0, averageYield: 0 }));
        } else if (name === 'name') {
            const selectedName = value;
            let yieldVal = 0;
            if (currentCommodity.typeName === 'Crop') {
                const ref = refCommodities.find(c => c.name === selectedName);
                if (ref) {
                    yieldVal = (ref.target_yield_ha || 0) * (currentCommodity.area || 0);
                }
            }
            setCurrentCommodity(prev => ({ ...prev, name: selectedName, averageYield: yieldVal }));
        } else if (name === 'area') {
            const areaVal = Number(value);
            let yieldVal = currentCommodity.averageYield || 0;
            if (currentCommodity.typeName === 'Crop') {
                const ref = refCommodities.find(c => c.name === currentCommodity.name);
                if (ref) {
                    yieldVal = (ref.target_yield_ha || 0) * areaVal;
                }
            }
            setCurrentCommodity(prev => ({ ...prev, area: areaVal, averageYield: yieldVal }));
        } else {
            setCurrentCommodity(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleAddCommodity = (): void => {
        const isAnimal = currentCommodity.typeName === 'Livestock';
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

    const handleEditCommodity = (idx: number): void => {
        if (formData.subprojectCommodities) {
            setCurrentCommodity(formData.subprojectCommodities[idx]);
            setEditingCommodityIndex(idx);
        }
    };

    const handleRemoveCommodity = (idx: number): void => {
        setFormData(prev => ({ ...prev, subprojectCommodities: prev.subprojectCommodities?.filter((_, i) => i !== idx) }));
        if (editingCommodityIndex === idx) {
             setEditingCommodityIndex(null);
             setCurrentCommodity({ typeName: '', name: '', area: 0, averageYield: 0 });
        }
    };

    const handleNextSection = (): void => {
        if (activeTab === 'details') {
            const required = ['name', 'indigenousPeopleOrganization', 'status'];
            const missing = required.filter(field => !formData[field as keyof Subproject]);
            if (missing.length > 0) {
                setMissingFields(missing);
                alert("Please fill in all required fields in the Subproject Details section.");
                return;
            }
            setActiveTab('commodity');
        } else if (activeTab === 'commodity') {
            setActiveTab('budget');
        } else if (activeTab === 'budget') {
            if (!subproject && !formData.estimatedCompletionDate) {
                alert("Estimated Completion Date is required before proceeding to summary.");
                setMissingFields(['estimatedCompletionDate']);
                setActiveTab('details');
                return;
            }
            if (!subproject) {
                setActiveTab('summary');
            }
        }
    };

    const handleBackSection = (): void => {
        if (activeTab === 'summary') {
            setActiveTab('budget');
        } else if (activeTab === 'budget') {
            setActiveTab('commodity');
        } else if (activeTab === 'commodity') {
            setActiveTab('details');
        }
    };

    const handleSubmit = async (e: FormEvent): Promise<void> => {
        e.preventDefault();
        
        // Final guard: only allow submission from the intended tabs
        const isNew = !subproject;
        if (isNew && activeTab !== 'summary') {
            // If they pressed Enter, we don't want to save.
            // We just return and do nothing, letting the user use the navigation buttons.
            return;
        }

        if (!isNew && activeTab !== 'budget' && activeTab !== 'summary') {
            return;
        }

        if (isNew && validationErrors.length > 0) {
            setMissingFields(validationErrors);
            alert("Please fill in all required fields before saving.");
            setActiveTab('details');
            return;
        }
        
        setMissingFields([]);

        const timestamp = new Date().toISOString();
        const historyEntry = { date: timestamp, event: subproject ? "Subproject Updated" : "Subproject Created", user: currentUser?.fullName || "System" };
        
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

        if (supabase) {
            const { id, ...dbPayload } = payload; 
            if (!subproject) {
                const { data, error } = await supabase.from('subprojects').insert([dbPayload]).select().single();
                if (error) { alert("Error saving: " + error.message); return; }
                if (data) {
                    onUpdateSubproject(data);
                    logAction('Created Subproject', data.name, data.indigenousPeopleOrganization, 'Subproject', String(data.id));
                    if (resolvedIpoId) addIpoHistory(resolvedIpoId, `Subproject Created: ${data.name}`);
                }
            } else {
                const { data, error } = await supabase.from('subprojects').update(dbPayload).eq('id', subproject.id).select().single();
                if (error) { alert("Error saving: " + error.message); return; }
                if (data) {
                    onUpdateSubproject(data);
                    logAction('Updated Subproject', data.name, data.indigenousPeopleOrganization, 'Subproject', String(data.id));
                }
            }
        } else {
             const offlinePayload = { ...payload, id: subproject ? subproject.id : Date.now() };
             onUpdateSubproject(offlinePayload);
        }

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

    const TabButton = ({ name, label }: { name: any, label: string }): React.ReactNode => (
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
                    <nav className="-mb-px flex space-x-4">
                        <TabButton name="details" label="Subproject Details" />
                        <TabButton name="commodity" label="Subproject Commodity" />
                        <TabButton name="budget" label="Budget Items" />
                        {!subproject && <TabButton name="summary" label="Summary" />}
                    </nav>
                </div>
                <div className="min-h-[400px]">
                    {activeTab === 'details' && (
                         <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium">Subproject Name <span className="text-red-500">*</span></label><input type="text" name="name" value={formData.name} onChange={handleInputChange} className={`${commonInputClasses} ${missingFields.includes('name') ? 'border-red-500 ring-1 ring-red-500' : ''}`} required /></div>
                                <div>
                                    <label className="block text-sm font-medium">Operating Unit</label>
                                    <select 
                                        name="operatingUnit" 
                                        value={formData.operatingUnit || ''} 
                                        onChange={handleInputChange} 
                                        className={commonInputClasses} 
                                        disabled={currentUser?.role !== 'Administrator'}
                                        title={currentUser?.role !== 'Administrator' ? "Only Administrators can edit the Operating Unit" : ""}
                                    >
                                        <option value="">Select Operating Unit</option>
                                        {operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}
                                    </select>
                                </div>
                                <div><label className="block text-sm font-medium">Region <span className="text-red-500">*</span></label><select value={selectedRegion} onChange={(e) => { setSelectedRegion(e.target.value); setFormData(prev => ({...prev, indigenousPeopleOrganization: ''})); }} className={`${commonInputClasses} ${missingFields.includes('indigenousPeopleOrganization') && !selectedRegion ? 'border-red-500 ring-1 ring-red-500' : ''}`}><option value="">Select Region</option>{philippineRegions.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                                <div><label className="block text-sm font-medium">Indigenous People Organization <span className="text-red-500">*</span></label><select name="indigenousPeopleOrganization" value={formData.indigenousPeopleOrganization} onChange={handleInputChange} className={`${commonInputClasses} ${missingFields.includes('indigenousPeopleOrganization') ? 'border-red-500 ring-1 ring-red-500' : ''}`} disabled={!selectedRegion} required><option value="">Select IPO</option>{filteredIpos.map(ipo => <option key={ipo.id} value={ipo.name}>{ipo.name}</option>)}</select></div>
                                <div><label className="block text-sm font-medium">Status <span className="text-red-500">*</span></label><select name="status" value={formData.status} onChange={handleInputChange} className={`${commonInputClasses} ${missingFields.includes('status') ? 'border-red-500 ring-1 ring-red-500' : ''}`} disabled={currentUser?.role === 'User' && !subproject}><option value="Proposed">Proposed</option><option value="Ongoing">Ongoing</option><option value="Cancelled">Cancelled</option>{formData.status === 'Completed' && <option value="Completed">Completed</option>}</select></div>
                                <div><label className="block text-sm font-medium">Package</label><select name="packageType" value={formData.packageType} onChange={handleInputChange} className={commonInputClasses}>{Array.from({ length: 7 }, (_, i) => `Package ${i + 1}`).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium">Estimated Completion {!subproject && <span className="text-red-500">*</span>}</label>
                                    <div className="flex gap-2">
                                        <select 
                                            name="estimatedCompletionMonth" 
                                            value={getMonthFromDateStr(formData.estimatedCompletionDate)} 
                                            onChange={handleEstimatedCompletionMonthChange}
                                            className={`${commonInputClasses} flex-1 ${missingFields.includes('estimatedCompletionDate') ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                                            required={!subproject}
                                        >
                                            <option value="">Select Month</option>
                                            {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                                        </select>
                                        <select
                                            name="estimatedCompletionYear"
                                            value={getYearFromDateStr(formData.estimatedCompletionDate) || formData.fundingYear || new Date().getFullYear()}
                                            onChange={handleEstimatedCompletionYearChange}
                                            className={`${commonInputClasses} w-32`}
                                        >
                                            {Array.from({ length: 10 }, (_, i) => {
                                                const y = (formData.fundingYear || new Date().getFullYear()) - 2 + i;
                                                return <option key={y} value={y}>{y}</option>;
                                            })}
                                        </select>
                                    </div>
                                    {getYearFromDateStr(formData.estimatedCompletionDate) && getYearFromDateStr(formData.estimatedCompletionDate) !== (formData.fundingYear || new Date().getFullYear()).toString() && (
                                        <p className="text-xs text-amber-600 mt-1">Note: Estimated completion year is different from the funding year.</p>
                                    )}
                                </div>
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
                                    <div key={i} className={`flex items-center justify-between p-4 rounded-lg text-sm ${i === editingCommodityIndex ? 'bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-700' : 'bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600'}`}>
                                        <div className="flex-grow">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-bold text-gray-900 dark:text-white text-base">{c.name}</span>
                                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-full text-[10px] font-bold uppercase tracking-wider">{c.typeName}</span>
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                                <div>
                                                    <span className="text-gray-500 dark:text-gray-400 block mb-0.5 uppercase tracking-tighter font-semibold">{c.typeName === 'Livestock' ? 'Number of Heads' : 'Total Area'}</span>
                                                    <span className="font-medium text-gray-900 dark:text-white">{c.area} {c.typeName === 'Livestock' ? 'Heads' : 'Hectares'}</span>
                                                </div>
                                                {c.typeName === 'Crop' && (
                                                    <div>
                                                        <span className="text-gray-500 dark:text-gray-400 block mb-0.5 uppercase tracking-tighter font-semibold">Estimated Yield</span>
                                                        <span className="font-medium text-gray-900 dark:text-white">{c.averageYield?.toLocaleString()} Kilograms</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 ml-4">
                                            <button type="button" onClick={() => handleEditCommodity(i)} className="p-2 text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors bg-white dark:bg-gray-800 rounded-full shadow-sm border border-gray-200 dark:border-gray-600">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
                                            </button>
                                            <button type="button" onClick={() => handleRemoveCommodity(i)} className="p-2 text-gray-400 hover:text-red-600 transition-colors bg-white dark:bg-gray-800 rounded-full shadow-sm border border-gray-200 dark:border-gray-600">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-8 bg-gray-50 dark:bg-gray-700/30 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700">
                                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">No commodities added yet. Use the form below to add one.</p>
                                </div>
                            )}
                            
                            <div className="bg-gray-50 dark:bg-gray-700/30 p-6 rounded-xl border border-gray-200 dark:border-gray-700 mt-6">
                                <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-4 uppercase tracking-wider flex items-center gap-2">
                                    <div className="w-1 h-4 bg-emerald-500 rounded-full"></div>
                                    {editingCommodityIndex !== null ? 'Edit Commodity' : 'Add New Commodity'}
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Commodity Type</label>
                                        <select 
                                            name="typeName" 
                                            value={currentCommodity.typeName} 
                                            onChange={handleCommodityChange} 
                                            className={commonInputClasses}
                                        >
                                            <option value="">Select Type</option>
                                            <option value="Crop">Crop</option>
                                            <option value="Livestock">Livestock</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Commodity Name</label>
                                        <select 
                                            name="name" 
                                            value={currentCommodity.name} 
                                            onChange={handleCommodityChange} 
                                            disabled={!currentCommodity.typeName} 
                                            className={commonInputClasses}
                                        >
                                            <option value="">Select Commodity</option>
                                            {currentCommodity.typeName === 'Crop' && refCommodities.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                            {currentCommodity.typeName === 'Livestock' && refLivestock.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                                            {currentCommodity.typeName === 'Livestock' ? 'Number of Heads' : 'Total Area (Hectares)'}
                                        </label>
                                        <input 
                                            type="number" 
                                            name="area" 
                                            value={currentCommodity.area} 
                                            onChange={handleCommodityChange} 
                                            className={commonInputClasses} 
                                            placeholder={currentCommodity.typeName === 'Livestock' ? "Enter number of heads" : "Enter hectares"}
                                        />
                                    </div>
                                </div>

                                {currentCommodity.name && (
                                    <div className="mt-6 p-4 bg-white dark:bg-gray-800 rounded-lg border border-emerald-100 dark:border-emerald-900/50 shadow-sm animate-fadeIn">
                                        <h5 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase mb-3 flex items-center gap-2">
                                            <Info className="h-3 w-3" />
                                            Reference Information
                                        </h5>
                                        {currentCommodity.typeName === 'Crop' ? (
                                            (() => {
                                                const ref = refCommodities.find(c => c.name === currentCommodity.name);
                                                if (!ref) return null;
                                                return (
                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-xs">
                                                        <div>
                                                            <span className="text-gray-500 block mb-1">Banner Program</span>
                                                            <span className="font-semibold text-gray-900 dark:text-white">{ref.banner_program}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-gray-500 block mb-1">Commodity Group</span>
                                                            <span className="font-semibold text-gray-900 dark:text-white">{ref.commodity_group}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-gray-500 block mb-1">Elevation Range</span>
                                                            <span className="font-semibold text-gray-900 dark:text-white">{ref.min_elevation_masl} - {ref.max_elevation_masl} MASL</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-gray-500 block mb-1">Target Yield</span>
                                                            <span className="font-semibold text-gray-900 dark:text-white">{ref.target_yield_ha?.toLocaleString()} Kilograms/Hectares</span>
                                                        </div>
                                                        <div className="md:col-span-4 pt-2 border-t border-gray-100 dark:border-gray-700 mt-2">
                                                            <div className="flex flex-wrap gap-4">
                                                                <div className="flex items-center gap-1">
                                                                    <span className="text-gray-500">Recommended Soil:</span>
                                                                    <span className="font-medium">{ref.recommended_soil}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1">
                                                                    <span className="text-gray-500">Climate Type:</span>
                                                                    <span className="font-medium">{ref.climate_type_suitability}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })()
                                        ) : (
                                            (() => {
                                                const ref = refLivestock.find(c => c.name === currentCommodity.name);
                                                if (!ref) return null;
                                                return (
                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-xs">
                                                        <div>
                                                            <span className="text-gray-500 block mb-1">Category</span>
                                                            <span className="font-semibold text-gray-900 dark:text-white">{ref.category}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-gray-500 block mb-1">Housing Type</span>
                                                            <span className="font-semibold text-gray-900 dark:text-white">{ref.housing_type}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-gray-500 block mb-1">Feed Type</span>
                                                            <span className="font-semibold text-gray-900 dark:text-white">{ref.feed_type}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-gray-500 block mb-1">Water Requirement</span>
                                                            <span className="font-semibold text-gray-900 dark:text-white">{ref.water_requirement_liters_day} Liters/Day</span>
                                                        </div>
                                                    </div>
                                                );
                                            })()
                                        )}
                                    </div>
                                )}

                                <div className="mt-6 flex flex-col md:flex-row gap-6 items-end">
                                    {currentCommodity.typeName === 'Crop' && (
                                        <div className="w-full md:w-1/3">
                                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Auto-Computed Yield (Kilograms)</label>
                                            <div className="relative">
                                                <input 
                                                    type="number" 
                                                    name="averageYield" 
                                                    value={currentCommodity.averageYield} 
                                                    readOnly
                                                    className={commonInputClasses + " bg-gray-100 dark:bg-gray-800 font-bold text-emerald-600 dark:text-emerald-400"} 
                                                />
                                                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                                    <span className="text-gray-400 text-xs">KG</span>
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-gray-400 mt-1 italic">Calculated based on area and reference target yield.</p>
                                        </div>
                                    )}
                                    <div className="flex-grow flex justify-end gap-3 w-full">
                                        {editingCommodityIndex !== null && (
                                            <button 
                                                type="button" 
                                                onClick={() => {
                                                    setEditingCommodityIndex(null);
                                                    setCurrentCommodity({ typeName: '', name: '', area: 0, averageYield: 0 });
                                                }} 
                                                className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-bold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        )}
                                        <button 
                                            type="button" 
                                            onClick={handleAddCommodity} 
                                            className="px-8 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition-all shadow-md shadow-emerald-500/20 flex items-center gap-2"
                                        >
                                            {editingCommodityIndex !== null ? 'Update Commodity' : 'Add to List'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {activeTab === 'budget' && (
                        <div className="space-y-4">
                             {formData.details.map((d, index) => (
                                <div key={d.id} className={`flex items-center justify-between p-2 rounded-md text-sm ${editingDetailId === d.id ? 'bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-700' : 'bg-gray-50 dark:bg-gray-700/50'}`}>
                                    <div>
                                        <span className="font-semibold">{d.particulars}</span>
                                        <div className="text-xs text-gray-500">
                                            <div>{d.uacsCode} {availableUacsCodes.find(c => c.code === d.uacsCode)?.desc ? `- ${availableUacsCodes.find(c => c.code === d.uacsCode)?.desc}` : ''}</div>
                                            <div>{d.numberOfUnits} {d.unitOfMeasure} @ {formatCurrency(Number(d.pricePerUnit))}</div>
                                            <span className="block mt-1">Obligation: {formatMonthYear(d.obligationMonth)} | Disbursement: {formatMonthYear(d.disbursementMonth)}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="font-bold">{formatCurrency(Number(d.numberOfUnits) * Number(d.pricePerUnit))}</span>
                                        <div className="flex items-center gap-2">
                                            <button type="button" onClick={() => handleEditDetail(d.id)} className="text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
                                            </button>
                                            <button type="button" onClick={() => handleRemoveDetail(d.id)} className="text-red-500 hover:text-red-700">&times;</button>
                                        </div>
                                    </div>
                                </div>
                             ))}
                             <div className="text-right font-bold text-gray-900 dark:text-white">Total: {formatCurrency(calculateTotalBudget(formData.details))}</div>
                             
                             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-end border-t pt-4 mt-4 border-gray-200 dark:border-gray-700">
                                <div className="lg:col-span-2"><label className="block text-xs font-medium">Item Type</label><select name="type" value={currentDetail.type} onChange={handleDetailChange} className={commonInputClasses + " py-1.5"}><option value="">Select Type</option>{Object.keys(particularTypes).map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                <div className="lg:col-span-2"><label className="block text-xs font-medium">Particulars</label><select name="particulars" value={currentDetail.particulars} onChange={handleDetailChange} disabled={!currentDetail.type} className={commonInputClasses + " py-1.5"}><option value="">Select Item</option>{currentDetail.type && particularTypes[currentDetail.type]?.map(i => <option key={i} value={i}>{i}</option>)}</select></div>
                                
                                <div className="lg:col-span-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div><label className="block text-xs font-medium">Object Type</label><select name="objectType" value={currentDetail.objectType} onChange={handleDetailChange} className={commonInputClasses + " py-1.5"}>{objectTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                    <div><label className="block text-xs font-medium">Expense Particular</label><select name="expenseParticular" value={currentDetail.expenseParticular} onChange={handleDetailChange} className={commonInputClasses + " py-1.5"}><option value="">Select Particular</option>{Object.keys(uacsCodes[currentDetail.objectType] || {}).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                                    <div>
                                        <label className="block text-xs font-medium">UACS Code</label>
                                        <input 
                                            type="text"
                                            name="uacsCode" 
                                            value={currentDetail.uacsCode} 
                                            onChange={handleDetailChange} 
                                            list="uacs-codes-list-edit"
                                            placeholder="Search UACS..."
                                            className={commonInputClasses + " py-1.5"}
                                        />
                                        <datalist id="uacs-codes-list-edit">
                                            {availableUacsCodes.map((item) => (
                                                <option key={item.code} value={item.code}>{item.code} - {item.desc}</option>
                                            ))}
                                        </datalist>
                                    </div>
                                </div>
 
                                <div>
                                    <label className="block text-xs font-medium">Delivery Month</label>
                                    <select 
                                        value={getMonthFromDateStr(currentDetail.deliveryDate)} 
                                        onChange={(e) => updateDetailDateFromMonth('deliveryDate', e.target.value)} 
                                        className={commonInputClasses + " py-1.5 text-sm"}
                                    >
                                        <option value="">Select Month</option>
                                        {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                                    </select>
                                </div>
                                
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
                                
                                <div><label className="block text-xs font-medium">Price per Unit</label><input type="number" name="pricePerUnit" value={currentDetail.pricePerUnit} onChange={handleDetailChange} className={commonInputClasses + " py-1.5 text-sm"} /></div>
                                <div><label className="block text-xs font-medium">Number of Units</label><input type="number" name="numberOfUnits" value={currentDetail.numberOfUnits} onChange={handleDetailChange} className={commonInputClasses + " py-1.5 text-sm"} /></div>
                                <div><label className="block text-xs font-medium">Unit of Measure</label><select name="unitOfMeasure" value={currentDetail.unitOfMeasure} onChange={handleDetailChange} className={commonInputClasses + " py-1.5 text-sm"}><option value="pcs">pcs</option><option value="kg">kg</option><option value="liters">liters</option><option value="boxes">boxes</option><option value="sets">sets</option><option value="pax">pax</option><option value="heads">heads</option><option value="months">months</option><option value="days">days</option><option value="ha">ha</option><option value="bags">bags</option><option value="bottles">bottles</option><option value="sachets">sachets</option><option value="rolls">rolls</option><option value="meters">meters</option><option value="units">units</option><option value="lots">lots</option></select></div>
                                
                                <div className="lg:col-span-4 flex gap-2 mt-2">
                                    {editingDetailId !== null && (
                                        <button type="button" onClick={handleCancelEditDetail} className="flex-1 py-2 bg-gray-400 text-white rounded text-sm hover:bg-gray-500">Cancel</button>
                                    )}
                                    <button type="button" onClick={handleAddDetail} className="flex-1 py-2 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700">
                                        {editingDetailId !== null ? 'Update Item' : 'Add Item'}
                                    </button>
                                </div>
                             </div>
                        </div>
                    )}
                    {activeTab === 'summary' && (
                        <div className="space-y-6 animate-fadeIn">
                            {validationErrors.length > 0 && (
                                <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-800 mb-4">
                                    <h5 className="text-red-800 dark:text-red-200 font-bold mb-1">Missing Required Information</h5>
                                    <p className="text-sm text-red-600 dark:text-red-400">The following fields are required before you can save:</p>
                                    <ul className="list-disc list-inside text-xs text-red-500 mt-2">
                                        {validationErrors.map(field => (
                                            <li key={field}>
                                                {field === 'indigenousPeopleOrganization' ? 'IPO' : 
                                                 field === 'details' ? 'Budget Items (at least one required)' :
                                                 field === 'commodities' ? 'Commodities (at least one required)' :
                                                 field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            
                            <div className="bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-lg border border-emerald-100 dark:border-emerald-800">
                                <h4 className="text-lg font-bold text-emerald-800 dark:text-emerald-200 mb-2">Subproject Summary</h4>
                                <p className="text-sm text-emerald-600 dark:text-emerald-400">Please review the details below before confirming the creation of this subproject.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <h5 className="font-bold text-gray-700 dark:text-gray-300 border-b pb-1">General Information</h5>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <span className="text-gray-500">Name:</span> 
                                        <span className={`font-medium ${!formData.name ? 'text-red-500 italic' : ''}`}>
                                            {formData.name || 'Missing Name'}
                                        </span>
                                        
                                        <span className="text-gray-500">IPO:</span> 
                                        <span className={`font-medium ${!formData.indigenousPeopleOrganization ? 'text-red-500 italic' : ''}`}>
                                            {formData.indigenousPeopleOrganization || 'Missing IPO'}
                                        </span>
                                        
                                        <span className="text-gray-500">Location:</span> <span className="font-medium">{formData.location}</span>
                                        <span className="text-gray-500">OU:</span> <span className="font-medium">{formData.operatingUnit}</span>
                                        
                                        <span className="text-gray-500">Status:</span> 
                                        <span className={`font-medium ${!formData.status ? 'text-red-500 italic' : ''}`}>
                                            {formData.status || 'Missing Status'}
                                        </span>
                                        
                                        <span className="text-gray-500">Package:</span> <span className="font-medium">{formData.packageType}</span>
                                        
                                        <span className="text-gray-500">Est. Completion:</span> 
                                        <span className={`font-medium ${!formData.estimatedCompletionDate ? 'text-red-500 italic' : ''}`}>
                                            {formData.estimatedCompletionDate ? formatMonthYear(formData.estimatedCompletionDate) : 'Missing Date'}
                                        </span>
                                        
                                        <span className="text-gray-500">Fund Year:</span> <span className="font-medium">{formData.fundingYear}</span>
                                        <span className="text-gray-500">Fund Type:</span> <span className="font-medium">{formData.fundType}</span>
                                        <span className="text-gray-500">Tier:</span> <span className="font-medium">{formData.tier}</span>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h5 className="font-bold text-gray-700 dark:text-gray-300 border-b pb-1">Commodities</h5>
                                    {formData.subprojectCommodities && formData.subprojectCommodities.length > 0 ? (
                                        <div className="space-y-2">
                                            {formData.subprojectCommodities.map((c, i) => (
                                                <div key={i} className="text-sm bg-gray-50 dark:bg-gray-700/50 p-2 rounded">
                                                    <div className="font-medium">{c.name} ({c.typeName})</div>
                                                    <div className="text-xs text-gray-500">{c.typeName === 'Livestock' ? 'Heads' : 'Area'}: {c.area}</div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-red-500 italic font-medium">Missing Commodities - Please add at least one commodity.</p>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h5 className="font-bold text-gray-700 dark:text-gray-300 border-b pb-1">Budget Items</h5>
                                <div className="overflow-x-auto">
                                    {formData.details.length > 0 ? (
                                        <table className="min-w-full text-sm">
                                            <thead>
                                                <tr className="text-left text-gray-500 border-b">
                                                    <th className="pb-2">Particulars</th>
                                                    <th className="pb-2">Qty/Unit</th>
                                                    <th className="pb-2 text-right">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                                {formData.details.map(d => (
                                                    <tr key={d.id}>
                                                        <td className="py-2">{d.particulars}</td>
                                                        <td className="py-2">{d.numberOfUnits} {d.unitOfMeasure}</td>
                                                        <td className="py-2 text-right font-medium">{formatCurrency(d.pricePerUnit * d.numberOfUnits)}</td>
                                                    </tr>
                                                ))}
                                                <tr className="font-bold">
                                                    <td colSpan={2} className="py-4 text-right">Grand Total:</td>
                                                    <td className="py-4 text-right text-emerald-600">{formatCurrency(calculateTotalBudget(formData.details))}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    ) : (
                                        <p className="text-sm text-red-500 italic font-medium">Missing Budget Items - Please add at least one budget item.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <div className="flex justify-end gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    {activeTab !== 'details' && (
                        <button type="button" onClick={handleBackSection} className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600">Back Section</button>
                    )}
                    
                    {/* Navigation Buttons */}
                    {activeTab !== 'summary' && !(subproject && activeTab === 'budget') && (
                        <button 
                            type="button" 
                            onClick={handleNextSection} 
                            className="px-4 py-2 rounded-md text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700"
                        >
                            Next Section
                        </button>
                    )}

                    {/* Confirmation/Update Buttons */}
                    {(activeTab === 'summary' || (subproject && activeTab === 'budget')) && (
                        <button 
                            type="submit" 
                            disabled={!subproject && validationErrors.length > 0}
                            className={`px-4 py-2 rounded-md text-sm font-medium text-white ${(!subproject && validationErrors.length > 0) ? 'bg-gray-400 cursor-not-allowed opacity-50' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                        >
                            {subproject ? 'Update Subproject' : 'Confirm & Save Subproject'}
                        </button>
                    )}
                </div>
            </form>

            {/* Delivery Date Confirmation Modal */}
            {confirmDeliveryDate && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Confirm Delivery Date</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                            The delivery date you selected is beyond the subproject's estimated completion date. 
                            Do you want to update the subproject's estimated completion date to match this delivery date?
                        </p>
                        <div className="flex justify-end gap-4">
                            <button onClick={handleCancelDeliveryDate} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
                            <button onClick={handleConfirmDeliveryDate} className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700">Confirm & Update</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SubprojectEdit;

// --- End of SubprojectEdit.tsx ---
