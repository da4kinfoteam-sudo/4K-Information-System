

import React, { useState, FormEvent, useMemo, useEffect } from 'react';
// FIX: Add FundType and Tier to imports to handle type widening.
import { Subproject, SubprojectDetail, IPO, philippineRegions, particularTypes, objectCodes, ObjectCode, fundTypes, tiers, FundType, Tier } from '../constants';
import LocationPicker from './LocationPicker';

// Declare XLSX to inform TypeScript about the global variable from the script tag
declare const XLSX: any;

type SubprojectDetailInput = Omit<SubprojectDetail, 'id'>;

interface SubprojectsProps {
    ipos: IPO[];
    subprojects: Subproject[];
    setSubprojects: React.Dispatch<React.SetStateAction<Subproject[]>>;
    onSelectIpo: (ipo: IPO) => void;
    onSelectSubproject: (subproject: Subproject) => void;
}

const Subprojects: React.FC<SubprojectsProps> = ({ ipos, subprojects, setSubprojects, onSelectIpo, onSelectSubproject }) => {
    const [detailItems, setDetailItems] = useState<SubprojectDetailInput[]>([]);
    const [currentDetail, setCurrentDetail] = useState({
        type: '',
        particulars: '',
        deliveryDate: '',
        unitOfMeasure: 'pcs' as SubprojectDetail['unitOfMeasure'],
        pricePerUnit: '',
        numberOfUnits: '',
        // FIX: Add type assertion to ensure the state can hold any 'ObjectCode', not just the first value.
        objectCode: objectCodes[0] as ObjectCode,
        obligationMonth: '',
        disbursementMonth: '',
    });
    const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
    const [editingSubproject, setEditingSubproject] = useState<Subproject | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [projectToDelete, setProjectToDelete] = useState<Subproject | null>(null);
    const [dateError, setDateError] = useState('');

    const [selectedRegion, setSelectedRegion] = useState('');
    const [ipoSearch, setIpoSearch] = useState('');
    const [isUploading, setIsUploading] = useState(false);

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [packageFilter, setPackageFilter] = useState('All');
    type SortKeys = keyof Subproject | 'budget';
    const [sortConfig, setSortConfig] = useState<{ key: SortKeys; direction: 'ascending' | 'descending' } | null>({ key: 'startDate', direction: 'descending' });
    const [activeTab, setActiveTab] = useState<'info' | 'breakdown'>('info');
    const [view, setView] = useState<'list' | 'add' | 'edit'>('list');

    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);


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
        fundingYear: new Date().getFullYear(),
        // FIX: Widen types for fundType and tier to allow any valid value, not just the default.
        fundType: fundTypes[0] as FundType,
        tier: tiers[0] as Tier,
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
                fundingYear: editingSubproject.fundingYear ?? new Date().getFullYear(),
                fundType: editingSubproject.fundType ?? fundTypes[0],
                tier: editingSubproject.tier ?? tiers[0],
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

    const paginatedSubprojects = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return processedSubprojects.slice(startIndex, startIndex + itemsPerPage);
    }, [processedSubprojects, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(processedSubprojects.length / itemsPerPage);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter, packageFilter, sortConfig, itemsPerPage]);

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
        
        if (name === 'status') {
            const newStatus = value as Subproject['status'];
            if (newStatus === 'Completed' && !formData.actualCompletionDate) {
                 const currentDate = new Date().toISOString().split('T')[0];
                 setFormData(prev => ({ ...prev, status: newStatus, actualCompletionDate: currentDate }));
            } else if (newStatus !== 'Completed') {
                setFormData(prev => ({ ...prev, status: newStatus, actualCompletionDate: '' }));
            } else {
                 setFormData(prev => ({ ...prev, status: newStatus }));
            }
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
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
        setDateError('');
        if (!formData.startDate || !formData.estimatedCompletionDate) {
            alert('Please set the project Start Date and Estimated Completion Date first.');
            return;
        }
        if (!currentDetail.type || !currentDetail.particulars || !currentDetail.deliveryDate || !currentDetail.pricePerUnit || !currentDetail.numberOfUnits || !currentDetail.obligationMonth || !currentDetail.disbursementMonth) {
            alert('Please fill out all detail fields, including dates and object code.');
            return;
        }

        const delivery = new Date(currentDetail.deliveryDate + 'T00:00:00Z');
        const start = new Date(formData.startDate + 'T00:00:00Z');
        const end = new Date(formData.estimatedCompletionDate + 'T00:00:00Z');
        
        if (delivery < start || delivery > end) {
            setDateError(`Delivery date must be between ${formData.startDate} and ${formData.estimatedCompletionDate}.`);
            return;
        }

        setDetailItems(prev => [...prev, {
            type: currentDetail.type,
            particulars: currentDetail.particulars,
            deliveryDate: currentDetail.deliveryDate,
            unitOfMeasure: currentDetail.unitOfMeasure,
            pricePerUnit: parseFloat(currentDetail.pricePerUnit),
            numberOfUnits: parseInt(currentDetail.numberOfUnits, 10),
            objectCode: currentDetail.objectCode,
            obligationMonth: currentDetail.obligationMonth,
            disbursementMonth: currentDetail.disbursementMonth,
        }]);
        setCurrentDetail({
            type: '',
            particulars: '',
            deliveryDate: '',
            unitOfMeasure: 'pcs',
            pricePerUnit: '',
            numberOfUnits: '',
            objectCode: objectCodes[0],
            obligationMonth: '',
            disbursementMonth: '',
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
            objectCode: itemToEdit.objectCode,
            obligationMonth: itemToEdit.obligationMonth,
            disbursementMonth: itemToEdit.disbursementMonth,
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
                fundingYear: Number(formData.fundingYear),
                lat: editingSubproject.lat || dummyCoords.lat,
                lng: editingSubproject.lng || dummyCoords.lng,
                details: detailItems.map((detail, index) => ({ ...detail, id: index + 1 })),
            };
            setSubprojects(prev => prev.map(p => p.id === editingSubproject.id ? updatedSubproject : p));
        } else {
            const newSubproject: Subproject = {
                id: subprojects.length > 0 ? Math.max(...subprojects.map(p => p.id)) + 1 : 1,
                ...formData,
                fundingYear: Number(formData.fundingYear),
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
        setView('edit');
    };
    
    const handleAddNewClick = () => {
        setEditingSubproject(null);
        setActiveTab('info');
        setView('add');
    };

    const handleCancelEdit = () => {
        setEditingSubproject(null);
        setFormData(defaultFormData);
        setDetailItems([]);
        setSelectedRegion('');
        setIpoSearch('');
        setActiveTab('info');
        setView('list');
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
    
    const handleDownloadReport = () => {
        const dataToExport = processedSubprojects.map(p => ({
            'Project Name': p.name,
            'Package': p.packageType,
            'IPO': p.indigenousPeopleOrganization,
            'Location': p.location,
            'Start Date': p.startDate,
            'Est. Completion': p.estimatedCompletionDate,
            'Actual Completion': p.actualCompletionDate || 'N/A',
            'Total Budget': calculateTotalBudget(p.details),
            'Status': p.status,
            'Remarks': p.remarks || ''
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
        XLSX.utils.book_append_sheet(wb, ws, "Subprojects Report");
        XLSX.writeFile(wb, "Subprojects_Report.xlsx");
    };

    const handleDownloadTemplate = () => {
        const headers = [
            'name', 'indigenousPeopleOrganization', 'packageType', 
            'startDate', 'estimatedCompletionDate', 'remarks', 'details'
        ];
        
        const exampleData = [{
            name: 'Sample Farm-to-Market Road',
            indigenousPeopleOrganization: 'San Isidro Farmers Association', // Must be an exact name from the IPO list
            packageType: 'Package 3',
            startDate: '2024-01-01',
            estimatedCompletionDate: '2024-12-31',
            remarks: 'Initial planning phase.',
            details: '[{"type":"Infrastructure","particulars":"Gravel and Sand","deliveryDate":"2024-02-15","unitOfMeasure":"lot","pricePerUnit":500000,"numberOfUnits":1,"objectCode":"CO","obligationMonth":"2024-01-20","disbursementMonth":"2024-03-01"}]'
        }];

        const instructions = [
            ["Column", "Description", "Required?"],
            ["name", "Full name of the Subproject.", "Yes"],
            ["indigenousPeopleOrganization", "The exact, full name of an existing IPO in the system.", "Yes"],
            ["packageType", "e.g., 'Package 1', 'Package 2', etc.", "Yes"],
            ["startDate", "Date in YYYY-MM-DD format.", "Yes"],
            ["estimatedCompletionDate", "Date in YYYY-MM-DD format.", "Yes"],
            ["remarks", "Any relevant remarks about the project.", "No"],
            ["details", `A JSON string for project breakdown. Format: '[{"type":"Type","particulars":"Name", "deliveryDate":"YYYY-MM-DD", "unitOfMeasure":"unit", "pricePerUnit":Number, "numberOfUnits":Number, "objectCode":"CO", "obligationMonth":"YYYY-MM-DD", "disbursementMonth":"YYYY-MM-DD"}]'. Use '[]' if empty.`, "Yes"],
        ];

        const wb = XLSX.utils.book_new();
        const ws_data = XLSX.utils.json_to_sheet(exampleData, { header: headers });
        const ws_instructions = XLSX.utils.aoa_to_sheet(instructions);
        
        XLSX.utils.book_append_sheet(wb, ws_data, "Subprojects Data");
        XLSX.utils.book_append_sheet(wb, ws_instructions, "Instructions");

        XLSX.writeFile(wb, "Subprojects_Upload_Template.xlsx");
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

                let currentMaxId = subprojects.reduce((max, p) => Math.max(max, p.id), 0);
                const existingIpoNames = new Set(ipos.map(ipo => ipo.name));
                
                const newSubprojects: Subproject[] = jsonData.map((row, index) => {
                    const rowNum = index + 2;
                    // Validation
                    if (!row.name || !row.indigenousPeopleOrganization || !row.startDate || !row.estimatedCompletionDate || !row.packageType) {
                        throw new Error(`Row ${rowNum}: Missing required fields (name, indigenousPeopleOrganization, startDate, estimatedCompletionDate, packageType).`);
                    }
                    if (!existingIpoNames.has(row.indigenousPeopleOrganization)) {
                        throw new Error(`Row ${rowNum}: IPO "${row.indigenousPeopleOrganization}" does not exist in the system.`);
                    }

                    let details: SubprojectDetailInput[];
                    try {
                        details = typeof row.details === 'string' ? JSON.parse(row.details) : [];
                        if (!Array.isArray(details)) throw new Error("Details must be a valid JSON array.");
                    } catch {
                        throw new Error(`Row ${rowNum}: Invalid JSON format in 'details' column.`);
                    }

                    currentMaxId++;
                    const linkedIpo = ipos.find(ipo => ipo.name === row.indigenousPeopleOrganization)!;

                    return {
                        id: currentMaxId,
                        name: String(row.name),
                        location: linkedIpo.location, // Inherit location from IPO
                        indigenousPeopleOrganization: String(row.indigenousPeopleOrganization),
                        status: 'Proposed', // Default status for new uploads
                        packageType: String(row.packageType) as `Package ${number}`,
                        startDate: String(row.startDate),
                        estimatedCompletionDate: String(row.estimatedCompletionDate),
                        actualCompletionDate: '',
                        remarks: String(row.remarks || ''),
                        lat: 14.5, // Dummy coords
                        lng: 121.5,
                        details: details.map((d, i) => ({ ...d, id: i + 1 })),
                        history: [{ date: new Date().toISOString().split('T')[0], user: 'System', event: 'Subproject created via bulk upload.' }]
                    };
                });

                setSubprojects(prev => [...prev, ...newSubprojects]);
                alert(`${newSubprojects.length} subproject(s) imported successfully!`);
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
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Subprojects Management</h2>
                <button
                    onClick={handleAddNewClick}
                    className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent"
                >
                    + Add New Subproject
                </button>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                 <div className="mb-4 flex flex-col gap-4">
                    <div className="flex flex-wrap gap-4 items-center justify-between">
                        <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
                            <input
                                type="text"
                                placeholder="Search by name, IPO, or location..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className={`w-full md:w-auto ${commonInputClasses} mt-0`}
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
                        <div className="flex items-center gap-2">
                            <button onClick={handleDownloadReport} className="inline-flex items-center justify-center py-2 px-3 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">Download Report</button>
                            <button onClick={handleDownloadTemplate} className="inline-flex items-center justify-center py-2 px-3 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">Template</button>
                            <label htmlFor="subproject-upload" className={`inline-flex items-center justify-center py-2 px-3 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 ${isUploading ? 'bg-gray-400 cursor-not-allowed' : 'cursor-pointer'}`}>{isUploading ? 'Uploading...' : 'Upload XLSX'}</label>
                            <input id="subproject-upload" type="file" className="hidden" onChange={handleFileUpload} accept=".xlsx, .xls" disabled={isUploading} />
                        </div>
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
                            {paginatedSubprojects.map((project) => (
                                <React.Fragment key={project.id}>
                                    <tr onClick={() => handleToggleRow(project.id)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="px-4 py-4 text-gray-400">
                                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-200 ${expandedRowId === project.id ? 'transform rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onSelectSubproject(project);
                                                }}
                                                className="text-left hover:text-accent dark:hover:text-green-400 focus:outline-none focus:underline"
                                                title={`View details for ${project.name}`}
                                            >
                                                {project.name}
                                            </button>
                                        </td>
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
                                                                    <th className="px-4 py-2 text-left">Obj. Code</th>
                                                                    <th className="px-4 py-2 text-left">Obligation</th>
                                                                    <th className="px-4 py-2 text-left">Disbursement</th>
                                                                    <th className="px-4 py-2 text-right"># of Units</th>
                                                                    <th className="px-4 py-2 text-right">Subtotal</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="text-sm">
                                                                {project.details.map(detail => (
                                                                    <tr key={detail.id} className="border-b border-gray-200 dark:border-gray-700">
                                                                        <td className="px-4 py-2 font-medium">{detail.particulars}</td>
                                                                        <td className="px-4 py-2">{detail.objectCode}</td>
                                                                        <td className="px-4 py-2">{formatDate(detail.obligationMonth)}</td>
                                                                        <td className="px-4 py-2">{formatDate(detail.disbursementMonth)}</td>
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
                                                             <p className="text-sm text-gray-600 dark:text-gray-300"><span className="font-semibold">Funding Year:</span> {project.fundingYear ?? 'N/A'}</p>
                                                             <p className="text-sm text-gray-600 dark:text-gray-300"><span className="font-semibold">Fund Type:</span> {project.fundType ?? 'N/A'}</p>
                                                             <p className="text-sm text-gray-600 dark:text-gray-300"><span className="font-semibold">Tier:</span> {project.tier ?? 'N/A'}</p>
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
                            Showing {Math.min((currentPage - 1) * itemsPerPage + 1, processedSubprojects.length)} to {Math.min(currentPage * itemsPerPage, processedSubprojects.length)} of {processedSubprojects.length} entries
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
                    <h3 className="text-2xl font-semibold text-gray-800 dark:text-white">{view === 'edit' ? 'Edit Subproject' : 'Add New Subproject'}</h3>
                    <button onClick={handleCancelEdit} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        Back to List
                    </button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                        <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                            <TabButton tabName="info" label="Project Information" />
                            <TabButton tabName="breakdown" label="Project Breakdown" />
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
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                     <div>
                                        <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Start Date</label>
                                        <input type="date" name="startDate" id="startDate" value={formData.startDate} onChange={handleInputChange} required className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label htmlFor="estimatedCompletionDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Estimated Completion Date</label>
                                        <input type="date" name="estimatedCompletionDate" id="estimatedCompletionDate" value={formData.estimatedCompletionDate} onChange={handleInputChange} required className={commonInputClasses} />
                                    </div>
                                 </div>
                                 {formData.status === 'Completed' && (
                                     <div>
                                        <label htmlFor="actualCompletionDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Completion Date</label>
                                        <input type="date" name="actualCompletionDate" id="actualCompletionDate" value={formData.actualCompletionDate} onChange={handleInputChange} className={commonInputClasses} />
                                     </div>
                                 )}
                                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label htmlFor="fundingYear" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Funding Year</label>
                                        <input type="number" name="fundingYear" id="fundingYear" value={formData.fundingYear} onChange={handleInputChange} min="2000" max="2100" className={commonInputClasses} />
                                    </div>
                                    <div>
                                        <label htmlFor="fundType" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fund Type</label>
                                        <select name="fundType" id="fundType" value={formData.fundType} onChange={handleInputChange} className={commonInputClasses}>
                                            {fundTypes.map(ft => <option key={ft} value={ft}>{ft}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label htmlFor="tier" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tier</label>
                                        <select name="tier" id="tier" value={formData.tier} onChange={handleInputChange} className={commonInputClasses}>
                                            {tiers.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                </div>
                                 <div>
                                    <label htmlFor="remarks" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Remarks</label>
                                    <textarea name="remarks" id="remarks" value={formData.remarks} onChange={handleInputChange} rows={3} className={commonInputClasses} />
                                </div>
                             </div>
                         )}
                         
                         {activeTab === 'breakdown' && (
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
                                                <span className="text-gray-500 dark:text-gray-400"> ({item.type} - {item.objectCode})</span>
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
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-end p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                                    <div className="lg:col-span-2">
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Type</label>
                                        <select name="type" value={currentDetail.type} onChange={handleDetailChange} className="mt-1 block w-full pl-2 pr-8 py-1.5 text-base bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md text-sm">
                                            <option value="">Select a type</option>
                                            {Object.keys(particularTypes).map(type => (
                                                <option key={type} value={type}>{type}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="lg:col-span-2">
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Item</label>
                                        <select name="particulars" value={currentDetail.particulars} onChange={handleDetailChange} disabled={!currentDetail.type} className="mt-1 block w-full pl-2 pr-8 py-1.5 text-base bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md text-sm disabled:bg-gray-200 dark:disabled:bg-gray-600">
                                            <option value="">Select an item</option>
                                            {currentDetail.type && particularTypes[currentDetail.type].map(item => (
                                                <option key={item} value={item}>{item}</option>
                                            ))}
                                        </select>
                                    </div>
                                    
                                     <div>
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Delivery Date</label>
                                        <input type="date" name="deliveryDate" value={currentDetail.deliveryDate} onChange={handleDetailChange} className="mt-1 block w-full px-2 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm" />
                                        {dateError && <p className="text-xs text-red-500 mt-1">{dateError}</p>}
                                    </div>
                                     <div>
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Object Code</label>
                                        <select name="objectCode" value={currentDetail.objectCode} onChange={(e) => handleDetailChange(e as React.ChangeEvent<HTMLSelectElement>)} className="mt-1 block w-full pl-2 pr-8 py-1.5 text-base bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md text-sm">
                                            {objectCodes.map(code => <option key={code} value={code}>{code}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Obligation Month</label>
                                        <input type="date" name="obligationMonth" value={currentDetail.obligationMonth} onChange={handleDetailChange} className="mt-1 block w-full px-2 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm" />
                                    </div>
                                     <div>
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Disbursement Month</label>
                                        <input type="date" name="disbursementMonth" value={currentDetail.disbursementMonth} onChange={handleDetailChange} className="mt-1 block w-full px-2 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm" />
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
                                    <div className="flex items-center gap-2 col-span-2">
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
    );


    return (
        <div>
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
            {view === 'list' ? renderListView() : renderFormView()}
        </div>
    );
};

export default Subprojects;