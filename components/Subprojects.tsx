
import React, { useState, FormEvent, useMemo, useEffect, useRef, useLayoutEffect } from 'react';
import { Subproject, IPO, philippineRegions, SubprojectDetail, objectTypes, ObjectType, fundTypes, FundType, tiers, Tier, operatingUnits, SubprojectCommodity, targetCommodities, targetCommodityCategories } from '../constants';
import LocationPicker, { parseLocation } from './LocationPicker';
import { useAuth } from '../contexts/AuthContext';

// Declare XLSX to inform TypeScript about the global variable from the script tag
declare const XLSX: any;

interface SubprojectsProps {
    ipos: IPO[];
    subprojects: Subproject[];
    setSubprojects: React.Dispatch<React.SetStateAction<Subproject[]>>;
    setIpos: React.Dispatch<React.SetStateAction<IPO[]>>;
    onSelectIpo: (ipo: IPO) => void;
    onSelectSubproject: (subproject: Subproject) => void;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    particularTypes: { [key: string]: string[] };
}

const defaultFormData: Subproject = {
    id: 0,
    uid: '',
    name: '',
    location: '',
    indigenousPeopleOrganization: '',
    status: 'Proposed',
    details: [],
    subprojectCommodities: [],
    packageType: 'Package 1',
    startDate: '',
    estimatedCompletionDate: '',
    lat: 0,
    lng: 0,
    fundingYear: new Date().getFullYear(),
    fundType: 'Current',
    tier: 'Tier 1',
    operatingUnit: '',
    encodedBy: ''
};

