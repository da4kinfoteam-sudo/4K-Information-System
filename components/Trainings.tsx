import React, { useState, FormEvent, useMemo } from 'react';
import { Training, IPO, philippineRegions, trainingComponents } from '../constants';
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
    participantsMale: 0,
    participantsFemale: 0,
    trainingExpenses: 0,
    component: trainingComponents[0],
};

const TrainingsComponent: React.FC<TrainingsProps> = ({ ipos, trainings, setTrainings }) => {
    const [formData, setFormData] = useState(defaultFormData);
    const [editingTraining, setEditingTraining] = useState<Training | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [trainingToDelete, setTrainingToDelete] = useState<Training | null>(null);
    const [ipoRegionFilter, setIpoRegionFilter] = useState('All');

    const [searchTerm, setSearchTerm] = useState('');
    const [tableRegionFilter, setTableRegionFilter] = useState('All');
    type SortKeys = keyof Training | 'totalParticipants';
    const [sortConfig, setSortConfig] = useState<{ key: SortKeys; direction: 'ascending' | 'descending' } | null>({ key: 'date', direction: 'descending' });

    const filteredIposForSelection = useMemo(() => {
        if (ipoRegionFilter === 'All') return ipos;
        return ipos.filter(ipo => ipo.region === ipoRegionFilter);
    }, [ipoRegionFilter, ipos]);

    const processedTrainings = useMemo(() => {
        let filteredTrainings = [...trainings];
        
        if (tableRegionFilter !== 'All') {
            const iposInRegion = new Set(ipos.filter(ipo => ipo.region === tableRegionFilter).map(ipo => ipo.name));
            filteredTrainings = filteredTrainings.filter(training =>
                training.participatingIpos.some(ipoName => iposInRegion.has(ipoName)) || (training.location === 'Online' && tableRegionFilter === 'Online')
            );
        }

        if (searchTerm) {
            const lowercasedSearchTerm = searchTerm.toLowerCase();
            filteredTrainings = filteredTrainings.filter(t =>
                t.name.toLowerCase().includes(lowercasedSearchTerm) ||
                t.location.toLowerCase().includes(lowercasedSearchTerm) ||
                t.facilitator.toLowerCase().includes(lowercasedSearchTerm) ||
                t.component.toLowerCase().includes(lowercasedSearchTerm) ||
                t.description.toLowerCase().includes(lowercasedSearchTerm)
            );
        }

        if (sortConfig !== null) {
            filteredTrainings.sort((a, b) => {
                let aValue: any;
                let bValue: any;

                if (sortConfig.key === 'totalParticipants') {
                    aValue = a.participantsMale + a.participantsFemale;
                    bValue = b.participantsMale + b.participantsFemale;
                } else {
                    aValue = a[sortConfig.key as keyof Training];
                    bValue = b[sortConfig.key as keyof Training];
                }

                if (aValue < bValue) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return filteredTrainings;
    }, [trainings, searchTerm, tableRegionFilter, sortConfig, ipos]);

    const requestSort = (key: SortKeys) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const isNumberInput = type === 'number';
        setFormData(prev => ({ 
            ...prev, 
            [name]: isNumberInput ? (value === '' ? '' : parseFloat(value)) : value 
        }));
    };
    
    const handleIpoSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedOptions = Array.from(e.target.selectedOptions, option => option.value);
        setFormData(prev => ({ ...prev, participatingIpos: selectedOptions }));
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.date || !formData.location || !formData.facilitator || !formData.component) {
            alert('Please fill out all required fields.');
            return;
        }
        
        const finalFormData = {
            ...formData,
            participantsMale: Number(formData.participantsMale) || 0,
            participantsFemale: Number(formData.participantsFemale) || 0,
            trainingExpenses: Number(formData.trainingExpenses) || 0,
        };

        if (editingTraining) {
            const updatedTraining: Training = { ...editingTraining, ...finalFormData };
            setTrainings(prev => prev.map(t => t.id === editingTraining.id ? updatedTraining : t));
        } else {
            const newTraining: Training = {
                id: trainings.length > 0 ? Math.max(...trainings.map(t => t.id)) + 1 : 1,
                ...finalFormData,
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
            participantsMale: training.participantsMale,
            participantsFemale: training.participantsFemale,
            trainingExpenses: training.trainingExpenses,
            component: training.component,
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
    
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
    }

    const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm";

    const SortableHeader: React.FC<{ sortKey: SortKeys; label: string; className?: string; }> = ({ sortKey, label, className }) => {
      const isSorted = sortConfig?.key === sortKey;
      const directionIcon = isSorted ? (sortConfig?.direction === 'ascending' ? '▲' : '▼') : '↕';
      return (
        <th scope="col" className={`px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider ${className}`}>
            <button onClick={() => requestSort(sortKey)} className="flex items-center gap-1.5 group">
              <span>{label}</span>
              <span className={`transition-opacity ${isSorted ? 'opacity-100' : 'opacity-30 group-hover:opacity-100'}`}>{directionIcon}</span>
            </button>
        </th>
      )
    }
    
    const totalParticipants = (Number(formData.participantsMale) || 0) + (Number(formData.participantsFemale) || 0);

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
                <form onSubmit={handleSubmit} className="space-y-6">
                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                        <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Core Details</legend>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div className="md:col-span-2">
                                <label htmlFor="name" className="block text-sm font-medium">Training Name</label>
                                <input type="text" name="name" id="name" value={formData.name} onChange={handleInputChange} required className={commonInputClasses} />
                            </div>
                            <div>
                                <label htmlFor="date" className="block text-sm font-medium">Date</label>
                                <input type="date" name="date" id="date" value={formData.date} onChange={handleInputChange} required className={commonInputClasses} />
                            </div>
                             <div>
                                <label htmlFor="component" className="block text-sm font-medium">Component</label>
                                <select name="component" id="component" value={formData.component} onChange={handleInputChange} required className={commonInputClasses}>
                                    {trainingComponents.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                             <div className="md:col-span-2">
                                 <label htmlFor="facilitator" className="block text-sm font-medium">Facilitator / Speaker</label>
                                <input type="text" name="facilitator" id="facilitator" value={formData.facilitator} onChange={handleInputChange} required className={commonInputClasses} />
                            </div>
                        </div>
                    </fieldset>

                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                        <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Location</legend>
                         <LocationPicker value={formData.location} onChange={(loc) => setFormData(prev => ({ ...prev, location: loc }))} required allowOnline={true} />
                    </fieldset>
                    
                     <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                        <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Participants & Budget</legend>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                             <div>
                                <label htmlFor="participantsMale" className="block text-sm font-medium">Male Participants</label>
                                <input type="number" name="participantsMale" id="participantsMale" min="0" value={formData.participantsMale} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                            <div>
                                <label htmlFor="participantsFemale" className="block text-sm font-medium">Female Participants</label>
                                <input type="number" name="participantsFemale" id="participantsFemale" min="0" value={formData.participantsFemale} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                             <div>
                                <label htmlFor="totalParticipants" className="block text-sm font-medium">Total Participants</label>
                                <input type="number" name="totalParticipants" id="totalParticipants" value={totalParticipants} disabled className={`${commonInputClasses} bg-gray-100 dark:bg-gray-800`} />
                            </div>
                             <div>
                                <label htmlFor="trainingExpenses" className="block text-sm font-medium">Training Expenses (PHP)</label>
                                <input type="number" name="trainingExpenses" id="trainingExpenses" min="0" step="0.01" value={formData.trainingExpenses} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                        </div>
                    </fieldset>

                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                        <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Description & Linked IPOs</legend>
                        <div className="space-y-4">
                             <div>
                                <label htmlFor="description" className="block text-sm font-medium">Description</label>
                                <textarea name="description" id="description" value={formData.description} onChange={handleInputChange} rows={3} className={commonInputClasses} />
                            </div>
                             <div>
                                <label htmlFor="participatingIpos" className="block text-sm font-medium">Participating IPOs</label>
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
                    </fieldset>

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

                 <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 items-center">
                    <input
                        type="text"
                        placeholder="Search by name, component, facilitator..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={`w-full md:w-1/3 ${commonInputClasses} mt-0`}
                    />
                    <div className="flex items-center gap-2">
                       <label htmlFor="tableRegionFilter" className="text-sm font-medium text-gray-700 dark:text-gray-300">Region:</label>
                        <select id="tableRegionFilter" value={tableRegionFilter} onChange={(e) => setTableRegionFilter(e.target.value)} className={`${commonInputClasses} mt-0`}>
                            <option value="All">All Regions</option>
                            <option value="Online">Online</option>
                            {philippineRegions.map(region => (
                                <option key={region} value={region}>{region}</option>
                            ))}
                        </select>
                    </div>
                 </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <SortableHeader sortKey="name" label="Name" />
                                <SortableHeader sortKey="date" label="Date" />
                                <SortableHeader sortKey="component" label="Component" />
                                <SortableHeader sortKey="totalParticipants" label="Participants" />
                                <SortableHeader sortKey="trainingExpenses" label="Expenses" />
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {processedTrainings.map((training) => (
                                <tr key={training.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className="px-6 py-4 whitespace-normal text-sm font-medium text-gray-900 dark:text-white">{training.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatDate(training.date)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{training.component}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{training.participantsMale + training.participantsFemale}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatCurrency(training.trainingExpenses)}</td>
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