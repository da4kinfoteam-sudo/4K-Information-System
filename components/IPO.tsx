
import React, { useState, FormEvent, useEffect, useMemo } from 'react';
import { IPO, Subproject, Training, philippineRegions, Commodity, commodityTypes, particularTypes } from '../constants';
import LocationPicker, { parseLocation } from './LocationPicker';

// Declare XLSX to inform TypeScript about the global variable from the script tag
declare const XLSX: any;

interface IPOsProps {
    ipos: IPO[];
    setIpos: React.Dispatch<React.SetStateAction<IPO[]>>;
    subprojects: Subproject[];
    trainings: Training[];
    onSelectIpo: (ipo: IPO) => void;
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
    commodities: [] as Commodity[],
    levelOfDevelopment: 1 as IPO['levelOfDevelopment'],
};

const registeringBodyOptions = ['SEC', 'DOLE', 'CDA'];

const IPOs: React.FC<IPOsProps> = ({ ipos, setIpos, subprojects, trainings, onSelectIpo }) => {
    const [formData, setFormData] = useState(defaultFormData);
    const [otherRegisteringBody, setOtherRegisteringBody] = useState('');
    const [editingIpo, setEditingIpo] = useState<IPO | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [ipoToDelete, setIpoToDelete] = useState<IPO | null>(null);
    const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const [searchTerm, setSearchTerm] = useState('');
    const [regionFilter, setRegionFilter] = useState('All');
    type SortKeys = keyof IPO;
    const [sortConfig, setSortConfig] = useState<{ key: SortKeys; direction: 'ascending' | 'descending' } | null>({ key: 'registrationDate', direction: 'descending' });

    const [currentCommodity, setCurrentCommodity] = useState({
        type: '',
        particular: '',
        value: '',
    });

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
                commodities: editingIpo.commodities || [],
                levelOfDevelopment: editingIpo.levelOfDevelopment || 1,
            });
            if (!registeringBodyOptions.includes(editingIpo.registeringBody)) {
                setOtherRegisteringBody(editingIpo.registeringBody);
            } else {
                setOtherRegisteringBody('');
            }
        }
    }, [editingIpo]);

    const processedIpos = useMemo(() => {
        let filteredIpos = [...ipos];

        if (regionFilter !== 'All') {
            filteredIpos = filteredIpos.filter(ipo => ipo.region === regionFilter);
        }

        if (searchTerm) {
            const lowercasedSearchTerm = searchTerm.toLowerCase();
            filteredIpos = filteredIpos.filter(ipo =>
                ipo.name.toLowerCase().includes(lowercasedSearchTerm) ||
                ipo.acronym.toLowerCase().includes(lowercasedSearchTerm) ||
                ipo.contactPerson.toLowerCase().includes(lowercasedSearchTerm) ||
                ipo.location.toLowerCase().includes(lowercasedSearchTerm)
            );
        }

        if (sortConfig !== null) {
            filteredIpos.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];
                if (aValue < bValue) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }

        return filteredIpos;
    }, [ipos, searchTerm, regionFilter, sortConfig]);
    
    const requestSort = (key: SortKeys) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };


    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        
        if (type === 'checkbox') {
            const { checked } = e.target as HTMLInputElement;
            setFormData(prev => ({ ...prev, [name]: checked }));
        } else if (name === 'levelOfDevelopment') {
            setFormData(prev => ({ ...prev, levelOfDevelopment: parseInt(value, 10) as IPO['levelOfDevelopment'] }));
        }
         else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };
    
    const handleCommodityChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'type') {
            setCurrentCommodity({ type: value, particular: '', value: '' });
        } else {
            setCurrentCommodity(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleAddCommodity = () => {
        if (!currentCommodity.type || !currentCommodity.particular || !currentCommodity.value) {
            alert('Please fill out all commodity fields.');
            return;
        }
        const newCommodity: Commodity = {
            type: currentCommodity.type,
            particular: currentCommodity.particular,
            value: parseFloat(currentCommodity.value),
        };
        setFormData(prev => ({ ...prev, commodities: [...prev.commodities, newCommodity] }));
        setCurrentCommodity({ type: '', particular: '', value: '' });
    };

    const handleRemoveCommodity = (indexToRemove: number) => {
        setFormData(prev => ({
            ...prev,
            commodities: prev.commodities.filter((_, index) => index !== indexToRemove),
        }));
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

    const handleEditClick = (ipo: IPO, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingIpo(ipo);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingIpo(null);
        setFormData(defaultFormData);
        setOtherRegisteringBody('');
        setCurrentCommodity({ type: '', particular: '', value: '' });
    };

    const handleDeleteClick = (ipo: IPO, e: React.MouseEvent) => {
        e.stopPropagation();
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

    const handleToggleRow = (ipoId: number) => {
        setExpandedRowId(prevId => (prevId === ipoId ? null : ipoId));
    };

    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
    }
    
    const calculateTotalBudget = (details: Subproject['details']) => {
        return details.reduce((total, item) => total + (item.pricePerUnit * item.numberOfUnits), 0);
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

    const handleDownloadTemplate = () => {
        const headers = [
            'name', 'acronym', 'location', 'indigenousCulturalCommunity', 
            'ancestralDomainNo', 'registeringBody', 'isWomenLed', 'isWithinGida',
            'contactPerson', 'contactNumber', 'registrationDate', 'commodities', 
            'levelOfDevelopment'
        ];
        
        const exampleData = [{
            name: 'Sample Farmers Association',
            acronym: 'SFA',
            location: 'Brgy. Sample, Sample City, Sample Province',
            indigenousCulturalCommunity: 'Sample Tribe',
            ancestralDomainNo: 'AD-12345',
            registeringBody: 'CDA',
            isWomenLed: 'TRUE',
            isWithinGida: 'FALSE',
            contactPerson: 'Juan Dela Cruz',
            contactNumber: '09171234567',
            registrationDate: '2023-01-15',
            commodities: '[{"type":"Crop Commodity","particular":"Rice Seeds","value":50}]',
            levelOfDevelopment: 2
        }];

        const instructions = [
            ["Column", "Description"],
            ["name", "Full name of the IPO. (Required)"],
            ["acronym", "Acronym of the IPO. (Required)"],
            ["location", "Full location, formatted as 'Barangay, Municipality, Province'. (Required)"],
            ["indigenousCulturalCommunity", "The name of the indigenous cultural community."],
            ["ancestralDomainNo", "The ancestral domain number, if any."],
            ["registeringBody", "e.g., SEC, DOLE, CDA, National Commission on Indigenous Peoples."],
            ["isWomenLed", "Enter TRUE or FALSE."],
            ["isWithinGida", "Enter TRUE or FALSE."],
            ["contactPerson", "Name of the contact person."],
            ["contactNumber", "Contact phone number."],
            ["registrationDate", "Date in YYYY-MM-DD format. (Required)"],
            ["commodities", `A JSON string for commodities. Format: '[{"type":"Type","particular":"Name","value":Number}]'. Example: '[{"type":"Livestock","particular":"Goats","value":100}]'. Use '[]' for none.`],
            ["levelOfDevelopment", "A number from 1 to 5."]
        ];

        const wb = XLSX.utils.book_new();
        const ws_data = XLSX.utils.json_to_sheet(exampleData, { header: headers });
        const ws_instructions = XLSX.utils.aoa_to_sheet(instructions);
        
        XLSX.utils.book_append_sheet(wb, ws_data, "IPO Data");
        XLSX.utils.book_append_sheet(wb, ws_instructions, "Instructions");

        XLSX.writeFile(wb, "IPO_Upload_Template.xlsx");
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = event.target?.result;
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

                let currentMaxId = ipos.reduce((max, ipo) => Math.max(max, ipo.id), 0);
                
                const newIpos: IPO[] = jsonData.map((row, index) => {
                    // Basic validation
                    if (!row.name || !row.acronym || !row.location || !row.registrationDate) {
                        throw new Error(`Row ${index + 2} is missing required fields (name, acronym, location, registrationDate).`);
                    }

                    let commodities: Commodity[];
                    try {
                        commodities = typeof row.commodities === 'string' ? JSON.parse(row.commodities) : [];
                    } catch {
                        console.warn(`Row ${index + 2}: Invalid JSON in 'commodities' column. Defaulting to empty.`);
                        commodities = [];
                    }

                    currentMaxId++;
                    const { region } = parseLocation(row.location);

                    return {
                        id: currentMaxId,
                        name: String(row.name),
                        acronym: String(row.acronym),
                        location: String(row.location),
                        region: region,
                        indigenousCulturalCommunity: String(row.indigenousCulturalCommunity || ''),
                        ancestralDomainNo: String(row.ancestralDomainNo || ''),
                        registeringBody: String(row.registeringBody || ''),
                        isWomenLed: String(row.isWomenLed).toUpperCase() === 'TRUE',
                        isWithinGida: String(row.isWithinGida).toUpperCase() === 'TRUE',
                        contactPerson: String(row.contactPerson || ''),
                        contactNumber: String(row.contactNumber || ''),
                        registrationDate: String(row.registrationDate),
                        commodities: commodities,
                        levelOfDevelopment: parseInt(row.levelOfDevelopment, 10) as IPO['levelOfDevelopment'] || 1,
                    };
                }).filter(Boolean); // Filter out any nulls from failed parsing

                setIpos(prev => [...prev, ...newIpos]);
                alert(`${newIpos.length} IPO(s) imported successfully!`);
            } catch (error: any) {
                console.error("Error processing XLSX file:", error);
                alert(`Failed to import file. ${error.message}`);
            } finally {
                setIsUploading(false);
                // Reset file input value
                if(e.target) e.target.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
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
                        <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Commodities</legend>
                        <div className="space-y-2 mb-4">
                            {formData.commodities.map((commodity, index) => (
                                <div key={index} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 p-2 rounded-md text-sm">
                                    <div>
                                        <span className="font-semibold">{commodity.particular}</span>
                                        <span className="text-gray-500 dark:text-gray-400"> ({commodity.type}) - </span>
                                        <span>{commodity.value.toLocaleString()} {commodity.type === 'Livestock' ? 'heads' : 'ha'}</span>
                                    </div>
                                    <button type="button" onClick={() => handleRemoveCommodity(index)} className="text-gray-400 hover:text-red-500">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Type</label>
                                <select name="type" value={currentCommodity.type} onChange={handleCommodityChange} className="mt-1 block w-full pl-2 pr-8 py-1.5 text-base bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md text-sm">
                                    <option value="">Select Type</option>
                                    {commodityTypes.map(type => (
                                        <option key={type} value={type}>{type}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Particular</label>
                                <select name="particular" value={currentCommodity.particular} onChange={handleCommodityChange} disabled={!currentCommodity.type} className="mt-1 block w-full pl-2 pr-8 py-1.5 text-base bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md text-sm disabled:bg-gray-200 dark:disabled:bg-gray-600">
                                    <option value="">Select Particular</option>
                                    {currentCommodity.type && particularTypes[currentCommodity.type].map(item => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </select>
                            </div>
                             <div className="flex items-end gap-2">
                                <div className="flex-1">
                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{currentCommodity.type === 'Livestock' ? 'Number of Heads' : 'Hectares'}</label>
                                    <input type="number" name="value" value={currentCommodity.value} onChange={handleCommodityChange} min="0" step="any" className="mt-1 block w-full px-2 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm" />
                                </div>
                                <button type="button" onClick={handleAddCommodity} className="h-9 w-9 flex-shrink-0 inline-flex items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50 text-accent dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900">+</button>
                            </div>
                        </div>
                    </fieldset>

                     <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                        <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Level of Development</legend>
                        <div>
                            <label htmlFor="levelOfDevelopment" className="block text-sm font-medium">Current Level</label>
                            <select name="levelOfDevelopment" id="levelOfDevelopment" value={formData.levelOfDevelopment} onChange={handleInputChange} required className={commonInputClasses}>
                                <option value={1}>Level 1</option>
                                <option value={2}>Level 2</option>
                                <option value={3}>Level 3</option>
                                <option value={4}>Level 4</option>
                                <option value={5}>Level 5</option>
                            </select>
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
                
                 <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 items-center justify-between">
                    <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
                        <input
                            type="text"
                            placeholder="Search by name, contact, or location..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={`w-full md:w-auto ${commonInputClasses} mt-0`}
                        />
                        <div className="flex items-center gap-2">
                           <label htmlFor="regionFilter" className="text-sm font-medium text-gray-700 dark:text-gray-300">Region:</label>
                            <select id="regionFilter" value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} className={`${commonInputClasses} mt-0`}>
                                <option value="All">All Regions</option>
                                {philippineRegions.map(region => (
                                    <option key={region} value={region}>{region}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={handleDownloadTemplate}
                            className="inline-flex items-center justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                        >
                            Download Template
                        </button>
                        <label 
                            htmlFor="ipo-upload" 
                            className={`inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 ${isUploading ? 'bg-gray-400 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                            {isUploading ? 'Uploading...' : 'Upload XLSX'}
                        </label>
                        <input 
                            id="ipo-upload" 
                            type="file" 
                            className="hidden" 
                            onChange={handleFileUpload} 
                            accept=".xlsx, .xls"
                            disabled={isUploading}
                        />
                    </div>
                 </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th scope="col" className="w-12"></th>
                                <SortableHeader sortKey="name" label="Name" />
                                <SortableHeader sortKey="region" label="Region" />
                                <SortableHeader sortKey="registrationDate" label="Registered" />
                                <SortableHeader sortKey="registeringBody" label="Registering Body" />
                                <SortableHeader sortKey="contactPerson" label="Contact Person" />
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {processedIpos.map((ipo) => {
                                const linkedSubprojects = subprojects.filter(p => p.indigenousPeopleOrganization === ipo.name);
                                const linkedTrainings = trainings.filter(t => t.participatingIpos.includes(ipo.name));
                                
                                return (
                                    <React.Fragment key={ipo.id}>
                                        <tr onClick={() => handleToggleRow(ipo.id)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className="px-4 py-4 text-gray-400">
                                                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-200 ${expandedRowId === ipo.id ? 'transform rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onSelectIpo(ipo);
                                                    }}
                                                    className="text-left hover:text-accent dark:hover:text-green-400 focus:outline-none focus:underline"
                                                >
                                                    <div>{ipo.name}</div>
                                                    <div className="text-xs text-gray-400">{ipo.acronym}</div>
                                                </button>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{ipo.region}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatDate(ipo.registrationDate)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{ipo.registeringBody}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                                                <div>{ipo.contactPerson}</div>
                                                <div className="text-xs text-gray-400">{ipo.contactNumber}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <button onClick={(e) => handleEditClick(ipo, e)} className="text-accent hover:brightness-90 dark:text-green-400 dark:hover:text-green-300 mr-4">Edit</button>
                                                <button onClick={(e) => handleDeleteClick(ipo, e)} className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200">Delete</button>
                                            </td>
                                        </tr>
                                         {expandedRowId === ipo.id && (
                                            <tr className="bg-gray-50 dark:bg-gray-900/50">
                                                <td colSpan={7} className="p-4">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                        <div>
                                                            <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Linked Subprojects</h4>
                                                            {linkedSubprojects.length > 0 ? (
                                                                <ul className="space-y-2">
                                                                    {linkedSubprojects.map(p => (
                                                                        <li key={p.id} className="text-sm p-2 bg-white dark:bg-gray-800 rounded-md shadow-sm">
                                                                            <div className="flex justify-between items-center">
                                                                               <span className="font-medium text-gray-800 dark:text-gray-100">{p.name}</span>
                                                                               <span className={getStatusBadge(p.status)}>{p.status}</span>
                                                                            </div>
                                                                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Budget: {formatCurrency(calculateTotalBudget(p.details))}</div>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            ) : (
                                                                <p className="text-sm text-gray-500 dark:text-gray-400 italic">No linked subprojects.</p>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Linked Trainings</h4>
                                                            {linkedTrainings.length > 0 ? (
                                                                <ul className="space-y-2">
                                                                    {linkedTrainings.map(t => (
                                                                        <li key={t.id} className="text-sm p-2 bg-white dark:bg-gray-800 rounded-md shadow-sm">
                                                                           <div className="flex justify-between items-center">
                                                                              <span className="font-medium text-gray-800 dark:text-gray-100">{t.name}</span>
                                                                              <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(t.date)}</span>
                                                                           </div>
                                                                           <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Facilitator: {t.facilitator}</div>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            ) : (
                                                                <p className="text-sm text-gray-500 dark:text-gray-400 italic">No linked trainings.</p>
                                                            )}
                                                        </div>
                                                        <div className="space-y-4">
                                                            <div>
                                                                <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Commodities</h4>
                                                                {ipo.commodities && ipo.commodities.length > 0 ? (
                                                                    <ul className="space-y-1 text-sm">
                                                                        {ipo.commodities.map((c, i) => (
                                                                            <li key={i} className="flex justify-between p-1 bg-white dark:bg-gray-800 rounded">
                                                                                <span>{c.particular} <span className="text-xs text-gray-400">({c.type})</span></span>
                                                                                <span className="font-medium">{c.value.toLocaleString()} {c.type === 'Livestock' ? 'heads' : 'ha'}</span>
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                ) : <p className="text-sm text-gray-500 dark:text-gray-400 italic">No commodities listed.</p>}
                                                            </div>
                                                            <div>
                                                                <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Level of Development</h4>
                                                                <p className="text-sm font-semibold text-accent dark:text-green-400 bg-gray-100 dark:bg-gray-900/50 px-3 py-1 rounded-full inline-block">Level {ipo.levelOfDevelopment}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default IPOs;