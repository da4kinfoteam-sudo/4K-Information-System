

import React, { useState, FormEvent, useMemo, useEffect } from 'react';
// FIX: Added FundType and Tier to imports to be used for type assertions.
import { Training, IPO, philippineRegions, trainingComponents, fundTypes, tiers, months, Disbursement, Month, FundType, Tier, TrainingComponentType } from '../constants';
import LocationPicker, { parseLocation } from './LocationPicker';

// Declare XLSX to inform TypeScript about the global variable from the script tag
declare const XLSX: any;

interface TrainingsProps {
    ipos: IPO[];
    trainings: Training[];
    setTrainings: React.Dispatch<React.SetStateAction<Training[]>>;
    onSelectIpo: (ipo: IPO) => void;
}

const defaultDisbursementSchedule = (): Disbursement[] => 
    months.map(month => ({ month, amount: 0 }));

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
    otherExpenses: 0,
    fundingYear: new Date().getFullYear(),
    // FIX: Widened the types of these properties to their respective union types.
    // This prevents TypeScript from inferring a narrow, specific type (e.g., 'Current')
    // and allows the state to hold any valid value from the union.
    fundType: fundTypes[0] as FundType,
    tier: tiers[0] as Tier,
    monthOfObligation: months[0] as Month,
    disbursementSchedule: defaultDisbursementSchedule(),
};

