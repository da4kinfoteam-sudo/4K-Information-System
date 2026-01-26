// Author: 4K 
import React, { useState, useEffect, FormEvent } from 'react';
import { IPO, Subproject, Training, Commodity, referenceCommodityTypes } from '../constants';
import LocationPicker, { parseLocation } from './LocationPicker';
import { useAuth } from '../contexts/AuthContext';
import { getUserPermissions } from './mainfunctions/TableHooks';


interface IPODetailProps {
    ipo: IPO;
    subprojects: Subproject[];
    trainings: Training[];
    onBack: () => void;
    previousPageName: string;
    onUpdateIpo: (updatedIpo: IPO) => void;
    onSelectSubproject: (subproject: Subproject) => void;
    onSelectActivity: (activity: Training) => void;
    particularTypes: { [key: string]: string[] };
    commodityCategories: { [key: string]: string[] };
}

const formatDate = (dateString?: string | null) => {
    if (!dateString) return 'N/A';
    // Ensure date is parsed as UTC to avoid timezone issues
    const date = new Date(dateString + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};


const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
}

const getStatusBadge = (status: Subproject['status']) => {
    const baseClasses = "px-2 py-0.5 text-xs font-medium rounded-full";
    switch (status) {
        case 'Completed': return `${baseClasses} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`;
        case 'Ongoing': return `${baseClasses} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`;
        case 'Proposed': return `${baseClasses} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`;
        case 'Cancelled': return `${baseClasses} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`;
        default: return `${baseClasses} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200`;
    }
}

const getTrainingStatusBadge = (training: Training) => {
    const isCompleted = !!training.actualDate;
    const baseClasses = "px-2 py-0.5 text-xs font-medium rounded-full";
    return isCompleted 
        ? `${baseClasses} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`
        : `${baseClasses} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`;
}

const DetailItem: React.FC<{ label: string; value?: string | number | React.ReactNode; half?: boolean }> = ({ label, value, half }) => (
    <div className={half ? 'sm:col-span-1' : 'sm:col-span-2'}>
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm text-gray-900 dark:text-white">{value || 'N/A'}</dd>
    </div>
);

const registeringBodyOptions = ['SEC', 'DOLE', 'CDA'];

