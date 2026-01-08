
import React, { useState, FormEvent, useMemo, useEffect } from 'react';
import { Training, OtherActivity, IPO, philippineRegions, OtherActivityComponentType, otherActivityComponents, otherActivityOptions, OtherActivityExpense, objectTypes, ObjectType, fundTypes, FundType, tiers, Tier, TrainingComponentType, operatingUnits } from '../constants';
import LocationPicker, { parseLocation } from './LocationPicker';
import { useAuth } from '../contexts/AuthContext';

// Declare XLSX to inform TypeScript about the global variable from the script tag
declare const XLSX: any;

interface ActivitiesProps {
    ipos: IPO[];
    trainings: Training[];
    setTrainings: React.Dispatch<React.SetStateAction<Training[]>>;
    otherActivities: OtherActivity[];
    setOtherActivities: React.Dispatch<React.SetStateAction<OtherActivity[]>>;
    onSelectIpo: (ipo: IPO) => void;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    pageTitle?: string;
    forcedType?: 'Training' | 'Activity';
}

// Unified type for list view
type CombinedActivity = (Training & { type: 'Training' }) | (OtherActivity & { type: 'Activity', facilitator: string | undefined });

const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const defaultFormData = {
    id: 0,
    uid: '',
    name: '',
    date: '',
    description: '',
    location: '',
    facilitator: '',
    participatingIpos: [] as string[],
    participantsMale: 0,
    participantsFemale: 0,
    component: 'Social Preparation' as OtherActivityComponentType, // Shared type base
    expenses: [] as OtherActivityExpense[],
    fundingYear: new Date().getFullYear(),
    fundType: fundTypes[0] as FundType,
    tier: tiers[0] as Tier,
    operatingUnit: '',
    encodedBy: '',
    catchUpPlanRemarks: '',
    newTargetDate: '',
    actualDate: '',
    actualParticipantsMale: 0,
    actualParticipantsFemale: 0
};

