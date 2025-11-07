
import React, { useState, FormEvent, useMemo, useEffect } from 'react';
import { Subproject, SubprojectDetail, IPO, philippineRegions, particularTypes } from '../constants';
import LocationPicker from './LocationPicker';

type SubprojectDetailInput = Omit<SubprojectDetail, 'id'>;

interface SubprojectsProps {
    ipos: IPO[];
    subprojects: Subproject[];
    setSubprojects: React.Dispatch<React.SetStateAction<Subproject[]>>;
    onSelectIpo: (ipo: IPO) => void;
}

const Subprojects: React.FC<SubprojectsProps> = ({ ipos, subprojects, setSubprojects, onSelectIpo }) => {
    const [detailItems, setDetailItems] = useState<SubprojectDetailInput[]>([]);
    const [currentDetail, setCurrentDetail] = useState({
        type: '',
        particulars: '',
        deliveryDate: '',
        unitOfMeasure: 'pcs' as SubprojectDetail['unitOfMeasure'],
        pricePerUnit: '',
        numberOfUnits: '',
    });
    const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
    const [editingSubproject, setEditingSubproject] = useState<Subproject | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [projectToDelete, setProjectToDelete] = useState<Subproject | null>(null);

    const [selectedRegion, setSelectedRegion] = useState('');
    const [ipoSearch, setIpoSearch] = useState('');

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [packageFilter, setPackageFilter] = useState('All');
    type SortKeys = keyof Subproject | 'budget';
    const [sortConfig, setSortConfig] = useState<{ key: SortKeys; direction: 'ascending' | 'descending' } | null>({ key: 'startDate', direction: 'descending' });
    const [activeTab, setActiveTab] = useState<'info' | 'timeline' | 'budget'>('info');


    const defaultFormData = useMemo(() => ({
        name: '',
        location: '',
        indigenousPeopleOrganization: '',
        status: 'Proposed' as Subproject['status'],
        packageType: 'Package 1' as Subproject['packageType'],
        startDate: '',
        estimatedCompletionDate: '',
        actualCompletionDate: '',
        remarks: '',
        lat: 0,
        lng: 0,
    }), []);

    const [formData, setFormData] = useState(defaultFormData);

     useEffect(() => {
        if (editingSubproject) {
            setFormData({
                name: editingSubproject.name,
                location: editingSubproject.location,
                indigenousPeopleOrganization: editingSubproject.indigenousPeopleOrganization,
                status: editingSubproject.status,
                packageType: editingSubproject.packageType,
                startDate: editingSubproject.startDate,
                estimatedCompletionDate: editingSubproject.estimatedCompletionDate,
                actualCompletionDate: editingSubproject.actualCompletionDate || '',
                remarks: editingSubproject.remarks || '',
                lat: editingSubproject.lat,
                lng: editingSubproject.lng,
            });
            setDetailItems(editingSubproject.details.map(({ id, ...rest }) => rest));

            const projectIpo = ipos.find(i => i.name === editingSubproject.indigenousPeopleOrganization);
            if (projectIpo) {
                setSelectedRegion(projectIpo.region);
                setIpoSearch(projectIpo.name);
            }
        } else {
             setFormData(defaultFormData);
        }
    }, [editingSubproject, ipos, defaultFormData]);

    const totalBudgetForNewProject = useMemo(() => {
        return detailItems.reduce((acc, item) => acc + (Number(item.pricePerUnit) * Number(item.numberOfUnits)), 0);
    }, [detailItems]);

    const filteredIpos = useMemo(() => {
        if (!selectedRegion) return [];
        return ipos.filter(ipo => ipo.region === selectedRegion);
    }, [selectedRegion, ipos]);

    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
    }
    
    const calculateTotalBudget = (details: SubprojectDetail[]) => {
        return details.reduce((total, item) => total + (item.pricePerUnit * item.numberOfUnits), 0);
    }

    const processedSubprojects = useMemo(() => {
        let filteredProjects = [...subprojects];

        if (statusFilter !== 'All') {
            filteredProjects = filteredProjects.filter(p => p.status === statusFilter);
        }
        if (packageFilter !== 'All') {
            filteredProjects = filteredProjects.filter(p => p.packageType === packageFilter);
        }

        if (searchTerm) {
            const lowercasedSearchTerm = searchTerm.toLowerCase();
            filteredProjects = filteredProjects.filter(p =>
                p.name.toLowerCase().includes(lowercasedSearchTerm) ||
                p.indigenousPeopleOrganization.toLowerCase().includes(lowercasedSearchTerm) ||
                p.location.toLowerCase().includes(lowercasedSearchTerm)
            );
        }

        if (sortConfig !== null) {
            filteredProjects.sort((a, b) => {
                let aValue: any;
                let bValue: any;

                if (sortConfig.key === 'budget') {
                    aValue = calculateTotalBudget(a.details);
                    bValue = calculateTotalBudget(b.details);
                } else {
                    aValue = a[sortConfig.key as keyof Subproject];
                    bValue = b[sortConfig.key as keyof Subproject];
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

        return filteredProjects;
    }, [subprojects, searchTerm, statusFilter, packageFilter, sortConfig]);

    const requestSort = (key: SortKeys) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const handleRegionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const region = e.target.value;
        setSelectedRegion(region);
        setIpoSearch('');
        setFormData(prev => ({
            ...prev,
            indigenousPeopleOrganization: '',
            location: '',
        }));
    };

    const handleIpoSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const searchName = e.target.value;
        setIpoSearch(searchName);

        const matchedIpo = filteredIpos.find(ipo => ipo.name === searchName);
        if (matchedIpo) {
            setFormData(prev => ({
                ...prev,
                indigenousPeopleOrganization: matchedIpo.name,
                location: matchedIpo.location,
            }));
        } else {
             setFormData(prev => ({
                ...prev,
                indigenousPeopleOrganization: '',
                location: '',
            }));
        }
    };


    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleDetailChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'type') {
            setCurrentDetail(prev => ({ ...prev, type: value, particulars: '' }));
        } else {
            setCurrentDetail(prev => ({ ...prev, [name]: value }));
        }
    };
    
    const handleAddDetail = () => {
        if (!currentDetail.type || !currentDetail.particulars || !currentDetail.deliveryDate || !currentDetail.pricePerUnit || !currentDetail.numberOfUnits) {
            alert('Please fill out all detail fields, including type, item, and delivery date.');
            return;
        }
        setDetailItems(prev => [...prev, {
            type: currentDetail.type,
            particulars: currentDetail.particulars,
            deliveryDate: currentDetail.deliveryDate,
            unitOfMeasure: currentDetail.unitOfMeasure,
            pricePerUnit: parseFloat(currentDetail.pricePerUnit),
            numberOfUnits: parseInt(currentDetail.numberOfUnits, 10),
        }]);
        setCurrentDetail({
            type: '',
            particulars: '',
            deliveryDate: '',
            unitOfMeasure: 'pcs',
            pricePerUnit: '',
            numberOfUnits: '',
        });
    };
    
    const handleRemoveDetail = (indexToRemove: number) => {
        setDetailItems(prev => prev.filter((_, index) => index !== indexToRemove));
    };

    const handleEditParticular = (indexToEdit: number) => {
        const itemToEdit = detailItems[indexToEdit];
        setCurrentDetail({
            type: itemToEdit.type,
            particulars: itemToEdit.particulars,
            deliveryDate: itemToEdit.deliveryDate,
            unitOfMeasure: itemToEdit.unitOfMeasure,
            pricePerUnit: String(itemToEdit.pricePerUnit),
            numberOfUnits: String(itemToEdit.numberOfUnits),
        });
        handleRemoveDetail(indexToEdit);
    };


    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.location || !formData.indigenousPeopleOrganization || detailItems.length === 0 || !formData.startDate || !formData.estimatedCompletionDate) {
            alert('Please fill out all required project fields and add at least one detail item.');
            return;
        }

        const dummyCoords = { lat: 14.5, lng: 121.5 };

        if (editingSubproject) {
             const updatedSubproject: Subproject = {
                ...editingSubproject,
                ...formData,
                lat: editingSubproject.lat || dummyCoords.lat,
                lng: editingSubproject.lng || dummyCoords.lng,
                details: detailItems.map((detail, index) => ({ ...detail, id: index + 1 })),
            };
            setSubprojects(prev => prev.map(p => p.id === editingSubproject.id ? updatedSubproject : p));
        } else {
            const newSubproject: Subproject = {
                id: subprojects.length > 0 ? Math.max(...subprojects.map(p => p.id)) + 1 : 1,
                ...formData,
                lat: dummyCoords.lat,
                lng: dummyCoords.lng,
                details: detailItems.map((detail, index) => ({ ...detail, id: index + 1 })),
            };
            setSubprojects(prev => [newSubproject, ...prev]);
        }
        
        handleCancelEdit();
    };
    
    const handleEditClick = (project: Subproject, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingSubproject(project);
        setActiveTab('info');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingSubproject(null);
        setFormData(defaultFormData);
        setDetailItems([]);
        setSelectedRegion('');
        setIpoSearch('');
        setActiveTab('info');
    };

    const handleDeleteClick = (project: Subproject, e: React.MouseEvent) => {
        e.stopPropagation();
        setProjectToDelete(project);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = () => {
        if (projectToDelete) {
            setSubprojects(prev => prev.filter(p => p.id !== projectToDelete.id));
            setIsDeleteModalOpen(false);
            setProjectToDelete(null);
        }
    };
    
    const getStatusBadge = (status: Subproject['status']) => {
        const baseClasses = "px-3 py-1 text-xs font-semibold rounded-full";
        switch (status) {
            case 'Completed': return `${baseClasses} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`;
            case 'Ongoing': return `${baseClasses} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`;
            case 'Proposed': return `${baseClasses} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`;
            case 'Cancelled': return `${baseClasses} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`;
            default: return `${baseClasses} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200`;
        }
    }

    const handleToggleRow = (projectId: number) => {
        setExpandedRowId(prevId => (prevId === projectId ? null : projectId));
    };

    const formatDate = (dateString?: string) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };
    
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

    return (
        <div>
            <h2 className="text-3xl font-bold mb-6 text-gray-800 dark:text-white">Subprojects Management</h2>
            
            {isDeleteModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl">
                        <h3 className="text-lg font-bold">Confirm Deletion</h3>
                        <p className="my-4">Are you sure you want to delete the project "{projectToDelete?.name}"? This action cannot be undone.</p>
                        <div className="flex justify-end gap-4">
                            <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
                            <button onClick={confirmDelete} className="px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Form Section */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
                <h3 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">{editingSubproject ? 'Edit Subproject' : 'Add New Subproject'}</h3>
                <form onSubmit={handleSubmit}>
                    <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                        <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                            <TabButton tabName="info" label="Project Information" />
                            <TabButton tabName="timeline" label="Timeline & Remarks" />
                            <TabButton tabName="budget" label="Budget Breakdown" />
                        </nav>
                    </div>

                    <div className="min-h-[300px]">
                         {activeTab === 'info' && (
                             <div className="space-y-6 animate-fadeIn">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <div className="lg:col-span-2">
                                        <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Subproject Name</label>
                                        <input type="text" name="name" id="name" value={formData.name} onChange={handleInputChange} required className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label htmlFor="packageType" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Package Type</label>
                                        <select id="packageType" name="packageType" value={formData.packageType} onChange={handleInputChange} required className={commonInputClasses}>
                                            {Array.from({ length: 7 }, (_, i) => `Package ${i + 1}`).map(pkg => (
                                                <option key={pkg} value={pkg}>{pkg}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                                        <select id="status" name="status" value={formData.status} onChange={handleInputChange} required className={commonInputClasses}>
                                            <option>Proposed</option>
                                            <option>Ongoing</option>
                                            <option>Completed</option>
                                            <option>Cancelled</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                     <div>
                                        <label htmlFor="region" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Region</label>
                                        <select name="region" id="region" value={selectedRegion} onChange={handleRegionChange} required className={commonInputClasses}>
                                            <option value="">Select a region first</option>
                                            {philippineRegions.map(region => (
                                                <option key={region} value={region}>{region}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="lg:col-span-2">
                                        <label htmlFor="ipoSearch" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Indigenous People Organization</label>
                                        <input 
                                            type="text" 
                                            name="ipoSearch" 
                                            id="ipoSearch" 
                                            value={ipoSearch}
                                            onChange={handleIpoSearchChange}
                                            list="ipo-datalist"
                                            placeholder={selectedRegion ? "Type to search for an IPO" : "Select a region first"}
                                            disabled={!selectedRegion}
                                            required
                                            className={`${commonInputClasses} disabled:bg-gray-200 dark:disabled:bg-gray-600`}
                                        />
                                        <datalist id="ipo-datalist">
                                            {filteredIpos.map(ipo => (
                                                <option key={ipo.id} value={ipo.name}>
                                                    {ipo.name} ({ipo.acronym})
                                                </option>
                                            ))}
                                        </datalist>
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="location" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Location (auto-filled from IPO)</label>
                                    <LocationPicker value={formData.location} onChange={(loc) => setFormData(prev => ({...prev, location: loc}))} required />
                                </div>
                             </div>
                         )}

                         {activeTab === 'timeline' && (
                             <div className="space-y-6 animate-fadeIn">
                                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                     <div>
                                        <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Start Date</label>
                                        <input type="date" name="startDate" id="startDate" value={formData.startDate} onChange={handleInputChange} required className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label htmlFor="estimatedCompletionDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Estimated Completion Date</label>
                                        <input type="date" name="estimatedCompletionDate" id="estimatedCompletionDate" value={formData.estimatedCompletionDate} onChange={handleInputChange} required className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label htmlFor="actualCompletionDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Completion Date</label>
                                        <input type="date" name="actualCompletionDate" id="actualCompletionDate" value={formData.actualCompletionDate} onChange={handleInputChange} className={commonInputClasses} />
                                    </div>
                                 </div>
                                 <div>
                                    <label htmlFor="remarks" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Remarks</label>
                                    <textarea name="remarks" id="remarks" value={formData.remarks} onChange={handleInputChange} rows={5} className={commonInputClasses} />
                                </div>
                             </div>
                         )}
                         
                         {activeTab === 'budget' && (
                             <div className="space-y-6 animate-fadeIn">
                                 <h4 className="text-lg font-medium text-gray-800 dark:text-white">Project Details / Items</h4>
                                 <div className="space-y-2 mb-4">
                                    {detailItems.length === 0 && (
                                        <p className="text-sm text-center py-4 text-gray-500 dark:text-gray-400">No budget items added yet.</p>
                                    )}
                                    {detailItems.map((item, index) => (
                                        <div key={index} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 p-2 rounded-md">
                                            <div className="text-sm flex-grow">
                                                <span className="font-semibold">{item.particulars}</span>
                                                <span className="text-gray-500 dark:text-gray-400"> ({item.type})</span>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">Delivery: {formatDate(item.deliveryDate)} | {item.numberOfUnits} {item.unitOfMeasure} @ {formatCurrency(item.pricePerUnit)}</div>
                                            </div>
                                            <div className="flex items-center gap-4 ml-4">
                                            <span className="font-semibold text-sm">{formatCurrency(item.pricePerUnit * item.numberOfUnits)}</span>
                                                <button type="button" onClick={() => handleEditParticular(index)} className="text-gray-400 hover:text-accent dark:hover:text-accent">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
                                                </button>
                                                <button type="button" onClick={() => handleRemoveDetail(index)} className="text-gray-400 hover:text-red-500">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Type</label>
                                        <select name="type" value={currentDetail.type} onChange={handleDetailChange} className="mt-1 block w-full pl-2 pr-8 py-1.5 text-base bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md text-sm">
                                            <option value="">Select a type</option>
                                            {Object.keys(particularTypes).map(type => (
                                                <option key={type} value={type}>{type}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Item</label>
                                        <select name="particulars" value={currentDetail.particulars} onChange={handleDetailChange} disabled={!currentDetail.type} className="mt-1 block w-full pl-2 pr-8 py-1.5 text-base bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md text-sm disabled:bg-gray-200 dark:disabled:bg-gray-600">
                                            <option value="">Select an item</option>
                                            {currentDetail.type && particularTypes[currentDetail.type].map(item => (
                                                <option key={item} value={item}>{item}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Delivery Date</label>
                                        <input type="date" name="deliveryDate" value={currentDetail.deliveryDate} onChange={handleDetailChange} className="mt-1 block w-full px-2 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Unit</label>
                                        <select name="unitOfMeasure" value={currentDetail.unitOfMeasure} onChange={handleDetailChange} className="mt-1 block w-full pl-2 pr-8 py-1.5 text-base bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md text-sm">
                                            <option>pcs</option>
                                            <option>kgs</option>
                                            <option>unit</option>
                                            <option>lot</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Price/Unit</label>
                                        <input type="number" name="pricePerUnit" value={currentDetail.pricePerUnit} onChange={handleDetailChange} min="0" step="0.01" className="mt-1 block w-full px-2 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm" />
                                    </div>
                                    <div className="flex items-center gap-2 col-span-2 md:col-span-1">
                                        <div className="flex-1">
                                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400"># of Units</label>
                                            <input type="number" name="numberOfUnits" value={currentDetail.numberOfUnits} onChange={handleDetailChange} min="1" step="1" className="mt-1 block w-full px-2 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm" />
                                        </div>
                                        <button type="button" onClick={handleAddDetail} className="h-9 w-9 flex-shrink-0 inline-flex items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50 text-accent dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900">+</button>
                                    </div>
                                </div>
                             </div>
                         )}
                    </div>
                    
                    <div className="flex justify-between items-center pt-4 mt-6 border-t border-gray-200 dark:border-gray-700">
                        <div className="text-lg font-bold">
                            Total Budget: <span className="text-accent dark:text-green-400">{formatCurrency(totalBudgetForNewProject)}</span>
                        </div>
                        <div className="flex gap-4">
                            {editingSubproject && (
                                <button type="button" onClick={handleCancelEdit} className="inline-flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                                    Cancel
                                </button>
                            )}
                            <button type="submit" className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent">
                                {editingSubproject ? 'Update Subproject' : 'Add Subproject'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            {/* Table Section */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                 <h3 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">Subprojects List</h3>
                 
                 <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 items-center">
                    <input
                        type="text"
                        placeholder="Search by name, IPO, or location..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={`w-full md:w-1/3 ${commonInputClasses} mt-0`}
                    />
                    <div className="flex items-center gap-2">
                       <label htmlFor="statusFilter" className="text-sm font-medium text-gray-700 dark:text-gray-300">Status:</label>
                        <select id="statusFilter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${commonInputClasses} mt-0`}>
                            <option value="All">All</option>
                            <option value="Proposed">Proposed</option>
                            <option value="Ongoing">Ongoing</option>
                            <option value="Completed">Completed</option>
                            <option value="Cancelled">Cancelled</option>
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <label htmlFor="packageFilter" className="text-sm font-medium text-gray-700 dark:text-gray-300">Package:</label>
                        <select id="packageFilter" value={packageFilter} onChange={(e) => setPackageFilter(e.target.value)} className={`${commonInputClasses} mt-0`}>
                             <option value="All">All</option>
                            {Array.from({ length: 7 }, (_, i) => `Package ${i + 1}`).map(pkg => (
                                <option key={pkg} value={pkg}>{pkg}</option>
                            ))}
                        </select>
                    </div>
                 </div>

                 <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th scope="col" className="w-12"></th>
                                <SortableHeader sortKey="name" label="Project Name" />
                                <SortableHeader sortKey="packageType" label="Package" />
                                <SortableHeader sortKey="indigenousPeopleOrganization" label="IPO" />
                                <SortableHeader sortKey="startDate" label="Timeline" />
                                <SortableHeader sortKey="budget" label="Total Budget" />
                                <SortableHeader sortKey="status" label="Status" />
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {processedSubprojects.map((project) => (
                                <React.Fragment key={project.id}>
                                    <tr onClick={() => handleToggleRow(project.id)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="px-4 py-4 text-gray-400">
                                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-200 ${expandedRowId === project.id ? 'transform rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{project.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{project.packageType}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const ipo = ipos.find(i => i.name === project.indigenousPeopleOrganization);
                                                    if (ipo) onSelectIpo(ipo);
                                                }}
                                                className="text-left hover:text-accent dark:hover:text-green-400 focus:outline-none focus:underline"
                                                title={`View details for ${project.indigenousPeopleOrganization}`}
                                            >
                                                {project.indigenousPeopleOrganization}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatDate(project.startDate)} - {formatDate(project.estimatedCompletionDate)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-600 dark:text-gray-200">{formatCurrency(calculateTotalBudget(project.details))}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm"><span className={getStatusBadge(project.status)}>{project.status}</span></td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button onClick={(e) => handleEditClick(project, e)} className="text-accent hover:brightness-90 dark:text-green-400 dark:hover:text-green-300 mr-4">Edit</button>
                                            <button onClick={(e) => handleDeleteClick(project, e)} className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200">Delete</button>
                                        </td>
                                    </tr>
                                    {expandedRowId === project.id && (
                                        <tr className="bg-gray-50 dark:bg-gray-900/50">
                                            <td colSpan={8} className="p-0">
                                                <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
                                                    <div className="lg:col-span-2">
                                                        <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Budget Details</h4>
                                                        <table className="min-w-full">
                                                            <thead className="bg-gray-100 dark:bg-gray-700 text-xs uppercase">
                                                                <tr>
                                                                    <th className="px-4 py-2 text-left">Particulars</th>
                                                                    <th className="px-4 py-2 text-left">Type</th>
                                                                    <th className="px-4 py-2 text-left">Delivery Date</th>
                                                                    <th className="px-4 py-2 text-right"># of Units</th>
                                                                    <th className="px-4 py-2 text-right">Subtotal</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="text-sm">
                                                                {project.details.map(detail => (
                                                                    <tr key={detail.id} className="border-b border-gray-200 dark:border-gray-700">
                                                                        <td className="px-4 py-2 font-medium">{detail.particulars}</td>
                                                                        <td className="px-4 py-2">{detail.type}</td>
                                                                        <td className="px-4 py-2">{formatDate(detail.deliveryDate)}</td>
                                                                        <td className="px-4 py-2 text-right">{detail.numberOfUnits.toLocaleString()} {detail.unitOfMeasure}</td>
                                                                        <td className="px-4 py-2 text-right font-medium">{formatCurrency(detail.pricePerUnit * detail.numberOfUnits)}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                    <div className="space-y-4">
                                                        <div>
                                                             <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Additional Info</h4>
                                                             <p className="text-sm text-gray-600 dark:text-gray-300"><span className="font-semibold">Actual Completion:</span> {formatDate(project.actualCompletionDate)}</p>
                                                        </div>
                                                        <div>
                                                            <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Remarks</h4>
                                                            <p className="text-sm text-gray-600 dark:text-gray-300 italic bg-gray-100 dark:bg-gray-800/50 p-3 rounded-md">{project.remarks || 'No remarks provided.'}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                 </div>
            </div>
        </div>
    );
};

export default Subprojects;
