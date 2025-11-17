

import React, { useState, FormEvent, useMemo, useEffect } from 'react';
import { OtherActivity, IPO, philippineRegions, otherActivityComponents, otherActivityOptions, OtherActivityComponentType, OtherActivityExpense, objectCodes, ObjectCode } from '../constants';
import LocationPicker, { parseLocation } from './LocationPicker';

interface OtherActivitiesProps {
    ipos: IPO[];
    otherActivities: OtherActivity[];
    setOtherActivities: React.Dispatch<React.SetStateAction<OtherActivity[]>>;
    onSelectIpo: (ipo: IPO) => void;
}

const defaultFormData = {
    id: 0,
    name: '',
    date: '',
    description: '',
    location: '',
    participatingIpos: [] as string[],
    participantsMale: 0,
    participantsFemale: 0,
    component: 'Social Preparation' as OtherActivityComponentType,
    expenses: [] as OtherActivityExpense[],
};

const OtherActivitiesComponent: React.FC<OtherActivitiesProps> = ({ ipos, otherActivities, setOtherActivities, onSelectIpo }) => {
    const [formData, setFormData] = useState(defaultFormData);
    const [editingActivity, setEditingActivity] = useState<OtherActivity | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [activityToDelete, setActivityToDelete] = useState<OtherActivity | null>(null);
    const [ipoRegionFilter, setIpoRegionFilter] = useState('All');
    const [activeTab, setActiveTab] = useState<'details' | 'budget'>('details');

    const [searchTerm, setSearchTerm] = useState('');
    const [tableRegionFilter, setTableRegionFilter] = useState('All');
    const [componentFilter, setComponentFilter] = useState<OtherActivityComponentType | 'All'>('All');
    type SortKeys = keyof OtherActivity | 'totalParticipants' | 'budget';
    const [sortConfig, setSortConfig] = useState<{ key: SortKeys; direction: 'ascending' | 'descending' } | null>({ key: 'date', direction: 'descending' });
    const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
    const [view, setView] = useState<'list' | 'add' | 'edit'>('list');
    
    const [currentExpense, setCurrentExpense] = useState({
        objectCode: objectCodes[0],
        obligationMonth: '',
        disbursementMonth: '',
        amount: ''
    });


    useEffect(() => {
        if (editingActivity) {
            setFormData({
                ...defaultFormData,
                ...editingActivity,
                participantsMale: Number(editingActivity.participantsMale) || 0,
                participantsFemale: Number(editingActivity.participantsFemale) || 0,
            });
             setActiveTab('details');
        } else {
            setFormData(defaultFormData);
        }
    }, [editingActivity]);
    
    // Reset activity name when component changes in the form
    useEffect(() => {
        if (view !== 'edit') {
            setFormData(prev => ({...prev, name: ''}));
        }
    }, [formData.component, view]);

    const filteredIposForSelection = useMemo(() => {
        const filtered = ipoRegionFilter === 'All' ? ipos : ipos.filter(ipo => ipo.region === ipoRegionFilter);
        return filtered.sort((a,b) => a.name.localeCompare(b.name));
    }, [ipoRegionFilter, ipos]);

    const processedActivities = useMemo(() => {
        let filtered = [...otherActivities];

        if (tableRegionFilter !== 'All') {
            const iposInRegion = new Set(ipos.filter(ipo => ipo.region === tableRegionFilter).map(ipo => ipo.name));
            filtered = filtered.filter(activity =>
                activity.participatingIpos.some(ipoName => iposInRegion.has(ipoName)) || (activity.location === 'Online' && tableRegionFilter === 'Online')
            );
        }
        
        if (componentFilter !== 'All') {
            filtered = filtered.filter(activity => activity.component === componentFilter);
        }

        if (searchTerm) {
            const lowercasedSearchTerm = searchTerm.toLowerCase();
            filtered = filtered.filter(t =>
                t.name.toLowerCase().includes(lowercasedSearchTerm) ||
                t.location.toLowerCase().includes(lowercasedSearchTerm) ||
                t.description.toLowerCase().includes(lowercasedSearchTerm)
            );
        }

        if (sortConfig !== null) {
            filtered.sort((a, b) => {
                let aValue: any;
                let bValue: any;

                if (sortConfig.key === 'totalParticipants') {
                    aValue = a.participantsMale + a.participantsFemale;
                    bValue = b.participantsMale + b.participantsFemale;
                } else if (sortConfig.key === 'budget') {
                    aValue = a.expenses.reduce((sum, e) => sum + e.amount, 0);
                    bValue = b.expenses.reduce((sum, e) => sum + e.amount, 0);
                }
                else {
                    aValue = a[sortConfig.key as keyof OtherActivity];
                    bValue = b[sortConfig.key as keyof OtherActivity];
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
        return filtered;
    }, [otherActivities, searchTerm, componentFilter, sortConfig, tableRegionFilter, ipos]);

    const requestSort = (key: SortKeys) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };
    
    const handleToggleRow = (activityId: number) => {
        setExpandedRowId(prevId => (prevId === activityId ? null : activityId));
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.currentTarget;
        const isNumberInput = 'type' in e.currentTarget && e.currentTarget.type === 'number';

        setFormData(prev => ({ 
            ...prev, 
            [name]: isNumberInput ? (value === '' ? '' : parseFloat(value)) : value 
        }));
    };
    
    const handleIpoSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedOptions = Array.from(e.target.selectedOptions, option => option.value);
        setFormData(prev => ({ ...prev, participatingIpos: selectedOptions }));
    };

    const handleExpenseChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setCurrentExpense(prev => ({...prev, [name]: value}));
    };
    
    const handleAddExpense = () => {
        if (!currentExpense.amount || !currentExpense.obligationMonth || !currentExpense.disbursementMonth) {
            alert('Please fill out all expense fields.');
            return;
        }
        const newExpense: OtherActivityExpense = {
            id: Date.now(),
            objectCode: currentExpense.objectCode,
            obligationMonth: currentExpense.obligationMonth,
            disbursementMonth: currentExpense.disbursementMonth,
            amount: parseFloat(currentExpense.amount)
        };
        setFormData(prev => ({...prev, expenses: [...prev.expenses, newExpense]}));
        setCurrentExpense({
            objectCode: objectCodes[0],
            obligationMonth: '',
            disbursementMonth: '',
            amount: ''
        });
    };

    const handleRemoveExpense = (id: number) => {
        setFormData(prev => ({ ...prev, expenses: prev.expenses.filter(exp => exp.id !== id) }));
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.date || !formData.location) {
            alert('Please fill out all required fields on the Activity Details tab.');
            return;
        }
        
        const showParticipants = formData.name !== 'Sub-Project Monitoring';
        const showIpos = formData.component !== 'Program Management' || formData.name === 'Sub-Project Monitoring';
        
        const finalFormData = {
            ...formData,
            participantsMale: showParticipants ? Number(formData.participantsMale) || 0 : 0,
            participantsFemale: showParticipants ? Number(formData.participantsFemale) || 0 : 0,
            participatingIpos: showIpos ? formData.participatingIpos : [],
        };

        if (editingActivity) {
            const updatedActivity: OtherActivity = { ...editingActivity, ...finalFormData };
            setOtherActivities(prev => prev.map(t => t.id === editingActivity.id ? updatedActivity : t));
        } else {
            const newActivity: OtherActivity = {
                ...finalFormData,
                id: otherActivities.length > 0 ? Math.max(...otherActivities.map(t => t.id)) + 1 : 1,
            };
            setOtherActivities(prev => [newActivity, ...prev]);
        }
        handleCancelEdit();
    };

    const handleEditClick = (activity: OtherActivity) => {
        setEditingActivity(activity);
        setView('edit');
    };
    
    const handleAddNewClick = () => {
        setEditingActivity(null);
        setView('add');
    };

    const handleCancelEdit = () => {
        setEditingActivity(null);
        setFormData(defaultFormData);
        setActiveTab('details');
        setView('list');
    };

    const handleDeleteClick = (activity: OtherActivity) => {
        setActivityToDelete(activity);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = () => {
        if (activityToDelete) {
            setOtherActivities(prev => prev.filter(p => p.id !== activityToDelete.id));
            setIsDeleteModalOpen(false);
            setActivityToDelete(null);
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

    const totalBudget = useMemo(() => {
        return formData.expenses.reduce((sum, exp) => sum + exp.amount, 0);
    }, [formData.expenses]);
    
    const TabButton: React.FC<{ tabName: typeof activeTab; label: string; }> = ({ tabName, label }) => {
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
    }

    const renderListView = () => (
        <>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Other Activities</h2>
                <button
                    onClick={handleAddNewClick}
                    className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent"
                >
                    + Add New Activity
                </button>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                 <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 items-center">
                    <input
                        type="text"
                        placeholder="Search activities..."
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
                    <div className="flex items-center gap-2">
                       <label htmlFor="componentFilter" className="text-sm font-medium text-gray-700 dark:text-gray-300">Component:</label>
                        <select id="componentFilter" value={componentFilter} onChange={(e) => setComponentFilter(e.target.value as any)} className={`${commonInputClasses} mt-0`}>
                            <option value="All">All Components</option>
                            {otherActivityComponents.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                 </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th scope="col" className="w-12 px-4 py-3"></th>
                                <SortableHeader sortKey="name" label="Name of Activity" />
                                <SortableHeader sortKey="date" label="Date" />
                                <SortableHeader sortKey="component" label="Component" />
                                <SortableHeader sortKey="budget" label="Budget" />
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {processedActivities.map((activity) => {
                                const totalActivityBudget = activity.expenses.reduce((sum, e) => sum + e.amount, 0);
                                return (
                                <React.Fragment key={activity.id}>
                                    <tr onClick={() => handleToggleRow(activity.id)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="px-4 py-4 text-gray-400">
                                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-200 ${expandedRowId === activity.id ? 'transform rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </td>
                                        <td className="px-6 py-4 whitespace-normal text-sm font-medium text-gray-900 dark:text-white">{activity.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatDate(activity.date)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{activity.component}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatCurrency(totalActivityBudget)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button onClick={(e) => { e.stopPropagation(); handleEditClick(activity); }} className="text-accent hover:brightness-90 dark:text-green-400 dark:hover:text-green-300 mr-4">Edit</button>
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(activity); }} className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200">Delete</button>
                                        </td>
                                    </tr>
                                     {expandedRowId === activity.id && (
                                        <tr className="bg-gray-50 dark:bg-gray-900/50">
                                            <td colSpan={6} className="p-4">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div className="space-y-4">
                                                        <div>
                                                            <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Description</h4>
                                                            <p className="text-sm text-gray-600 dark:text-gray-300">{activity.description || 'No description provided.'}</p>
                                                        </div>
                                                         {activity.name !== 'Sub-Project Monitoring' && (
                                                            <div>
                                                                <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Participants</h4>
                                                                <p className="text-sm text-gray-600 dark:text-gray-300">{activity.participantsMale + activity.participantsFemale} Total ({activity.participantsMale} Male, {activity.participantsFemale} Female)</p>
                                                            </div>
                                                        )}
                                                        <div>
                                                            <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Participating IPOs</h4>
                                                            {activity.participatingIpos.length > 0 ? (
                                                                <div className="flex flex-wrap gap-2">
                                                                    {activity.participatingIpos.map(ipoName => {
                                                                        const ipo = ipos.find(i => i.name === ipoName);
                                                                        return (
                                                                            <button
                                                                                key={ipoName}
                                                                                onClick={(e) => { e.stopPropagation(); if (ipo) onSelectIpo(ipo); }}
                                                                                className="bg-gray-200 dark:bg-gray-700 rounded-full px-3 py-1 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
                                                                            >
                                                                                {ipoName}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            ) : (
                                                                <p className="text-sm text-gray-500 dark:text-gray-400 italic">No participating IPOs for this activity.</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="space-y-4 text-sm bg-gray-100 dark:bg-gray-800/50 p-4 rounded-lg">
                                                        <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Budget Breakdown</h4>
                                                        {activity.expenses.length > 0 ? (
                                                             <ul className="space-y-1">
                                                                {activity.expenses.map(exp => (
                                                                    <li key={exp.id} className="flex justify-between items-center p-1">
                                                                        <span>{exp.objectCode} ({formatDate(exp.obligationMonth)})</span>
                                                                        <span className="font-medium">{formatCurrency(exp.amount)}</span>
                                                                    </li>
                                                                ))}
                                                                <li className="flex justify-between items-center p-1 border-t border-gray-300 dark:border-gray-600 mt-1 pt-1 font-bold">
                                                                    <span>Total</span>
                                                                    <span>{formatCurrency(totalActivityBudget)}</span>
                                                                </li>
                                                            </ul>
                                                        ) : (
                                                             <p className="text-sm text-gray-500 dark:text-gray-400 italic">No budget items listed.</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            )})}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );

    const renderFormView = () => {
        const showParticipants = formData.name !== 'Sub-Project Monitoring';
        const showIpos = formData.component !== 'Program Management' || formData.name === 'Sub-Project Monitoring';

        return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-semibold text-gray-800 dark:text-white">{view === 'edit' ? 'Edit Activity' : 'Add New Activity'}</h3>
                 <button onClick={handleCancelEdit} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    Back to List
                </button>
            </div>
            <form onSubmit={handleSubmit}>
                <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                    <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                        <TabButton tabName="details" label="Activity Details" />
                        <TabButton tabName="budget" label="Budget" />
                    </nav>
                </div>
                <div className="min-h-[400px]">
                    {activeTab === 'details' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                 <div>
                                    <label htmlFor="component" className="block text-sm font-medium text-gray-700 dark:text-gray-300">1. Select Activity Component</label>
                                    <select name="component" id="component" value={formData.component} onChange={handleInputChange} required className={commonInputClasses}>
                                        {otherActivityComponents.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">2. Select Activity Name</label>
                                    <select name="name" id="name" value={formData.name} onChange={handleInputChange} required className={commonInputClasses}>
                                        <option value="">--Select an activity--</option>
                                        {otherActivityOptions[formData.component].map(name => <option key={name} value={name}>{name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Core Details</legend>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor="date" className="block text-sm font-medium">Date</label>
                                        <input type="date" name="date" id="date" value={formData.date} onChange={handleInputChange} required className={commonInputClasses} />
                                    </div>
                                    <div className="md:col-span-2">
                                         <label className="block text-sm font-medium">Location</label>
                                        <LocationPicker value={formData.location} onChange={(loc) => setFormData(prev => ({ ...prev, location: loc }))} required allowOnline={true} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label htmlFor="description" className="block text-sm font-medium">Description / Objective</label>
                                        <textarea name="description" id="description" value={formData.description} onChange={handleInputChange} rows={3} className={commonInputClasses} />
                                    </div>
                                </div>
                            </fieldset>
                            
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {showParticipants && (
                                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                        <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Participants</legend>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                                             <div>
                                                <label htmlFor="participantsMale" className="block text-sm font-medium">Male</label>
                                                <input type="number" name="participantsMale" id="participantsMale" min="0" value={formData.participantsMale} onChange={handleInputChange} className={commonInputClasses} />
                                            </div>
                                            <div>
                                                <label htmlFor="participantsFemale" className="block text-sm font-medium">Female</label>
                                                <input type="number" name="participantsFemale" id="participantsFemale" min="0" value={formData.participantsFemale} onChange={handleInputChange} className={commonInputClasses} />
                                            </div>
                                        </div>
                                    </fieldset>
                                )}
                                 {showIpos ? (
                                    <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                        <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Linked IPOs</legend>
                                        <div className="flex items-center gap-4 mb-2">
                                            <span className="text-sm text-gray-500 dark:text-gray-400">Filter:</span>
                                            <select 
                                                value={ipoRegionFilter} 
                                                onChange={(e) => setIpoRegionFilter(e.target.value)}
                                                className="block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
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
                                            className="block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm h-32"
                                        >
                                            {filteredIposForSelection.map(ipo => (
                                                <option key={ipo.id} value={ipo.name}>{`${ipo.name} (${parseLocation(ipo.location).province})`}</option>
                                            ))}
                                        </select>
                                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Hold Ctrl (or Cmd) to select multiple.</p>
                                    </fieldset>
                                ) : (
                                    <div className="border border-dashed border-gray-300 dark:border-gray-600 p-4 rounded-md flex items-center justify-center h-full">
                                        <p className="text-sm text-center text-gray-500 dark:text-gray-400">IPOs are not applicable for this activity.</p>
                                    </div>
                                )}
                            </div>

                        </div>
                    )}
                     {activeTab === 'budget' && (
                         <div className="space-y-6">
                            <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Expense Items</legend>
                                <div className="space-y-2 mb-4">
                                    {formData.expenses.length === 0 && <p className="text-sm text-center py-4 text-gray-500 dark:text-gray-400">No expense items added yet.</p>}
                                    {formData.expenses.map((exp) => (
                                        <div key={exp.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 p-2 rounded-md">
                                            <div className="text-sm flex-grow">
                                                <span className="font-semibold">{exp.objectCode}</span>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">Obligation: {formatDate(exp.obligationMonth)} | Disbursement: {formatDate(exp.disbursementMonth)}</div>
                                            </div>
                                            <div className="flex items-center gap-4 ml-4">
                                                <span className="font-semibold text-sm">{formatCurrency(exp.amount)}</span>
                                                <button type="button" onClick={() => handleRemoveExpense(exp.id)} className="text-gray-400 hover:text-red-500">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-end p-4 border-t border-gray-200 dark:border-gray-700">
                                     <div>
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Object Code</label>
                                        <select name="objectCode" value={currentExpense.objectCode} onChange={handleExpenseChange} className={`${commonInputClasses} py-1.5 text-sm`}>
                                            {objectCodes.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Obligation Month</label>
                                        <input type="date" name="obligationMonth" value={currentExpense.obligationMonth} onChange={handleExpenseChange} className={`${commonInputClasses} py-1.5 text-sm`} />
                                    </div>
                                     <div>
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Disbursement Month</label>
                                        <input type="date" name="disbursementMonth" value={currentExpense.disbursementMonth} onChange={handleExpenseChange} className={`${commonInputClasses} py-1.5 text-sm`} />
                                    </div>
                                    <div className="flex items-end gap-2">
                                        <div className="flex-1">
                                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Amount (PHP)</label>
                                            <input type="number" name="amount" value={currentExpense.amount} onChange={handleExpenseChange} min="0" step="0.01" className={`${commonInputClasses} py-1.5 text-sm`} />
                                        </div>
                                        <button type="button" onClick={handleAddExpense} className="h-9 w-9 flex-shrink-0 inline-flex items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50 text-accent dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900">+</button>
                                    </div>
                                </div>
                            </fieldset>
                         </div>
                    )}
                </div>

                <div className="flex justify-between items-center pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
                     <div className="text-lg font-bold">
                        Total Budget: <span className="text-accent dark:text-green-400">{formatCurrency(totalBudget)}</span>
                    </div>
                    <div className="flex gap-4">
                        <button type="button" onClick={handleCancelEdit} className="inline-flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                            Cancel
                        </button>
                        <button type="submit" className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent">
                            {editingActivity ? 'Update Activity' : 'Add Activity'}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    )};

    return (
        <div>
            {isDeleteModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl">
                        <h3 className="text-lg font-bold">Confirm Deletion</h3>
                        <p className="my-4">Are you sure you want to delete the activity "{activityToDelete?.name}"? This action cannot be undone.</p>
                        <div className="flex justify-end gap-4">
                            <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
                            <button onClick={confirmDelete} className="px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {view === 'list' ? renderListView() : renderFormView()}
        </div>
    );
};

export default OtherActivitiesComponent;
