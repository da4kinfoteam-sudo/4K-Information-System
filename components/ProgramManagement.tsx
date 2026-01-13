// Author: 4K 
import React, { useState, FormEvent, useMemo, useEffect } from 'react';
import { 
    OfficeRequirement, StaffingRequirement, OtherProgramExpense, 
    fundTypes, FundType, tiers, Tier, operatingUnits, objectTypes, ObjectType 
} from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import { OfficeRequirementsTable, OfficeRequirementsFormFields, parseOfficeRequirementRow } from './program_management/OfficeRequirementsTab';
import { StaffingRequirementsTable, StaffingRequirementsFormFields, parseStaffingRequirementRow } from './program_management/StaffingRequirementsTab';
import { OtherExpensesTable, OtherExpensesFormFields, parseOtherExpenseRow } from './program_management/OtherExpensesTab';

// Declare XLSX to inform TypeScript about the global variable from the script tag
declare const XLSX: any;

interface ProgramManagementProps {
    officeReqs: OfficeRequirement[];
    setOfficeReqs: React.Dispatch<React.SetStateAction<OfficeRequirement[]>>;
    staffingReqs: StaffingRequirement[];
    setStaffingReqs: React.Dispatch<React.SetStateAction<StaffingRequirement[]>>;
    otherProgramExpenses: OtherProgramExpense[];
    setOtherProgramExpenses: React.Dispatch<React.SetStateAction<OtherProgramExpense[]>>;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
}

type ActiveTab = 'Office' | 'Staffing' | 'Other';

const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm";