const IPODetail: React.FC<IPODetailProps> = ({ ipo, subprojects, trainings, onBack, previousPageName, onUpdateIpo, onSelectSubproject, onSelectActivity, particularTypes, commodityCategories }) => {
    const { currentUser } = useAuth();
    const { canEdit } = getUserPermissions(currentUser);
    const [isEditing, setIsEditing] = useState(false);
    const [editedIpo, setEditedIpo] = useState<IPO>(ipo);
    const [otherRegisteringBody, setOtherRegisteringBody] = useState('');
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    
    // Commodity State
    const [currentCommodity, setCurrentCommodity] = useState({
        type: '',
        particular: '',
        value: '',
        yield: '',
        isScad: false,
        marketingPercentage: '',
        foodSecurityPercentage: '',
        averageIncome: ''
    });
    const [editingCommodityIndex, setEditingCommodityIndex] = useState<number | null>(null);
    
    useEffect(() => {
        // Reset form state if the viewed IPO changes or when exiting edit mode
        const isOther = !registeringBodyOptions.includes(ipo.registeringBody);
        const registrationBodyValue = isOther ? 'Others' : ipo.registeringBody;
        
        setEditedIpo({
            ...ipo,
            registeringBody: registrationBodyValue,
            registrationDate: ipo.registrationDate || '' // Ensure string for input
        });

        if (isOther) {
            setOtherRegisteringBody(ipo.registeringBody);
        } else {
            setOtherRegisteringBody('');
        }
    }, [ipo, isEditing]);


    const handleCancelEdit = () => {
        setIsEditing(false);
        handleCancelCommodityEdit();
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        setIsConfirmModalOpen(true);
    };

    const handleConfirmSave = () => {
        const finalRegisteringBody = editedIpo.registeringBody === 'Others' ? otherRegisteringBody : editedIpo.registeringBody;
        onUpdateIpo({ 
            ...editedIpo, 
            registeringBody: finalRegisteringBody,
            registrationDate: editedIpo.registrationDate || null // Convert empty string to null for DB
        });
        setIsConfirmModalOpen(false);
        setIsEditing(false);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        
        if (type === 'checkbox') {
            const { checked } = e.target as HTMLInputElement;
            setEditedIpo(prev => ({ ...prev, [name]: checked }));
        } else if (name === 'levelOfDevelopment' || name.startsWith('total')) {
            setEditedIpo(prev => ({ ...prev, [name]: parseInt(value, 10) || 0 }));
        } else {
            setEditedIpo(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleLocationChange = (locationString: string) => {
        setEditedIpo(prev => ({
            ...prev,
            location: locationString,
        }));
    };
    
    const handleRegionChange = (region: string) => {
        setEditedIpo(prev => ({
            ...prev,
            region: region,
        }));
    };

    const handleCommodityChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
            const { checked } = e.target as HTMLInputElement;
            setCurrentCommodity(prev => ({ ...prev, [name]: checked }));
        } else if (name === 'type') {
            setCurrentCommodity({
                type: value,
                particular: '',
                value: '',
                yield: '',
                isScad: false,
                marketingPercentage: '',
                foodSecurityPercentage: '',
                averageIncome: ''
            });
        } else {
            if (name === 'marketingPercentage' || name === 'foodSecurityPercentage') {
                const numValue = parseFloat(value);
                if (value !== '' && (isNaN(numValue) || numValue < 0)) return; // Prevent negative inputs

                const newValue = value === '' ? 0 : numValue;
                const otherKey = name === 'marketingPercentage' ? 'foodSecurityPercentage' : 'marketingPercentage';
                // Cast to access property dynamically
                const otherValue = parseFloat(String((currentCommodity as any)[otherKey]) || '0');

                if (newValue + otherValue > 100) {
                    return; // Prevent total exceeding 100%
                }
            }
            setCurrentCommodity(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleAddCommodity = () => {
        const isAnimal = currentCommodity.type === 'Animal Commodity';
        if (!currentCommodity.type || !currentCommodity.particular || !currentCommodity.value || (!isAnimal && !currentCommodity.yield)) {
            alert(`Please fill out all commodity fields including ${isAnimal ? 'Number of Heads' : 'Area and Yield'}.`);
            return;
        }
        const newCommodity: Commodity = {
            type: currentCommodity.type,
            particular: currentCommodity.particular,
            value: parseFloat(currentCommodity.value),
            yield: isAnimal ? undefined : parseFloat(currentCommodity.yield),
            isScad: currentCommodity.isScad,
            marketingPercentage: currentCommodity.marketingPercentage ? parseFloat(currentCommodity.marketingPercentage) : undefined,
            foodSecurityPercentage: currentCommodity.foodSecurityPercentage ? parseFloat(currentCommodity.foodSecurityPercentage) : undefined,
            averageIncome: currentCommodity.averageIncome ? parseFloat(currentCommodity.averageIncome) : undefined,
        };

        if (editingCommodityIndex !== null) {
            // Edit Mode
            const updatedCommodities = [...editedIpo.commodities];
            updatedCommodities[editingCommodityIndex] = newCommodity;
            const hasScad = updatedCommodities.some(c => c.isScad);
            setEditedIpo(prev => ({ ...prev, commodities: updatedCommodities, isWithScad: hasScad }));
            setEditingCommodityIndex(null);
        } else {
            // Add Mode
            const updatedCommodities = [...editedIpo.commodities, newCommodity];
            const hasScad = updatedCommodities.some(c => c.isScad);
            setEditedIpo(prev => ({ ...prev, commodities: updatedCommodities, isWithScad: hasScad }));
        }

        setCurrentCommodity({
            type: '', particular: '', value: '', yield: '', isScad: false,
            marketingPercentage: '', foodSecurityPercentage: '', averageIncome: ''
        });
    };

    const handleEditCommodity = (index: number) => {
        const commodity = editedIpo.commodities[index];
        setCurrentCommodity({
            type: commodity.type,
            particular: commodity.particular,
            value: String(commodity.value),
            yield: commodity.yield ? String(commodity.yield) : '',
            isScad: commodity.isScad || false,
            marketingPercentage: commodity.marketingPercentage ? String(commodity.marketingPercentage) : '',
            foodSecurityPercentage: commodity.foodSecurityPercentage ? String(commodity.foodSecurityPercentage) : '',
            averageIncome: commodity.averageIncome ? String(commodity.averageIncome) : ''
        });
        setEditingCommodityIndex(index);
    };

    const handleCancelCommodityEdit = () => {
        setEditingCommodityIndex(null);
        setCurrentCommodity({
            type: '', particular: '', value: '', yield: '', isScad: false,
            marketingPercentage: '', foodSecurityPercentage: '', averageIncome: ''
        });
    };

    const handleRemoveCommodity = (indexToRemove: number) => {
        const updatedCommodities = editedIpo.commodities.filter((_, index) => index !== indexToRemove);
        const hasScad = updatedCommodities.some(c => c.isScad);
        setEditedIpo(prev => ({
            ...prev,
            commodities: updatedCommodities,
            isWithScad: hasScad
        }));
        if (editingCommodityIndex === indexToRemove) {
            handleCancelCommodityEdit();
        }
    };

    const calculateTotalBudget = (details: Subproject['details']) => {
        return details.reduce((total, item) => total + (item.pricePerUnit * item.numberOfUnits), 0);
    }
    
    const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm";


    if (isEditing) {
        return (
             <div className="space-y-6">
                 {isConfirmModalOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
                        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Confirm Changes</h3>
                            <p className="my-4 text-gray-600 dark:text-gray-300">Are you sure you want to save these changes?</p>
                            <div className="flex justify-end gap-4 mt-6">
                                <button onClick={() => setIsConfirmModalOpen(false)} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
                                <button onClick={handleConfirmSave} className="px-4 py-2 rounded-md text-sm font-medium text-white bg-accent hover:brightness-95">Confirm</button>
                            </div>
                        </div>
                    </div>
                )}
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Editing: {ipo.name}</h1>
                 <form onSubmit={handleSubmit} className="space-y-6 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                        <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">IPO Profile</legend>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-3">
                                <label htmlFor="name" className="block text-sm font-medium">IPO Name</label>
                                <input type="text" name="name" id="name" value={editedIpo.name} onChange={handleInputChange} required className={commonInputClasses} />
                            </div>
                             <div className="md:col-span-3">
                                <label htmlFor="indigenousCulturalCommunity" className="block text-sm font-medium">Indigenous Cultural Community (ICC)</label>
                                <input type="text" name="indigenousCulturalCommunity" id="indigenousCulturalCommunity" value={editedIpo.indigenousCulturalCommunity} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                            
                            <div className="md:col-span-3">
                                <label htmlFor="location" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">IPO Location</label>
                                <LocationPicker 
                                    value={editedIpo.location} 
                                    onChange={handleLocationChange} 
                                    onRegionChange={handleRegionChange} 
                                    required 
                                />
                            </div>
                            <div className="md:col-span-3">
                                <label htmlFor="ancestralDomainNo" className="block text-sm font-medium">Ancestral Domain No.</label>
                                <input type="text" name="ancestralDomainNo" id="ancestralDomainNo" value={editedIpo.ancestralDomainNo} onChange={handleInputChange} className={commonInputClasses} />
                            </div>

                             <div>
                                <label htmlFor="registeringBody" className="block text-sm font-medium">Registering Body</label>
                                <select name="registeringBody" id="registeringBody" value={editedIpo.registeringBody} onChange={handleInputChange} className={commonInputClasses}>
                                    {registeringBodyOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    <option value="Others">Others</option>
                                </select>
                             </div>
                             {editedIpo.registeringBody === 'Others' && (
                                <div>
                                    <label htmlFor="otherRegisteringBody" className="block text-sm font-medium">Please Specify</label>
                                    <input type="text" name="otherRegisteringBody" id="otherRegisteringBody" value={otherRegisteringBody} onChange={(e) => setOtherRegisteringBody(e.target.value)} required className={commonInputClasses} />
                                </div>
                             )}
                              <div className={editedIpo.registeringBody === 'Others' ? '' : 'md:col-start-2'}>
                                <label htmlFor="registrationDate" className="block text-sm font-medium">Registration Date</label>
                                <input type="date" name="registrationDate" id="registrationDate" value={editedIpo.registrationDate || ''} onChange={handleInputChange} className={commonInputClasses} />
                            </div>

                             <div>
                                <label htmlFor="contactPerson" className="block text-sm font-medium">Contact Person</label>
                                <input type="text" name="contactPerson" id="contactPerson" value={editedIpo.contactPerson} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                            <div>
                                <label htmlFor="contactNumber" className="block text-sm font-medium">Contact Number</label>
                                <input type="text" name="contactNumber" id="contactNumber" value={editedIpo.contactNumber} onChange={handleInputChange} className={commonInputClasses} />
                            </div>

                            <div className="md:col-span-3 flex items-center flex-wrap gap-x-8 gap-y-2 pt-2">
                                 <label htmlFor="isWomenLed" className="flex items-center gap-2 text-sm font-medium">
                                    <input type="checkbox" name="isWomenLed" id="isWomenLed" checked={editedIpo.isWomenLed} onChange={handleInputChange} className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent" />
                                    <span>Women-led</span>
                                </label>
                                <label htmlFor="isWithinGida" className="flex items-center gap-2 text-sm font-medium">
                                    <input type="checkbox" name="isWithinGida" id="isWithinGida" checked={editedIpo.isWithinGida} onChange={handleInputChange} className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent" />
                                    <span>Within GIDA area</span>
                                </label>
                                <label htmlFor="isWithinElcac" className="flex items-center gap-2 text-sm font-medium">
                                    <input type="checkbox" name="isWithinElcac" id="isWithinElcac" checked={editedIpo.isWithinElcac} onChange={handleInputChange} className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent" />
                                    <span>Within ELCAC area</span>
                                </label>
                                <label className="flex items-center gap-2 text-sm font-medium text-gray-400 dark:text-gray-500">
                                    <input type="checkbox" name="isWithScad" checked={editedIpo.isWithScad} disabled className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent" />
                                    <span>With SCAD</span>
                                </label>
                            </div>
                        </div>
                    </fieldset>

                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                        <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Commodities</legend>
                        <div className="space-y-2 mb-4">
                            {editedIpo.commodities.map((commodity, index) => (
                                <div key={index} className={`flex items-center justify-between p-2 rounded-md text-sm ${editingCommodityIndex === index ? 'bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-700' : 'bg-gray-50 dark:bg-gray-700/50'}`}>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold">{commodity.particular}</span>
                                            <span className="text-gray-500 dark:text-gray-400"> ({commodity.type}) - </span>
                                            <span>
                                                {commodity.value.toLocaleString()} {commodity.type === 'Animal Commodity' ? 'heads' : 'ha'}
                                                {commodity.yield ? ` | Yield: ${commodity.yield}` : ''}
                                            </span>
                                            {commodity.isScad && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300">SCAD</span>}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1 pl-1">
                                            {(commodity.marketingPercentage || 0) > 0 && <span>Marketing: {commodity.marketingPercentage}%</span>}
                                            {(commodity.foodSecurityPercentage || 0) > 0 && <span className="ml-2">Food Security: {commodity.foodSecurityPercentage}%</span>}
                                            {(commodity.averageIncome || 0) > 0 && <span className="ml-2">Avg. Income: ₱{commodity.averageIncome?.toLocaleString()}</span>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button type="button" onClick={() => handleEditCommodity(index)} className="text-gray-400 hover:text-accent dark:hover:text-accent">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
                                        </button>
                                        <button type="button" onClick={() => handleRemoveCommodity(index)} className="text-gray-400 hover:text-red-500">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                             <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Type</label>
                                <select name="type" value={currentCommodity.type} onChange={handleCommodityChange} className="mt-1 block w-full pl-2 pr-8 py-1.5 text-base bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md text-sm">
                                    <option value="">Select Type</option>
                                    {referenceCommodityTypes.map(type => ( <option key={type} value={type}>{type}</option> ))}
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Particular</label>
                                <select name="particular" value={currentCommodity.particular} onChange={handleCommodityChange} disabled={!currentCommodity.type} className="mt-1 block w-full pl-2 pr-8 py-1.5 text-base bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md text-sm disabled:bg-gray-200 dark:disabled:bg-gray-600">
                                    <option value="">Select Particular</option>
                                    {currentCommodity.type && commodityCategories[currentCommodity.type] && commodityCategories[currentCommodity.type].map(item => ( <option key={item} value={item}>{item}</option> ))}
                                </select>
                            </div>
                             <div className="flex items-end gap-2">
                                <div className="flex-1">
                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{currentCommodity.type === 'Animal Commodity' ? 'Number of Heads' : 'Area (ha)'}</label>
                                    <input type="number" name="value" value={currentCommodity.value} onChange={handleCommodityChange} min="0" step="any" className="mt-1 block w-full px-2 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm" />
                                </div>
                                {currentCommodity.type !== 'Animal Commodity' && (
                                    <div className="flex-1">
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Avg Yield</label>
                                        <input type="number" name="yield" value={currentCommodity.yield} onChange={handleCommodityChange} min="0" step="any" className="mt-1 block w-full px-2 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm" />
                                    </div>
                                )}
                            </div>
                        </div>
                        {/* New Usage Percentage Row */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end mt-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Marketing %</label>
                                <input type="number" name="marketingPercentage" value={currentCommodity.marketingPercentage} onChange={handleCommodityChange} min="0" max="100" className="mt-1 block w-full px-2 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm" placeholder="0-100" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Food Security %</label>
                                <input type="number" name="foodSecurityPercentage" value={currentCommodity.foodSecurityPercentage} onChange={handleCommodityChange} min="0" max="100" className="mt-1 block w-full px-2 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm" placeholder="0-100" />
                            </div>
                            <div>
                                {Number(currentCommodity.marketingPercentage) > 0 && (
                                    <div className="animate-fadeIn">
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Average Income (PHP)</label>
                                        <input type="number" name="averageIncome" value={currentCommodity.averageIncome} onChange={handleCommodityChange} min="0" className="mt-1 block w-full px-2 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm" placeholder="0.00" />
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-end items-end h-full">
                                {editingCommodityIndex !== null ? (
                                    <div className="flex gap-1 w-full">
                                        <button type="button" onClick={handleAddCommodity} className="h-9 px-3 flex-grow inline-flex items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700 text-xs font-medium">Update</button>
                                        <button type="button" onClick={handleCancelCommodityEdit} className="h-9 px-3 inline-flex items-center justify-center rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 text-xs font-medium">Cancel</button>
                                    </div>
                                ) : (
                                    <button type="button" onClick={handleAddCommodity} className="h-9 w-9 flex-shrink-0 inline-flex items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50 text-accent dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900">+</button>
                                )}
                            </div>
                        </div>
                        <div className="mt-2">
                            <label className="flex items-center gap-2 text-sm font-medium">
                                <input type="checkbox" name="isScad" checked={currentCommodity.isScad} onChange={handleCommodityChange} className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent" />
                                <span>SCAD commodity</span>
                            </label>
                        </div>
                    </fieldset>
                    
                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                        <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Level of Development</legend>
                        <div>
                            <label htmlFor="levelOfDevelopment" className="block text-sm font-medium">Current Level</label>
                            <select name="levelOfDevelopment" id="levelOfDevelopment" value={editedIpo.levelOfDevelopment} onChange={handleInputChange} required className={commonInputClasses}>
                                <option value={1}>Level 1</option> <option value={2}>Level 2</option> <option value={3}>Level 3</option> <option value={4}>Level 4</option> <option value={5}>Level 5</option>
                            </select>
                        </div>
                    </fieldset>

                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                        <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Membership Information</legend>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label htmlFor="totalMembers" className="block text-sm font-medium">Total Members</label>
                                <input type="number" name="totalMembers" id="totalMembers" value={editedIpo.totalMembers} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                            <div>
                                <label htmlFor="totalIpMembers" className="block text-sm font-medium">Total IP Members</label>
                                <input type="number" name="totalIpMembers" id="totalIpMembers" value={editedIpo.totalIpMembers} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                            <div>
                                <label htmlFor="total4PsMembers" className="block text-sm font-medium">Total 4Ps Beneficiaries</label>
                                <input type="number" name="total4PsMembers" id="total4PsMembers" value={editedIpo.total4PsMembers} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                            <div>
                                <label htmlFor="totalMaleMembers" className="block text-sm font-medium">Male Members</label>
                                <input type="number" name="totalMaleMembers" id="totalMaleMembers" value={editedIpo.totalMaleMembers} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                            <div>
                                <label htmlFor="totalFemaleMembers" className="block text-sm font-medium">Female Members</label>
                                <input type="number" name="totalFemaleMembers" id="totalFemaleMembers" value={editedIpo.totalFemaleMembers} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium">&nbsp;</label>
                                <span className="text-sm text-gray-500">Total: {(editedIpo.totalMaleMembers || 0) + (editedIpo.totalFemaleMembers || 0)}</span>
                            </div>
                            <div>
                                <label htmlFor="totalYouthMembers" className="block text-sm font-medium">Youth Members</label>
                                <input type="number" name="totalYouthMembers" id="totalYouthMembers" value={editedIpo.totalYouthMembers} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                            <div>
                                <label htmlFor="totalSeniorMembers" className="block text-sm font-medium">Senior Citizen Members</label>
                                <input type="number" name="totalSeniorMembers" id="totalSeniorMembers" value={editedIpo.totalSeniorMembers} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                        </div>
                    </fieldset>

                    <div className="flex justify-end gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <button type="button" onClick={handleCancelEdit} className="inline-flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                            Cancel
                        </button>
                        <button type="submit" className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent">
                            Save Changes
                        </button>
                    </div>
                 </form>
            </div>
        )
    }

    return (
        <div className="space-y-8">
            <header className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">{ipo.name}</h1>
                    <p className="text-md text-gray-500 dark:text-gray-400">{ipo.location}</p>
                </div>
                <div className="flex items-center gap-4">
                     {canEdit && (
                         <button
                            onClick={() => setIsEditing(true)}
                            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white bg-accent hover:brightness-95"
                        >
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
                            Edit IPO
                        </button>
                     )}
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        Back to {previousPageName}
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Subprojects Card */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Subprojects</h3>
                        {subprojects.length > 0 ? (
                            <ul className="space-y-4">
                                {subprojects.map(p => (
                                    <li key={p.id} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <button 
                                                    onClick={() => onSelectSubproject(p)}
                                                    className="font-bold text-gray-800 dark:text-gray-100 hover:text-accent dark:hover:text-green-400 focus:outline-none focus:underline text-left"
                                                >
                                                    {p.name}
                                                </button>
                                                <p className="text-sm text-gray-500 dark:text-gray-400">{p.location}</p>
                                            </div>
                                            <span className={getStatusBadge(p.status)}>{p.status}</span>
                                        </div>
                                        <div className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                                            <span className="font-semibold">Budget:</span> {formatCurrency(calculateTotalBudget(p.details))}
                                            <span className="mx-2">|</span>
                                            <span className="font-semibold">Timeline:</span> {formatDate(p.startDate)} to {formatDate(p.estimatedCompletionDate)}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400 italic">No subprojects linked to this IPO.</p>
                        )}
                    </div>

                    {/* Trainings Card */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Trainings Attended</h3>
                        {trainings.length > 0 ? (
                             <ul className="space-y-4">
                                {trainings.map(t => (
                                    <li key={t.id} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <button 
                                                    onClick={() => onSelectActivity(t)}
                                                    className="font-bold text-gray-800 dark:text-gray-100 hover:text-accent dark:hover:text-green-400 focus:outline-none focus:underline text-left"
                                                >
                                                    {t.name}
                                                </button>
                                                <p className="text-sm text-gray-500 dark:text-gray-400">{t.component}</p>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <span className={getTrainingStatusBadge(t)}>{t.actualDate ? 'Completed' : 'Planned'}</span>
                                                <p className="text-sm text-gray-500 dark:text-gray-400">{formatDate(t.date)}</p>
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">{t.description}</p>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400 italic">This IPO has not attended any recorded trainings.</p>
                        )}
                    </div>
                    
                    {/* History Card */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">History</h3>
                        {ipo.history && ipo.history.length > 0 ? (
                            <div className="relative border-l-2 border-gray-200 dark:border-gray-700 ml-2 py-2">
                                <ul className="space-y-8">
                                    {ipo.history.map((entry, index) => (
                                        <li key={index} className="ml-8 relative">
                                            <span className="absolute flex items-center justify-center w-4 h-4 bg-accent rounded-full -left-[35px] ring-4 ring-white dark:ring-gray-800">
                                                <svg className="w-1.5 h-1.5 text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20">
                                                    <path d="M20 4a2 2 0 0 0-2-2h-2V1a1 1 0 0 0-2 0v1h-3V1a1 1 0 0 0-2 0v1H6V1a1 1 0 0 0-2 0v1H2a2 2 0 0 0-2 2v2h20V4Z"/>
                                                    <path d="M0 18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8H0v10Zm5-8h10a1 1 0 0 1 0 2H5a1 1 0 0 1 0-2Z"/>
                                                </svg>
                                            </span>
                                            <time className="mb-1 text-sm font-normal leading-none text-gray-400 dark:text-gray-500">{formatDate(entry.date)}</time>
                                            <p className="font-semibold text-gray-900 dark:text-white">{entry.event}</p>
                                            <p className="text-sm font-normal text-gray-500 dark:text-gray-400">by {entry.user}</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400 italic">No historical data available for this IPO.</p>
                        )}
                    </div>
                </div>

                {/* Right Column */}
                <div className="space-y-8">
                    {/* Profile Card */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">IPO Profile</h3>
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
                            <DetailItem label="Indigenous Cultural Community" value={ipo.indigenousCulturalCommunity} />
                            <DetailItem label="Ancestral Domain No." value={ipo.ancestralDomainNo} />
                            <DetailItem label="Registering Body" value={ipo.registeringBody} half />
                            <DetailItem label="Registration Date" value={formatDate(ipo.registrationDate)} half />
                            <DetailItem label="Contact Person" value={ipo.contactPerson} half />
                            <DetailItem label="Contact Number" value={ipo.contactNumber} half />
                            <DetailItem label="Flags" value={
                                <div className="flex flex-wrap gap-2 mt-1">
                                    {ipo.isWomenLed && <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300">Women-Led</span>}
                                    {ipo.isWithinGida && <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300">Within GIDA</span>}
                                    {ipo.isWithinElcac && <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300">Within ELCAC</span>}
                                    {ipo.isWithScad && <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300">With SCAD</span>}
                                </div>
                            } />
                        </dl>
                    </div>

                     {/* Commodities Card */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Commodities & Development</h3>
                        <div className="mb-4">
                            <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Level of Development</h4>
                            <p className="text-sm font-semibold text-accent dark:text-green-400 bg-gray-100 dark:bg-gray-900/50 px-3 py-1 rounded-full inline-block">Level {ipo.levelOfDevelopment}</p>
                        </div>
                         <div>
                            <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Commodities</h4>
                            {ipo.commodities && ipo.commodities.length > 0 ? (
                                <ul className="space-y-2 text-sm">
                                    {ipo.commodities.map((c, i) => (
                                        <li key={i} className="flex justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded">
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-2">
                                                    <span>{c.particular} <span className="text-xs text-gray-400">({c.type})</span></span>
                                                    {c.isScad && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300">SCAD</span>}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 pl-1">
                                                    {(c.marketingPercentage || 0) > 0 && <span>Mktg: {c.marketingPercentage}%</span>}
                                                    {(c.foodSecurityPercentage || 0) > 0 && <span className="ml-2">FS: {c.foodSecurityPercentage}%</span>}
                                                    {(c.averageIncome || 0) > 0 && <span className="ml-2">Inc: ₱{c.averageIncome?.toLocaleString()}</span>}
                                                </div>
                                            </div>
                                            <span className="font-medium text-right">
                                                {c.value.toLocaleString()} {c.type === 'Animal Commodity' ? 'heads' : 'ha'}
                                                {c.yield ? ` | Y: ${c.yield}` : ''}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : <p className="text-sm text-gray-500 dark:text-gray-400 italic">No commodities listed.</p>}
                        </div>
                    </div>

                    {/* Membership Information Card */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Membership Information</h3>
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 text-sm">
                            <div className="flex justify-between border-b border-gray-100 dark:border-gray-700 py-2">
                                <dt className="text-gray-500 dark:text-gray-400">Total Members</dt>
                                <dd className="font-semibold text-gray-900 dark:text-white">{ipo.totalMembers || 0}</dd>
                            </div>
                            <div className="flex justify-between border-b border-gray-100 dark:border-gray-700 py-2">
                                <dt className="text-gray-500 dark:text-gray-400">Total IP Members</dt>
                                <dd className="font-semibold text-gray-900 dark:text-white">{ipo.totalIpMembers || 0}</dd>
                            </div>
                            <div className="flex justify-between border-b border-gray-100 dark:border-gray-700 py-2">
                                <dt className="text-gray-500 dark:text-gray-400">Male</dt>
                                <dd className="font-semibold text-gray-900 dark:text-white">{ipo.totalMaleMembers || 0}</dd>
                            </div>
                            <div className="flex justify-between border-b border-gray-100 dark:border-gray-700 py-2">
                                <dt className="text-gray-500 dark:text-gray-400">Female</dt>
                                <dd className="font-semibold text-gray-900 dark:text-white">{ipo.totalFemaleMembers || 0}</dd>
                            </div>
                            <div className="flex justify-between border-b border-gray-100 dark:border-gray-700 py-2">
                                <dt className="text-gray-500 dark:text-gray-400">Youth</dt>
                                <dd className="font-semibold text-gray-900 dark:text-white">{ipo.totalYouthMembers || 0}</dd>
                            </div>
                            <div className="flex justify-between border-b border-gray-100 dark:border-gray-700 py-2">
                                <dt className="text-gray-500 dark:text-gray-400">Senior Citizens</dt>
                                <dd className="font-semibold text-gray-900 dark:text-white">{ipo.totalSeniorMembers || 0}</dd>
                            </div>
                            <div className="flex justify-between border-b border-gray-100 dark:border-gray-700 py-2 sm:col-span-2">
                                <dt className="text-gray-500 dark:text-gray-400">4Ps Beneficiaries</dt>
                                <dd className="font-semibold text-gray-900 dark:text-white">{ipo.total4PsMembers || 0}</dd>
                            </div>
                        </dl>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default IPODetail;