const Subprojects: React.FC<SubprojectsProps> = ({ ipos, subprojects, setSubprojects, setIpos, onSelectIpo, onSelectSubproject, uacsCodes, particularTypes }) => {
    const { currentUser } = useAuth();
    const [formData, setFormData] = useState<Subproject>(defaultFormData);
    const [editingSubproject, setEditingSubproject] = useState<Subproject | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [subprojectToDelete, setSubprojectToDelete] = useState<Subproject | null>(null);
    
    // Error Modal State
    const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const [activeTab, setActiveTab] = useState<'details' | 'commodity' | 'budget' | 'accomplishments'>('details');
    const [isUploading, setIsUploading] = useState(false);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [regionFilter, setRegionFilter] = useState('All');
    const [ouFilter, setOuFilter] = useState('All');
    const [packageFilter, setPackageFilter] = useState('All');
    const [statusFilter, setStatusFilter] = useState('All');

    // Sorting
    type SortKeys = keyof Subproject | 'totalBudget' | 'actualObligated' | 'actualDisbursed' | 'completionRate' | 'commodityTarget';
    const [sortConfig, setSortConfig] = useState<{ key: SortKeys; direction: 'ascending' | 'descending' } | null>({ key: 'startDate', direction: 'descending' });
    
    const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
    const [view, setView] = useState<'list' | 'add' | 'edit'>('list');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    // Scroll persistence
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const scrollPositionRef = useRef(0);

    useLayoutEffect(() => {
        if (tableContainerRef.current) {
            tableContainerRef.current.scrollLeft = scrollPositionRef.current;
        }
    }, [sortConfig]);

    // Budget Form State
    const [currentDetail, setCurrentDetail] = useState<Omit<SubprojectDetail, 'id'>>({
        type: '',
        particulars: '',
        deliveryDate: '',
        unitOfMeasure: 'pcs',
        pricePerUnit: 0,
        numberOfUnits: 0,
        objectType: 'MOOE',
        expenseParticular: '',
        uacsCode: '',
        obligationMonth: '',
        disbursementMonth: ''
    });

    // Commodity Form State
    const [currentCommodity, setCurrentCommodity] = useState<SubprojectCommodity>({
        typeName: '',
        name: '',
        area: 0,
        averageYield: 0
    });

    const canEdit = currentUser?.role === 'Administrator' || currentUser?.role === 'User';
    const canViewAll = currentUser?.role === 'Administrator' || currentUser?.operatingUnit === 'NPMO';

    useEffect(() => {
        if (editingSubproject) {
            setFormData(editingSubproject);
            setActiveTab('details');
        } else {
            setFormData({
                ...defaultFormData,
                operatingUnit: currentUser?.operatingUnit || '',
                encodedBy: currentUser?.fullName || ''
            });
        }
    }, [editingSubproject, currentUser]);

    // Check completion status whenever details change
    useEffect(() => {
        if (editingSubproject && formData.details.length > 0) {
            const allItemsDelivered = formData.details.every(d => d.actualDeliveryDate && d.actualDeliveryDate.trim() !== '');
            if (allItemsDelivered) {
                // Find latest actual delivery date
                const latestDate = formData.details.reduce((latest, current) => {
                    const d = new Date(current.actualDeliveryDate!);
                    return d > latest ? d : latest;
                }, new Date(0));
                
                // Only update if status is not already completed to avoid infinite loops or unnecessary updates
                if (formData.status !== 'Completed') {
                    setFormData(prev => ({
                        ...prev,
                        status: 'Completed',
                        actualCompletionDate: latestDate.toISOString().split('T')[0]
                    }));
                }
            } else {
                // Revert status if not all items are delivered and it was automatically marked completed
                if (formData.status === 'Completed') {
                     setFormData(prev => ({
                        ...prev,
                        status: 'Ongoing', // Or revert to previous status if tracked
                        actualCompletionDate: undefined
                    }));
                }
            }
        }
    }, [formData.details, editingSubproject]);


    const processedSubprojects = useMemo(() => {
        let filtered = [...subprojects];

        if (!canViewAll && currentUser) {
            filtered = filtered.filter(s => s.operatingUnit === currentUser.operatingUnit);
        } else if (canViewAll && ouFilter !== 'All') {
            filtered = filtered.filter(s => s.operatingUnit === ouFilter);
        }

        if (regionFilter !== 'All') {
             if (regionFilter === 'Online') {
                 // Subprojects usually aren't online, but consistent with other components
                 filtered = [];
             } else {
                const iposInRegion = new Set(ipos.filter(ipo => ipo.region === regionFilter).map(ipo => ipo.name));
                filtered = filtered.filter(s => iposInRegion.has(s.indigenousPeopleOrganization));
             }
        }

        if (packageFilter !== 'All') {
            filtered = filtered.filter(s => s.packageType === packageFilter);
        }

        if (statusFilter !== 'All') {
            filtered = filtered.filter(s => s.status === statusFilter);
        }

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            filtered = filtered.filter(s =>
                s.name.toLowerCase().includes(lower) ||
                s.indigenousPeopleOrganization.toLowerCase().includes(lower) ||
                s.location.toLowerCase().includes(lower) ||
                s.operatingUnit.toLowerCase().includes(lower) ||
                s.uid.toLowerCase().includes(lower)
            );
        }

        if (sortConfig !== null) {
            filtered.sort((a, b) => {
                let aValue: any = '';
                let bValue: any = '';

                // Helper calculations for sorting
                const getBudget = (s: Subproject) => s.details.reduce((sum, d) => sum + (d.pricePerUnit * d.numberOfUnits), 0);
                const getObligated = (s: Subproject) => s.details.reduce((sum, d) => d.actualObligationDate ? sum + (d.actualAmount || 0) : sum, 0);
                const getDisbursed = (s: Subproject) => s.details.reduce((sum, d) => d.actualDisbursementDate ? sum + (d.actualAmount || 0) : sum, 0);
                const getRate = (s: Subproject) => {
                    const total = s.details.length;
                    const comp = s.details.filter(d => d.actualDeliveryDate).length;
                    return total > 0 ? (comp / total) * 100 : 0;
                };
                const getCommodities = (s: Subproject) => s.subprojectCommodities?.map(c => c.name).join(', ') || '';

                switch (sortConfig.key) {
                    case 'totalBudget':
                        aValue = getBudget(a);
                        bValue = getBudget(b);
                        break;
                    case 'actualObligated':
                        aValue = getObligated(a);
                        bValue = getObligated(b);
                        break;
                    case 'actualDisbursed':
                        aValue = getDisbursed(a);
                        bValue = getDisbursed(b);
                        break;
                    case 'completionRate':
                        aValue = getRate(a);
                        bValue = getRate(b);
                        break;
                    case 'commodityTarget':
                        aValue = getCommodities(a);
                        bValue = getCommodities(b);
                        break;
                    default:
                        aValue = a[sortConfig.key as keyof Subproject] ?? '';
                        bValue = b[sortConfig.key as keyof Subproject] ?? '';
                }

                if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return filtered;
    }, [subprojects, searchTerm, regionFilter, ouFilter, packageFilter, statusFilter, sortConfig, ipos, currentUser, canViewAll]);

    const paginatedSubprojects = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return processedSubprojects.slice(startIndex, startIndex + itemsPerPage);
    }, [processedSubprojects, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(processedSubprojects.length / itemsPerPage);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, regionFilter, ouFilter, packageFilter, statusFilter, sortConfig, itemsPerPage]);

    const requestSort = (key: SortKeys) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const handleToggleRow = (id: number) => {
        setExpandedRowId(prev => (prev === id ? null : id));
    };

    const calculateTotalBudget = (details: SubprojectDetail[]) => {
        return details.reduce((total, item) => total + (item.pricePerUnit * item.numberOfUnits), 0);
    };

    // --- Form Handlers ---

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        
        setFormData(prev => {
            const newData = { ...prev, [name]: value };

            if (name === 'fundType') {
                const currentSystemYear = new Date().getFullYear();
                if (value === 'Continuing') {
                    newData.fundingYear = currentSystemYear - 1;
                } else {
                    // 'Current' or 'Insertion'
                    newData.fundingYear = currentSystemYear;
                }
            }

            if (name === 'indigenousPeopleOrganization') {
                const selectedIpo = ipos.find(ipo => ipo.name === value);
                if (selectedIpo) {
                    newData.location = selectedIpo.location;
                } else {
                    newData.location = '';
                }
            }

            return newData;
        });
    };

    const handleDetailChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'type') {
            setCurrentDetail(prev => ({ ...prev, type: value, particulars: '' }));
        } else if (name === 'objectType') {
            setCurrentDetail(prev => ({ ...prev, objectType: value as ObjectType, expenseParticular: '', uacsCode: '' }));
        } else if (name === 'expenseParticular') {
            setCurrentDetail(prev => ({ ...prev, expenseParticular: value, uacsCode: '' }));
        } else {
            setCurrentDetail(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleAddDetail = () => {
        if (!currentDetail.particulars || !currentDetail.uacsCode || !currentDetail.pricePerUnit || !currentDetail.numberOfUnits) {
            alert("Please fill in required detail fields (Particulars, UACS, Price, Qty).");
            return;
        }
        const newDetail: SubprojectDetail = {
            id: Date.now(),
            ...currentDetail,
            pricePerUnit: Number(currentDetail.pricePerUnit),
            numberOfUnits: Number(currentDetail.numberOfUnits)
        };
        setFormData(prev => ({ ...prev, details: [...prev.details, newDetail] }));
        // Reset detail form
        setCurrentDetail(prev => ({
            ...prev,
            particulars: '',
            pricePerUnit: 0,
            numberOfUnits: 0,
            uacsCode: '',
            expenseParticular: '',
            obligationMonth: '',
            disbursementMonth: ''
        }));
    };

    const handleEditDetail = (id: number) => {
        const detailToEdit = formData.details.find(d => d.id === id);
        if (detailToEdit) {
            setCurrentDetail({
                type: detailToEdit.type,
                particulars: detailToEdit.particulars,
                deliveryDate: detailToEdit.deliveryDate,
                unitOfMeasure: detailToEdit.unitOfMeasure,
                pricePerUnit: detailToEdit.pricePerUnit,
                numberOfUnits: detailToEdit.numberOfUnits,
                objectType: detailToEdit.objectType,
                expenseParticular: detailToEdit.expenseParticular,
                uacsCode: detailToEdit.uacsCode,
                obligationMonth: detailToEdit.obligationMonth,
                disbursementMonth: detailToEdit.disbursementMonth
            });
            // Remove the item being edited so it can be re-added
            setFormData(prev => ({ ...prev, details: prev.details.filter(d => d.id !== id) }));
        }
    };

    const handleRemoveDetail = (id: number) => {
        setFormData(prev => ({ ...prev, details: prev.details.filter(d => d.id !== id) }));
    };

    const handleDetailAccomplishmentChange = (id: number, field: keyof SubprojectDetail, value: any) => {
        setFormData(prev => ({
            ...prev,
            details: prev.details.map(d => d.id === id ? { ...d, [field]: value } : d)
        }));
    };

    // Commodity Handlers
    const handleCommodityChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'typeName') {
            setCurrentCommodity(prev => ({ ...prev, typeName: value, name: '' })); // Reset commodity name if type changes
        } else {
            setCurrentCommodity(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleAddCommodity = () => {
        const isLivestock = currentCommodity.typeName === 'Livestock';
        if (!currentCommodity.typeName || !currentCommodity.name || !currentCommodity.area || (!isLivestock && !currentCommodity.averageYield)) {
            alert(`Please fill in all commodity fields (Type, Name, ${isLivestock ? 'Heads' : 'Area, Yield'}).`);
            return;
        }
        const newCommodity: SubprojectCommodity = {
            ...currentCommodity,
            area: Number(currentCommodity.area),
            averageYield: isLivestock ? undefined : Number(currentCommodity.averageYield)
        };
        setFormData(prev => ({
            ...prev,
            subprojectCommodities: [...(prev.subprojectCommodities || []), newCommodity]
        }));
        setCurrentCommodity({ typeName: '', name: '', area: 0, averageYield: 0 });
    };

    const handleEditCommodity = (index: number) => {
        const commodityToEdit = formData.subprojectCommodities?.[index];
        if (commodityToEdit) {
            setCurrentCommodity({
                typeName: commodityToEdit.typeName || '', // Handle legacy data
                name: commodityToEdit.name,
                area: commodityToEdit.area,
                averageYield: commodityToEdit.averageYield || 0
            });
            // Remove from list to allow re-adding
            setFormData(prev => ({
                ...prev,
                subprojectCommodities: (prev.subprojectCommodities || []).filter((_, i) => i !== index)
            }));
        }
    };

    const handleRemoveCommodity = (index: number) => {
        setFormData(prev => ({
            ...prev,
            subprojectCommodities: (prev.subprojectCommodities || []).filter((_, i) => i !== index)
        }));
    };

    const handleCommodityAccomplishmentChange = (index: number, value: number) => {
        setFormData(prev => ({
            ...prev,
            subprojectCommodities: prev.subprojectCommodities?.map((c, i) => i === index ? { ...c, actualYield: value } : c)
        }));
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        
        const missingFields: string[] = [];
        if (!formData.name) missingFields.push('Subproject Name');
        if (!formData.indigenousPeopleOrganization) missingFields.push('IPO');
        if (!formData.location) missingFields.push('Location');
        if (!formData.startDate) missingFields.push('Start Date');
        if (!formData.estimatedCompletionDate) missingFields.push('Estimated Completion Date');

        if (missingFields.length > 0) {
            setErrorMessage(`Please fill in the following required fields: ${missingFields.join(', ')}.`);
            setIsErrorModalOpen(true);
            return;
        }

        const historyEntry = {
            date: new Date().toISOString(),
            event: editingSubproject ? "Subproject Updated" : "Subproject Created",
            user: currentUser?.fullName || "System"
        };

        if (editingSubproject) {
            const updated = { 
                ...formData, 
                id: editingSubproject.id,
                history: [...(editingSubproject.history || []), historyEntry]
            };
            setSubprojects(prev => prev.map(p => p.id === updated.id ? updated : p));
        } else {
            const newId = Math.max(...subprojects.map(s => s.id), 0) + 1;
            // Generate simple UID if not present
            const uid = formData.uid || `SP-${new Date().getFullYear()}-${String(newId).padStart(3, '0')}`;
            const newSubproject = { 
                ...formData, 
                id: newId, 
                uid,
                history: [historyEntry]
            };
            setSubprojects(prev => [...prev, newSubproject]);
        }

        // Sync commodities to IPO
        if (formData.subprojectCommodities && formData.subprojectCommodities.length > 0) {
            setIpos(prev => prev.map(ipo => {
                if (ipo.name === formData.indigenousPeopleOrganization) {
                    const newCommodities = [...ipo.commodities];
                    let changed = false;
                    formData.subprojectCommodities?.forEach(sc => {
                        const exists = newCommodities.some(c => c.particular === sc.name && c.type === sc.typeName);
                        if (!exists) {
                            newCommodities.push({
                                type: sc.typeName,
                                particular: sc.name,
                                value: sc.area,
                                isScad: false
                            });
                            changed = true;
                        }
                    });
                    if (changed) return { ...ipo, commodities: newCommodities };
                }
                return ipo;
            }));
        }

        handleCancelEdit();
    };

    const handleEditClick = (subproject: Subproject) => {
        setEditingSubproject(subproject);
        setView('edit');
    };

    const handleAddNewClick = () => {
        setEditingSubproject(null);
        setView('add');
    };

    const handleCancelEdit = () => {
        setEditingSubproject(null);
        setFormData(defaultFormData);
        setView('list');
    };

    const handleDeleteClick = (subproject: Subproject) => {
        setSubprojectToDelete(subproject);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = () => {
        if (subprojectToDelete) {
            setSubprojects(prev => prev.filter(s => s.id !== subprojectToDelete.id));
            setIsDeleteModalOpen(false);
            setSubprojectToDelete(null);
        }
    };

    // --- Imports / Exports ---

    const handleDownloadReport = () => {
        const data = processedSubprojects.map(s => ({
            UID: s.uid,
            Name: s.name,
            IPO: s.indigenousPeopleOrganization,
            Location: s.location,
            Status: s.status,
            Budget: calculateTotalBudget(s.details),
            'Start Date': s.startDate,
            'End Date': s.estimatedCompletionDate
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Subprojects");
        XLSX.writeFile(wb, "Subprojects_Report.xlsx");
    };

    const handleDownloadTemplate = () => {
        const headers = [
            'uid', 'name', 'indigenousPeopleOrganization', 'location', 'status', 'packageType', 
            'startDate', 'estimatedCompletionDate', 'actualCompletionDate', 'fundingYear', 'fundType', 'tier', 'operatingUnit', 'remarks',
            'detail_type', 'detail_particulars', 'detail_deliveryDate', 'detail_unitOfMeasure', 'detail_pricePerUnit', 'detail_numberOfUnits', 
            'detail_objectType', 'detail_expenseParticular', 'detail_uacsCode', 'detail_obligationMonth', 'detail_disbursementMonth'
        ];

        const exampleData = [
            {
                uid: 'SP-TEMP-001',
                name: 'Sample Coffee Production',
                indigenousPeopleOrganization: 'Samahan ng mga Katutubong Dumagat',
                location: 'Brgy. Daraitan, Tanay, Rizal',
                status: 'Ongoing',
                packageType: 'Package 1',
                startDate: '2024-01-15',
                estimatedCompletionDate: '2024-06-15',
                actualCompletionDate: '',
                fundingYear: 2024,
                fundType: 'Current',
                tier: 'Tier 1',
                operatingUnit: 'RPMO 4A',
                remarks: 'Sample upload with multiple items',
                detail_type: 'Equipment',
                detail_particulars: 'Coffee Roaster',
                detail_deliveryDate: '2024-03-01',
                detail_unitOfMeasure: 'unit',
                detail_pricePerUnit: 150000,
                detail_numberOfUnits: 1,
                detail_objectType: 'CO',
                detail_expenseParticular: 'Machinery and Equipment',
                detail_uacsCode: '10605030-00',
                detail_obligationMonth: '2024-02-01',
                detail_disbursementMonth: '2024-03-15'
            },
            {
                uid: 'SP-TEMP-001',
                name: 'Sample Coffee Production',
                indigenousPeopleOrganization: 'Samahan ng mga Katutubong Dumagat',
                location: 'Brgy. Daraitan, Tanay, Rizal',
                status: 'Ongoing',
                packageType: 'Package 1',
                startDate: '2024-01-15',
                estimatedCompletionDate: '2024-06-15',
                actualCompletionDate: '',
                fundingYear: 2024,
                fundType: 'Current',
                tier: 'Tier 1',
                operatingUnit: 'RPMO 4A',
                remarks: 'Sample upload with multiple items',
                detail_type: 'Infrastructure',
                detail_particulars: 'Coffee Processing Shed',
                detail_deliveryDate: '2024-04-01',
                detail_unitOfMeasure: 'unit',
                detail_pricePerUnit: 500000,
                detail_numberOfUnits: 1,
                detail_objectType: 'CO',
                detail_expenseParticular: 'Buildings and Other Structures',
                detail_uacsCode: '10604020-00',
                detail_obligationMonth: '2024-02-15',
                detail_disbursementMonth: '2024-04-15'
            }
        ];

        const instructions = [
            ["Column", "Description"],
            ["uid", "Unique Identifier. REQUIRED. Rows with the same UID will be grouped into one subproject."],
            ["name", "Name of the subproject."],
            ["indigenousPeopleOrganization", "Name of the IPO."],
            ["location", "Location string (e.g., Brgy. X, Municipality, Province)."],
            ["status", "Proposed, Ongoing, Completed, or Cancelled."],
            ["packageType", "Package 1, Package 2, etc."],
            ["startDate", "YYYY-MM-DD"],
            ["estimatedCompletionDate", "YYYY-MM-DD"],
            ["actualCompletionDate", "YYYY-MM-DD (Optional)"],
            ["fundingYear", "Year (e.g., 2024)"],
            ["fundType", "Current, Continuing, or Insertion"],
            ["tier", "Tier 1 or Tier 2"],
            ["operatingUnit", "e.g., RPMO 4A"],
            ["remarks", "Optional remarks"],
            ["detail_type", "Item Type (e.g., Equipment, Livestock, etc.)"],
            ["detail_particulars", "Specific item name."],
            ["detail_deliveryDate", "YYYY-MM-DD"],
            ["detail_unitOfMeasure", "pcs, kgs, unit, lot, heads"],
            ["detail_pricePerUnit", "Number"],
            ["detail_numberOfUnits", "Number"],
            ["detail_objectType", "MOOE or CO"],
            ["detail_expenseParticular", "Expense Class"],
            ["detail_uacsCode", "Specific UACS Code"],
            ["detail_obligationMonth", "YYYY-MM-DD (Date of Obligation)"],
            ["detail_disbursementMonth", "YYYY-MM-DD (Date of Disbursement)"]
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

                const groupedData = new Map<string, any>();
                let maxId = subprojects.reduce((max, s) => Math.max(max, s.id), 0);

                jsonData.forEach((row, index) => {
                    if (!row.uid) return; // Skip rows without UID
                    
                    if (!groupedData.has(row.uid)) {
                        maxId++;
                        
                        groupedData.set(row.uid, {
                            id: maxId,
                            uid: String(row.uid),
                            name: String(row.name),
                            location: String(row.location),
                            indigenousPeopleOrganization: String(row.indigenousPeopleOrganization),
                            status: row.status,
                            packageType: row.packageType,
                            startDate: String(row.startDate),
                            estimatedCompletionDate: String(row.estimatedCompletionDate),
                            actualCompletionDate: row.actualCompletionDate ? String(row.actualCompletionDate) : undefined,
                            fundingYear: Number(row.fundingYear),
                            fundType: row.fundType,
                            tier: row.tier,
                            operatingUnit: row.operatingUnit,
                            encodedBy: currentUser?.fullName || 'System Upload',
                            remarks: row.remarks,
                            // Mock Lat/Lng for map display since parsing assumes structure, could be enhanced with proper Geocoding
                            lat: 14.5995 + (Math.random() * 0.1 - 0.05), 
                            lng: 120.9842 + (Math.random() * 0.1 - 0.05),
                            details: [],
                            subprojectCommodities: []
                        });
                    }

                    const subproject = groupedData.get(row.uid);
                    
                    if (row.detail_particulars) {
                        subproject.details.push({
                            id: Date.now() + index, // Temp ID
                            type: row.detail_type,
                            particulars: row.detail_particulars,
                            deliveryDate: String(row.detail_deliveryDate),
                            unitOfMeasure: row.detail_unitOfMeasure,
                            pricePerUnit: Number(row.detail_pricePerUnit),
                            numberOfUnits: Number(row.detail_numberOfUnits),
                            objectType: row.detail_objectType,
                            expenseParticular: row.detail_expenseParticular,
                            uacsCode: String(row.detail_uacsCode),
                            obligationMonth: String(row.detail_obligationMonth),
                            disbursementMonth: String(row.detail_disbursementMonth)
                        });
                    }
                });

                const newSubprojects = Array.from(groupedData.values());
                setSubprojects(prev => [...prev, ...newSubprojects]);
                alert(`${newSubprojects.length} subprojects imported successfully!`);

            } catch (error: any) {
                console.error("Error processing XLSX file:", error);
                alert(`Failed to import file. ${error.message}`);
            } finally {
                setIsUploading(false);
                if (e.target) e.target.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleDownloadTemplateOld = () => {
        // Placeholder for template download
        alert("Template download placeholder");
    };

    // --- Render Helpers ---

    const formatDate = (dateString?: string) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
    };

    const getStatusBadge = (status: Subproject['status']) => {
        const baseClasses = "px-2 py-0.5 text-xs font-medium rounded-full";
        switch (status) {
            case 'Completed': return `${baseClasses} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`;
            case 'Ongoing': return `${baseClasses} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`;
            case 'Proposed': return `${baseClasses} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`;
            case 'Cancelled': return `${baseClasses} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`;
            default: return `${baseClasses} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200`;
        }
    };

    const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm";

    const SortableHeader: React.FC<{ sortKey: SortKeys; label: string; className?: string }> = ({ sortKey, label, className }) => {
        const isSorted = sortConfig?.key === sortKey;
        const directionIcon = isSorted ? (sortConfig?.direction === 'ascending' ? '▲' : '▼') : '↕';
        return (
            <th scope="col" className={`px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider ${className}`}>
                <button onClick={() => requestSort(sortKey)} className="flex items-center gap-1.5 group">
                    <span>{label}</span>
                    <span className={`transition-opacity ${isSorted ? 'opacity-100' : 'opacity-30 group-hover:opacity-100'}`}>{directionIcon}</span>
                </button>
            </th>
        );
    };

    const TabButton: React.FC<{ tabName: typeof activeTab; label: string }> = ({ tabName, label }) => {
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
    };

    const renderListView = () => (
        <>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Subprojects Management</h2>
                {canEdit && (
                    <button onClick={handleAddNewClick} className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent">
                        + Add New Subproject
                    </button>
                )}
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                <div className="mb-4 flex flex-col md:flex-row gap-4">
                    <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
                        <input
                            type="text"
                            placeholder="Search by name, IPO, location, or OU..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={`w-full md:w-auto ${commonInputClasses} mt-0`}
                        />
                        {canViewAll && (
                            <div className="flex items-center gap-2">
                                <label htmlFor="ouFilter" className="text-sm font-medium text-gray-700 dark:text-gray-300">OU:</label>
                                <select id="ouFilter" value={ouFilter} onChange={(e) => setOuFilter(e.target.value)} className={`${commonInputClasses} mt-0`}>
                                    <option value="All">All OUs</option>
                                    {operatingUnits.map(ou => (
                                        <option key={ou} value={ou}>{ou}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                         <div className="flex items-center gap-2">
                            <label htmlFor="regionFilter" className="text-sm font-medium text-gray-700 dark:text-gray-300">Region:</label>
                            <select id="regionFilter" value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} className={`${commonInputClasses} mt-0`}>
                                <option value="All">All Regions</option>
                                {philippineRegions.map(r => (
                                    <option key={r} value={r}>{r}</option>
                                ))}
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
                    </div>
                    <div className="flex-grow"></div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleDownloadReport} className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">Download Report</button>
                        {canEdit && (
                            <>
                                <button onClick={handleDownloadTemplate} className="inline-flex items-center justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">Download Template</button>
                                <label htmlFor="subproject-upload" className={`inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 ${isUploading ? 'bg-gray-400 cursor-not-allowed' : 'cursor-pointer'}`}>{isUploading ? 'Uploading...' : 'Upload XLSX'}</label>
                                <input id="subproject-upload" type="file" className="hidden" onChange={handleFileUpload} accept=".xlsx, .xls" disabled={isUploading} />
                            </>
                        )}
                    </div>
                </div>

                <div 
                    className="overflow-x-auto" 
                    ref={tableContainerRef}
                    onScroll={(e) => scrollPositionRef.current = e.currentTarget.scrollLeft}
                >
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th scope="col" className="w-12 px-4 py-3 sticky left-0 bg-gray-50 dark:bg-gray-700 z-10"></th>
                                <SortableHeader sortKey="name" label="Name" className="min-w-[200px]" />
                                <SortableHeader sortKey="operatingUnit" label="OU" className="whitespace-nowrap" />
                                <SortableHeader sortKey="indigenousPeopleOrganization" label="IPO" className="min-w-[150px]" />
                                <SortableHeader sortKey="commodityTarget" label="Commodity Target" className="min-w-[200px] whitespace-nowrap" />
                                <SortableHeader sortKey="estimatedCompletionDate" label="Target Completion Date" className="whitespace-nowrap" />
                                <SortableHeader sortKey="actualCompletionDate" label="Actual Completion Date" className="whitespace-nowrap" />
                                <SortableHeader sortKey="totalBudget" label="Budget" className="whitespace-nowrap" />
                                <SortableHeader sortKey="actualObligated" label="Actual Obligated Amount" className="whitespace-nowrap" />
                                <SortableHeader sortKey="actualDisbursed" label="Actual Disbursed Amount" className="whitespace-nowrap" />
                                <SortableHeader sortKey="completionRate" label="Completion Rate" className="whitespace-nowrap" />
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap sticky right-0 bg-gray-50 dark:bg-gray-700 z-10">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {paginatedSubprojects.map((s) => {
                                const budget = calculateTotalBudget(s.details);
                                const actualObligated = s.details.reduce((sum, d) => d.actualObligationDate ? sum + (d.actualAmount || 0) : sum, 0);
                                const actualDisbursed = s.details.reduce((sum, d) => d.actualDisbursementDate ? sum + (d.actualAmount || 0) : sum, 0);
                                const totalItems = s.details.length;
                                const completedItems = s.details.filter(d => d.actualDeliveryDate).length;
                                const completionRate = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
                                const commodities = s.subprojectCommodities && s.subprojectCommodities.length > 0 
                                    ? s.subprojectCommodities.map(c => `${c.name} (${c.area} ${c.typeName === 'Livestock' ? 'heads' : 'ha'})`).join(', ')
                                    : 'N/A';

                                return (
                                <React.Fragment key={s.id}>
                                    <tr onClick={() => handleToggleRow(s.id)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="px-4 py-4 text-gray-400 sticky left-0 bg-white dark:bg-gray-800 z-10"><svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-200 ${expandedRowId === s.id ? 'transform rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></td>
                                        <td className="px-6 py-4 whitespace-normal text-sm font-medium text-gray-900 dark:text-white min-w-[200px]">
                                            <button onClick={(e) => {e.stopPropagation(); onSelectSubproject(s);}} className="text-left hover:text-accent hover:underline">
                                                {s.name}
                                            </button>
                                            <div className="text-xs text-gray-400">{s.uid}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{s.operatingUnit}</td>
                                        <td className="px-6 py-4 whitespace-normal text-sm text-gray-500 dark:text-gray-300">{s.indigenousPeopleOrganization}</td>
                                        <td className="px-6 py-4 whitespace-normal text-sm text-gray-500 dark:text-gray-300 min-w-[150px]">{commodities}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatDate(s.estimatedCompletionDate)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatDate(s.actualCompletionDate)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatCurrency(budget)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatCurrency(actualObligated)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatCurrency(actualDisbursed)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                                            <div className="flex items-center">
                                                <span className="mr-2 text-xs font-medium">{completionRate}%</span>
                                                <div className="w-20 bg-gray-200 rounded-full h-1.5 dark:bg-gray-700">
                                                    <div className={`h-1.5 rounded-full ${completionRate === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${completionRate}%` }}></div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium sticky right-0 bg-white dark:bg-gray-800 z-10">
                                            {canEdit && (
                                                <>
                                                    <button onClick={(e) => { e.stopPropagation(); handleEditClick(s); }} className="text-accent hover:brightness-90 mr-4">Edit</button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(s); }} className="text-red-600 hover:text-red-900">Delete</button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                    {expandedRowId === s.id && (
                                        <tr className="bg-gray-50 dark:bg-gray-900/50">
                                            <td colSpan={12} className="p-4">
                                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                                    {/* Column 1: Project Details */}
                                                    <div className="space-y-4">
                                                        <div>
                                                            <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Project Details</h4>
                                                            <div className="space-y-2 text-sm">
                                                                <p><strong className="text-gray-500 dark:text-gray-400">Location:</strong> <span className="text-gray-900 dark:text-gray-100">{s.location}</span></p>
                                                                <p><strong className="text-gray-500 dark:text-gray-400">Package:</strong> <span className="text-gray-900 dark:text-gray-100">{s.packageType}</span></p>
                                                                <p><strong className="text-gray-500 dark:text-gray-400">Status:</strong> <span className={getStatusBadge(s.status)}>{s.status}</span></p>
                                                                <p><strong className="text-gray-500 dark:text-gray-400">Encoded by:</strong> <span className="text-gray-900 dark:text-gray-100">{s.encodedBy}</span></p>
                                                            </div>
                                                        </div>
                                                        {s.remarks && (
                                                            <div>
                                                                <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Remarks</h4>
                                                                <p className="text-sm text-gray-600 dark:text-gray-300 italic">{s.remarks}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                    
                                                    {/* Column 2: Budget & Particulars */}
                                                    <div className="space-y-4 text-sm bg-gray-100 dark:bg-gray-800/50 p-4 rounded-lg">
                                                        <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Budget & Particulars</h4>
                                                        {s.details.length > 0 ? (
                                                            <ul className="space-y-1">
                                                                {s.details.map(detail => (
                                                                    <li key={detail.id} className="flex justify-between items-start p-1 border-b border-gray-200 dark:border-gray-700 last:border-0">
                                                                        <div>
                                                                            <span className="block font-medium text-gray-800 dark:text-gray-200">{detail.particulars}</span>
                                                                            <span className="text-xs text-gray-500 dark:text-gray-400">{detail.uacsCode} | {detail.numberOfUnits} {detail.unitOfMeasure}</span>
                                                                        </div>
                                                                        <span className="font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">{formatCurrency(detail.pricePerUnit * detail.numberOfUnits)}</span>
                                                                    </li>
                                                                ))}
                                                                <li className="flex justify-between items-center p-1 border-t border-gray-300 dark:border-gray-600 mt-2 pt-2 font-bold text-gray-900 dark:text-white">
                                                                    <span>Total</span>
                                                                    <span>{formatCurrency(calculateTotalBudget(s.details))}</span>
                                                                </li>
                                                            </ul>
                                                        ) : (
                                                            <p className="text-sm text-gray-500 dark:text-gray-400 italic">No budget items listed.</p>
                                                        )}
                                                        
                                                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-200 dark:border-gray-700 mt-2">
                                                            <p><strong className="text-gray-500 dark:text-gray-400">Funding Year:</strong> <span className="text-gray-900 dark:text-gray-100">{s.fundingYear ?? 'N/A'}</span></p>
                                                            <p><strong className="text-gray-500 dark:text-gray-400">Fund Type:</strong> <span className="text-gray-900 dark:text-gray-100">{s.fundType ?? 'N/A'}</span></p>
                                                            <p><strong className="text-gray-500 dark:text-gray-400">Tier:</strong> <span className="text-gray-900 dark:text-gray-100">{s.tier ?? 'N/A'}</span></p>
                                                        </div>
                                                    </div>

                                                    {/* Column 3: Brief Accomplishment Details */}
                                                    <div className="space-y-4 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
                                                        <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Accomplishment Brief</h4>
                                                        <div className="space-y-3 text-sm">
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-gray-600 dark:text-gray-400">Physical Completion</span>
                                                                <span className={`font-bold ${completionRate === 100 ? 'text-green-600' : 'text-blue-600'}`}>{completionRate}%</span>
                                                            </div>
                                                            <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
                                                                <div className={`h-2 rounded-full ${completionRate === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${completionRate}%` }}></div>
                                                            </div>
                                                            <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-500 dark:text-gray-400">Obligated</span>
                                                                    <span className="font-medium text-gray-800 dark:text-gray-200">{formatCurrency(actualObligated)}</span>
                                                                </div>
                                                                <div className="flex justify-between mt-1">
                                                                    <span className="text-gray-500 dark:text-gray-400">Disbursed</span>
                                                                    <span className="font-medium text-gray-800 dark:text-gray-200">{formatCurrency(actualDisbursed)}</span>
                                                                </div>
                                                            </div>
                                                            {s.subprojectCommodities && s.subprojectCommodities.length > 0 && (
                                                                <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-semibold uppercase">Impact</p>
                                                                    {s.subprojectCommodities.map((c, i) => (
                                                                        <div key={i} className="flex justify-between text-xs">
                                                                            <span>{c.name}</span>
                                                                            <span className="font-medium">{c.actualYield ? c.actualYield : '-'} {c.typeName === 'Livestock' ? 'heads' : 'yield'} (Actual)</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );})}
                        </tbody>
                    </table>
                </div>
                 {/* Pagination */}
                 <div className="py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-700 dark:text-gray-300">Show</span>
                        <select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1 pl-2 pr-8 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm">
                            {[10, 20, 50, 100].map(size => ( <option key={size} value={size}>{size}</option> ))}
                        </select>
                        <span className="text-gray-700 dark:text-gray-300">entries</span>
                    </div>
                     <div className="flex items-center gap-4 text-sm">
                        <span className="text-gray-700 dark:text-gray-300">Showing {Math.min((currentPage - 1) * itemsPerPage + 1, processedSubprojects.length)} to {Math.min(currentPage * itemsPerPage, processedSubprojects.length)} of {processedSubprojects.length} entries</span>
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

    const renderFormView = () => (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-semibold text-gray-800 dark:text-white">{view === 'edit' ? 'Edit Subproject' : 'Add New Subproject'}</h3>
                 <button onClick={handleCancelEdit} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Back to List</button>
            </div>
            <form onSubmit={handleSubmit}>
                <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                    <nav className="-mb-px flex space-x-4 overflow-x-auto" aria-label="Tabs">
                        <TabButton tabName="details" label="Subproject Details" />
                        <TabButton tabName="commodity" label="Subproject Commodity" />
                        <TabButton tabName="budget" label="Budget Items" />
                        {view === 'edit' && <TabButton tabName="accomplishments" label="Accomplishments" />}
                    </nav>
                </div>
                <div className="min-h-[400px]">
                    {activeTab === 'details' && (
                         <div className="space-y-6">
                            <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Project Details</legend>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div><label className="block text-sm font-medium">Subproject Name</label><input type="text" name="name" value={formData.name} onChange={handleInputChange} className={commonInputClasses} /></div>
                                    <div>
                                        <label className="block text-sm font-medium">IPO</label>
                                        <select name="indigenousPeopleOrganization" value={formData.indigenousPeopleOrganization} onChange={handleInputChange} className={commonInputClasses}>
                                            <option value="">Select IPO</option>
                                            {ipos.map(ipo => <option key={ipo.id} value={ipo.name}>{ipo.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium">Status</label>
                                        <select name="status" value={formData.status} onChange={handleInputChange} className={commonInputClasses}>
                                            <option value="Proposed">Proposed</option>
                                            <option value="Ongoing">Ongoing</option>
                                            <option value="Cancelled">Cancelled</option>
                                            {/* Completed is hidden as it is auto-calculated */}
                                            {formData.status === 'Completed' && <option value="Completed">Completed</option>}
                                        </select>
                                        {formData.status === 'Completed' && <p className="text-xs text-green-600 mt-1">Status set to Completed automatically based on actual delivery dates.</p>}
                                    </div>
                                    <div>
                                         <label className="block text-sm font-medium">Package</label>
                                         <select name="packageType" value={formData.packageType} onChange={handleInputChange} className={commonInputClasses}>
                                            {Array.from({ length: 7 }, (_, i) => `Package ${i + 1}`).map(p => <option key={p} value={p}>{p}</option>)}
                                         </select>
                                    </div>
                                </div>
                            </fieldset>
                             <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Location & Timeline</legend>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium">Location</label>
                                        <input 
                                            type="text" 
                                            name="location"
                                            value={formData.location} 
                                            readOnly 
                                            className={`${commonInputClasses} bg-gray-100 dark:bg-gray-600 cursor-not-allowed`} 
                                            placeholder="Auto-filled based on IPO selection"
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div><label className="block text-sm font-medium">Start Date</label><input type="date" name="startDate" value={formData.startDate} onChange={handleInputChange} className={commonInputClasses} /></div>
                                        <div><label className="block text-sm font-medium">Est. Completion</label><input type="date" name="estimatedCompletionDate" value={formData.estimatedCompletionDate} onChange={handleInputChange} className={commonInputClasses} /></div>
                                        <div><label className="block text-sm font-medium">Actual Completion</label><input type="date" name="actualCompletionDate" value={formData.actualCompletionDate || ''} readOnly className={`${commonInputClasses} bg-gray-100 dark:bg-gray-600 cursor-not-allowed`} /></div>
                                    </div>
                                </div>
                            </fieldset>
                            <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Funding</legend>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium">Year</label>
                                        <input 
                                            type="number" 
                                            name="fundingYear" 
                                            value={formData.fundingYear} 
                                            readOnly 
                                            className={`${commonInputClasses} bg-gray-100 dark:bg-gray-600 cursor-not-allowed`} 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium">Type</label>
                                        <select name="fundType" value={formData.fundType} onChange={handleInputChange} className={commonInputClasses}>
                                            {fundTypes.map(f => <option key={f} value={f}>{f}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium">Tier</label>
                                        <select name="tier" value={formData.tier} onChange={handleInputChange} className={commonInputClasses}>
                                            {tiers.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </fieldset>
                         </div>
                    )}
                    {activeTab === 'commodity' && (
                        <div className="space-y-6">
                            <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Subproject Commodities</legend>
                                <div className="space-y-2 mb-4">
                                    {formData.subprojectCommodities && formData.subprojectCommodities.length > 0 ? (
                                        formData.subprojectCommodities.map((c, index) => (
                                            <div key={index} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 p-2 rounded-md text-sm">
                                                <div>
                                                    <span className="font-semibold">{c.name}</span>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">({c.typeName || 'N/A'})</span>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                                        {c.typeName === 'Livestock' ? 'Heads' : 'Area'}: {c.area} {c.typeName !== 'Livestock' && `| Yield: ${c.averageYield}`}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button type="button" onClick={() => handleEditCommodity(index)} className="text-gray-400 hover:text-accent dark:hover:text-accent">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
                                                    </button>
                                                    <button type="button" onClick={() => handleRemoveCommodity(index)} className="text-red-500 hover:text-red-700">&times;</button>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-sm text-gray-500 dark:text-gray-400 italic">No commodities added.</p>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end border-t pt-4 mt-4 border-gray-200 dark:border-gray-700">
                                    <div>
                                        <label className="block text-xs font-medium">Type</label>
                                        <select name="typeName" value={currentCommodity.typeName} onChange={handleCommodityChange} className={commonInputClasses + " py-1.5"}>
                                            <option value="">Select Type</option>
                                            {Object.keys(targetCommodityCategories).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium">Commodity</label>
                                        <select name="name" value={currentCommodity.name} onChange={handleCommodityChange} disabled={!currentCommodity.typeName} className={commonInputClasses + " py-1.5"}>
                                            <option value="">Select Commodity</option>
                                            {currentCommodity.typeName && targetCommodityCategories[currentCommodity.typeName].map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium">{currentCommodity.typeName === 'Livestock' ? 'No. of Heads' : 'Area (ha)'}</label>
                                        <input type="number" name="area" value={currentCommodity.area} onChange={handleCommodityChange} className={commonInputClasses + " py-1.5"} />
                                    </div>
                                    <div className="flex gap-2 items-end">
                                        {currentCommodity.typeName !== 'Livestock' && (
                                            <div className="flex-grow">
                                                <label className="block text-xs font-medium">Average Yield</label>
                                                <input type="number" name="averageYield" value={currentCommodity.averageYield} onChange={handleCommodityChange} className={commonInputClasses + " py-1.5"} />
                                            </div>
                                        )}
                                        <button type="button" onClick={handleAddCommodity} className="h-9 w-9 flex-shrink-0 inline-flex items-center justify-center rounded-full bg-green-100 text-accent hover:bg-green-200">+</button>
                                    </div>
                                </div>
                            </fieldset>
                        </div>
                    )}
                    {activeTab === 'budget' && (
                        <div className="space-y-6">
                             <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Budget Items</legend>
                                <div className="space-y-2 mb-4">
                                    {formData.details.map((d) => (
                                        <div key={d.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 p-2 rounded-md text-sm">
                                            <div>
                                                <span className="font-semibold">{d.particulars}</span>
                                                <div className="text-xs text-gray-500">{d.uacsCode} - {d.numberOfUnits} {d.unitOfMeasure} @ {formatCurrency(d.pricePerUnit)}</div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="font-bold">{formatCurrency(d.numberOfUnits * d.pricePerUnit)}</span>
                                                <button type="button" onClick={() => handleEditDetail(d.id)} className="text-gray-400 hover:text-accent dark:hover:text-accent">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
                                                </button>
                                                <button type="button" onClick={() => handleRemoveDetail(d.id)} className="text-red-500 hover:text-red-700">&times;</button>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="text-right font-bold pt-2">Total: {formatCurrency(calculateTotalBudget(formData.details))}</div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-end border-t pt-4 mt-4 border-gray-200 dark:border-gray-700">
                                    <div className="lg:col-span-2"><label className="block text-xs font-medium">Item Type</label><select name="type" value={currentDetail.type} onChange={handleDetailChange} className={commonInputClasses + " py-1.5"}><option value="">Select Type</option>{Object.keys(particularTypes).map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                    <div className="lg:col-span-2"><label className="block text-xs font-medium">Particulars</label><select name="particulars" value={currentDetail.particulars} onChange={handleDetailChange} disabled={!currentDetail.type} className={commonInputClasses + " py-1.5"}><option value="">Select Item</option>{currentDetail.type && particularTypes[currentDetail.type].map(i => <option key={i} value={i}>{i}</option>)}</select></div>
                                    
                                    <div className="lg:col-span-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <div><label className="block text-xs font-medium">Object Type</label><select name="objectType" value={currentDetail.objectType} onChange={handleDetailChange} className={commonInputClasses + " py-1.5"}>{objectTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                        <div><label className="block text-xs font-medium">Expense Particular</label><select name="expenseParticular" value={currentDetail.expenseParticular} onChange={handleDetailChange} className={commonInputClasses + " py-1.5"}><option value="">Select Particular</option>{Object.keys(uacsCodes[currentDetail.objectType]).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                                        <div><label className="block text-xs font-medium">UACS Code</label><select name="uacsCode" value={currentDetail.uacsCode} onChange={handleDetailChange} disabled={!currentDetail.expenseParticular} className={commonInputClasses + " py-1.5"}><option value="">Select UACS</option>{currentDetail.expenseParticular && Object.entries(uacsCodes[currentDetail.objectType][currentDetail.expenseParticular]).map(([c, d]) => <option key={c} value={c}>{c} - {d}</option>)}</select></div>
                                    </div>

                                    <div><label className="block text-xs font-medium">Delivery Date</label><input type="date" name="deliveryDate" value={currentDetail.deliveryDate} onChange={handleDetailChange} className={commonInputClasses + " py-1.5 text-sm"} /></div>
                                    <div><label className="block text-xs font-medium">Obligation Date</label><input type="date" name="obligationMonth" value={currentDetail.obligationMonth} onChange={handleDetailChange} className={commonInputClasses + " py-1.5 text-sm"} /></div>
                                    <div><label className="block text-xs font-medium">Disbursement Date</label><input type="date" name="disbursementMonth" value={currentDetail.disbursementMonth} onChange={handleDetailChange} className={commonInputClasses + " py-1.5 text-sm"} /></div>

                                    <div><label className="block text-xs font-medium">Unit</label><select name="unitOfMeasure" value={currentDetail.unitOfMeasure} onChange={handleDetailChange} className={commonInputClasses + " py-1.5"}><option>pcs</option><option>kgs</option><option>unit</option><option>lot</option><option>heads</option></select></div>
                                    <div><label className="block text-xs font-medium">Price/Unit</label><input type="number" name="pricePerUnit" value={currentDetail.pricePerUnit} onChange={handleDetailChange} className={commonInputClasses + " py-1.5"} /></div>
                                    <div><label className="block text-xs font-medium">Qty</label><input type="number" name="numberOfUnits" value={currentDetail.numberOfUnits} onChange={handleDetailChange} className={commonInputClasses + " py-1.5"} /></div>
                                    <button type="button" onClick={handleAddDetail} className="h-9 w-9 flex-shrink-0 inline-flex items-center justify-center rounded-full bg-green-100 text-accent hover:bg-green-200">+</button>
                                </div>
                             </fieldset>
                        </div>
                    )}
                    {activeTab === 'accomplishments' && view === 'edit' && (
                        <div className="space-y-6">
                            {/* Section 1: Budget Items */}
                            <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Budget Items Accomplishment</legend>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                        <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs">
                                            <tr>
                                                <th className="px-3 py-2 text-left font-medium">Particulars</th>
                                                <th className="px-3 py-2 text-left font-medium">Actual Delivery</th>
                                                <th className="px-3 py-2 text-left font-medium">Actual Obligation</th>
                                                <th className="px-3 py-2 text-left font-medium">Actual Disbursement</th>
                                                <th className="px-3 py-2 text-left font-medium">Actual Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                            {formData.details.map((detail) => (
                                                <tr key={detail.id}>
                                                    <td className="px-3 py-2 text-sm text-gray-800 dark:text-gray-200">{detail.particulars}</td>
                                                    <td className="px-3 py-2">
                                                        <input type="date" value={detail.actualDeliveryDate || ''} onChange={(e) => handleDetailAccomplishmentChange(detail.id, 'actualDeliveryDate', e.target.value)} className="w-full text-xs px-2 py-1 rounded border dark:bg-gray-600 dark:border-gray-500" />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <input type="date" value={detail.actualObligationDate || ''} onChange={(e) => handleDetailAccomplishmentChange(detail.id, 'actualObligationDate', e.target.value)} className="w-full text-xs px-2 py-1 rounded border dark:bg-gray-600 dark:border-gray-500" />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <input type="date" value={detail.actualDisbursementDate || ''} onChange={(e) => handleDetailAccomplishmentChange(detail.id, 'actualDisbursementDate', e.target.value)} className="w-full text-xs px-2 py-1 rounded border dark:bg-gray-600 dark:border-gray-500" />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <input type="number" value={detail.actualAmount || ''} onChange={(e) => handleDetailAccomplishmentChange(detail.id, 'actualAmount', parseFloat(e.target.value))} className="w-full text-xs px-2 py-1 rounded border dark:bg-gray-600 dark:border-gray-500" placeholder="0.00" />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </fieldset>

                            {/* Section 2: Customer Satisfaction */}
                            <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Customer Satisfaction</legend>
                                <p className="text-sm text-gray-500 dark:text-gray-400 italic">Placeholder for Customer Satisfaction Survey data.</p>
                            </fieldset>

                            {/* Section 3: Impact of Subproject */}
                            <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Impact of Subproject</legend>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                        <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs">
                                            <tr>
                                                <th className="px-3 py-2 text-left font-medium">Commodity</th>
                                                <th className="px-3 py-2 text-left font-medium">Target</th>
                                                <th className="px-3 py-2 text-left font-medium">Actual Yield/Heads</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                            {formData.subprojectCommodities?.map((commodity, index) => (
                                                <tr key={index}>
                                                    <td className="px-3 py-2 text-sm text-gray-800 dark:text-gray-200">{commodity.name} ({commodity.typeName})</td>
                                                    <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">
                                                        {commodity.averageYield ? `${commodity.averageYield} (Yield)` : ''} 
                                                        {commodity.typeName === 'Livestock' ? ' (Heads)' : ''}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="flex items-center gap-2">
                                                            <input type="number" value={commodity.actualYield || ''} onChange={(e) => handleCommodityAccomplishmentChange(index, parseFloat(e.target.value))} className="w-32 text-xs px-2 py-1 rounded border dark:bg-gray-600 dark:border-gray-500" placeholder="0" />
                                                            <span className="text-xs text-gray-500">{commodity.typeName === 'Livestock' ? 'heads' : 'yield'}</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                            {(!formData.subprojectCommodities || formData.subprojectCommodities.length === 0) && (
                                                <tr><td colSpan={3} className="px-3 py-2 text-sm text-gray-500 italic text-center">No commodities linked.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </fieldset>

                            {/* Section 4: Catch Up Plan (Conditional) */}
                            {new Date() > new Date(formData.estimatedCompletionDate) && formData.status !== 'Completed' && (
                                <fieldset className="border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10 p-4 rounded-md">
                                    <legend className="px-2 font-semibold text-red-600 dark:text-red-400">Catch Up Plan</legend>
                                    <p className="text-xs text-red-500 mb-2">Project is delayed. Please provide a catch-up plan.</p>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Remarks / Justification</label>
                                            <textarea name="catchUpPlanRemarks" value={formData.catchUpPlanRemarks || ''} onChange={handleInputChange} rows={3} className={commonInputClasses} placeholder="Describe actions taken or justification for delay..." />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">New Target Completion Date</label>
                                            <input type="date" name="newTargetCompletionDate" value={formData.newTargetCompletionDate || ''} onChange={handleInputChange} className={commonInputClasses} />
                                        </div>
                                    </div>
                                </fieldset>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex justify-end gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button type="button" onClick={handleCancelEdit} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600">Cancel</button>
                    <button type="submit" className="px-4 py-2 rounded-md text-sm font-medium text-white bg-accent hover:brightness-95">Save Subproject</button>
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
                        <p className="my-4">Are you sure you want to delete "{subprojectToDelete?.name}"? This action cannot be undone.</p>
                        <div className="flex justify-end gap-4">
                            <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
                            <button onClick={confirmDelete} className="px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700">Delete</button>
                        </div>
                    </div>
                </div>
            )}
            
            {isErrorModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full">
                        <h3 className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">Validation Error</h3>
                        <p className="my-4 text-gray-700 dark:text-gray-300">{errorMessage}</p>
                        <div className="flex justify-end gap-4">
                            <button onClick={() => setIsErrorModalOpen(false)} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Close</button>
                        </div>
                    </div>
                </div>
            )}

            {view === 'list' ? renderListView() : renderFormView()}
        </div>
    );
};

export default Subprojects;
