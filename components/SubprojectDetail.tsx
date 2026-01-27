// Author: 4K 
import React, { useState, FormEvent, useEffect, useMemo } from 'react';
import { Subproject, SubprojectDetail, IPO, objectTypes, ObjectType, fundTypes, tiers, SubprojectCommodity, referenceCommodityTypes } from '../constants';
import LocationPicker, { parseLocation } from './LocationPicker';
import { useAuth } from '../contexts/AuthContext';
import { getUserPermissions } from './mainfunctions/TableHooks';

interface SubprojectDetailProps {
    subproject: Subproject;
    ipos: IPO[];
    onBack: () => void;
    previousPageName: string;
    onUpdateSubproject: (updatedSubproject: Subproject) => void;
    particularTypes: { [key: string]: string[] };
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    commodityCategories: { [key: string]: string[] };
}

type SubprojectDetailInput = Omit<SubprojectDetail, 'id'>;

const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    if (dateString.includes('T')) {
        return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    const date = new Date(dateString + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
}

const getStatusBadge = (status: Subproject['status']) => {
    const baseClasses = "px-3 py-1 text-sm font-semibold rounded-full";
    switch (status) {
        case 'Completed': return `${baseClasses} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`;
        case 'Ongoing': return `${baseClasses} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`;
        case 'Proposed': return `${baseClasses} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`;
        case 'Cancelled': return `${baseClasses} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`;
        default: return `${baseClasses} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200`;
    }
}

const DetailItem: React.FC<{ label: string; value?: string | number | React.ReactNode }> = ({ label, value }) => (
    <div>
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{value || 'N/A'}</dd>
    </div>
);

const SubprojectDetail: React.FC<SubprojectDetailProps> = ({ subproject, ipos, onBack, previousPageName, onUpdateSubproject, particularTypes, uacsCodes, commodityCategories }) => {
    const { currentUser } = useAuth();
    const { canEdit } = getUserPermissions(currentUser);
    // Added 'accomplishment' mode
    const [editMode, setEditMode] = useState<'none' | 'full' | 'budget' | 'accomplishment'>('none');
    const [editedSubproject, setEditedSubproject] = useState(subproject);
    const [activeTab, setActiveTab] = useState<'details' | 'commodity' | 'budget'>('details');
    const [detailItems, setDetailItems] = useState<SubprojectDetailInput[]>([]);
     const [currentDetail, setCurrentDetail] = useState({
        type: '',
        particulars: '',
        deliveryDate: '',
        unitOfMeasure: 'pcs' as SubprojectDetail['unitOfMeasure'],
        pricePerUnit: '',
        numberOfUnits: '',
        objectType: 'MOOE' as ObjectType,
        expenseParticular: '',
        uacsCode: '',
        obligationMonth: '',
        disbursementMonth: '',
    });
    
    // Commodity Form State
    const [currentCommodity, setCurrentCommodity] = useState<SubprojectCommodity>({
        typeName: '',
        name: '',
        area: 0,
        averageYield: 0
    });
    
    // Edit state for budget items
    const [editingDetailIndex, setEditingDetailIndex] = useState<number | null>(null);

    const [dateError, setDateError] = useState('');


    useEffect(() => {
        setEditedSubproject(subproject);
        setDetailItems(subproject.details.map(({ id, ...rest }) => rest));
        if (editMode === 'full') setActiveTab('details');
        if (editMode === 'budget') setActiveTab('budget');
        // Accomplishment mode doesn't need tab switching logic here as it has its own fixed view
        
        // Reset local editing states when subproject or editMode changes
        setEditingDetailIndex(null);
        setCurrentDetail({ type: '', particulars: '', deliveryDate: '', unitOfMeasure: 'pcs', pricePerUnit: '', numberOfUnits: '', objectType: 'MOOE', expenseParticular: '', uacsCode: '', obligationMonth: '', disbursementMonth: '' });
    }, [subproject, editMode]);

    // Check completion status whenever details change (similar to Subprojects.tsx)
    useEffect(() => {
        if (editMode !== 'none' && detailItems.length > 0) {
            // detailItems has Omit<SubprojectDetail, 'id'>, but may carry accomplishments
            const allItemsDelivered = detailItems.every((d: any) => d.actualDeliveryDate && d.actualDeliveryDate.trim() !== '');
            
            if (allItemsDelivered) {
                const latestDate = detailItems.reduce((latest: Date, current: any) => {
                    const d = new Date(current.actualDeliveryDate!);
                    return d > latest ? d : latest;
                }, new Date(0));

                if (editedSubproject.status !== 'Completed') {
                    setEditedSubproject(prev => ({
                        ...prev,
                        status: 'Completed',
                        actualCompletionDate: latestDate.toISOString().split('T')[0]
                    }));
                }
            } else {
                if (editedSubproject.status === 'Completed') {
                    setEditedSubproject(prev => ({
                        ...prev,
                        status: 'Ongoing',
                        actualCompletionDate: undefined
                    }));
                }
            }
        }
    }, [detailItems, editMode]);

    const totalBudget = useMemo(() => {
       return detailItems.reduce((acc, item) => acc + (Number(item.pricePerUnit) * Number(item.numberOfUnits)), 0);
    }, [detailItems]);

    const calculateTotalBudget = (details: SubprojectDetail[]) => {
        return details.reduce((total, item) => total + (item.pricePerUnit * item.numberOfUnits), 0);
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        if (name === 'status') {
            const newStatus = value as Subproject['status'];
            if (newStatus === 'Completed' && !editedSubproject.actualCompletionDate) {
                 const currentDate = new Date().toISOString().split('T')[0];
                 setEditedSubproject(prev => ({ ...prev, status: newStatus, actualCompletionDate: currentDate }));
            } else if (newStatus !== 'Completed') {
                setEditedSubproject(prev => ({ ...prev, status: newStatus, actualCompletionDate: '' }));
            } else {
                 setEditedSubproject(prev => ({ ...prev, status: newStatus }));
            }
        } else if (name === 'indigenousPeopleOrganization') {
             const selectedIpo = ipos.find(ipo => ipo.name === value);
             setEditedSubproject(prev => ({ 
                 ...prev, 
                 [name]: value,
                 location: selectedIpo ? selectedIpo.location : '' 
             }));
        } else {
            setEditedSubproject(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleDetailChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'type') {
            setCurrentDetail(prev => ({ ...prev, type: value, particulars: '' }));
        } else if (name === 'objectType') {
            setCurrentDetail(prev => ({ ...prev, objectType: value as ObjectType, expenseParticular: '', uacsCode: '' }));
        } else if (name === 'expenseParticular') {
            setCurrentDetail(prev => ({ ...prev, expenseParticular: value, uacsCode: '' }));
        } else {
            setCurrentDetail(prev => ({ ...prev, [name]: value }));
        }
    };
    
    const handleAddDetail = () => {
        setDateError('');
        if (!editedSubproject.startDate || !editedSubproject.estimatedCompletionDate) {
            alert('Please set the project Start Date and Estimated Completion Date first.');
            return;
        }
        if (!currentDetail.type || !currentDetail.particulars || !currentDetail.deliveryDate || !currentDetail.pricePerUnit || !currentDetail.numberOfUnits || !currentDetail.obligationMonth || !currentDetail.disbursementMonth || !currentDetail.uacsCode) {
            alert('Please fill out all detail fields, including UACS classification.');
            return;
        }
        const delivery = new Date(currentDetail.deliveryDate + 'T00:00:00Z');
        const start = new Date(editedSubproject.startDate + 'T00:00:00Z');
        const end = new Date(editedSubproject.estimatedCompletionDate + 'T00:00:00Z');

        if (delivery < start || delivery > end) {
            setDateError(`Delivery date must be between the project timeline (${formatDate(editedSubproject.startDate)} to ${formatDate(editedSubproject.estimatedCompletionDate)}).`);
            return;
        }

        const newItem = {
            ...currentDetail,
            pricePerUnit: parseFloat(currentDetail.pricePerUnit),
            numberOfUnits: parseInt(currentDetail.numberOfUnits, 10),
        };

        if (editingDetailIndex !== null) {
            // Update existing detail
            setDetailItems(prev => prev.map((item, index) => index === editingDetailIndex ? newItem : item));
            setEditingDetailIndex(null);
        } else {
            // Add new detail
            setDetailItems(prev => [...prev, newItem]);
        }

        setCurrentDetail({ type: '', particulars: '', deliveryDate: '', unitOfMeasure: 'pcs', pricePerUnit: '', numberOfUnits: '', objectType: 'MOOE', expenseParticular: '', uacsCode: '', obligationMonth: '', disbursementMonth: '' });
    };

    const handleRemoveDetail = (indexToRemove: number) => {
        setDetailItems(prev => prev.filter((_, index) => index !== indexToRemove));
        if (editingDetailIndex === indexToRemove) {
            handleCancelDetailEdit();
        } else if (editingDetailIndex !== null && editingDetailIndex > indexToRemove) {
            setEditingDetailIndex(editingDetailIndex - 1);
        }
    };
    
    const handleEditParticular = (indexToEdit: number) => {
        const itemToEdit = detailItems[indexToEdit];
        setCurrentDetail({
            ...itemToEdit,
            pricePerUnit: String(itemToEdit.pricePerUnit),
            numberOfUnits: String(itemToEdit.numberOfUnits),
        });
        setEditingDetailIndex(indexToEdit);
    };

    const handleCancelDetailEdit = () => {
        setEditingDetailIndex(null);
        setCurrentDetail({ type: '', particulars: '', deliveryDate: '', unitOfMeasure: 'pcs', pricePerUnit: '', numberOfUnits: '', objectType: 'MOOE', expenseParticular: '', uacsCode: '', obligationMonth: '', disbursementMonth: '' });
    };

    const handleDetailAccomplishmentChange = (index: number, field: keyof SubprojectDetailInput, value: any) => {
        setDetailItems(prev => prev.map((d, i) => i === index ? { ...d, [field]: value } : d));
    };

    // Commodity Handlers
    const handleCommodityChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'typeName') {
            setCurrentCommodity(prev => ({ ...prev, typeName: value, name: '' })); // Reset name if type changes
        } else {
            setCurrentCommodity(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleAddCommodity = () => {
        const isAnimal = currentCommodity.typeName === 'Animal Commodity';
        if (!currentCommodity.typeName || !currentCommodity.name || !currentCommodity.area || (!isAnimal && !currentCommodity.averageYield)) {
            alert(`Please fill in all commodity fields (Type, Name, ${isAnimal ? 'Number of Heads' : 'Area, Yield'}).`);
            return;
        }
        const newCommodity: SubprojectCommodity = {
            ...currentCommodity,
            area: Number(currentCommodity.area),
            averageYield: isAnimal ? undefined : Number(currentCommodity.averageYield)
        };
        setEditedSubproject(prev => ({
            ...prev,
            subprojectCommodities: [...(prev.subprojectCommodities || []), newCommodity]
        }));
        setCurrentCommodity({ typeName: '', name: '', area: 0, averageYield: 0 });
    };

    const handleEditCommodity = (index: number) => {
        const commodityToEdit = editedSubproject.subprojectCommodities?.[index];
        if (commodityToEdit) {
            setCurrentCommodity({
                typeName: commodityToEdit.typeName || '', // Handle potentially missing typeName in legacy data
                name: commodityToEdit.name,
                area: commodityToEdit.area,
                averageYield: commodityToEdit.averageYield || 0
            });
            // Remove from list so it can be re-added
            setEditedSubproject(prev => ({
                ...prev,
                subprojectCommodities: (prev.subprojectCommodities || []).filter((_, i) => i !== index)
            }));
        }
    };

    const handleRemoveCommodity = (index: number) => {
        setEditedSubproject(prev => ({
            ...prev,
            subprojectCommodities: (prev.subprojectCommodities || []).filter((_, i) => i !== index)
        }));
    };

    const handleCommodityAccomplishmentChange = (index: number, field: keyof SubprojectCommodity, value: any) => {
        // Validation for percentages
        if (field === 'marketingPercentage' || field === 'foodSecurityPercentage') {
            const numValue = parseFloat(value);
            if (value !== '' && (isNaN(numValue) || numValue < 0)) return; 

            const newValue = value === '' ? 0 : numValue;
            const currentItem = editedSubproject.subprojectCommodities?.[index];
            if (currentItem) {
                const otherKey = field === 'marketingPercentage' ? 'foodSecurityPercentage' : 'marketingPercentage';
                const otherValue = parseFloat(String(currentItem[otherKey]) || '0');
                if (newValue + otherValue > 100) return;
            }
        }

        setEditedSubproject(prev => ({
            ...prev,
            subprojectCommodities: prev.subprojectCommodities?.map((c, i) => i === index ? { ...c, [field]: value } : c)
        }));
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        
        let eventType = "Updated via Detail View";
        if (editMode === 'budget') eventType = "Updated Budget via Detail View";
        if (editMode === 'accomplishment') eventType = "Updated Accomplishment";

        const historyEntry = {
            date: new Date().toISOString(),
            event: eventType,
            user: currentUser?.fullName || "System"
        };

        const updatedSubprojectWithDetails = {
            ...editedSubproject,
            details: detailItems.map((d, i) => ({ ...d, id: i + 1 })),
            history: [...(subproject.history || []), historyEntry]
        };
        onUpdateSubproject(updatedSubprojectWithDetails);
        setEditMode('none');
    };

    const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm";

    const TabButton: React.FC<{ tabName: typeof activeTab; label: string }> = ({ tabName, label }) => {
        const isActive = activeTab === tabName;
        return (
            <button
                type="button"
                onClick={() => setActiveTab(tabName)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-200
                    ${isActive
                        ? 'border-accent text-accent dark:text-green-400 dark:border-green-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
            >
                {label}
            </button>
        );
    };

    if (editMode !== 'none') {
        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">
                        {editMode === 'budget' ? 'Editing Budget: ' : editMode === 'accomplishment' ? 'Editing Accomplishment: ' : 'Editing: '}{subproject.name}
                    </h1>
                    <button onClick={() => setEditMode('none')} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel Editing</button>
                </div>
                
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
                    <form onSubmit={handleSubmit}>
                        {editMode === 'full' && (
                            <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                                <nav className="-mb-px flex space-x-4 overflow-x-auto" aria-label="Tabs">
                                    <TabButton tabName="details" label="Subproject Details" />
                                    <TabButton tabName="commodity" label="Subproject Commodity" />
                                    <TabButton tabName="budget" label="Budget Items" />
                                    {/* Accomplishment Tab Removed from standard Edit Mode */}
                                </nav>
                            </div>
                        )}
                        
                        <div className="min-h-[400px]">
                            {activeTab === 'details' && editMode === 'full' && (
                                <div className="space-y-6">
                                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                        <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Project Details</legend>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium">Subproject Name</label>
                                                <input type="text" name="name" value={editedSubproject.name} onChange={handleInputChange} required className={commonInputClasses} />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium">IPO</label>
                                                <select name="indigenousPeopleOrganization" value={editedSubproject.indigenousPeopleOrganization} onChange={handleInputChange} required className={commonInputClasses}>
                                                    <option value="">Select IPO</option>
                                                    {ipos.map(ipo => <option key={ipo.id} value={ipo.name}>{ipo.name}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium">Status</label>
                                                <select name="status" value={editedSubproject.status} onChange={handleInputChange} className={commonInputClasses}>
                                                    <option value="Proposed">Proposed</option>
                                                    <option value="Ongoing">Ongoing</option>
                                                    <option value="Completed">Completed</option>
                                                    <option value="Cancelled">Cancelled</option>
                                                    {editedSubproject.status === 'Completed' && <option value="Completed">Completed</option>}
                                                </select>
                                                {editedSubproject.status === 'Completed' && <p className="text-xs text-green-600 mt-1">Status set to Completed automatically based on actual delivery dates.</p>}
                                            </div>
                                            <div>
                                                 <label className="block text-sm font-medium">Package</label>
                                                 <select name="packageType" value={editedSubproject.packageType} onChange={handleInputChange} className={commonInputClasses}>
                                                    {Array.from({ length: 7 }, (_, i) => `Package ${i + 1}`).map(p => <option key={p} value={p}>{p}</option>)}
                                                 </select>
                                            </div>
                                        </div>
                                    </fieldset>
                                     <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                        <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Location & Timeline</legend>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium">Location</label>
                                                <input 
                                                    type="text" 
                                                    value={editedSubproject.location} 
                                                    readOnly 
                                                    className={`${commonInputClasses} bg-gray-100 dark:bg-gray-600 cursor-not-allowed`} 
                                                />
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div><label className="block text-sm font-medium">Start Date</label><input type="date" name="startDate" value={editedSubproject.startDate} onChange={handleInputChange} required className={commonInputClasses} /></div>
                                                <div><label className="block text-sm font-medium">Est. Completion</label><input type="date" name="estimatedCompletionDate" value={editedSubproject.estimatedCompletionDate} onChange={handleInputChange} required className={commonInputClasses} /></div>
                                                <div><label className="block text-sm font-medium">Actual Completion</label><input type="date" name="actualCompletionDate" value={editedSubproject.actualCompletionDate || ''} readOnly className={`${commonInputClasses} bg-gray-100 dark:bg-gray-600 cursor-not-allowed`} /></div>
                                            </div>
                                        </div>
                                    </fieldset>
                                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                        <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Funding</legend>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div><label className="block text-sm font-medium">Year</label><input type="number" name="fundingYear" value={editedSubproject.fundingYear} onChange={handleInputChange} className={commonInputClasses} /></div>
                                            <div>
                                                <label className="block text-sm font-medium">Type</label>
                                                <select name="fundType" value={editedSubproject.fundType} onChange={handleInputChange} className={commonInputClasses}>
                                                    {fundTypes.map(f => <option key={f} value={f}>{f}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium">Tier</label>
                                                <select name="tier" value={editedSubproject.tier} onChange={handleInputChange} className={commonInputClasses}>
                                                    {tiers.map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    </fieldset>
                                    {/* Remarks */}
                                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                        <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Remarks</legend>
                                        <div>
                                            <textarea name="remarks" id="remarks" value={editedSubproject.remarks} onChange={handleInputChange} rows={4} className={commonInputClasses} />
                                        </div>
                                    </fieldset>
                                 </div>
                            )}
                            {activeTab === 'commodity' && editMode === 'full' && (
                                <div className="space-y-6">
                                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                        <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Subproject Commodities</legend>
                                        <div className="space-y-2 mb-4">
                                            {editedSubproject.subprojectCommodities && editedSubproject.subprojectCommodities.length > 0 ? (
                                                editedSubproject.subprojectCommodities.map((c, index) => (
                                                    <div key={index} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 p-2 rounded-md text-sm">
                                                        <div>
                                                            <span className="font-semibold">{c.name}</span>
                                                            <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">({c.typeName || 'N/A'})</span>
                                                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                                                {c.typeName === 'Animal Commodity' ? 'Heads' : 'Area'}: {c.area} {c.typeName !== 'Animal Commodity' && `| Yield: ${c.averageYield}`}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <button type="button" onClick={() => handleEditCommodity(index)} className="text-gray-400 hover:text-accent dark:hover:text-accent">
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
                                                            </button>
                                                            <button type="button" onClick={() => handleRemoveCommodity(index)} className="text-red-500 hover:text-red-700">&times;</button>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-sm text-gray-500 dark:text-gray-400 italic">No commodities added.</p>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end border-t pt-4 mt-4 border-gray-200 dark:border-gray-700">
                                            <div>
                                                <label className="block text-xs font-medium">Type</label>
                                                <select name="typeName" value={currentCommodity.typeName} onChange={handleCommodityChange} className={commonInputClasses + " py-1.5"}>
                                                    <option value="">Select Type</option>
                                                    {referenceCommodityTypes.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium">Commodity</label>
                                                <select name="name" value={currentCommodity.name} onChange={handleCommodityChange} disabled={!currentCommodity.typeName} className={commonInputClasses + " py-1.5"}>
                                                    <option value="">Select Commodity</option>
                                                    {currentCommodity.typeName && commodityCategories[currentCommodity.typeName]?.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium">{currentCommodity.typeName === 'Animal Commodity' ? 'No. of Heads' : 'Area (ha)'}</label>
                                                <input type="number" name="area" value={currentCommodity.area} onChange={handleCommodityChange} className={commonInputClasses + " py-1.5"} />
                                            </div>
                                            <div className="flex gap-2 items-end">
                                                {currentCommodity.typeName !== 'Animal Commodity' && (
                                                    <div className="flex-grow">
                                                        <label className="block text-xs font-medium">Average Yield</label>
                                                        <input type="number" name="averageYield" value={currentCommodity.averageYield} onChange={handleCommodityChange} className={commonInputClasses + " py-1.5"} />
                                                    </div>
                                                )}
                                                <button type="button" onClick={handleAddCommodity} className="h-9 w-9 flex-shrink-0 inline-flex items-center justify-center rounded-full bg-green-100 text-accent hover:bg-green-200">+</button>
                                            </div>
                                        </div>
                                    </fieldset>
                                </div>
                            )}
                            {activeTab === 'budget' && (editMode === 'full' || editMode === 'budget') && (
                                <div className="space-y-6">
                                     <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                        <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Budget Items</legend>
                                        <div className="space-y-2 mb-4">
                                            {detailItems.map((d, index) => (
                                                <div key={index} className={`flex items-center justify-between p-2 rounded-md text-sm ${editingDetailIndex === index ? 'bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-700' : 'bg-gray-50 dark:bg-gray-700/50'}`}>
                                                    <div>
                                                        <span className="font-semibold">{d.particulars}</span>
                                                        <div className="text-xs text-gray-500">{d.uacsCode} - {d.numberOfUnits} {d.unitOfMeasure} @ {formatCurrency(Number(d.pricePerUnit))}</div>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <span className="font-bold">{formatCurrency(Number(d.numberOfUnits) * Number(d.pricePerUnit))}</span>
                                                        <div className="flex items-center gap-2">
                                                            <button type="button" onClick={() => handleEditParticular(index)} className="text-gray-400 hover:text-accent dark:hover:text-accent">
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
                                                            </button>
                                                            <button type="button" onClick={() => handleRemoveDetail(index)} className="text-red-500 hover:text-red-700">&times;</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            <div className="text-right font-bold pt-2">Total: {formatCurrency(totalBudget)}</div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-end border-t pt-4 mt-4 border-gray-200 dark:border-gray-700">
                                            <div className="lg:col-span-2"><label className="block text-xs font-medium">Item Type</label><select name="type" value={currentDetail.type} onChange={handleDetailChange} className={commonInputClasses + " py-1.5"}><option value="">Select Type</option>{Object.keys(particularTypes).map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                            <div className="lg:col-span-2"><label className="block text-xs font-medium">Particulars</label><select name="particulars" value={currentDetail.particulars} onChange={handleDetailChange} disabled={!currentDetail.type} className={commonInputClasses + " py-1.5"}><option value="">Select Item</option>{currentDetail.type && particularTypes[currentDetail.type]?.map(i => <option key={i} value={i}>{i}</option>)}</select></div>
                                            
                                            <div className="lg:col-span-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                                                <div><label className="block text-xs font-medium">Object Type</label><select name="objectType" value={currentDetail.objectType} onChange={handleDetailChange} className={commonInputClasses + " py-1.5"}>{objectTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                                <div><label className="block text-xs font-medium">Expense Particular</label><select name="expenseParticular" value={currentDetail.expenseParticular} onChange={handleDetailChange} className={commonInputClasses + " py-1.5"}><option value="">Select Particular</option>{Object.keys(uacsCodes[currentDetail.objectType]).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                                                <div><label className="block text-xs font-medium">UACS Code</label><select name="uacsCode" value={currentDetail.uacsCode} onChange={handleDetailChange} disabled={!currentDetail.expenseParticular} className={commonInputClasses + " py-1.5"}><option value="">Select UACS</option>{currentDetail.expenseParticular && uacsCodes[currentDetail.objectType]?.[currentDetail.expenseParticular] && Object.entries(uacsCodes[currentDetail.objectType][currentDetail.expenseParticular]).map(([c, d]) => <option key={c} value={c}>{c} - {d}</option>)}</select></div>
                                            </div>

                                            <div><label className="block text-xs font-medium">Delivery Date</label><input type="date" name="deliveryDate" value={currentDetail.deliveryDate} onChange={handleDetailChange} className={commonInputClasses + " py-1.5 text-sm"} />{dateError && <p className="text-xs text-red-500 mt-1">{dateError}</p>}</div>
                                            <div><label className="block text-xs font-medium">Obligation Month</label><input type="date" name="obligationMonth" value={currentDetail.obligationMonth} onChange={handleDetailChange} className={commonInputClasses + " py-1.5 text-sm"} /></div>
                                            <div><label className="block text-xs font-medium">Disbursement Month</label><input type="date" name="disbursementMonth" value={currentDetail.disbursementMonth} onChange={handleDetailChange} className={commonInputClasses + " py-1.5 text-sm"} /></div>

                                            <div><label className="block text-xs font-medium">Unit</label><select name="unitOfMeasure" value={currentDetail.unitOfMeasure} onChange={handleDetailChange} className={commonInputClasses + " py-1.5"}><option>pcs</option><option>kgs</option><option>unit</option><option>lot</option><option>heads</option></select></div>
                                            <div><label className="block text-xs font-medium">Price/Unit</label><input type="number" name="pricePerUnit" value={currentDetail.pricePerUnit} onChange={handleDetailChange} className={commonInputClasses + " py-1.5"} /></div>
                                            <div><label className="block text-xs font-medium">Qty</label><input type="number" name="numberOfUnits" value={currentDetail.numberOfUnits} onChange={handleDetailChange} className={commonInputClasses + " py-1.5"} /></div>
                                            
                                            {editingDetailIndex !== null ? (
                                                <div className="flex gap-1 h-9 items-end">
                                                    <button type="button" onClick={handleAddDetail} className="h-full px-3 inline-flex items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700 text-xs font-medium">Update</button>
                                                    <button type="button" onClick={handleCancelDetailEdit} className="h-full px-3 inline-flex items-center justify-center rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 text-xs font-medium">Cancel</button>
                                                </div>
                                            ) : (
                                                <button type="button" onClick={handleAddDetail} className="h-9 w-9 flex-shrink-0 inline-flex items-center justify-center rounded-full bg-green-100 text-accent hover:bg-green-200">+</button>
                                            )}
                                        </div>
                                     </fieldset>
                                </div>
                            )}
                            
                            {editMode === 'accomplishment' && (
                                <div className="space-y-6">
                                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                        <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Budget Items Accomplishment</legend>
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                                <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left font-medium">Particulars</th>
                                                        <th className="px-3 py-2 text-left font-medium">Actual No. of Units</th>
                                                        <th className="px-3 py-2 text-left font-medium">Actual Delivery</th>
                                                        <th className="px-3 py-2 text-left font-medium">Actual Obligation</th>
                                                        <th className="px-3 py-2 text-left font-medium">Actual Disbursement</th>
                                                        <th className="px-3 py-2 text-left font-medium">Actual Amount</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                    {detailItems.map((detail, idx) => (
                                                        <tr key={idx}>
                                                            <td className="px-3 py-2 text-sm text-gray-800 dark:text-gray-200">
                                                                {detail.particulars}
                                                                <div className="text-xs text-gray-500">Target: {detail.numberOfUnits} {detail.unitOfMeasure}</div>
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                <input 
                                                                    type="number" 
                                                                    value={(detail as any).actualNumberOfUnits || ''} 
                                                                    onChange={(e) => handleDetailAccomplishmentChange(idx, 'actualNumberOfUnits', parseFloat(e.target.value))} 
                                                                    className="w-full text-xs px-2 py-1 rounded border dark:bg-gray-600 dark:border-gray-500" 
                                                                    placeholder={`0 ${detail.unitOfMeasure}`}
                                                                />
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                <input type="date" value={(detail as any).actualDeliveryDate || ''} onChange={(e) => handleDetailAccomplishmentChange(idx, 'actualDeliveryDate', e.target.value)} className="w-full text-xs px-2 py-1 rounded border dark:bg-gray-600 dark:border-gray-500" />
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                <input type="date" value={(detail as any).actualObligationDate || ''} onChange={(e) => handleDetailAccomplishmentChange(idx, 'actualObligationDate', e.target.value)} className="w-full text-xs px-2 py-1 rounded border dark:bg-gray-600 dark:border-gray-500" />
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                <input type="date" value={(detail as any).actualDisbursementDate || ''} onChange={(e) => handleDetailAccomplishmentChange(idx, 'actualDisbursementDate', e.target.value)} className="w-full text-xs px-2 py-1 rounded border dark:bg-gray-600 dark:border-gray-500" />
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                <input type="number" value={(detail as any).actualAmount || ''} onChange={(e) => handleDetailAccomplishmentChange(idx, 'actualAmount', parseFloat(e.target.value))} className="w-full text-xs px-2 py-1 rounded border dark:bg-gray-600 dark:border-gray-500" placeholder="0.00" />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </fieldset>

                                    {/* Section 2: Customer Satisfaction */}
                                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                        <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Customer Satisfaction</legend>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 italic">Placeholder for Customer Satisfaction Survey data.</p>
                                    </fieldset>

                                    {/* Section 3: Outcome of Subproject */}
                                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                        <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Outcome of Subproject</legend>
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                                <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left font-medium">Commodity</th>
                                                        <th className="px-3 py-2 text-left font-medium">Target</th>
                                                        <th className="px-3 py-2 text-left font-medium">Actual</th>
                                                        <th className="px-3 py-2 text-left font-medium">Usage</th>
                                                        <th className="px-3 py-2 text-left font-medium">Income (PHP)</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                    {editedSubproject.subprojectCommodities?.map((commodity, index) => {
                                                        const isCrop = commodity.typeName === 'Crop Commodity';
                                                        return (
                                                            <tr key={index}>
                                                                <td className="px-3 py-2 text-sm text-gray-800 dark:text-gray-200">{commodity.name} ({commodity.typeName})</td>
                                                                <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
                                                                    {commodity.averageYield ? `${commodity.averageYield} (Yield/Ha)` : ''} 
                                                                    {commodity.typeName === 'Animal Commodity' ? ' (Heads)' : ''}
                                                                </td>
                                                                <td className="px-3 py-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <input type="number" value={commodity.actualYield || ''} onChange={(e) => handleCommodityAccomplishmentChange(index, 'actualYield', parseFloat(e.target.value))} className="w-24 text-xs px-2 py-1 rounded border dark:bg-gray-600 dark:border-gray-500" placeholder="0" />
                                                                        <span className="text-xs text-gray-500">{isCrop ? 'Yield/Ha' : 'Heads'}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-3 py-2">
                                                                    <div className="flex flex-col gap-1">
                                                                        <div className="flex items-center gap-1">
                                                                            <input type="number" value={commodity.marketingPercentage || ''} onChange={(e) => handleCommodityAccomplishmentChange(index, 'marketingPercentage', parseFloat(e.target.value))} className="w-16 text-xs px-1 py-0.5 rounded border dark:bg-gray-600 dark:border-gray-500" placeholder="%" />
                                                                            <span className="text-xs text-gray-500">Mktg</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-1">
                                                                            <input type="number" value={commodity.foodSecurityPercentage || ''} onChange={(e) => handleCommodityAccomplishmentChange(index, 'foodSecurityPercentage', parseFloat(e.target.value))} className="w-16 text-xs px-1 py-0.5 rounded border dark:bg-gray-600 dark:border-gray-500" placeholder="%" />
                                                                            <span className="text-xs text-gray-500">FS</span>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="px-3 py-2">
                                                                    {(commodity.marketingPercentage || 0) > 0 ? (
                                                                        <div className="flex flex-col gap-1">
                                                                            <input type="number" value={commodity.income || ''} onChange={(e) => handleCommodityAccomplishmentChange(index, 'income', parseFloat(e.target.value))} className="w-28 text-xs px-2 py-1 rounded border dark:bg-gray-600 dark:border-gray-500" placeholder="0.00" />
                                                                            <span className="text-[10px] text-gray-400 italic">
                                                                                {isCrop ? 'per harvest season' : 'annual income'}
                                                                            </span>
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-xs text-gray-400">-</span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                    {(!editedSubproject.subprojectCommodities || editedSubproject.subprojectCommodities.length === 0) && (
                                                        <tr><td colSpan={5} className="px-3 py-2 text-sm text-gray-500 italic text-center">No commodities linked.</td></tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </fieldset>

                                    {/* Section 4: Catch Up Plan (Conditional) */}
                                    {new Date() > new Date(editedSubproject.estimatedCompletionDate) && editedSubproject.status !== 'Completed' && (
                                        <fieldset className="border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10 p-4 rounded-md">
                                            <legend className="px-2 font-semibold text-red-600 dark:text-red-400">Catch Up Plan</legend>
                                            <p className="text-xs text-red-500 mb-2">Project is delayed. Please provide a catch-up plan.</p>
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Remarks / Justification</label>
                                                    <textarea name="catchUpPlanRemarks" value={editedSubproject.catchUpPlanRemarks || ''} onChange={handleInputChange} rows={3} className={commonInputClasses} placeholder="Describe actions taken or justification for delay..." />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">New Target Completion Date</label>
                                                    <input type="date" name="newTargetCompletionDate" value={editedSubproject.newTargetCompletionDate || ''} onChange={handleInputChange} className={commonInputClasses} />
                                                </div>
                                            </div>
                                        </fieldset>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <button type="button" onClick={() => setEditMode('none')} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600">Cancel</button>
                            <button type="submit" className="px-4 py-2 rounded-md text-sm font-medium text-white bg-accent hover:brightness-95">Save Changes</button>
                        </div>
                    </form>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-8">
             <header className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">{subproject.name}</h1>
                    <p className="text-md text-gray-500 dark:text-gray-400">{subproject.location}</p>
                </div>
                <div className="flex items-center gap-4">
                     {canEdit && (
                         <button onClick={() => setEditMode('full')} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
                            Edit Subproject
                        </button>
                     )}
                    {canEdit && (
                        <button onClick={() => setEditMode('accomplishment')} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Edit Accomplishment
                        </button>
                    )}
                    <button onClick={onBack} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        Back to {previousPageName}
                    </button>
                </div>
            </header>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column */}
                <div className="lg:col-span-2 space-y-8">
                     <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Project Details</h3>
                         <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                            <DetailItem label="Status" value={<span className={getStatusBadge(subproject.status)}>{subproject.status}</span>} />
                            <DetailItem label="UID" value={subproject.uid} />
                            <DetailItem label="Package" value={subproject.packageType} />
                            <DetailItem label="IPO" value={subproject.indigenousPeopleOrganization} />
                            <DetailItem label="Start Date" value={formatDate(subproject.startDate)} />
                            <DetailItem label="Est. Completion" value={formatDate(subproject.estimatedCompletionDate)} />
                            <DetailItem label="Actual Completion" value={formatDate(subproject.actualCompletionDate)} />
                            <DetailItem label="Funding Year" value={subproject.fundingYear?.toString()} />
                            <DetailItem label="Fund Type" value={subproject.fundType} />
                            <DetailItem label="Tier" value={subproject.tier} />
                         </div>
                         <div className="mt-6">
                             <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Remarks</h4>
                             <p className="mt-1 text-sm text-gray-800 dark:text-gray-100 italic bg-gray-50 dark:bg-gray-700/50 p-3 rounded-md">{subproject.remarks || 'No remarks provided.'}</p>
                         </div>
                     </div>

                     {/* New Target Commodities Section */}
                     <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Target Commodities</h3>
                        {subproject.subprojectCommodities && subproject.subprojectCommodities.length > 0 ? (
                            <ul className="space-y-1">
                                {subproject.subprojectCommodities.map((c, idx) => (
                                    <li key={idx} className="flex justify-between items-center bg-gray-50 dark:bg-gray-700/50 p-3 rounded-md text-sm">
                                        <div>
                                            <span className="font-semibold text-gray-800 dark:text-gray-200">{c.name}</span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">({c.typeName || 'N/A'})</span>
                                        </div>
                                        <span className="text-gray-500 dark:text-gray-400">
                                            {c.typeName === 'Animal Commodity' ? 'Heads' : 'Area'}: {c.area} {c.typeName !== 'Animal Commodity' && `| Yield: ${c.averageYield} kg/ha`}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400 italic">No commodities recorded.</p>
                        )}
                     </div>

                     <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Budget Breakdown</h3>
                            {canEdit && (
                                <button onClick={() => setEditMode('budget')} className="text-sm text-accent hover:underline flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
                                    Edit Budget
                                </button>
                            )}
                        </div>
                        <div className="overflow-x-auto">
                           <table className="min-w-full text-sm">
                                <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase">
                                    <tr>
                                        <th className="px-4 py-2 text-left">Particulars</th>
                                        <th className="px-4 py-2 text-left">Delivery Date</th>
                                        <th className="px-4 py-2 text-left">UACS Code</th>
                                        <th className="px-4 py-2 text-left">Obligation</th>
                                        <th className="px-4 py-2 text-left">Disbursement</th>
                                        <th className="px-4 py-2 text-right"># of Units</th>
                                        <th className="px-4 py-2 text-right">Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {subproject.details.map(detail => (
                                        <tr key={detail.id} className="border-b border-gray-200 dark:border-gray-700">
                                            <td className="px-4 py-2 font-medium">{detail.particulars}</td>
                                            <td className="px-4 py-2">{formatDate(detail.deliveryDate)}</td>
                                            <td className="px-4 py-2">{detail.uacsCode}</td>
                                            <td className="px-4 py-2">{formatDate(detail.obligationMonth)}</td>
                                            <td className="px-4 py-2">{formatDate(detail.disbursementMonth)}</td>
                                            <td className="px-4 py-2 text-right">{detail.numberOfUnits.toLocaleString()} {detail.unitOfMeasure}</td>
                                            <td className="px-4 py-2 text-right font-medium">{formatCurrency(detail.pricePerUnit * detail.numberOfUnits)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="font-bold bg-gray-50 dark:bg-gray-700/50">
                                    <tr>
                                        <td colSpan={6} className="px-4 py-2 text-right">Total Budget</td>
                                        <td className="px-4 py-2 text-right">{formatCurrency(calculateTotalBudget(subproject.details))}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {/* NEW: Accomplishment Report Section (Read-Only) */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Accomplishment Report</h3>
                        </div>
                        <div className="space-y-6">
                            <div>
                                <h4 className="text-sm font-bold text-gray-600 dark:text-gray-300 mb-2">Item Delivery Status</h4>
                                {subproject.details.some(d => d.actualDeliveryDate) ? (
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full text-sm">
                                            <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase">
                                                <tr>
                                                    <th className="px-4 py-2 text-left">Item</th>
                                                    <th className="px-4 py-2 text-left">Actual Delivery</th>
                                                    <th className="px-4 py-2 text-right">Actual Units</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {subproject.details.filter(d => d.actualDeliveryDate).map(d => (
                                                    <tr key={d.id} className="border-b border-gray-100 dark:border-gray-700">
                                                        <td className="px-4 py-2 font-medium">{d.particulars}</td>
                                                        <td className="px-4 py-2 text-green-600 dark:text-green-400">{formatDate(d.actualDeliveryDate)}</td>
                                                        <td className="px-4 py-2 text-right">{d.actualNumberOfUnits || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500 italic">No items delivered yet.</p>
                                )}
                            </div>

                            <div>
                                <h4 className="text-sm font-bold text-gray-600 dark:text-gray-300 mb-2">Project Outcome</h4>
                                {subproject.subprojectCommodities && subproject.subprojectCommodities.some(c => c.actualYield || c.income) ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {subproject.subprojectCommodities.map((c, i) => (
                                            (c.actualYield || c.income) && (
                                                <div key={i} className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-100 dark:border-gray-700">
                                                    <p className="font-bold text-gray-800 dark:text-gray-200">{c.name}</p>
                                                    <div className="mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-400">
                                                        {c.actualYield && <p>Yield: <span className="font-semibold text-gray-900 dark:text-white">{c.actualYield}</span> {c.typeName === 'Animal Commodity' ? 'Heads' : 'Yield/Ha'}</p>}
                                                        {c.income && <p>Income: <span className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(c.income)}</span></p>}
                                                        {c.marketingPercentage && <p>Marketing: {c.marketingPercentage}%</p>}
                                                    </div>
                                                </div>
                                            )
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500 italic">No outcome data recorded yet.</p>
                                )}
                            </div>
                        </div>
                    </div>

                </div>
                 {/* Right Column */}
                <div className="space-y-8">
                     <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">History</h3>
                        {subproject.history && subproject.history.length > 0 ? (
                            <div className="relative border-l-2 border-gray-200 dark:border-gray-700 ml-2 py-2">
                                <ul className="space-y-8">
                                    {subproject.history.map((entry, index) => (
                                        <li key={index} className="ml-8 relative">
                                            <span className="absolute flex items-center justify-center w-4 h-4 bg-accent rounded-full -left-[35px] ring-4 ring-white dark:ring-gray-800"></span>
                                            <time className="mb-1 text-sm font-normal leading-none text-gray-400 dark:text-gray-500">{formatDate(entry.date)}</time>
                                            <p className="font-semibold text-gray-900 dark:text-white">{entry.event}</p>
                                            <p className="text-sm font-normal text-gray-500 dark:text-gray-400">by {entry.user}</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400 italic">No historical data available.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SubprojectDetail;
