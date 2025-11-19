
import React, { useState, FormEvent, useMemo, useEffect } from 'react';
import { OtherActivity, IPO, philippineRegions, otherActivityComponents, otherActivityOptions, OtherActivityComponentType, OtherActivityExpense, objectTypes, ObjectType, fundTypes, FundType, tiers, Tier } from '../constants';
import LocationPicker, { parseLocation } from './LocationPicker';
import { useAuth } from '../contexts/AuthContext';

// Declare XLSX to inform TypeScript about the global variable from the script tag
declare const XLSX: any;

interface OtherActivitiesProps {
    ipos: IPO[];
    otherActivities: OtherActivity[];
    setOtherActivities: React.Dispatch<React.SetStateAction<OtherActivity[]>>;
    onSelectIpo: (ipo: IPO) => void;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
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
    fundingYear: new Date().getFullYear(),
    fundType: fundTypes[0] as FundType,
    tier: tiers[0] as Tier,
    operatingUnit: '',
    encodedBy: ''
};

export const OtherActivitiesComponent: React.FC<OtherActivitiesProps> = ({ ipos, otherActivities, setOtherActivities, onSelectIpo, uacsCodes }) => {
    const { currentUser } = useAuth();
    const [formData, setFormData] = useState(defaultFormData);
    const [editingActivity, setEditingActivity] = useState<OtherActivity | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [activityToDelete, setActivityToDelete] = useState<OtherActivity | null>(null);
    const [ipoRegionFilter, setIpoRegionFilter] = useState('All');
    const [activeTab, setActiveTab] = useState<'details' | 'budget'>('details');
    const [isUploading, setIsUploading] = useState(false);

    const [searchTerm, setSearchTerm] = useState('');
    const [tableRegionFilter, setTableRegionFilter] = useState('All');
    const [componentFilter, setComponentFilter] = useState<OtherActivityComponentType | 'All'>('All');
    type SortKeys = keyof OtherActivity | 'totalParticipants' | 'budget';
    const [sortConfig, setSortConfig] = useState<{ key: SortKeys; direction: 'ascending' | 'descending' } | null>({ key: 'date', direction: 'descending' });
    const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
    const [view, setView] = useState<'list' | 'add' | 'edit'>('list');
    
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const canEdit = currentUser?.role === 'Administrator' || currentUser?.role === 'User';
    const canViewAll = currentUser?.role === 'Administrator' || currentUser?.operatingUnit === 'NPMO';

    const [currentExpense, setCurrentExpense] = useState({
        objectType: 'MOOE' as ObjectType,
        expenseParticular: '',
        uacsCode: '',
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
                fundingYear: editingActivity.fundingYear ?? new Date().getFullYear(),
                fundType: editingActivity.fundType ?? fundTypes[0],
                tier: editingActivity.tier ?? tiers[0],
            });
             setActiveTab('details');
        } else {
            setFormData({
                ...defaultFormData,
                operatingUnit: currentUser?.operatingUnit || '',
                encodedBy: currentUser?.fullName || ''
            });
        }
    }, [editingActivity, currentUser]);
    
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

        // OU Filtering
        if (!canViewAll && currentUser) {
            filtered = filtered.filter(a => a.operatingUnit === currentUser.operatingUnit);
        }

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
                t.description.toLowerCase().includes(lowercasedSearchTerm) ||
                t.operatingUnit.toLowerCase().includes(lowercasedSearchTerm)
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
    }, [otherActivities, searchTerm, componentFilter, sortConfig, tableRegionFilter, ipos, currentUser, canViewAll]);

    const paginatedActivities = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return processedActivities.slice(startIndex, startIndex + itemsPerPage);
    }, [processedActivities, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(processedActivities.length / itemsPerPage);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, componentFilter, tableRegionFilter, sortConfig, itemsPerPage]);


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
        if (name === 'objectType') {
            setCurrentExpense(prev => ({ ...prev, objectType: value as ObjectType, expenseParticular: '', uacsCode: '' }));
        } else if (name === 'expenseParticular') {
            setCurrentExpense(prev => ({ ...prev, expenseParticular: value, uacsCode: '' }));
        } else {
            setCurrentExpense(prev => ({...prev, [name]: value}));
        }
    };
    
    const handleAddExpense = () => {
        if (!currentExpense.amount || !currentExpense.obligationMonth || !currentExpense.disbursementMonth || !currentExpense.uacsCode) {
            alert('Please fill out all expense fields, including UACS classification.');
            return;
        }
        const newExpense: OtherActivityExpense = {
            id: Date.now(),
            objectType: currentExpense.objectType,
            expenseParticular: currentExpense.expenseParticular,
            uacsCode: currentExpense.uacsCode,
            obligationMonth: currentExpense.obligationMonth,
            disbursementMonth: currentExpense.disbursementMonth,
            amount: parseFloat(currentExpense.amount)
        };
        setFormData(prev => ({...prev, expenses: [...prev.expenses, newExpense]}));
        setCurrentExpense({
            objectType: 'MOOE',
            expenseParticular: '',
            uacsCode: '',
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
            fundingYear: Number(formData.fundingYear) || new Date().getFullYear(),
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
    
    const handleDownloadReport = () => {
        const dataToExport = processedActivities.map(a => ({
            'Component': a.component,
            'Activity Name': a.name,
            'Date': a.date,
            'Location': a.location,
            'Male Participants': a.participantsMale,
            'Female Participants': a.participantsFemale,
            'Total Budget': a.expenses.reduce((sum, e) => sum + e.amount, 0),
            'Funding Year': a.fundingYear,
            'Fund Type': a.fundType,
            'Tier': a.tier,
            'Operating Unit': a.operatingUnit,
            'Encoded By': a.encodedBy,
            'Participating IPOs': a.participatingIpos.join(', '),
            'Description': a.description,
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
        XLSX.utils.book_append_sheet(wb, ws, "Other Activities Report");
        XLSX.writeFile(wb, "Other_Activities_Report.xlsx");
    };

    // ... handleDownloadTemplate (omitted) ...
    const handleDownloadTemplate = () => {
        const exampleData = [{
            component: 'Social Preparation', name: 'Community Needs Assessment', date: '2024-02-20', description: 'Assessed community needs for subproject identification.',
            location: 'Brgy. San Isidro, Tanay, Rizal', participatingIpos: 'San Isidro Farmers Association', participantsMale: 20, participantsFemale: 25,
            expenses: '[{"objectType":"MOOE","expenseParticular":"Travelling Expenses","uacsCode":"50201010-00","obligationMonth":"2024-02-15","disbursementMonth":"2024-02-28","amount":30000}]',
            fundingYear: 2024, fundType: 'Current', tier: 'Tier 1'
        }];
        const wb = XLSX.utils.book_new();
        const ws_data = XLSX.utils.json_to_sheet(exampleData);
        XLSX.utils.book_append_sheet(wb, ws_data, "Activities Data");
        XLSX.writeFile(wb, "Other_Activities_Upload_Template.xlsx");
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

                let currentMaxId = otherActivities.reduce((max, a) => Math.max(max, a.id), 0);
                
                const newActivities: OtherActivity[] = jsonData.map((row, index) => {
                    const rowNum = index + 2;
                    if (!row.component || !row.name || !row.date || !row.location) throw new Error(`Row ${rowNum}: Missing required fields.`);
                    
                    let expenses: OtherActivityExpense[];
                    try {
                        expenses = typeof row.expenses === 'string' ? JSON.parse(row.expenses) : [];
                    } catch { expenses = []; }

                    currentMaxId++;
                    return {
                        id: currentMaxId,
                        component: row.component as OtherActivityComponentType,
                        name: String(row.name),
                        date: String(row.date),
                        description: String(row.description || ''),
                        location: String(row.location),
                        participatingIpos: (row.participatingIpos || '').toString().split(',').map((s: string) => s.trim()).filter(Boolean),
                        participantsMale: Number(row.participantsMale) || 0,
                        participantsFemale: Number(row.participantsFemale) || 0,
                        expenses: expenses.map((exp, i) => ({ ...exp, id: Date.now() + i })),
                        fundingYear: Number(row.fundingYear) || undefined,
                        fundType: fundTypes.includes(row.fundType) ? row.fundType : undefined,
                        tier: tiers.includes(row.tier) ? row.tier : undefined,
                        operatingUnit: currentUser?.operatingUnit || 'NPMO',
                        encodedBy: currentUser?.fullName || 'System'
                    };
                });

                setOtherActivities(prev => [...prev, ...newActivities]);
                alert(`${newActivities.length} activit(y/ies) imported successfully!`);
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
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Other Activities</h2>
                {canEdit && (
                    <button onClick={handleAddNewClick} className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent">
                        + Add New Activity
                    </button>
                )}
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                 <div className="mb-4 flex flex-col md:flex-row gap-4">
                    <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
                        <input type="text" placeholder="Search activities..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className={`w-full md:w-auto ${commonInputClasses} mt-0`} />
                        <div className="flex items-center gap-2">
                           <label htmlFor="tableRegionFilter" className="text-sm font-medium text-gray-700 dark:text-gray-300">Region:</label>
                            <select id="tableRegionFilter" value={tableRegionFilter} onChange={(e) => setTableRegionFilter(e.target.value)} className={`${commonInputClasses} mt-0`}>
                                <option value="All">All Regions</option><option value="Online">Online</option>{philippineRegions.map(region => ( <option key={region} value={region}>{region}</option> ))}
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                           <label htmlFor="componentFilter" className="text-sm font-medium text-gray-700 dark:text-gray-300">Component:</label>
                            <select id="componentFilter" value={componentFilter} onChange={(e) => setComponentFilter(e.target.value as any)} className={`${commonInputClasses} mt-0`}>
                                <option value="All">All Components</option>{otherActivityComponents.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="flex-grow"></div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleDownloadReport} className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">Download Report</button>
                        {canEdit && (
                            <>
                                <button onClick={handleDownloadTemplate} className="inline-flex items-center justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">Download Template</button>
                                <label htmlFor="activity-upload" className={`inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 ${isUploading ? 'bg-gray-400 cursor-not-allowed' : 'cursor-pointer'}`}>{isUploading ? 'Uploading...' : 'Upload XLSX'}</label>
                                <input id="activity-upload" type="file" className="hidden" onChange={handleFileUpload} accept=".xlsx, .xls" disabled={isUploading} />
                            </>
                        )}
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
                                <SortableHeader sortKey="budget" label="Budget" />
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Op. Unit</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {paginatedActivities.map((activity) => {
                                const totalActivityBudget = activity.expenses.reduce((sum, e) => sum + e.amount, 0);
                                const totalParticipants = activity.participantsMale + activity.participantsFemale;
                                return (
                                <React.Fragment key={activity.id}>
                                    <tr onClick={() => handleToggleRow(activity.id)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="px-4 py-4 text-gray-400"><svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-200 ${expandedRowId === activity.id ? 'transform rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></td>
                                        <td className="px-6 py-4 whitespace-normal text-sm font-medium text-gray-900 dark:text-white">{activity.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatDate(activity.date)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{activity.component}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{totalParticipants > 0 ? totalParticipants : '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatCurrency(totalActivityBudget)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{activity.operatingUnit}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            {canEdit && (
                                                <>
                                                    <button onClick={(e) => { e.stopPropagation(); handleEditClick(activity); }} className="text-accent hover:brightness-90 dark:text-green-400 dark:hover:text-green-300 mr-4">Edit</button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(activity); }} className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200">Delete</button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                     {expandedRowId === activity.id && (
                                        <tr className="bg-gray-50 dark:bg-gray-900/50">
                                            <td colSpan={8} className="p-4">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div className="space-y-4">
                                                        <div>
                                                            <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Description</h4>
                                                            <p className="text-sm text-gray-600 dark:text-gray-300">{activity.description || 'No description provided.'}</p>
                                                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Encoded by: {activity.encodedBy}</p>
                                                        </div>
                                                        {activity.participatingIpos.length > 0 && (
                                                            <div>
                                                                <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Participating IPOs</h4>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {activity.participatingIpos.map(ipoName => {
                                                                        const ipo = ipos.find(i => i.name === ipoName);
                                                                        return (
                                                                            <button key={ipoName} onClick={(e) => { e.stopPropagation(); if (ipo) onSelectIpo(ipo); }} className="bg-gray-200 dark:bg-gray-700 rounded-full px-3 py-1 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed" disabled={!ipo} title={ipo ? `View details for ${ipoName}` : `${ipoName} (details not found)`}>
                                                                                {ipoName}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="space-y-4 text-sm bg-gray-100 dark:bg-gray-800/50 p-4 rounded-lg">
                                                        <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Budget & Funding</h4>
                                                         {activity.expenses.length > 0 ? (
                                                             <ul className="space-y-1">
                                                                {activity.expenses.map(exp => (
                                                                    <li key={exp.id} className="flex justify-between items-center p-1"><span>{exp.expenseParticular} ({exp.uacsCode})</span><span className="font-medium">{formatCurrency(exp.amount)}</span></li>
                                                                ))}
                                                                <li className="flex justify-between items-center p-1 border-t border-gray-300 dark:border-gray-600 mt-1 pt-1 font-bold"><span>Total</span><span>{formatCurrency(totalActivityBudget)}</span></li>
                                                            </ul>
                                                        ) : (<p className="text-sm text-gray-500 dark:text-gray-400 italic">No budget items listed.</p>)}
                                                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                                                             <p><strong className="text-gray-500 dark:text-gray-400">Funding Year:</strong> {activity.fundingYear ?? 'N/A'}</p>
                                                            <p><strong className="text-gray-500 dark:text-gray-400">Fund Type:</strong> {activity.fundType ?? 'N/A'}</p>
                                                            <p><strong className="text-gray-500 dark:text-gray-400">Tier:</strong> {activity.tier ?? 'N/A'}</p>
                                                        </div>
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
                 <div className="py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-700 dark:text-gray-300">Show</span>
                        <select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1 pl-2 pr-8 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm">
                            {[10, 20, 50, 100].map(size => ( <option key={size} value={size}>{size}</option> ))}
                        </select>
                        <span className="text-gray-700 dark:text-gray-300">entries</span>
                    </div>
                     <div className="flex items-center gap-4 text-sm">
                        <span className="text-gray-700 dark:text-gray-300">Showing {Math.min((currentPage - 1) * itemsPerPage + 1, processedActivities.length)} to {Math.min(currentPage * itemsPerPage, processedActivities.length)} of {processedActivities.length} entries</span>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">Previous</button>
                            <span className="px-2 font-medium">{currentPage} / {totalPages}</span>
                            <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );

    // ... renderFormView (omitted) ...
    const renderFormView = () => (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-semibold text-gray-800 dark:text-white">{view === 'edit' ? 'Edit Activity' : 'Add New Activity'}</h3>
                 <button onClick={handleCancelEdit} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Back to List</button>
            </div>
            <form onSubmit={handleSubmit}>
                <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                    <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                        <TabButton tabName="details" label="Activity Details" />
                        <TabButton tabName="budget" label="Expenses" />
                    </nav>
                </div>
                <div className="min-h-[400px]">
                    {activeTab === 'details' && (
                        <div className="space-y-6">
                            <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Core Details</legend>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                     <div><label htmlFor="component" className="block text-sm font-medium">Component</label><select name="component" id="component" value={formData.component} onChange={handleInputChange} required className={commonInputClasses}>{otherActivityComponents.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                                     <div><label htmlFor="name" className="block text-sm font-medium">Activity Name</label><select name="name" id="name" value={formData.name} onChange={handleInputChange} required className={commonInputClasses}><option value="">Select Activity</option>{otherActivityOptions[formData.component].map(opt => <option key={opt} value={opt}>{opt}</option>)}</select></div>
                                    <div><label htmlFor="date" className="block text-sm font-medium">Date</label><input type="date" name="date" id="date" value={formData.date} onChange={handleInputChange} required className={commonInputClasses} /></div>
                                </div>
                            </fieldset>
                            <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Location</legend>
                                 <LocationPicker value={formData.location} onChange={(loc) => setFormData(prev => ({ ...prev, location: loc }))} required allowOnline={true} />
                            </fieldset>
                             {formData.name !== 'Sub-Project Monitoring' && (
                                <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                    <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Participants</legend>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 items-end">
                                         <div><label htmlFor="participantsMale" className="block text-sm font-medium">Male Participants</label><input type="number" name="participantsMale" id="participantsMale" min="0" value={formData.participantsMale || ''} onChange={handleInputChange} className={commonInputClasses} /></div>
                                        <div><label htmlFor="participantsFemale" className="block text-sm font-medium">Female Participants</label><input type="number" name="participantsFemale" id="participantsFemale" min="0" value={formData.participantsFemale || ''} onChange={handleInputChange} className={commonInputClasses} /></div>
                                         <div><label htmlFor="totalParticipants" className="block text-sm font-medium">Total Participants</label><input type="number" name="totalParticipants" id="totalParticipants" value={(Number(formData.participantsMale)||0) + (Number(formData.participantsFemale)||0)} disabled className={`${commonInputClasses} bg-gray-100 dark:bg-gray-800`} /></div>
                                    </div>
                                </fieldset>
                            )}
                            <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Description</legend>
                                <div><label htmlFor="description" className="block text-sm font-medium">Description</label><textarea name="description" id="description" value={formData.description} onChange={handleInputChange} rows={3} className={commonInputClasses} /></div>
                            </fieldset>
                             {(formData.component !== 'Program Management' || formData.name === 'Sub-Project Monitoring') && (
                                <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                    <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Linked IPOs</legend>
                                    <div>
                                        <label htmlFor="participatingIpos" className="block text-sm font-medium">Participating IPOs</label>
                                        <div className="flex items-center gap-4 mt-1">
                                            <span className="text-sm text-gray-500 dark:text-gray-400">Filter by:</span>
                                            <select value={ipoRegionFilter} onChange={(e) => setIpoRegionFilter(e.target.value)} className="block w-full md:w-1/3 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm">
                                                <option value="All">All Regions</option>{philippineRegions.map(r => <option key={r} value={r}>{r}</option>)}
                                            </select>
                                        </div>
                                        <select multiple name="participatingIpos" id="participatingIpos" value={formData.participatingIpos} onChange={handleIpoSelectChange} className="mt-2 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm h-40">
                                            {filteredIposForSelection.map(ipo => ( <option key={ipo.id} value={ipo.name}>{`${ipo.name} (${parseLocation(ipo.location).province})`}</option> ))}
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
                                <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Funding Source</legend>
                                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div><label htmlFor="fundingYear" className="block text-sm font-medium">Funding Year</label><input type="number" name="fundingYear" id="fundingYear" value={formData.fundingYear} onChange={handleInputChange} min="2000" max="2100" className={commonInputClasses} /></div>
                                    <div><label htmlFor="fundType" className="block text-sm font-medium">Fund Type</label><select name="fundType" id="fundType" value={formData.fundType} onChange={handleInputChange} className={commonInputClasses}>{fundTypes.map(ft => <option key={ft} value={ft}>{ft}</option>)}</select></div>
                                    <div><label htmlFor="tier" className="block text-sm font-medium">Tier</label><select name="tier" id="tier" value={formData.tier} onChange={handleInputChange} className={commonInputClasses}>{tiers.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                </div>
                            </fieldset>
                            <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Budget Details</legend>
                                 <div className="space-y-2 mb-4">
                                    {formData.expenses.length === 0 && <p className="text-sm text-center py-4 text-gray-500 dark:text-gray-400">No expense items added yet.</p>}
                                    {formData.expenses.map((exp) => (
                                        <div key={exp.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 p-2 rounded-md">
                                            <div className="text-sm flex-grow">
                                                <span className="font-semibold">{exp.expenseParticular}</span>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">{exp.uacsCode} | Obligation: {formatDate(exp.obligationMonth)}</div>
                                            </div>
                                            <div className="flex items-center gap-4 ml-4">
                                                <span className="font-semibold text-sm">{formatCurrency(exp.amount)}</span>
                                                <button type="button" onClick={() => handleRemoveExpense(exp.id)} className="text-gray-400 hover:text-red-500"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end p-4 border-t border-gray-200 dark:border-gray-700">
                                    {/* ... Expense Inputs ... */}
                                     <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Object Type</label><select name="objectType" value={currentExpense.objectType} onChange={handleExpenseChange} className={commonInputClasses + " py-1.5 text-sm"}>{objectTypes.map(type => <option key={type} value={type}>{type}</option>)}</select></div>
                                        <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Expense Particular</label><select name="expenseParticular" value={currentExpense.expenseParticular} onChange={handleExpenseChange} className={commonInputClasses + " py-1.5 text-sm"}><option value="">Select Particular</option>{Object.keys(uacsCodes[currentExpense.objectType]).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                                        <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400">UACS Code</label><select name="uacsCode" value={currentExpense.uacsCode} onChange={handleExpenseChange} disabled={!currentExpense.expenseParticular} className={commonInputClasses + " py-1.5 text-sm disabled:bg-gray-200 dark:disabled:bg-gray-600"}><option value="">Select UACS Code</option>{currentExpense.expenseParticular && Object.entries(uacsCodes[currentExpense.objectType][currentExpense.expenseParticular]).map(([code, desc]) => <option key={code} value={code}>{code} - {desc}</option>)}</select></div>
                                    </div>
                                    <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Obligation Month</label><input type="date" name="obligationMonth" value={currentExpense.obligationMonth} onChange={handleExpenseChange} className={`${commonInputClasses} py-1.5 text-sm`} /></div>
                                    <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Disbursement Month</label><input type="date" name="disbursementMonth" value={currentExpense.disbursementMonth} onChange={handleExpenseChange} className={`${commonInputClasses} py-1.5 text-sm`} /></div>
                                    <div className="flex items-end gap-2 md:col-span-2">
                                        <div className="flex-1"><label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Amount (PHP)</label><input type="number" name="amount" value={currentExpense.amount} onChange={handleExpenseChange} min="0" step="0.01" className={`${commonInputClasses} py-1.5 text-sm`} /></div>
                                        <button type="button" onClick={handleAddExpense} className="h-9 w-9 flex-shrink-0 inline-flex items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50 text-accent dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900">+</button>
                                    </div>
                                </div>
                            </fieldset>
                         </div>
                    )}
                </div>
                <div className="flex justify-between items-center pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
                     <div className="text-lg font-bold">Total Budget: <span className="text-accent dark:text-green-400">{formatCurrency(totalBudget)}</span></div>
                    <div className="flex gap-4">
                        <button type="button" onClick={handleCancelEdit} className="inline-flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">Cancel</button>
                        <button type="submit" className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent">{editingActivity ? 'Update Activity' : 'Add Activity'}</button>
                    </div>
                </div>
            </form>
        </div>
    );

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
