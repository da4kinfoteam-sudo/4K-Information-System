import React, { useState, FormEvent, useMemo } from 'react';
import { Training, IPO, philippineRegions } from '../constants';
import LocationPicker from './LocationPicker';

interface TrainingsProps {
    ipos: IPO[];
    trainings: Training[];
    setTrainings: React.Dispatch<React.SetStateAction<Training[]>>;
}

const defaultFormData = {
    name: '',
    date: '',
    description: '',
    location: '',
    facilitator: '',
    participatingIpos: [] as string[],
};

const TrainingsComponent: React.FC<TrainingsProps> = ({ ipos, trainings, setTrainings }) => {
    const [formData, setFormData] = useState(defaultFormData);
    const [editingTraining, setEditingTraining] = useState<Training | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [trainingToDelete, setTrainingToDelete] = useState<Training | null>(null);
    const [ipoRegionFilter, setIpoRegionFilter] = useState('All');

    const filteredIposForSelection = useMemo(() => {
        if (ipoRegionFilter === 'All') return ipos;
        return ipos.filter(ipo => ipo.region === ipoRegionFilter);
    }, [ipoRegionFilter, ipos]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    
    const handleIpoSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedOptions = Array.from(e.target.selectedOptions, option => option.value);
        setFormData(prev => ({ ...prev, participatingIpos: selectedOptions }));
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.date || !formData.location || !formData.facilitator) {
            alert('Please fill out all required fields.');
            return;
        }

        if (editingTraining) {
            const updatedTraining: Training = { ...editingTraining, ...formData };
            setTrainings(prev => prev.map(t => t.id === editingTraining.id ? updatedTraining : t));
        } else {
            const newTraining: Training = {
                id: trainings.length > 0 ? Math.max(...trainings.map(t => t.id)) + 1 : 1,
                ...formData,
            };
            setTrainings(prev => [newTraining, ...prev]);
        }
        handleCancelEdit();
    };

    const handleEditClick = (training: Training) => {
        setEditingTraining(training);
        setFormData({
            name: training.name,
            date: training.date,
            description: training.description,
            location: training.location,
            facilitator: training.facilitator,
            participatingIpos: training.participatingIpos,
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingTraining(null);
        setFormData(defaultFormData);
    };

    const handleDeleteClick = (training: Training) => {
        setTrainingToDelete(training);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = () => {
        if (trainingToDelete) {
            setTrainings(prev => prev.filter(p => p.id !== trainingToDelete.id));
            setIsDeleteModalOpen(false);
            setTrainingToDelete(null);
        }
    };
    
    const formatDate = (dateString?: string) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    return (
        <div>
            <h2 className="text-3xl font-bold mb-6 text-gray-800 dark:text-white">Trainings Management</h2>

            {isDeleteModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl">
                        <h3 className="text-lg font-bold">Confirm Deletion</h3>
                        <p className="my-4">Are you sure you want to delete the training "{trainingToDelete?.name}"? This action cannot be undone.</p>
                        <div className="flex justify-end gap-4">
                            <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
                            <button onClick={confirmDelete} className="px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Form Section */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
                <h3 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">{editingTraining ? 'Edit Training' : 'Add New Training'}</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Training Name</label>
                            <input type="text" name="name" id="name" value={formData.name} onChange={handleInputChange} required className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm" />
                        </div>
                        <div>
                            <label htmlFor="date" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Date</label>
                            <input type="date" name="date" id="date" value={formData.date} onChange={handleInputChange} required className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm" />
                        </div>
                         <div className="md:col-span-2">
                             <label htmlFor="facilitator" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Facilitator / Speaker</label>
                            <input type="text" name="facilitator" id="facilitator" value={formData.facilitator} onChange={handleInputChange} required className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm" />
                        </div>
                        <div className="md:col-span-2">
                            <label htmlFor="location" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Location</label>
                            <LocationPicker value={formData.location} onChange={(loc) => setFormData(prev => ({ ...prev, location: loc }))} required />
                        </div>
                         <div className="md:col-span-2">
                            <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                            <textarea name="description" id="description" value={formData.description} onChange={handleInputChange} rows={3} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm" />
                        </div>
                         <div className="md:col-span-2">
                            <label htmlFor="participatingIpos" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Participating IPOs</label>
                            <div className="flex items-center gap-4 mt-1">
                                <span className="text-sm text-gray-500 dark:text-gray-400">Filter by:</span>
                                 <select 
                                     value={ipoRegionFilter} 
                                     onChange={(e) => setIpoRegionFilter(e.target.value)}
                                     className="block w-full md:w-1/3 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
                                 >
                                    <option value="All">All Regions</option>
                                    {philippineRegions.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>
                             <select
                                multiple
                                name="participatingIpos"
                                id="participatingIpos"
                                value={formData.participatingIpos}
                                onChange={handleIpoSelectChange}
                                className="mt-2 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm h-32"
                            >
                                {filteredIposForSelection.map(ipo => (
                                    <option key={ipo.id} value={ipo.name}>{ipo.name} ({ipo.acronym})</option>
                                ))}
                            </select>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Hold Ctrl (or Cmd on Mac) to select multiple organizations.</p>
                        </div>
                    </div>
                    <div className="flex justify-end gap-4 pt-2">
                        {editingTraining && (
                            <button type="button" onClick={handleCancelEdit} className="inline-flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                                Cancel
                            </button>
                        )}
                        <button type="submit" className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent">
                            {editingTraining ? 'Update Training' : 'Add Training'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Table Section */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                <h3 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">Trainings List</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Name</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Location</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Participating IPOs</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {trainings.map((training) => (
                                <tr key={training.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className="px-6 py-4 whitespace-normal text-sm font-medium text-gray-900 dark:text-white">{training.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatDate(training.date)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{training.location}</td>
                                    <td className="px-6 py-4 whitespace-normal text-sm text-gray-500 dark:text-gray-300">
                                        {training.participatingIpos.map(ipoName => (
                                            <span key={ipoName} className="inline-block bg-gray-200 dark:bg-gray-700 rounded-full px-2 py-1 text-xs font-semibold text-gray-700 dark:text-gray-200 mr-1 mb-1">
                                                {ipoName}
                                            </span>
                                        ))}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button onClick={() => handleEditClick(training)} className="text-accent hover:brightness-90 dark:text-green-400 dark:hover:text-green-300 mr-4">Edit</button>
                                        <button onClick={() => handleDeleteClick(training)} className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200">Delete</button>
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

export default TrainingsComponent;