const ProgramManagement: React.FC<ProgramManagementProps> = ({ 
    officeReqs, setOfficeReqs, 
    staffingReqs, setStaffingReqs, 
    otherProgramExpenses, setOtherProgramExpenses,
    uacsCodes
}) => {
    const { currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState<ActiveTab>('Office');
    const [formTab, setFormTab] = useState<'Details' | 'Accomplishment'>('Details');
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<any>(null);
    const [editingItem, setEditingItem] = useState<any>(null);
    const [view, setView] = useState<'list' | 'form'>('list');
    const [isUploading, setIsUploading] = useState(false);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    // Multi-Delete State
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [isMultiDeleteModalOpen, setIsMultiDeleteModalOpen] = useState(false);

    // Filter State
    const [ouFilter, setOuFilter] = useState('All');
    const [yearFilter, setYearFilter] = useState('All');

    // UACS Selection State
    const [selectedObjectType, setSelectedObjectType] = useState<ObjectType>('MOOE');
    const [selectedParticular, setSelectedParticular] = useState('');

    // Generic Form State
    const initialFormState = {
        id: 0,
        uid: '',
        operatingUnit: '',
        uacsCode: '',
        obligationDate: '',
        disbursementDate: '',
        fundType: 'Current' as FundType,
        fundYear: new Date().getFullYear(),
        tier: 'Tier 1' as Tier,
        encodedBy: '',
        
        // Office Req fields
        equipment: '',
        specs: '',
        purpose: '',
        numberOfUnits: 0,
        pricePerUnit: 0,

        // Staffing fields
        personnelPosition: '',
        status: 'Contractual',
        salaryGrade: 1,
        annualSalary: 0,
        personnelType: 'Technical',

        // Other Expenses fields
        particulars: '',
        amount: 0,

        // Accomplishment Fields
        actualDate: '',
        actualAmount: 0,
        actualObligationDate: '',
        actualDisbursementDate: '',
        actualObligationAmount: 0,
        actualDisbursementAmount: 0
    };

    const [formData, setFormData] = useState(initialFormState);

    // Permissions
    const canEdit = currentUser?.role === 'Administrator' || currentUser?.role === 'User';
    const canViewAll = currentUser?.role === 'Administrator' || currentUser?.role === 'Management';

    // Set default OU filter for restricted users
    useEffect(() => {
        if (currentUser && !canViewAll) {
            setOuFilter(currentUser.operatingUnit);
        } else {
            setOuFilter('All');
        }
    }, [currentUser, canViewAll]);

    // Reset selection mode and pagination when active tab changes
    useEffect(() => {
        setIsSelectionMode(false);
        setSelectedIds([]);
        setCurrentPage(1);
    }, [activeTab]);

    const availableYears = useMemo(() => {
         const years = new Set<string>();
         [...officeReqs, ...staffingReqs, ...otherProgramExpenses].forEach(i => years.add(i.fundYear.toString()));
         return Array.from(years).sort().reverse();
    }, [officeReqs, staffingReqs, otherProgramExpenses]);

    // Reset form when view changes
    useEffect(() => {
        if (view === 'form' && !editingItem) {
            setFormData({
                ...initialFormState,
                operatingUnit: currentUser?.operatingUnit || (canViewAll ? 'NPMO' : currentUser?.operatingUnit || ''),
                encodedBy: currentUser?.fullName || '',
            });
            // Reset UACS selectors
            setSelectedObjectType('MOOE');
            setSelectedParticular('');
            setFormTab('Details');
        }
    }, [view, editingItem, currentUser, canViewAll]);

    // Pre-fill form for editing
    useEffect(() => {
        if (editingItem) {
            setFormData({ 
                ...initialFormState, 
                ...editingItem,
                // Ensure defaults if missing in item
                actualDate: editingItem.actualDate || '',
                actualAmount: editingItem.actualAmount || 0,
                actualObligationDate: editingItem.actualObligationDate || '',
                actualDisbursementDate: editingItem.actualDisbursementDate || '',
                actualObligationAmount: editingItem.actualObligationAmount || 0,
                actualDisbursementAmount: editingItem.actualDisbursementAmount || 0
            });
            
            // Reverse engineer UACS selection
            let foundType: ObjectType = 'MOOE';
            let foundParticular = '';
            
            outerLoop:
            for (const type of objectTypes) {
                if(uacsCodes[type]) {
                    for (const part in uacsCodes[type]) {
                        if (uacsCodes[type][part].hasOwnProperty(editingItem.uacsCode)) {
                            foundType = type;
                            foundParticular = part;
                            break outerLoop;
                        }
                    }
                }
            }
            setSelectedObjectType(foundType);
            setSelectedParticular(foundParticular);
            setFormTab('Details');
        }
    }, [editingItem, uacsCodes]);


    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.operatingUnit) {
            alert("Operating Unit is required.");
            return;
        }
        if (!formData.uacsCode) {
            alert("UACS Code is required.");
            return;
        }

        // Determine table and state setter
        let tableName = '';
        let setFunction: any = null;
        let prefix = '';

        if (activeTab === 'Office') {
            tableName = 'office_requirements';
            setFunction = setOfficeReqs;
            prefix = 'OR';
        } else if (activeTab === 'Staffing') {
            tableName = 'staffing_requirements';
            setFunction = setStaffingReqs;
            prefix = 'SR';
        } else {
            tableName = 'other_program_expenses';
            setFunction = setOtherProgramExpenses;
            prefix = 'OE';
        }

        const commonFields = {
            operatingUnit: formData.operatingUnit,
            uacsCode: formData.uacsCode,
            obligationDate: formData.obligationDate,
            disbursementDate: formData.disbursementDate,
            fundType: formData.fundType,
            fundYear: Number(formData.fundYear),
            tier: formData.tier,
            encodedBy: formData.encodedBy || currentUser?.fullName || 'System',
            
            // Accomplishment Fields
            actualDate: formData.actualDate,
            actualAmount: Number(formData.actualAmount),
            actualObligationDate: formData.actualObligationDate,
            actualDisbursementDate: formData.actualDisbursementDate,
            actualObligationAmount: Number(formData.actualObligationAmount),
            actualDisbursementAmount: Number(formData.actualDisbursementAmount),
            updated_at: new Date().toISOString()
        };

        let specificFields = {};
        if (activeTab === 'Office') {
            specificFields = {
                equipment: formData.equipment,
                specs: formData.specs,
                purpose: formData.purpose,
                numberOfUnits: Number(formData.numberOfUnits),
                pricePerUnit: Number(formData.pricePerUnit)
            };
        } else if (activeTab === 'Staffing') {
            specificFields = {
                personnelPosition: formData.personnelPosition,
                status: formData.status,
                salaryGrade: Number(formData.salaryGrade),
                annualSalary: Number(formData.annualSalary),
                personnelType: formData.personnelType
            };
        } else {
            specificFields = {
                particulars: formData.particulars,
                amount: Number(formData.amount)
            };
        }

        if (supabase) {
            if (editingItem) {
                // Update
                const { data, error } = await supabase
                    .from(tableName)
                    .update({ ...commonFields, ...specificFields })
                    .eq('id', editingItem.id)
                    .select()
                    .single();

                if (error) {
                    console.error("Error updating item:", error);
                    alert("Failed to update item.");
                } else if (data) {
                    setFunction((prev: any[]) => prev.map(i => i.id === data.id ? data : i));
                }
            } else {
                // Create
                // Generate UID if not present
                let uid = formData.uid;
                if (!uid) {
                    const year = new Date().getFullYear();
                    const sequence = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
                    uid = `${prefix}-${year}-${sequence}`;
                }

                const { data, error } = await supabase
                    .from(tableName)
                    .insert([{ ...commonFields, ...specificFields, uid, created_at: new Date().toISOString() }])
                    .select()
                    .single();

                if (error) {
                    console.error("Error creating item:", error);
                    alert("Failed to create item.");
                } else if (data) {
                    setFunction((prev: any[]) => [data, ...prev]);
                }
            }
        } else {
            // Fallback for offline mode (using random ID)
            const newItem = {
                ...commonFields,
                ...specificFields,
                id: editingItem ? editingItem.id : Date.now(),
                uid: formData.uid || `${prefix}-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`
            };
            
            if (editingItem) {
                setFunction((prev: any[]) => prev.map(i => i.id === newItem.id ? newItem : i));
            } else {
                setFunction((prev: any[]) => [newItem, ...prev]);
            }
        }
        
        handleCancelForm();
    };

    const handleCancelForm = () => {
        setEditingItem(null);
        setView('list');
        setFormData(initialFormState);
    };

    const handleEdit = (item: any) => {
        setEditingItem(item);
        setView('form');
    };

    const handleDelete = (item: any) => {
        setItemToDelete(item);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (itemToDelete) {
            let tableName = '';
            let setFunction: any = null;

            if (activeTab === 'Office') { tableName = 'office_requirements'; setFunction = setOfficeReqs; }
            else if (activeTab === 'Staffing') { tableName = 'staffing_requirements'; setFunction = setStaffingReqs; }
            else { tableName = 'other_program_expenses'; setFunction = setOtherProgramExpenses; }

            if (supabase) {
                const { error } = await supabase.from(tableName).delete().eq('id', itemToDelete.id);
                if (error) {
                    console.error("Error deleting item:", error);
                    alert("Failed to delete item.");
                } else {
                    setFunction((prev: any[]) => prev.filter(i => i.id !== itemToDelete.id));
                }
            } else {
                setFunction((prev: any[]) => prev.filter(i => i.id !== itemToDelete.id));
            }
            setIsDeleteModalOpen(false);
            setItemToDelete(null);
        }
    };

    // --- Multi-Delete ---
    const handleToggleSelectionMode = () => {
        if (isSelectionMode) {
            setIsSelectionMode(false);
            setSelectedIds([]);
        } else {
            setIsSelectionMode(true);
        }
    };

    const handleSelectRow = (id: number) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const confirmMultiDelete = async () => {
        let tableName = '';
        let setFunction: any = null;

        if (activeTab === 'Office') { tableName = 'office_requirements'; setFunction = setOfficeReqs; }
        else if (activeTab === 'Staffing') { tableName = 'staffing_requirements'; setFunction = setStaffingReqs; }
        else { tableName = 'other_program_expenses'; setFunction = setOtherProgramExpenses; }

        if (supabase) {
            const { error } = await supabase.from(tableName).delete().in('id', selectedIds);
            if (error) {
                console.error("Error deleting items:", error);
                alert("Failed to delete selected items.");
            } else {
                setFunction((prev: any[]) => prev.filter(i => !selectedIds.includes(i.id)));
            }
        } else {
            setFunction((prev: any[]) => prev.filter(i => !selectedIds.includes(i.id)));
        }
        setIsMultiDeleteModalOpen(false);
        setIsSelectionMode(false);
        setSelectedIds([]);
    };

    // --- Filtering ---
    const filterList = (list: any[]) => {
        let filtered = list;
        if (!canViewAll && currentUser) {
            filtered = filtered.filter(item => item.operatingUnit === currentUser.operatingUnit);
        } else if (canViewAll && ouFilter !== 'All') {
            filtered = filtered.filter(item => item.operatingUnit === ouFilter);
        }
        if (yearFilter !== 'All') {
            filtered = filtered.filter(item => item.fundYear.toString() === yearFilter);
        }
        return filtered.sort((a,b) => b.id - a.id);
    };

    const getCurrentList = () => {
        if (activeTab === 'Office') return filterList(officeReqs);
        if (activeTab === 'Staffing') return filterList(staffingReqs);
        return filterList(otherProgramExpenses);
    }

    // --- Report Handler ---
    const handleDownloadReport = () => {
        const currentList = getCurrentList();
        let data: any[] = [];
        let sheetName = "";
        let fileName = "";

        if (activeTab === 'Office') {
            data = (currentList as OfficeRequirement[]).map(item => ({
                UID: item.uid,
                OU: item.operatingUnit,
                Equipment: item.equipment,
                Specs: item.specs,
                Purpose: item.purpose,
                'No. of Units': item.numberOfUnits,
                'Price/Unit': item.pricePerUnit,
                'Total Amount': item.numberOfUnits * item.pricePerUnit,
                'Fund Type': item.fundType,
                'Fund Year': item.fundYear,
                Tier: item.tier,
                'Obligation Date': item.obligationDate,
                'Disbursement Date': item.disbursementDate
            }));
            sheetName = "Office Requirements";
            fileName = "Office_Requirements_Report.xlsx";
        } else if (activeTab === 'Staffing') {
            data = (currentList as StaffingRequirement[]).map(item => ({
                UID: item.uid,
                OU: item.operatingUnit,
                Position: item.personnelPosition,
                Status: item.status,
                'Salary Grade': item.salaryGrade,
                'Annual Salary': item.annualSalary,
                Type: item.personnelType,
                'Fund Type': item.fundType,
                'Fund Year': item.fundYear,
                Tier: item.tier,
                'Obligation Date': item.obligationDate,
                'Disbursement Date': item.disbursementDate
            }));
            sheetName = "Staffing Requirements";
            fileName = "Staffing_Requirements_Report.xlsx";
        } else {
            data = (currentList as OtherProgramExpense[]).map(item => ({
                UID: item.uid,
                OU: item.operatingUnit,
                Particulars: item.particulars,
                Amount: item.amount,
                'Fund Type': item.fundType,
                'Fund Year': item.fundYear,
                Tier: item.tier,
                'Obligation Date': item.obligationDate,
                'Disbursement Date': item.disbursementDate
            }));
            sheetName = "Other Expenses";
            fileName = "Other_Expenses_Report.xlsx";
        }

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        XLSX.writeFile(wb, fileName);
    };

    // --- Import Handlers ---
    const handleDownloadTemplate = () => {
        let headers: string[] = [];
        let commonHeaders = ['operatingUnit', 'fundYear', 'fundType', 'tier', 'obligationDate', 'disbursementDate', 'uacsCode'];
        let exampleData: any[] = [];

        if (activeTab === 'Office') {
            headers = [...commonHeaders, 'equipment', 'specs', 'purpose', 'numberOfUnits', 'pricePerUnit'];
            exampleData = [{
                operatingUnit: 'NPMO', fundYear: 2024, fundType: 'Current', tier: 'Tier 1', obligationDate: '2024-01-15', disbursementDate: '2024-02-15', uacsCode: '50203010-00',
                equipment: 'Laptop', specs: 'i7, 16GB RAM', purpose: 'For administrative use', numberOfUnits: 1, pricePerUnit: 50000
            }];
        } else if (activeTab === 'Staffing') {
            headers = [...commonHeaders, 'personnelPosition', 'status', 'salaryGrade', 'annualSalary', 'personnelType'];
            exampleData = [{
                operatingUnit: 'NPMO', fundYear: 2024, fundType: 'Current', tier: 'Tier 1', obligationDate: '2024-01-15', disbursementDate: '2024-02-15', uacsCode: '50100000-00',
                personnelPosition: 'Project Development Officer II', status: 'Contractual', salaryGrade: 15, annualSalary: 450000, personnelType: 'Technical'
            }];
        } else {
            headers = [...commonHeaders, 'particulars', 'amount'];
            exampleData = [{
                operatingUnit: 'NPMO', fundYear: 2024, fundType: 'Current', tier: 'Tier 1', obligationDate: '2024-01-15', disbursementDate: '2024-02-15', uacsCode: '50299990-99',
                particulars: 'Miscellaneous Expenses', amount: 10000
            }];
        }

        const ws = XLSX.utils.json_to_sheet(exampleData, { header: headers });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, `${activeTab}_Template.xlsx`);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = event.target?.result;
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

                // Determine table and setter
                let tableName = '';
                let setFunction: any = null;
                let prefix = '';
                
                if (activeTab === 'Office') { tableName = 'office_requirements'; setFunction = setOfficeReqs; prefix = 'OR'; }
                else if (activeTab === 'Staffing') { tableName = 'staffing_requirements'; setFunction = setStaffingReqs; prefix = 'SR'; }
                else { tableName = 'other_program_expenses'; setFunction = setOtherProgramExpenses; prefix = 'OE'; }

                const currentTimestamp = new Date().toISOString();
                const newItems = jsonData.map((row: any, index: number) => {
                    const uid = `${prefix}-${row.fundYear || new Date().getFullYear()}-${Date.now().toString().slice(-4)}${index}`;
                    // Basic parsing
                    const common = {
                        operatingUnit: row.operatingUnit,
                        fundYear: row.fundYear,
                        fundType: row.fundType,
                        tier: row.tier,
                        obligationDate: row.obligationDate,
                        disbursementDate: row.disbursementDate,
                        uacsCode: row.uacsCode,
                        encodedBy: currentUser?.fullName || 'Upload',
                        created_at: currentTimestamp,
                        updated_at: currentTimestamp
                    };

                    if (activeTab === 'Office') return parseOfficeRequirementRow(row, { uid, ...common });
                    if (activeTab === 'Staffing') return parseStaffingRequirementRow(row, { uid, ...common });
                    return parseOtherExpenseRow(row, { uid, ...common });
                });

                if (supabase) {
                    const { error } = await supabase.from(tableName).insert(newItems);
                    if (error) throw error;
                    
                    // Refresh data
                    const { data } = await supabase.from(tableName).select('*').order('id', { ascending: true });
                    if (data) setFunction(data);
                } else {
                    // Offline
                    setFunction((prev: any[]) => [...newItems.map((i, idx) => ({ ...i, id: Date.now() + idx })), ...prev]);
                }
                
                alert(`${newItems.length} items imported successfully.`);

            } catch (error: any) {
                console.error("Error processing file:", error);
                alert(`Failed to import: ${error.message}`);
            } finally {
                setIsUploading(false);
                if (e.target) e.target.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };

    // --- Render Logic ---
    const renderList = () => {
        const currentList = getCurrentList();
        
        // Pagination logic
        const totalPages = Math.ceil(currentList.length / itemsPerPage);
        const paginatedList = currentList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

        return (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                    <div className="flex items-center gap-4">
                        {canViewAll && (
                            <select value={ouFilter} onChange={e => setOuFilter(e.target.value)} className={commonInputClasses}>
                                <option value="All">All OUs</option>
                                {operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}
                            </select>
                        )}
                        <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} className={commonInputClasses}>
                            <option value="All">All Years</option>
                            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {isSelectionMode && selectedIds.length > 0 && (
                            <button onClick={() => setIsMultiDeleteModalOpen(true)} className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700">
                                Delete Selected ({selectedIds.length})
                            </button>
                        )}
                        <button onClick={handleDownloadReport} className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">Download Report</button>
                        {canEdit && (
                            <>
                                <button onClick={handleDownloadTemplate} className="inline-flex items-center justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">Download Template</button>
                                <label className={`inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 ${isUploading ? 'bg-gray-400 cursor-not-allowed' : 'cursor-pointer'}`}>
                                    {isUploading ? 'Uploading...' : 'Upload XLSX'}
                                    <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleFileUpload} disabled={isUploading} />
                                </label>
                                <button onClick={handleToggleSelectionMode} className={`inline-flex items-center justify-center p-2 border border-gray-300 dark:border-gray-600 shadow-sm rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 ${isSelectionMode ? 'bg-gray-200 dark:bg-gray-600 text-red-600' : 'bg-white dark:bg-gray-700 text-gray-500'}`} title="Toggle Multi-Delete Mode">
                                    <TrashIcon />
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {activeTab === 'Office' && (
                    <OfficeRequirementsTable 
                        items={paginatedList as OfficeRequirement[]} 
                        canEdit={canEdit} 
                        isSelectionMode={isSelectionMode} 
                        selectedIds={selectedIds} 
                        onSelectRow={handleSelectRow} 
                        onEdit={handleEdit} 
                        onDelete={handleDelete} 
                    />
                )}
                {activeTab === 'Staffing' && (
                    <StaffingRequirementsTable 
                        items={paginatedList as StaffingRequirement[]} 
                        canEdit={canEdit} 
                        isSelectionMode={isSelectionMode} 
                        selectedIds={selectedIds} 
                        onSelectRow={handleSelectRow} 
                        onEdit={handleEdit} 
                        onDelete={handleDelete} 
                    />
                )}
                {activeTab === 'Other' && (
                    <OtherExpensesTable 
                        items={paginatedList as OtherProgramExpense[]} 
                        canEdit={canEdit} 
                        isSelectionMode={isSelectionMode} 
                        selectedIds={selectedIds} 
                        onSelectRow={handleSelectRow} 
                        onEdit={handleEdit} 
                        onDelete={handleDelete} 
                    />
                )}

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
                        <span className="text-gray-700 dark:text-gray-300">Showing {Math.min((currentPage - 1) * itemsPerPage + 1, currentList.length)} to {Math.min(currentPage * itemsPerPage, currentList.length)} of {currentList.length} entries</span>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">Previous</button>
                            <span className="px-2 font-medium">{currentPage} / {totalPages}</span>
                            <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderForm = () => (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white">
                    {editingItem ? 'Edit' : 'Add'} {activeTab === 'Office' ? 'Office Requirement' : activeTab === 'Staffing' ? 'Staffing Requirement' : 'Other Expense'}
                </h3>
                <button onClick={handleCancelForm} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md text-sm">Cancel</button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-6">
                <div className="border-b border-gray-200 dark:border-gray-700 mb-4">
                    <nav className="-mb-px flex space-x-4">
                        <button type="button" onClick={() => setFormTab('Details')} className={`pb-2 border-b-2 text-sm font-medium ${formTab === 'Details' ? 'border-accent text-accent' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Details</button>
                        <button type="button" onClick={() => setFormTab('Accomplishment')} className={`pb-2 border-b-2 text-sm font-medium ${formTab === 'Accomplishment' ? 'border-accent text-accent' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Accomplishment</button>
                    </nav>
                </div>

                {formTab === 'Details' && (
                    <>
                        {/* Common Fields */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border border-gray-200 dark:border-gray-700 rounded-md">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Operating Unit</label>
                                <select name="operatingUnit" value={formData.operatingUnit} onChange={handleInputChange} disabled={!canViewAll && !!currentUser} className={`${commonInputClasses} disabled:bg-gray-100 disabled:cursor-not-allowed`}>
                                    <option value="">Select OU</option>
                                    {operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fund Year</label>
                                <input type="number" name="fundYear" value={formData.fundYear} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fund Type</label>
                                <select name="fundType" value={formData.fundType} onChange={handleInputChange} className={commonInputClasses}>
                                    {fundTypes.map(f => <option key={f} value={f}>{f}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tier</label>
                                <select name="tier" value={formData.tier} onChange={handleInputChange} className={commonInputClasses}>
                                    {tiers.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Obligation Date</label>
                                <input type="date" name="obligationDate" value={formData.obligationDate} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Disbursement Date</label>
                                <input type="date" name="disbursementDate" value={formData.disbursementDate} onChange={handleInputChange} className={commonInputClasses} />
                            </div>
                        </div>

                        {/* UACS Selection */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border border-gray-200 dark:border-gray-700 rounded-md">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Object Type</label>
                                <select value={selectedObjectType} onChange={e => { setSelectedObjectType(e.target.value as ObjectType); setSelectedParticular(''); setFormData(prev => ({...prev, uacsCode: ''})); }} className={commonInputClasses}>
                                    {objectTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Particular</label>
                                <select value={selectedParticular} onChange={e => { setSelectedParticular(e.target.value); setFormData(prev => ({...prev, uacsCode: ''})); }} className={commonInputClasses}>
                                    <option value="">Select</option>
                                    {uacsCodes[selectedObjectType] && Object.keys(uacsCodes[selectedObjectType]).map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">UACS Code</label>
                                <select name="uacsCode" value={formData.uacsCode} onChange={handleInputChange} className={commonInputClasses} disabled={!selectedParticular}>
                                    <option value="">Select Code</option>
                                    {selectedParticular && uacsCodes[selectedObjectType][selectedParticular] && Object.entries(uacsCodes[selectedObjectType][selectedParticular]).map(([code, desc]) => (
                                        <option key={code} value={code}>{code} - {desc}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Specific Fields */}
                        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-md">
                            {activeTab === 'Office' && <OfficeRequirementsFormFields formData={formData} handleInputChange={handleInputChange} commonInputClasses={commonInputClasses} />}
                            {activeTab === 'Staffing' && <StaffingRequirementsFormFields formData={formData} handleInputChange={handleInputChange} commonInputClasses={commonInputClasses} />}
                            {activeTab === 'Other' && <OtherExpensesFormFields formData={formData} handleInputChange={handleInputChange} commonInputClasses={commonInputClasses} />}
                        </div>
                    </>
                )}

                {formTab === 'Accomplishment' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border border-gray-200 dark:border-gray-700 rounded-md">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Date</label>
                            <input type="date" name="actualDate" value={formData.actualDate} onChange={handleInputChange} className={commonInputClasses} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Amount (Total)</label>
                            <input type="number" name="actualAmount" value={formData.actualAmount} onChange={handleInputChange} min="0" step="0.01" className={commonInputClasses} />
                        </div>
                        <div className="md:col-span-2 border-t border-gray-200 dark:border-gray-700 my-2"></div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Obligation Date</label>
                            <input type="date" name="actualObligationDate" value={formData.actualObligationDate} onChange={handleInputChange} className={commonInputClasses} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Obligation Amount</label>
                            <input type="number" name="actualObligationAmount" value={formData.actualObligationAmount} onChange={handleInputChange} min="0" step="0.01" className={commonInputClasses} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Disbursement Date</label>
                            <input type="date" name="actualDisbursementDate" value={formData.actualDisbursementDate} onChange={handleInputChange} className={commonInputClasses} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Disbursement Amount</label>
                            <input type="number" name="actualDisbursementAmount" value={formData.actualDisbursementAmount} onChange={handleInputChange} min="0" step="0.01" className={commonInputClasses} />
                        </div>
                    </div>
                )}

                <div className="flex justify-end gap-4">
                    <button type="button" onClick={handleCancelForm} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md text-sm">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-accent text-white rounded-md text-sm hover:brightness-95">Save Item</button>
                </div>
            </form>
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Program Management</h2>
                {canEdit && view === 'list' && (
                    <button onClick={() => setView('form')} className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent">
                        + Add New Item
                    </button>
                )}
            </div>

            {view === 'list' && (
                <div className="border-b border-gray-200 dark:border-gray-700">
                    <nav className="-mb-px flex space-x-8">
                        {(['Office', 'Staffing', 'Other'] as ActiveTab[]).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                                    activeTab === tab
                                        ? 'border-accent text-accent'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                }`}
                            >
                                {tab === 'Office' ? 'Office Requirements' : tab === 'Staffing' ? 'Staffing Requirements' : 'Other Expenses'}
                            </button>
                        ))}
                    </nav>
                </div>
            )}

            {view === 'list' ? renderList() : renderForm()}

            {/* Modal for Deletion */}
            {isDeleteModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Confirm Deletion</h3>
                        <p className="text-gray-600 dark:text-gray-300 mb-6">Are you sure you want to delete this item? This action cannot be undone.</p>
                        <div className="flex justify-end gap-4">
                            <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md text-sm">Cancel</button>
                            <button onClick={confirmDelete} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal for Multi-Deletion */}
            {isMultiDeleteModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Confirm Bulk Deletion</h3>
                        <p className="text-gray-600 dark:text-gray-300 mb-6">Are you sure you want to delete {selectedIds.length} items? This action cannot be undone.</p>
                        <div className="flex justify-end gap-4">
                            <button onClick={() => setIsMultiDeleteModalOpen(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md text-sm">Cancel</button>
                            <button onClick={confirmMultiDelete} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700">Delete All</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProgramManagement;
// --- End of components/ProgramManagement.tsx ---