export const ActivitiesComponent: React.FC<ActivitiesProps> = ({ ipos, trainings, setTrainings, otherActivities, setOtherActivities, onSelectIpo, uacsCodes, pageTitle = "Activities Management", forcedType }) => {
    const { currentUser } = useAuth();
    const [formData, setFormData] = useState(defaultFormData);
    const [editingItem, setEditingItem] = useState<CombinedActivity | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<CombinedActivity | null>(null);
    const [ipoRegionFilter, setIpoRegionFilter] = useState('All');
    const [activeTab, setActiveTab] = useState<'details' | 'budget' | 'accomplishments'>('details');
    const [isUploading, setIsUploading] = useState(false);
    const [selectedActivityType, setSelectedActivityType] = useState('');

    // Multi-Delete State
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
    const [isMultiDeleteModalOpen, setIsMultiDeleteModalOpen] = useState(false);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [ouFilter, setOuFilter] = useState('All');
    const [componentFilter, setComponentFilter] = useState<OtherActivityComponentType | 'All'>('All');
    const [typeFilter, setTypeFilter] = useState<'All' | 'Training' | 'Activity'>('All');

    // Sorting
    type SortKeys = keyof CombinedActivity | 'totalParticipants' | 'budget';
    const [sortConfig, setSortConfig] = useState<{ key: SortKeys; direction: 'ascending' | 'descending' } | null>({ key: 'date', direction: 'descending' });
    
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
    const [view, setView] = useState<'list' | 'add' | 'edit'>('list');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    // If forcedType is provided, lock the filter
    useEffect(() => {
        if (forcedType) {
            setTypeFilter(forcedType);
        }
    }, [forcedType]);

    // Determine if current form state represents a Training based on selected Activity Type
    const isTrainingForm = useMemo(() => {
        return selectedActivityType.endsWith(' Training') || (forcedType === 'Training');
    }, [selectedActivityType, forcedType]);

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

    // Initialize form data when editing or creating
    useEffect(() => {
        if (editingItem) {
            setFormData({
                ...defaultFormData,
                ...editingItem,
                participantsMale: Number(editingItem.participantsMale) || 0,
                participantsFemale: Number(editingItem.participantsFemale) || 0,
                fundingYear: editingItem.fundingYear ?? new Date().getFullYear(),
                fundType: editingItem.fundType ?? fundTypes[0],
                tier: editingItem.tier ?? tiers[0],
                facilitator: editingItem.type === 'Training' ? editingItem.facilitator : '',
                catchUpPlanRemarks: editingItem.catchUpPlanRemarks || '',
                newTargetDate: editingItem.newTargetDate || '',
                actualDate: editingItem.actualDate || '',
                actualParticipantsMale: editingItem.actualParticipantsMale || 0,
                actualParticipantsFemale: editingItem.actualParticipantsFemale || 0,
            });
            
            // Set Activity Type
            if (editingItem.type === 'Training') {
                setSelectedActivityType(`${editingItem.component} Training`);
            } else {
                setSelectedActivityType(editingItem.name);
            }

             setActiveTab('details');
        } else {
            setFormData({
                ...defaultFormData,
                operatingUnit: currentUser?.operatingUnit || '',
                encodedBy: currentUser?.fullName || ''
            });
            setSelectedActivityType('');
        }
    }, [editingItem, currentUser]);

    // When component changes in form, reset types unless editing
    useEffect(() => {
        if (view !== 'edit') {
            if (!forcedType || forcedType === 'Activity') {
                 setFormData(prev => ({...prev, name: ''}));
                 setSelectedActivityType('');
            }
        }
    }, [formData.component, view, forcedType]);

    const filteredIposForSelection = useMemo(() => {
        const filtered = ipoRegionFilter === 'All' ? ipos : ipos.filter(ipo => ipo.region === ipoRegionFilter);
        return filtered.sort((a,b) => a.name.localeCompare(b.name));
    }, [ipoRegionFilter, ipos]);

    const activityOptions = useMemo(() => {
        const base = otherActivityOptions[formData.component] || [];
        const trainingOption = `${formData.component} Training`;
        
        if (forcedType === 'Training') return [trainingOption];
        if (forcedType === 'Activity') return base;

        // Ensure unique
        if (base.includes(trainingOption)) return base;
        return [...base, trainingOption];
    }, [formData.component, forcedType]);

    // Combine and process list data
    const processedActivities = useMemo(() => {
        let combined: CombinedActivity[] = [];
        
        if (!forcedType || forcedType === 'Training') {
             const t = trainings.map(x => ({ ...x, type: 'Training' as const }));
             combined = [...combined, ...t];
        }
        
        if (!forcedType || forcedType === 'Activity') {
             const o = otherActivities.map(x => ({ ...x, type: 'Activity' as const, facilitator: undefined }));
             combined = [...combined, ...o];
        }

        // OU Filtering
        if (!canViewAll && currentUser) {
            combined = combined.filter(a => a.operatingUnit === currentUser.operatingUnit);
        } else if (canViewAll && ouFilter !== 'All') {
            combined = combined.filter(a => a.operatingUnit === ouFilter);
        }

        if (componentFilter !== 'All') {
            combined = combined.filter(activity => activity.component === componentFilter);
        }

        // Only apply typeFilter if not forced, although combined list construction already handles it mostly
        if (!forcedType && typeFilter !== 'All') {
            combined = combined.filter(activity => activity.type === typeFilter);
        }

        if (searchTerm) {
            const lowercasedSearchTerm = searchTerm.toLowerCase();
            combined = combined.filter(t =>
                t.name.toLowerCase().includes(lowercasedSearchTerm) ||
                t.location.toLowerCase().includes(lowercasedSearchTerm) ||
                t.description.toLowerCase().includes(lowercasedSearchTerm) ||
                (t.type === 'Training' && t.facilitator.toLowerCase().includes(lowercasedSearchTerm)) ||
                t.operatingUnit.toLowerCase().includes(lowercasedSearchTerm) ||
                (t.uid && t.uid.toLowerCase().includes(lowercasedSearchTerm))
            );
        }

        if (sortConfig !== null) {
            combined.sort((a, b) => {
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
                    aValue = a[sortConfig.key as keyof CombinedActivity];
                    bValue = b[sortConfig.key as keyof CombinedActivity];
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
        return combined;
    }, [trainings, otherActivities, searchTerm, componentFilter, typeFilter, sortConfig, ouFilter, ipos, currentUser, canViewAll, forcedType]);

    const paginatedActivities = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return processedActivities.slice(startIndex, startIndex + itemsPerPage);
    }, [processedActivities, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(processedActivities.length / itemsPerPage);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, componentFilter, typeFilter, ouFilter, sortConfig, itemsPerPage, forcedType]);

    const requestSort = (key: SortKeys) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };
    
    const handleToggleRow = (activityId: number, type: 'Training' | 'Activity') => {
        const key = `${type}-${activityId}`;
        setExpandedRowId(prevId => (prevId === key ? null : key));
    };

    // --- Multi-Delete Handlers ---
    const handleToggleSelectionMode = () => {
        if (isSelectionMode) {
            setIsSelectionMode(false);
            setSelectedKeys([]);
        } else {
            setIsSelectionMode(true);
        }
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            const keys = paginatedActivities.map(a => `${a.type}-${a.id}`);
            setSelectedKeys(prev => Array.from(new Set([...prev, ...keys])));
        } else {
            const keysToRemove = new Set(paginatedActivities.map(a => `${a.type}-${a.id}`));
            setSelectedKeys(prev => prev.filter(k => !keysToRemove.has(k)));
        }
    };

    const handleSelectRow = (key: string) => {
        setSelectedKeys(prev => {
            if (prev.includes(key)) return prev.filter(k => k !== key);
            return [...prev, key];
        });
    };

    const confirmMultiDelete = () => {
        const trainingIds = selectedKeys.filter(k => k.startsWith('Training-')).map(k => Number(k.split('-')[1]));
        const activityIds = selectedKeys.filter(k => k.startsWith('Activity-')).map(k => Number(k.split('-')[1]));

        if (trainingIds.length > 0) {
            setTrainings(prev => prev.filter(t => !trainingIds.includes(t.id)));
        }
        if (activityIds.length > 0) {
            setOtherActivities(prev => prev.filter(a => !activityIds.includes(a.id)));
        }
        
        setIsMultiDeleteModalOpen(false);
        setIsSelectionMode(false);
        setSelectedKeys([]);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const target = e.currentTarget as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        const { name, value } = target;
        const isNumberInput = 'type' in target && target.type === 'number';

        setFormData(prev => ({ 
            ...prev, 
            [name]: isNumberInput ? (value === '' ? '' : parseFloat(value)) : value 
        }));
    };

    const handleActivityTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        setSelectedActivityType(value);
        if (value.endsWith(' Training') || forcedType === 'Training') {
            // If switching to training type
            if (editingItem && editingItem.type === 'Training' && value === `${editingItem.component} Training`) {
                // If editing and same type, restore original name
                setFormData(prev => ({ ...prev, name: editingItem.name }));
            } else {
                // Otherwise clear name for input (unless specifically Activity where name matches type)
                if (forcedType !== 'Activity') setFormData(prev => ({ ...prev, name: '' }));
            }
        } else {
            // Not a training, name IS the type
            setFormData(prev => ({ ...prev, name: value }));
        }
    };
    
    const handleIpoSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedOptions = Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value);
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

    const handleExpenseAccomplishmentChange = (id: number, field: keyof OtherActivityExpense, value: any) => {
        setFormData(prev => ({
            ...prev,
            expenses: prev.expenses.map(e => e.id === id ? { ...e, [field]: value } : e)
        }));
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.date || !formData.location) {
            alert('Please fill out all required fields.');
            return;
        }

        // If editing:
        if (editingItem) {
            if (isTrainingForm) {
                // Check if we need to move it from OtherActivities to Trainings (rare case of rename)
                const updatedTraining: Training = {
                    ...formData,
                    component: formData.component as TrainingComponentType, // Cast is safe due to unified types
                    id: editingItem.id
                };
                if (editingItem.type === 'Training') {
                    setTrainings(prev => prev.map(t => t.id === editingItem.id ? updatedTraining : t));
                } else {
                     // Move from OtherActivity to Training (delete old, add new)
                     setOtherActivities(prev => prev.filter(a => a.id !== editingItem.id));
                     setTrainings(prev => [...prev, updatedTraining]);
                }
            } else {
                const updatedActivity: OtherActivity = {
                    ...formData,
                     id: editingItem.id
                };
                 if (editingItem.type === 'Activity') {
                    setOtherActivities(prev => prev.map(a => a.id === editingItem.id ? updatedActivity : a));
                } else {
                     // Move from Training to OtherActivity
                     setTrainings(prev => prev.filter(t => t.id !== editingItem.id));
                     setOtherActivities(prev => [...prev, updatedActivity]);
                }
            }
        } else {
            // New Item
            const newId = Math.max(...trainings.map(t => t.id), ...otherActivities.map(a => a.id), 0) + 1;
            const currentYear = new Date().getFullYear();
            let uid = formData.uid;
            if (!uid) {
                const prefix = isTrainingForm ? 'TRN' : 'ACT';
                const sequence = String(newId).padStart(3, '0');
                uid = `${prefix}-${currentYear}-${sequence}`;
            }

            if (isTrainingForm) {
                 const newTraining: Training = {
                    ...formData,
                    uid,
                    component: formData.component as TrainingComponentType,
                    id: newId,
                };
                setTrainings(prev => [newTraining, ...prev]);
            } else {
                const newActivity: OtherActivity = {
                    ...formData,
                    uid,
                    id: newId,
                };
                setOtherActivities(prev => [newActivity, ...prev]);
            }
        }
        
        handleCancelEdit();
    };

    const handleEditClick = (activity: CombinedActivity) => {
        setEditingItem(activity);
        setView('edit');
    };
    
    const handleAddNewClick = () => {
        setEditingItem(null);
        setView('add');
    };

    const handleCancelEdit = () => {
        setEditingItem(null);
        setFormData(defaultFormData);
        setSelectedActivityType('');
        setActiveTab('details');
        setView('list');
    };

    const handleDeleteClick = (activity: CombinedActivity) => {
        setItemToDelete(activity);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = () => {
        if (itemToDelete) {
            if (itemToDelete.type === 'Training') {
                setTrainings(prev => prev.filter(p => p.id !== itemToDelete.id));
            } else {
                setOtherActivities(prev => prev.filter(p => p.id !== itemToDelete.id));
            }
            setIsDeleteModalOpen(false);
            setItemToDelete(null);
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

    // Re-declare totalBudget inside component for use in renderFormView
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
            'UID': a.uid || '',
            'Type': a.type,
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
            'Facilitator': a.type === 'Training' ? a.facilitator : 'N/A',
            'Description': a.description,
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Activities Report");
        XLSX.writeFile(wb, "Activities_Report.xlsx");
    };

    const handleDownloadTemplate = () => {
        const headers = [
            'uid', 'type', 'component', 'name', 'date', 'province', 'municipality', 'facilitator', 'description',
            'participatingIpos', 'participantsMale', 'participantsFemale',
            'fundingYear', 'fundType', 'tier', 
            'expense_objectType', 'expense_particular', 'expense_uacsCode', 'expense_obligationMonth', 'expense_disbursementMonth', 'expense_amount'
        ];
        // ... (existing template code)
        // For brevity, skipping full recreation of template logic as it's unchanged logic-wise
        const exampleData = [
            {
                uid: 'TRN-2024-001',
                type: 'Training',
                component: 'Social Preparation',
                name: 'Basic Leadership Training',
                date: '2024-03-15',
                province: 'Rizal',
                municipality: 'Tanay',
                facilitator: 'John Doe',
                description: 'Leadership skills training.',
                participatingIpos: 'San Isidro Farmers Association',
                participantsMale: 10,
                participantsFemale: 15,
                fundingYear: 2024,
                fundType: 'Current',
                tier: 'Tier 1',
                expense_objectType: 'MOOE',
                expense_particular: 'Training Expenses',
                expense_uacsCode: '50202010-01',
                expense_obligationMonth: '2024-03-01',
                expense_disbursementMonth: '2024-03-20',
                expense_amount: 25000
            }
        ];

        const wb = XLSX.utils.book_new();
        const ws_data = XLSX.utils.json_to_sheet(exampleData, { header: headers });
        XLSX.utils.book_append_sheet(wb, ws_data, "Activities Data");
        XLSX.writeFile(wb, "Activities_Upload_Template.xlsx");
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

                let currentTrainingId = trainings.reduce((max, t) => Math.max(max, t.id), 0);
                let currentActivityId = otherActivities.reduce((max, a) => Math.max(max, a.id), 0);
                const existingIpoNames = new Set(ipos.map(ipo => ipo.name));

                const groupedData = new Map<string, any>();

                jsonData.forEach((row, index) => {
                    const rowNum = index + 2;
                    const uid = row.uid;
                    if (!uid) throw new Error(`Row ${rowNum}: Missing UID.`);

                    if (!groupedData.has(uid)) {
                        // Basic validation for new group
                        if (!row.type || !row.component || !row.name || !row.date || !row.province || !row.municipality) {
                            throw new Error(`Row ${rowNum} (UID: ${uid}): Missing required common fields.`);
                        }

                        const participatingIpos = (row.participatingIpos || '').toString().split(',').map((s: string) => s.trim()).filter(Boolean);
                        for (const ipoName of participatingIpos) {
                            if (!existingIpoNames.has(ipoName)) throw new Error(`Row ${rowNum}: IPO "${ipoName}" not found.`);
                        }

                        // Construct Location String from Province and Municipality
                        const municipality = String(row.municipality || '').trim();
                        const province = String(row.province || '').trim();
                        const locationString = `${municipality}, ${province}`;

                        groupedData.set(uid, {
                            common: {
                                uid: String(uid),
                                type: row.type,
                                component: row.component as any,
                                name: String(row.name),
                                date: String(row.date),
                                description: String(row.description || ''),
                                location: locationString,
                                participatingIpos: participatingIpos,
                                participantsMale: Number(row.participantsMale) || 0,
                                participantsFemale: Number(row.participantsFemale) || 0,
                                fundingYear: Number(row.fundingYear) || undefined,
                                fundType: fundTypes.includes(row.fundType) ? row.fundType : undefined,
                                tier: tiers.includes(row.tier) ? row.tier : undefined,
                                operatingUnit: currentUser?.operatingUnit || 'NPMO',
                                encodedBy: currentUser?.fullName || 'System',
                                facilitator: String(row.facilitator || ''),
                            },
                            expenses: []
                        });
                    }

                    // Add expense from this row if present
                    if (row.expense_amount && row.expense_objectType) {
                        groupedData.get(uid).expenses.push({
                            id: Date.now() + index * 10, // Unique temporary ID
                            objectType: row.expense_objectType,
                            expenseParticular: String(row.expense_particular || ''),
                            uacsCode: String(row.expense_uacsCode || ''),
                            obligationMonth: String(row.expense_obligationMonth || ''),
                            disbursementMonth: String(row.expense_disbursementMonth || ''),
                            amount: Number(row.expense_amount)
                        });
                    }
                });

                const newTrainings: Training[] = [];
                const newActivities: OtherActivity[] = [];

                groupedData.forEach((group) => {
                    if (group.common.type === 'Training') {
                        currentTrainingId++;
                        newTrainings.push({
                            id: currentTrainingId,
                            ...group.common,
                            expenses: group.expenses,
                        });
                    } else {
                        currentActivityId++;
                        const { facilitator, ...activityCommon } = group.common; // Remove facilitator from Activity
                        newActivities.push({
                            id: currentActivityId,
                            ...activityCommon,
                            expenses: group.expenses,
                        });
                    }
                });

                if (newTrainings.length > 0) setTrainings(prev => [...prev, ...newTrainings]);
                if (newActivities.length > 0) setOtherActivities(prev => [...prev, ...newActivities]);

                alert(`${newTrainings.length} trainings and ${newActivities.length} other activities imported successfully!`);

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
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">{pageTitle}</h2>
                {canEdit && (
                    <button onClick={handleAddNewClick} className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent">
                        + Add New {forcedType === 'Training' ? 'Training' : forcedType === 'Activity' ? 'Activity' : 'Item'}
                    </button>
                )}
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                 <div className="mb-4 flex flex-col md:flex-row gap-4">
                    <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
                        <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className={`w-full md:w-auto ${commonInputClasses} mt-0`} />
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
                           <label htmlFor="componentFilter" className="text-sm font-medium text-gray-700 dark:text-gray-300">Component:</label>
                            <select id="componentFilter" value={componentFilter} onChange={(e) => setComponentFilter(e.target.value as any)} className={`${commonInputClasses} mt-0`}>
                                <option value="All">All Components</option>{otherActivityComponents.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                         {/* Only show Type filter if NOT forced */}
                         {!forcedType && (
                             <div className="flex items-center gap-2">
                               <label htmlFor="typeFilter" className="text-sm font-medium text-gray-700 dark:text-gray-300">Type:</label>
                                <select id="typeFilter" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className={`${commonInputClasses} mt-0`}>
                                    <option value="All">All Types</option>
                                    <option value="Training">Trainings Only</option>
                                    <option value="Activity">Other Activities Only</option>
                                </select>
                            </div>
                         )}
                    </div>
                    <div className="flex-grow"></div>
                    <div className="flex items-center gap-2">
                        {isSelectionMode && selectedKeys.length > 0 && (
                            <button onClick={() => setIsMultiDeleteModalOpen(true)} className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700">
                                Delete Selected ({selectedKeys.length})
                            </button>
                        )}
                        <button onClick={handleDownloadReport} className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">Download Report</button>
                        {canEdit && (
                            <>
                                <button onClick={handleDownloadTemplate} className="inline-flex items-center justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">Download Template</button>
                                <label htmlFor="activity-upload" className={`inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 ${isUploading ? 'bg-gray-400 cursor-not-allowed' : 'cursor-pointer'}`}>{isUploading ? 'Uploading...' : 'Upload XLSX'}</label>
                                <input id="activity-upload" type="file" className="hidden" onChange={handleFileUpload} accept=".xlsx, .xls" disabled={isUploading} />
                                <button
                                    onClick={handleToggleSelectionMode}
                                    className={`inline-flex items-center justify-center p-2 border border-gray-300 dark:border-gray-600 shadow-sm rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 ${isSelectionMode ? 'bg-gray-200 dark:bg-gray-600 text-red-600' : 'bg-white dark:bg-gray-700 text-gray-500'}`}
                                    title="Toggle Multi-Delete Mode"
                                >
                                    <TrashIcon />
                                </button>
                            </>
                        )}
                    </div>
                 </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th scope="col" className="w-12 px-4 py-3 sticky left-0 bg-gray-50 dark:bg-gray-700 z-10"></th>
                                <SortableHeader sortKey="name" label="Name" />
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 tracking-wider">Type</th>
                                <SortableHeader sortKey="date" label="Date" />
                                <SortableHeader sortKey="component" label="Component" />
                                <SortableHeader sortKey="totalParticipants" label="Participants" />
                                <SortableHeader sortKey="budget" label="Budget" />
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 tracking-wider">OU</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 tracking-wider sticky right-0 bg-gray-50 dark:bg-gray-700 z-10">
                                    {isSelectionMode ? (
                                        <div className="flex items-center justify-end gap-2">
                                            <span className="text-xs">Select All</span>
                                            <input 
                                                type="checkbox" 
                                                onChange={handleSelectAll} 
                                                checked={paginatedActivities.length > 0 && paginatedActivities.every(a => selectedKeys.includes(`${a.type}-${a.id}`))}
                                                className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                                            />
                                        </div>
                                    ) : (
                                        "Actions"
                                    )}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {paginatedActivities.map((activity) => {
                                const totalActivityBudget = activity.expenses.reduce((sum, e) => sum + e.amount, 0);
                                const totalParticipants = activity.participantsMale + activity.participantsFemale;
                                const rowKey = `${activity.type}-${activity.id}`;
                                return (
                                <React.Fragment key={rowKey}>
                                    <tr onClick={() => handleToggleRow(activity.id, activity.type)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="px-4 py-4 text-gray-400 sticky left-0 bg-white dark:bg-gray-800 z-10"><svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-200 ${expandedRowId === rowKey ? 'transform rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></td>
                                        <td className="px-6 py-4 whitespace-normal text-sm font-medium text-gray-900 dark:text-white">
                                            {activity.name}
                                            {activity.uid && <div className="text-xs text-gray-400 font-normal">{activity.uid}</div>}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-xs"><span className={`px-2 py-1 rounded-full font-semibold ${activity.type === 'Training' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>{activity.type}</span></td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatDate(activity.date)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{activity.component}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{totalParticipants > 0 ? totalParticipants : '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatCurrency(totalActivityBudget)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{activity.operatingUnit}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium sticky right-0 bg-white dark:bg-gray-800 z-10">
                                            {canEdit && (
                                                <div className="flex items-center justify-end">
                                                    {isSelectionMode && (
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedKeys.includes(rowKey)} 
                                                            onChange={(e) => { e.stopPropagation(); handleSelectRow(rowKey); }} 
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="mr-3 h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                                                        />
                                                    )}
                                                    <button onClick={(e) => { e.stopPropagation(); handleEditClick(activity); }} className="text-accent hover:brightness-90 dark:text-green-400 dark:hover:text-green-300 mr-4">Edit</button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(activity); }} className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200">Delete</button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                     {expandedRowId === rowKey && (
                                        <tr className="bg-gray-50 dark:bg-gray-900/50">
                                            <td colSpan={9} className="p-4">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div className="space-y-4">
                                                        <div>
                                                            <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Description</h4>
                                                            <p className="text-sm text-gray-600 dark:text-gray-300">{activity.description || 'No description provided.'}</p>
                                                            {activity.type === 'Training' && activity.facilitator && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Facilitator: {activity.facilitator}</p>}
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

    const renderFormView = () => (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-semibold text-gray-800 dark:text-white">{view === 'edit' ? 'Edit ' : 'Add New '}{forcedType || 'Activity'}</h3>
                 <button onClick={handleCancelEdit} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Back to List</button>
            </div>
            <form onSubmit={handleSubmit}>
                <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                    <nav className="-mb-px flex space-x-4 overflow-x-auto" aria-label="Tabs">
                        <TabButton tabName="details" label="Details" />
                        <TabButton tabName="budget" label="Expenses" />
                        {view === 'edit' && <TabButton tabName="accomplishments" label="Accomplishments" />}
                    </nav>
                </div>
                <div className="min-h-[400px]">
                    {activeTab === 'details' && (
                        <div className="space-y-6">
                            <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Activity Information</legend>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                     <div><label htmlFor="component" className="block text-sm font-medium">Component</label><select name="component" id="component" value={formData.component} onChange={handleInputChange} required className={commonInputClasses}>{otherActivityComponents.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                                     <div>
                                         <label htmlFor="activityType" className="block text-sm font-medium">Activity Type</label>
                                         <select 
                                            name="activityType" 
                                            id="activityType" 
                                            value={selectedActivityType} 
                                            onChange={handleActivityTypeChange} 
                                            required 
                                            className={commonInputClasses}
                                         >
                                            <option value="">Select Type</option>
                                            {activityOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                         </select>
                                     </div>
                                     {isTrainingForm && (
                                         <div>
                                             <label htmlFor="name" className="block text-sm font-medium">Activity Name</label>
                                             <input type="text" name="name" id="name" value={formData.name} onChange={handleInputChange} required className={commonInputClasses} placeholder="Enter specific training title" />
                                         </div>
                                     )}
                                    <div><label htmlFor="date" className="block text-sm font-medium">Date</label><input type="date" name="date" id="date" value={formData.date} onChange={handleInputChange} required className={commonInputClasses} /></div>
                                    {isTrainingForm && (
                                        <div><label htmlFor="facilitator" className="block text-sm font-medium">Facilitator</label><input type="text" name="facilitator" id="facilitator" value={formData.facilitator} onChange={handleInputChange} className={commonInputClasses} /></div>
                                    )}
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
                    {activeTab === 'accomplishments' && view === 'edit' && (
                        <div className="space-y-6">
                            {/* Section 1: Activity Accomplishment */}
                            <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Activity Accomplishment</legend>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Date of Conduct</label>
                                        <input type="date" name="actualDate" value={formData.actualDate} onChange={handleInputChange} className={commonInputClasses} />
                                    </div>
                                    {((formData.participantsMale || 0) + (formData.participantsFemale || 0)) > 0 && (
                                        <>
                                            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4 mt-2 border-t pt-2 border-gray-200 dark:border-gray-700">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Male Participants</label>
                                                    <input type="number" name="actualParticipantsMale" value={formData.actualParticipantsMale} onChange={handleInputChange} min="0" className={commonInputClasses} />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Female Participants</label>
                                                    <input type="number" name="actualParticipantsFemale" value={formData.actualParticipantsFemale} onChange={handleInputChange} min="0" className={commonInputClasses} />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Total Actual Participants</label>
                                                    <input 
                                                        type="number" 
                                                        value={(Number(formData.actualParticipantsMale) || 0) + (Number(formData.actualParticipantsFemale) || 0)} 
                                                        disabled 
                                                        className={`${commonInputClasses} bg-gray-100 dark:bg-gray-600 cursor-not-allowed`} 
                                                    />
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </fieldset>

                            {/* Section 2: Budget Items Accomplishment */}
                            <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Budget Items Accomplishment</legend>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                        <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs">
                                            <tr>
                                                <th className="px-3 py-2 text-left font-medium">Particulars</th>
                                                <th className="px-3 py-2 text-left font-medium">Actual Obligation</th>
                                                <th className="px-3 py-2 text-left font-medium">Actual Disbursement</th>
                                                <th className="px-3 py-2 text-left font-medium">Actual Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                            {formData.expenses.map((expense) => (
                                                <tr key={expense.id}>
                                                    <td className="px-3 py-2 text-sm text-gray-800 dark:text-gray-200">{expense.expenseParticular}</td>
                                                    <td className="px-3 py-2">
                                                        <input type="date" value={expense.actualObligationDate || ''} onChange={(e) => handleExpenseAccomplishmentChange(expense.id, 'actualObligationDate', e.target.value)} className="w-full text-xs px-2 py-1 rounded border dark:bg-gray-600 dark:border-gray-500" />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <input type="date" value={expense.actualDisbursementDate || ''} onChange={(e) => handleExpenseAccomplishmentChange(expense.id, 'actualDisbursementDate', e.target.value)} className="w-full text-xs px-2 py-1 rounded border dark:bg-gray-600 dark:border-gray-500" />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <input type="number" value={expense.actualAmount || ''} onChange={(e) => handleExpenseAccomplishmentChange(expense.id, 'actualAmount', parseFloat(e.target.value))} className="w-full text-xs px-2 py-1 rounded border dark:bg-gray-600 dark:border-gray-500" placeholder="0.00" />
                                                    </td>
                                                </tr>
                                            ))}
                                            {formData.expenses.length === 0 && (
                                                <tr><td colSpan={4} className="px-3 py-4 text-center text-sm text-gray-500 italic">No budget items to update.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </fieldset>

                            {/* Section 3: Customer Satisfaction */}
                            <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                                <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Customer Satisfaction</legend>
                                <p className="text-sm text-gray-500 dark:text-gray-400 italic">Placeholder for Customer Satisfaction Survey data.</p>
                            </fieldset>

                            {/* Section 4: Catch Up Plan (Conditional) */}
                            {new Date() > new Date(formData.date) && (
                                <fieldset className="border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10 p-4 rounded-md">
                                    <legend className="px-2 font-semibold text-red-600 dark:text-red-400">Catch Up Plan</legend>
                                    <p className="text-xs text-red-500 mb-2">Activity is delayed. Please provide a catch-up plan.</p>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Remarks / Justification</label>
                                            <textarea name="catchUpPlanRemarks" value={formData.catchUpPlanRemarks || ''} onChange={handleInputChange} rows={3} className={commonInputClasses} placeholder="Describe actions taken or justification for delay..." />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">New Target Date</label>
                                            <input type="date" name="newTargetDate" value={formData.newTargetDate || ''} onChange={handleInputChange} className={commonInputClasses} />
                                        </div>
                                    </div>
                                </fieldset>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex justify-between items-center pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
                     <div className="text-lg font-bold">Total Budget: <span className="text-accent dark:text-green-400">{formatCurrency(totalBudget)}</span></div>
                    <div className="flex gap-4">
                        <button type="button" onClick={handleCancelEdit} className="inline-flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">Cancel</button>
                        <button type="submit" className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent">{editingItem ? 'Update Activity' : 'Add Activity'}</button>
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
                        <p className="my-4">Are you sure you want to delete the item "{itemToDelete?.name}"? This action cannot be undone.</p>
                        <div className="flex justify-end gap-4">
                            <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
                            <button onClick={confirmDelete} className="px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {isMultiDeleteModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl">
                        <h3 className="text-lg font-bold text-red-600 dark:text-red-400">Confirm Bulk Deletion</h3>
                        <p className="my-4 text-gray-700 dark:text-gray-300">
                            Are you sure you want to delete the <strong>{selectedKeys.length}</strong> selected item(s)? 
                            This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-4">
                            <button onClick={() => setIsMultiDeleteModalOpen(false)} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
                            <button onClick={confirmMultiDelete} className="px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700">Delete All Selected</button>
                        </div>
                    </div>
                </div>
            )}

            {view === 'list' ? renderListView() : renderFormView()}
        </div>
    );
};
