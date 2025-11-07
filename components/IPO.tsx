import React, { useState, FormEvent } from 'react';
import { IPO } from '../constants';
import LocationPicker from './LocationPicker';

interface IPOsProps {
    ipos: IPO[];
    setIpos: React.Dispatch<React.SetStateAction<IPO[]>>;
}

const defaultFormData = {
    name: '',
    acronym: '',
    location: '',
    contactPerson: '',
    contactNumber: '',
    registrationDate: '',
};

const IPOs: React.FC<IPOsProps> = ({ ipos, setIpos }) => {
    const [formData, setFormData] = useState(defaultFormData);
    const [editingIpo, setEditingIpo] = useState<IPO | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [ipoToDelete, setIpoToDelete] = useState<IPO | null>(null);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.acronym || !formData.location || !formData.contactPerson || !formData.registrationDate) {
            alert('Please fill out all required fields.');
            return;
        }

        if (editingIpo) {
            const updatedIpo: IPO = { ...editingIpo, ...formData };
            setIpos(prev => prev.map(ipo => ipo.id === editingIpo.id ? updatedIpo : ipo));
        } else {
            const newIpo: IPO = {
                id: ipos.length > 0 ? Math.max(...ipos.map(ipo => ipo.id)) + 1 : 1,
                ...formData,
            };
            setIpos(prev => [newIpo, ...prev]);
        }
        handleCancelEdit();
    };

    const handleEditClick = (ipo: IPO) => {
        setEditingIpo(ipo);
        setFormData({
            name: ipo.name,
            acronym: ipo.acronym,
            location: ipo.location,
            contactPerson: ipo.contactPerson,
            contactNumber: ipo.contactNumber,
            registrationDate: ipo.registrationDate,
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingIpo(null);
        setFormData(defaultFormData);
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
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">IPO Name</label>
                            <input type="text" name="name" id="name" value={formData.name} onChange={handleInputChange} required className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm" />
                        </div>
                        <div>
                            <label htmlFor="acronym" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Acronym</label>
                            <input type="text" name="acronym" id="acronym" value={formData.acronym} onChange={handleInputChange} required className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm" />
                        </div>
                        <div className="md:col-span-2">
                            <label htmlFor="location" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Location</label>
                            <LocationPicker value={formData.location} onChange={(loc) => setFormData(prev => ({...prev, location: loc}))} required />
                        </div>
                        <div>
                            <label htmlFor="contactPerson" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Contact Person</label>
                            <input type="text" name="contactPerson" id="contactPerson" value={formData.contactPerson} onChange={handleInputChange} required className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm" />
                        </div>
                        <div>
                            <label htmlFor="contactNumber" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Contact Number</label>
                            <input type="text" name="contactNumber" id="contactNumber" value={formData.contactNumber} onChange={handleInputChange} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm" />
                        </div>
                         <div className="md:col-span-2">
                            <label htmlFor="registrationDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Registration Date</label>
                            <input type="date" name="registrationDate" id="registrationDate" value={formData.registrationDate} onChange={handleInputChange} required className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm" />
                        </div>
                    </div>
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
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Acronym</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Location</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Registered</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Contact Person</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {ipos.map((ipo) => (
                                <tr key={ipo.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{ipo.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{ipo.acronym}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{ipo.location}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatDate(ipo.registrationDate)}</td>
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