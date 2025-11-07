import React, { useState, FormEvent, useEffect } from 'react';
import { IPO } from '../constants';
import LocationPicker, { parseLocation } from './LocationPicker';

interface IPOsProps {
    ipos: IPO[];
    setIpos: React.Dispatch<React.SetStateAction<IPO[]>>;
}

const defaultFormData = {
    name: '',
    acronym: '',
    location: '',
    region: '',
    indigenousCulturalCommunity: '',
    ancestralDomainNo: '',
    registeringBody: 'SEC',
    contactPerson: '',
    contactNumber: '',
    registrationDate: '',
    isWomenLed: false,
    isWithinGida: false,
};

const registeringBodyOptions = ['SEC', 'DOLE', 'CDA'];

const IPOs: React.FC<IPOsProps> = ({ ipos, setIpos }) => {
    const [formData, setFormData] = useState(defaultFormData);
    const [otherRegisteringBody, setOtherRegisteringBody] = useState('');
    const [editingIpo, setEditingIpo] = useState<IPO | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [ipoToDelete, setIpoToDelete] = useState<IPO | null>(null);

    const isOtherRegisteringBody = !registeringBodyOptions.includes(formData.registeringBody);

    useEffect(() => {
        if (editingIpo) {
             setFormData({
                name: editingIpo.name,
                acronym: editingIpo.acronym,
                location: editingIpo.location,
                region: editingIpo.region,
                indigenousCulturalCommunity: editingIpo.indigenousCulturalCommunity,
                ancestralDomainNo: editingIpo.ancestralDomainNo,
                registeringBody: registeringBodyOptions.includes(editingIpo.registeringBody) ? editingIpo.registeringBody : 'Others',
                contactPerson: editingIpo.contactPerson,
                contactNumber: editingIpo.contactNumber,
                registrationDate: editingIpo.registrationDate,
                isWomenLed: editingIpo.isWomenLed,
                isWithinGida: editingIpo.isWithinGida,
            });
            if (!registeringBodyOptions.includes(editingIpo.registeringBody)) {
                setOtherRegisteringBody(editingIpo.registeringBody);
            } else {
                setOtherRegisteringBody('');
            }
        }
    }, [editingIpo]);


    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        
        if (type === 'checkbox') {
            const { checked } = e.target as HTMLInputElement;
            setFormData(prev => ({ ...prev, [name]: checked }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleLocationChange = (locationString: string) => {
        const parsed = parseLocation(locationString);
        setFormData(prev => ({
            ...prev,
            location: locationString,
            region: parsed.region,
        }));
    };
    

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        const finalRegisteringBody = formData.registeringBody === 'Others' ? otherRegisteringBody : formData.registeringBody;
        
        if (!formData.name || !formData.acronym || !formData.location || !finalRegisteringBody || !formData.registrationDate) {
            alert('Please fill out all required fields: Name, Acronym, Location, Registering Body, and Registration Date.');
            return;
        }
        
        const submissionData = { ...formData, registeringBody: finalRegisteringBody };

        if (editingIpo) {
            const updatedIpo: IPO = { ...editingIpo, ...submissionData };
            setIpos(prev => prev.map(ipo => ipo.id === editingIpo.id ? updatedIpo : ipo));
        } else {
            const newIpo: IPO = {
                id: ipos.length > 0 ? Math.max(...ipos.map(ipo => ipo.id)) + 1 : 1,
                ...submissionData,
            };
            setIpos(prev => [newIpo, ...prev]);
        }
        handleCancelEdit();
    };

    const handleEditClick = (ipo: IPO) => {
        setEditingIpo(ipo);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingIpo(null);
        setFormData(defaultFormData);
        setOtherRegisteringBody('');
    };

    const handleDeleteClick = (ipo: IPO) => {
        setIpoToDelete(ipo);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = () => {
        if (ipoToDelete) {
            setIpos(prev => prev.filter(p => p.id !== ipoToDelete.id));
            setIsDeleteModalOpen(false);
            setIpoToDelete(null);
        }
    };
    
    const formatDate = (dateString?: string) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm";

    return (
        <div>
            <h2 className="text-3xl font-bold mb-6 text-gray-800 dark:text-white">IPO Management</h2>

            {isDeleteModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl">
                        <h3 className="text-lg font-bold">Confirm Deletion</h3>
                        <p className="my-4">Are you sure you want to delete "{ipoToDelete?.name}"? This action cannot be undone.</p>
                        <div className="flex justify-end gap-4">
                            <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
                            <button onClick={confirmDelete} className="px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Form Section */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
                <h3 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">{editingIpo ? 'Edit IPO' : 'Add New IPO'}</h3>
                <form onSubmit={handleSubmit} className="space-y-6">
                    
                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                        <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">IPO Profile</legend>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div className="md:col-span-2">
                                <label htmlFor="name" className="block text-sm font-medium">IPO Name</label>
                                <input type="text" name="name" id="name" value={formData.name} onChange={handleInputChange} required className={commonInputClasses} />
                            </div>
                            <div>
                                <label htmlFor="acronym" className="block text-sm font-medium">Acronym</label>
                                <input type="text" name="acronym" id="acronym" value={formData.acronym} onChange={handleInputChange} required className={commonInputClasses} />
                            </div>
                             <div>
                                <label htmlFor="indigenousCulturalCommunity" className="block text-sm font-medium">Indigenous Cultural Community (ICC)</label>
                                <input type="text" name="indigenousCulturalCommunity" id="indigenousCulturalCommunity" value={formData.indigenousCulturalCommunity} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                        </div>
                    </fieldset>
                    
                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                         <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Location & Domain</legend>
                         <div className="space-y-4">
                            <div>
                                <label htmlFor="location" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">IPO Location</label>
                                <LocationPicker 
                                    value={formData.location} 
                                    onChange={handleLocationChange}
                                    required 
                                />
                            </div>
                            <div>
                                <label htmlFor="ancestralDomainNo" className="block text-sm font-medium">Ancestral Domain No.</label>
                                <input type="text" name="ancestralDomainNo" id="ancestralDomainNo" value={formData.ancestralDomainNo} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                         </div>
                    </fieldset>
                    
                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                         <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Registration & Classification</legend>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                              <div>
                                <label htmlFor="registeringBody" className="block text-sm font-medium">Registering Body</label>
                                <select name="registeringBody" id="registeringBody" value={formData.registeringBody} onChange={handleInputChange} required className={commonInputClasses}>
                                    {registeringBodyOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    <option value="Others">Others</option>
                                </select>
                             </div>
                             {formData.registeringBody === 'Others' && (
                                <div>
                                    <label htmlFor="otherRegisteringBody" className="block text-sm font-medium">Please Specify</label>
                                    <input type="text" name="otherRegisteringBody" id="otherRegisteringBody" value={otherRegisteringBody} onChange={(e) => setOtherRegisteringBody(e.target.value)} required className={commonInputClasses} />
                                </div>
                             )}
                              <div className={formData.registeringBody === 'Others' ? '' : 'md:col-start-2'}>
                                <label htmlFor="registrationDate" className="block text-sm font-medium">Registration Date</label>
                                <input type="date" name="registrationDate" id="registrationDate" value={formData.registrationDate} onChange={handleInputChange} required className={commonInputClasses} />
                            </div>
                            <div className="md:col-span-2 flex items-center space-x-8 pt-2">
                                 <label htmlFor="isWomenLed" className="flex items-center gap-2 text-sm font-medium">
                                    <input type="checkbox" name="isWomenLed" id="isWomenLed" checked={formData.isWomenLed} onChange={handleInputChange} className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent" />
                                    <span>Women-led</span>
                                </label>
                                <label htmlFor="isWithinGida" className="flex items-center gap-2 text-sm font-medium">
                                    <input type="checkbox" name="isWithinGida" id="isWithinGida" checked={formData.isWithinGida} onChange={handleInputChange} className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent" />
                                    <span>Within GIDA area</span>
                                </label>
                            </div>
                         </div>
                    </fieldset>
                    
                     <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                         <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Contact Information</legend>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div>
                                <label htmlFor="contactPerson" className="block text-sm font-medium">Contact Person</label>
                                <input type="text" name="contactPerson" id="contactPerson" value={formData.contactPerson} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                            <div>
                                <label htmlFor="contactNumber" className="block text-sm font-medium">Contact Number</label>
                                <input type="text" name="contactNumber" id="contactNumber" value={formData.contactNumber} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                        </div>
                    </fieldset>


                    <div className="flex justify-end gap-4 pt-2">
                        {editingIpo && (
                            <button type="button" onClick={handleCancelEdit} className="inline-flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                                Cancel
                            </button>
                        )}
                        <button type="submit" className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent">
                            {editingIpo ? 'Update IPO' : 'Add IPO'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Table Section */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                <h3 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">IPO List</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Name</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Region</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Registered</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Registering Body</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Contact Person</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {ipos.map((ipo) => (
                                <tr key={ipo.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                        <div>{ipo.name}</div>
                                        <div className="text-xs text-gray-400">{ipo.acronym}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{ipo.region}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatDate(ipo.registrationDate)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{ipo.registeringBody}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                                        <div>{ipo.contactPerson}</div>
                                        <div className="text-xs text-gray-400">{ipo.contactNumber}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button onClick={() => handleEditClick(ipo)} className="text-accent hover:brightness-90 dark:text-green-400 dark:hover:text-green-300 mr-4">Edit</button>
                                        <button onClick={() => handleDeleteClick(ipo)} className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200">Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default IPOs;