const TrainingsComponent: React.FC<TrainingsProps> = ({ ipos, trainings, setTrainings, onSelectIpo }) => {
    const [formData, setFormData] = useState(defaultFormData);
    const [editingTraining, setEditingTraining] = useState<Training | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [trainingToDelete, setTrainingToDelete] = useState<Training | null>(null);
    const [ipoRegionFilter, setIpoRegionFilter] = useState('All');
    const [activeTab, setActiveTab] = useState<'details' | 'budget'>('details');
    const [isUploading, setIsUploading] = useState(false);

    const [searchTerm, setSearchTerm] = useState('');
    const [tableRegionFilter, setTableRegionFilter] = useState('All');
    const [componentFilter, setComponentFilter] = useState<'All' | TrainingComponentType>('All');
    type SortKeys = keyof Training | 'totalParticipants';
    const [sortConfig, setSortConfig] = useState<{ key: SortKeys; direction: 'ascending' | 'descending' } | null>({ key: 'date', direction: 'descending' });
    const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
    const [view, setView] = useState<'list' | 'add' | 'edit'>('list');

    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    useEffect(() => {
        if (formData.component === 'Program Management') {
            setFormData(prev => ({ ...prev, participatingIpos: [] }));
        }
    }, [formData.component]);
    
    useEffect(() => {
        if (editingTraining) {
            setFormData({
                name: editingTraining.name,
                date: editingTraining.date,
                description: editingTraining.description,
                location: editingTraining.location,
                facilitator: editingTraining.facilitator,
                participatingIpos: editingTraining.participatingIpos,
                participantsMale: editingTraining.participantsMale,
                participantsFemale: editingTraining.participantsFemale,
                trainingExpenses: editingTraining.trainingExpenses,
                component: editingTraining.component,
                otherExpenses: editingTraining.otherExpenses ?? 0,
                fundingYear: editingTraining.fundingYear ?? new Date().getFullYear(),
                fundType: editingTraining.fundType ?? fundTypes[0],
                tier: editingTraining.tier ?? tiers[0],
                monthOfObligation: editingTraining.monthOfObligation ?? months[0],
                disbursementSchedule: editingTraining.disbursementSchedule && editingTraining.disbursementSchedule.length === 12 
                    ? editingTraining.disbursementSchedule 
                    : defaultDisbursementSchedule(),
            });
            setActiveTab('details');
        } else {
            setFormData(defaultFormData);
        }
    }, [editingTraining]);

    const filteredIposForSelection = useMemo(() => {
        const filtered = ipoRegionFilter === 'All' ? ipos : ipos.filter(ipo => ipo.region === ipoRegionFilter);
        return filtered.sort((a,b) => a.name.localeCompare(b.name));
    }, [ipoRegionFilter, ipos]);

    const processedTrainings = useMemo(() => {
        let filteredTrainings = [...trainings];
        
        if (tableRegionFilter !== 'All') {
            const iposInRegion = new Set(ipos.filter(ipo => ipo.region === tableRegionFilter).map(ipo => ipo.name));
            filteredTrainings = filteredTrainings.filter(training =>
                training.participatingIpos.some(ipoName => iposInRegion.has(ipoName)) || (training.location === 'Online' && tableRegionFilter === 'Online')
            );
        }
        
        if (componentFilter !== 'All') {
            filteredTrainings = filteredTrainings.filter(t => t.component === componentFilter);
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
    }, [trainings, searchTerm, tableRegionFilter, sortConfig, ipos, componentFilter]);
    
    const paginatedTrainings = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return processedTrainings.slice(startIndex, startIndex + itemsPerPage);
    }, [processedTrainings, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(processedTrainings.length / itemsPerPage);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, tableRegionFilter, componentFilter, sortConfig, itemsPerPage]);

    const requestSort = (key: SortKeys) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };
    
    const handleToggleRow = (trainingId: number) => {
        setExpandedRowId(prevId => (prevId === trainingId ? null : trainingId));
    };

    // FIX: Addressed error "Property 'value' does not exist on type 'unknown'" by ensuring correct
    // type handling for the event target. `e.currentTarget` provides the correctly typed element.
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.currentTarget;
        const isNumberInput = 'type' in e.currentTarget && e.currentTarget.type === 'number';

        setFormData(prev => ({ 
            ...prev, 
            [name]: isNumberInput ? (value === '' ? 0 : parseFloat(value)) : value 
        }));
    };
    
    const handleDisbursementChange = (month: Month, amount: string) => {
        const newSchedule = formData.disbursementSchedule.map(d => 
            d.month === month ? { ...d, amount: parseFloat(amount) || 0 } : d
        );
        setFormData(prev => ({ ...prev, disbursementSchedule: newSchedule }));
    };

    const handleIpoSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedOptions = Array.from(e.target.selectedOptions, option => option.value);
        setFormData(prev => ({ ...prev, participatingIpos: selectedOptions }));
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.date || !formData.location || !formData.facilitator || !formData.component) {
            alert('Please fill out all required fields on the Training Details tab.');
            return;
        }
        
        const finalFormData = {
            ...formData,
            participantsMale: Number(formData.participantsMale) || 0,
            participantsFemale: Number(formData.participantsFemale) || 0,
            trainingExpenses: Number(formData.trainingExpenses) || 0,
            otherExpenses: Number(formData.otherExpenses) || 0,
            fundingYear: Number(formData.fundingYear) || new Date().getFullYear(),
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
        setView('edit');
    };
    
    const handleAddNewClick = () => {
        setEditingTraining(null);
        setView('add');
    };

    const handleCancelEdit = () => {
        setEditingTraining(null);
        setFormData(defaultFormData);
        setActiveTab('details');
        setView('list');
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
    const totalBudget = (Number(formData.trainingExpenses) || 0) + (Number(formData.otherExpenses) || 0);
    const totalDisbursed = formData.disbursementSchedule.reduce((sum, item) => sum + item.amount, 0);

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
    
    const handleDownloadReport = () => {
        const dataToExport = processedTrainings.map(t => ({
            'Training Name': t.name,
            'Component': t.component,
            'Date': t.date,
            'Location': t.location,
            'Facilitator': t.facilitator,
            'Male Participants': t.participantsMale,
            'Female Participants': t.participantsFemale,
            'Total Participants': t.participantsMale + t.participantsFemale,
            'Total Budget': (t.trainingExpenses ?? 0) + (t.otherExpenses ?? 0),
            'Participating IPOs': t.participatingIpos.join(', '),
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const budgetColIndex = Object.keys(dataToExport[0] || {}).indexOf('Total Budget');
        if (budgetColIndex !== -1) {
            const budgetCol = XLSX.utils.encode_col(budgetColIndex);
            for (let i = 2; i <= dataToExport.length + 1; i++) {
                const cellAddress = budgetCol + i;
                if(ws[cellAddress]) {
                    ws[cellAddress].z = '"₱"#,##0.00';
                }
            }
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Trainings Report");
        XLSX.writeFile(wb, "Trainings_Report.xlsx");
    };

    const handleDownloadTemplate = () => {
        const exampleData = [{
            name: 'Sample Financial Literacy Seminar',
            date: '2024-01-15',
            description: 'A sample seminar on financial management.',
            location: 'Tanay, Rizal',
            facilitator: 'Rural Bank of Tanay',
            participatingIpos: 'San Isidro Farmers Association, Daraitan Farmers Cooperative',
            participantsMale: 15,
            participantsFemale: 25,
            trainingExpenses: 50000,
            component: 'Social Preparation',
            otherExpenses: 0,
            fundingYear: 2024,
            fundType: 'Current',
            tier: 'Tier 1',
            monthOfObligation: 'January',
        }];

        const instructions = [
            ["Column", "Description", "Required?"],
            ["name", "Full name of the training activity.", "Yes"],
            ["date", "Date in YYYY-MM-DD format.", "Yes"],
            ["description", "A brief description of the training.", "No"],
            ["location", "Full location, formatted as 'Municipality, Province'. Or 'Online'.", "Yes"],
            ["facilitator", "Name of the person or organization facilitating.", "Yes"],
            ["participatingIpos", "A comma-separated list of the EXACT, full names of existing IPOs.", "No"],
            ["participantsMale", "Number of male participants.", "No (defaults to 0)"],
            ["participantsFemale", "Number of female participants.", "No (defaults to 0)"],
            ["trainingExpenses", "The main cost of the training (as a number).", "No (defaults to 0)"],
            ["component", `Must be one of: ${trainingComponents.join(', ')}`, "Yes"],
            ["otherExpenses", "Any other related expenses (as a number).", "No (defaults to 0)"],
            ["fundingYear", "The funding year (e.g., 2024).", "No"],
            ["fundType", `Must be one of: ${fundTypes.join(', ')}`, "No"],
            ["tier", `Must be one of: ${tiers.join(', ')}`, "No"],
            ["monthOfObligation", `Must be one of: ${months.join(', ')}`, "No"],
        ];

        const wb = XLSX.utils.book_new();
        const ws_data = XLSX.utils.json_to_sheet(exampleData);
        const ws_instructions = XLSX.utils.aoa_to_sheet(instructions);
        
        XLSX.utils.book_append_sheet(wb, ws_data, "Trainings Data");
        XLSX.utils.book_append_sheet(wb, ws_instructions, "Instructions");
        XLSX.writeFile(wb, "Trainings_Upload_Template.xlsx");
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

                let currentMaxId = trainings.reduce((max, t) => Math.max(max, t.id), 0);
                const existingIpoNames = new Set(ipos.map(ipo => ipo.name));

                const newTrainings: Training[] = jsonData.map((row, index) => {
                    const rowNum = index + 2;
                    if (!row.name || !row.date || !row.location || !row.facilitator || !row.component) {
                        throw new Error(`Row ${rowNum}: Missing required fields (name, date, location, facilitator, component).`);
                    }
                    if (!trainingComponents.includes(row.component)) {
                        throw new Error(`Row ${rowNum}: Invalid component "${row.component}".`);
                    }
                    
                    const participatingIpos = (row.participatingIpos || '').toString().split(',').map((s: string) => s.trim()).filter(Boolean);
                    for (const ipoName of participatingIpos) {
                        if (!existingIpoNames.has(ipoName)) {
                            throw new Error(`Row ${rowNum}: IPO "${ipoName}" does not exist in the system.`);
                        }
                    }
                    
                    currentMaxId++;
                    return {
                        id: currentMaxId,
                        name: String(row.name),
                        date: String(row.date),
                        description: String(row.description || ''),
                        location: String(row.location),
                        facilitator: String(row.facilitator),
                        participatingIpos: participatingIpos,
                        participantsMale: Number(row.participantsMale) || 0,
                        participantsFemale: Number(row.participantsFemale) || 0,
                        trainingExpenses: Number(row.trainingExpenses) || 0,
                        component: row.component as TrainingComponentType,
                        otherExpenses: Number(row.otherExpenses) || 0,
                        fundingYear: Number(row.fundingYear) || undefined,
                        fundType: fundTypes.includes(row.fundType) ? row.fundType : undefined,
                        tier: tiers.includes(row.tier) ? row.tier : undefined,
                        monthOfObligation: months.includes(row.monthOfObligation) ? row.monthOfObligation : undefined,
                        disbursementSchedule: defaultDisbursementSchedule(),
                    };
                });

                setTrainings(prev => [...prev, ...newTrainings]);
                alert(`${newTrainings.length} training(s) imported successfully!`);
            } catch (error: any) {
                console.error("Error processing XLSX file:", error);
                alert(`Failed to import file. ${error.message}`);
            } finally {
                setIsUploading(false);
                if(e.target) e.target.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };


    const renderListView = () => (
        <>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Trainings Management</h2>
                <button
                    onClick={handleAddNewClick}
                    className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent"
                >
                    + Add New Training
                </button>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                 <div className="mb-4 flex flex-col md:flex-row gap-4">
                    <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
                        <input
                            type="text"
                            placeholder="Search by name, component, facilitator..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={`w-full md:w-auto ${commonInputClasses} mt-0`}
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
                                {trainingComponents.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="flex-grow"></div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleDownloadReport} className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">Download Report</button>
                        <button onClick={handleDownloadTemplate} className="inline-flex items-center justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">Download Template</button>
                        <label htmlFor="training-upload" className={`inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 ${isUploading ? 'bg-gray-400 cursor-not-allowed' : 'cursor-pointer'}`}>{isUploading ? 'Uploading...' : 'Upload XLSX'}</label>
                        <input id="training-upload" type="file" className="hidden" onChange={handleFileUpload} accept=".xlsx, .xls" disabled={isUploading} />
                    </div>
                 </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th scope="col" className="w-12 px-4 py-3"></th>
                                <SortableHeader sortKey="name" label="Name" />
                                <SortableHeader sortKey="date" label="Date" />
                                <SortableHeader sortKey="component" label="Component" />
                                <SortableHeader sortKey="totalParticipants" label="Participants" />
                                <SortableHeader sortKey="trainingExpenses" label="Budget" />
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {paginatedTrainings.map((training) => (
                                <React.Fragment key={training.id}>
                                    <tr onClick={() => handleToggleRow(training.id)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="px-4 py-4 text-gray-400">
                                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-200 ${expandedRowId === training.id ? 'transform rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </td>
                                        <td className="px-6 py-4 whitespace-normal text-sm font-medium text-gray-900 dark:text-white">{training.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatDate(training.date)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{training.component}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{training.participantsMale + training.participantsFemale}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatCurrency(training.trainingExpenses + (training.otherExpenses ?? 0))}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button onClick={(e) => { e.stopPropagation(); handleEditClick(training); }} className="text-accent hover:brightness-90 dark:text-green-400 dark:hover:text-green-300 mr-4">Edit</button>
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(training); }} className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200">Delete</button>
                                        </td>
                                    </tr>
                                     {expandedRowId === training.id && (
                                        <tr className="bg-gray-50 dark:bg-gray-900/50">
                                            <td colSpan={7} className="p-4">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div className="space-y-4">
                                                        <div>
                                                            <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Description</h4>
                                                            <p className="text-sm text-gray-600 dark:text-gray-300">{training.description || 'No description provided.'}</p>
                                                        </div>
                                                        <div>
                                                            <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Participating IPOs</h4>
                                                            {training.participatingIpos.length > 0 ? (
                                                                <div className="flex flex-wrap gap-2">
                                                                    {training.participatingIpos.map(ipoName => {
                                                                        const ipo = ipos.find(i => i.name === ipoName);
                                                                        return (
                                                                            <button
                                                                                key={ipoName}
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    if (ipo) onSelectIpo(ipo);
                                                                                }}
                                                                                className="bg-gray-200 dark:bg-gray-700 rounded-full px-3 py-1 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed"
                                                                                disabled={!ipo}
                                                                                title={ipo ? `View details for ${ipoName}` : `${ipoName} (details not found)`}
                                                                            >
                                                                                {ipoName}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            ) : (
                                                                <p className="text-sm text-gray-500 dark:text-gray-400 italic">No participating IPOs listed.</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="space-y-4 text-sm bg-gray-100 dark:bg-gray-800/50 p-4 rounded-lg">
                                                        <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Budget & Funding</h4>
                                                        <div className="grid grid-cols-2 gap-2">
                                                             <p><strong className="text-gray-500 dark:text-gray-400">Funding Year:</strong> {training.fundingYear ?? 'N/A'}</p>
                                                            <p><strong className="text-gray-500 dark:text-gray-400">Fund Type:</strong> {training.fundType ?? 'N/A'}</p>
                                                            <p><strong className="text-gray-500 dark:text-gray-400">Tier:</strong> {training.tier ?? 'N/A'}</p>
                                                            <p><strong className="text-gray-500 dark:text-gray-400">Month of Obligation:</strong> {training.monthOfObligation ?? 'N/A'}</p>
                                                            <p className="col-span-2"><strong className="text-gray-500 dark:text-gray-400">Total Budget:</strong> {formatCurrency((training.trainingExpenses ?? 0) + (training.otherExpenses ?? 0))}</p>
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
                <div className="py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-700 dark:text-gray-300">Show</span>
                        <select
                            value={itemsPerPage}
                            onChange={(e) => setItemsPerPage(Number(e.target.value))}
                            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1 pl-2 pr-8 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
                        >
                            {[10, 20, 50, 100].map(size => (
                                <option key={size} value={size}>{size}</option>
                            ))}
                        </select>
                        <span className="text-gray-700 dark:text-gray-300">entries</span>
                    </div>
                     <div className="flex items-center gap-4 text-sm">
                        <span className="text-gray-700 dark:text-gray-300">
                            Showing {Math.min((currentPage - 1) * itemsPerPage + 1, processedTrainings.length)} to {Math.min(currentPage * itemsPerPage, processedTrainings.length)} of {processedTrainings.length} entries
                        </span>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">
                                Previous
                            </button>
                            <span className="px-2 font-medium">{currentPage} / {totalPages}</span>
                            <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">
                                Next
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );

    const renderFormView = () => (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-semibold text-gray-800 dark:text-white">{view === 'edit' ? 'Edit Training' : 'Add New Training'}</h3>
                 <button onClick={handleCancelEdit} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    Back to List
                </button>
            </div>
            <form onSubmit={handleSubmit}>
                <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                    <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                        <TabButton tabName="details" label="Training Details" />
                        <TabButton tabName="budget" label="Budget & Funding" />
                    </nav>
                </div>

                <div className="min-h-[400px]">
                    {activeTab === 'details' && (
                        <div className="space-y-6">
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
                                <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Participants</legend>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 items-end">
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
                                </div>
                            </fieldset>

                            <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Description</legend>
                                <div>
                                    <label htmlFor="description" className="block text-sm font-medium">Description</label>
                                    <textarea name="description" id="description" value={formData.description} onChange={handleInputChange} rows={3} className={commonInputClasses} />
                                </div>
                            </fieldset>
                            
                            {formData.component !== 'Program Management' && (
                                <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                    <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Linked IPOs</legend>
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
                                            className="mt-2 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm h-40"
                                        >
                                            {filteredIposForSelection.map(ipo => (
                                                <option key={ipo.id} value={ipo.name}>{`${ipo.name} (${parseLocation(ipo.location).province})`}</option>
                                            ))}
                                        </select>
                                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Hold Ctrl (or Cmd on Mac) to select multiple.</p>
                                    </div>
                                </fieldset>
                            )}
                        </div>
                    )}
                     {activeTab === 'budget' && (
                         <div className="space-y-6">
                             <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Budget Details</legend>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                                     <div>
                                        <label htmlFor="trainingExpenses" className="block text-sm font-medium">Training Expenses (PHP)</label>
                                        <input type="number" name="trainingExpenses" id="trainingExpenses" min="0" step="0.01" value={formData.trainingExpenses} onChange={handleInputChange} className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label htmlFor="otherExpenses" className="block text-sm font-medium">Other Expenses (PHP)</label>
                                        <input type="number" name="otherExpenses" id="otherExpenses" min="0" step="0.01" value={formData.otherExpenses} onChange={handleInputChange} className={commonInputClasses} />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label htmlFor="totalBudget" className="block text-sm font-medium">Total Budget</label>
                                        <input type="text" name="totalBudget" id="totalBudget" value={formatCurrency(totalBudget)} disabled className={`${commonInputClasses} bg-gray-100 dark:bg-gray-800`} />
                                    </div>
                                </div>
                            </fieldset>
                             <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Funding Source</legend>
                                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label htmlFor="fundingYear" className="block text-sm font-medium">Funding Year</label>
                                        <input type="number" name="fundingYear" id="fundingYear" value={formData.fundingYear} onChange={handleInputChange} min="2000" max="2100" className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label htmlFor="fundType" className="block text-sm font-medium">Fund Type</label>
                                        <select name="fundType" id="fundType" value={formData.fundType} onChange={handleInputChange} className={commonInputClasses}>
                                            {fundTypes.map(ft => <option key={ft} value={ft}>{ft}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label htmlFor="tier" className="block text-sm font-medium">Tier</label>
                                        <select name="tier" id="tier" value={formData.tier} onChange={handleInputChange} className={commonInputClasses}>
                                            {tiers.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </fieldset>
                            <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Financial Schedule</legend>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                                     <div>
                                        <label htmlFor="monthOfObligation" className="block text-sm font-medium">Month of Obligation</label>
                                        <select name="monthOfObligation" id="monthOfObligation" value={formData.monthOfObligation} onChange={handleInputChange} className={commonInputClasses}>
                                            {months.map(m => <option key={m} value={m}>{m}</option>)}
                                        </select>
                                    </div>
                                     <div className="md:row-span-2">
                                        <label className="block text-sm font-medium">Disbursement Schedule</label>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-1">
                                            {formData.disbursementSchedule.map(({month, amount}) => (
                                                <div key={month} className="flex items-center gap-2">
                                                    <label htmlFor={`disburse-${month}`} className="w-20 text-sm text-gray-600 dark:text-gray-300">{month}</label>
                                                    <input 
                                                        type="number" 
                                                        id={`disburse-${month}`}
                                                        value={amount || ''}
                                                        onChange={(e) => handleDisbursementChange(month, e.target.value)}
                                                        className="block w-full px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm sm:text-sm"
                                                        placeholder="0.00"
                                                        min="0" step="0.01"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                         <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                                            <span className="font-semibold text-sm">Total Disbursed:</span>
                                            <span className="font-bold text-sm">{formatCurrency(totalDisbursed)}</span>
                                         </div>
                                    </div>
                                </div>
                            </fieldset>
                         </div>
                    )}
                </div>
                <div className="flex justify-end gap-4 pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
                    <button type="button" onClick={handleCancelEdit} className="inline-flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                        Cancel
                    </button>
                    <button type="submit" className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent">
                        {editingTraining ? 'Update Training' : 'Add Training'}
                    </button>
                </div>
            </form>
        </div>
    );
// FIX: Add return statement to the functional component.
    return (
        <div>
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
            {view === 'list' ? renderListView() : renderFormView()}
        </div>
    );
};

// FIX: Add default export to resolve import error in App.tsx
export default TrainingsComponent;