
import React, { useState, FormEvent, useMemo, useEffect } from 'react';
import { 
    OfficeRequirement, StaffingRequirement, OtherProgramExpense, 
    fundTypes, FundType, tiers, Tier, operatingUnits, objectTypes, ObjectType 
} from '../constants';
import { useAuth } from '../contexts/AuthContext';

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

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm";

const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
};

const ProgramManagement: React.FC<ProgramManagementProps> = ({ 
    officeReqs, setOfficeReqs, 
    staffingReqs, setStaffingReqs, 
    otherProgramExpenses, setOtherProgramExpenses,
    uacsCodes
}) => {
    const { currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState<ActiveTab>('Office');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<any>(null);
    const [editingItem, setEditingItem] = useState<any>(null);
    const [view, setView] = useState<'list' | 'form'>('list');

    // Filter State
    const [ouFilter, setOuFilter] = useState('All');
    const [yearFilter, setYearFilter] = useState('All');

    // UACS Selection State
    const [selectedObjectType, setSelectedObjectType] = useState<ObjectType>('MOOE');
    const [selectedParticular, setSelectedParticular] = useState('');

    // Generic Form State - unified structure to handle all types, specific fields handled conditionally
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
        amount: 0
    };

    const [formData, setFormData] = useState(initialFormState);

    const canEdit = currentUser?.role === 'Administrator' || currentUser?.role === 'User';
    const canViewAll = currentUser?.role === 'Administrator' || currentUser?.operatingUnit === 'NPMO';

    // Filtered Data based on Tab and OU
    const currentList = useMemo(() => {
        let list: any[] = [];
        switch(activeTab) {
            case 'Office': list = officeReqs; break;
            case 'Staffing': list = staffingReqs; break;
            case 'Other': list = otherProgramExpenses; break;
        }

        if (!canViewAll && currentUser) {
            list = list.filter(item => item.operatingUnit === currentUser.operatingUnit);
        } else if (canViewAll && ouFilter !== 'All') {
            list = list.filter(item => item.operatingUnit === ouFilter);
        }

        if (yearFilter !== 'All') {
            list = list.filter(item => item.fundYear.toString() === yearFilter);
        }
        
        return list.sort((a,b) => b.id - a.id);
    }, [activeTab, officeReqs, staffingReqs, otherProgramExpenses, ouFilter, yearFilter, currentUser, canViewAll]);

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
                operatingUnit: currentUser?.operatingUnit || 'NPMO',
                encodedBy: currentUser?.fullName || '',
            });
            // Reset UACS selectors
            setSelectedObjectType('MOOE');
            setSelectedParticular('');
        }
    }, [view, editingItem, currentUser]);

    // Pre-fill form for editing
    useEffect(() => {
        if (editingItem) {
            setFormData({ ...initialFormState, ...editingItem });
            
            // Reverse engineer UACS selection
            let foundType: ObjectType = 'MOOE';
            let foundParticular = '';
            
            outerLoop:
            for (const type of objectTypes) {
                for (const part in uacsCodes[type]) {
                    if (uacsCodes[type][part].hasOwnProperty(editingItem.uacsCode)) {
                        foundType = type;
                        foundParticular = part;
                        break outerLoop;
                    }
                }
            }
            setSelectedObjectType(foundType);
            setSelectedParticular(foundParticular);
        }
    }, [editingItem, uacsCodes]);


    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        // Validation
        if (!formData.operatingUnit || !formData.uacsCode) {
            alert("Please fill in all required fields.");
            return;
        }

        const commonData = {
            operatingUnit: formData.operatingUnit,
            uacsCode: formData.uacsCode,
            obligationDate: formData.obligationDate,
            disbursementDate: formData.disbursementDate,
            fundType: formData.fundType,
            fundYear: Number(formData.fundYear),
            tier: formData.tier,
            encodedBy: formData.encodedBy
        };

        if (editingItem) {
            // Update
            const updateId = editingItem.id;
            if (activeTab === 'Office') {
                setOfficeReqs(prev => prev.map(item => item.id === updateId ? { ...item, ...commonData, equipment: formData.equipment, specs: formData.specs, purpose: formData.purpose, numberOfUnits: Number(formData.numberOfUnits), pricePerUnit: Number(formData.pricePerUnit) } : item));
            } else if (activeTab === 'Staffing') {
                 setStaffingReqs(prev => prev.map(item => item.id === updateId ? { ...item, ...commonData, personnelPosition: formData.personnelPosition, status: formData.status as any, salaryGrade: Number(formData.salaryGrade), annualSalary: Number(formData.annualSalary), personnelType: formData.personnelType as any } : item));
            } else {
                setOtherProgramExpenses(prev => prev.map(item => item.id === updateId ? { ...item, ...commonData, particulars: formData.particulars, amount: Number(formData.amount) } : item));
            }
        } else {
            // Create
            const newId = Date.now(); // Simple ID generation
            // Generate UID based on Type and Year
            const prefix = activeTab === 'Office' ? 'OR' : activeTab === 'Staffing' ? 'SR' : 'OE';
            const uid = `${prefix}-${formData.fundYear}-${String(newId).slice(-4)}`;

            if (activeTab === 'Office') {
                setOfficeReqs(prev => [{ ...commonData, id: newId, uid, equipment: formData.equipment, specs: formData.specs, purpose: formData.purpose, numberOfUnits: Number(formData.numberOfUnits), pricePerUnit: Number(formData.pricePerUnit) }, ...prev]);
            } else if (activeTab === 'Staffing') {
                 setStaffingReqs(prev => [{ ...commonData, id: newId, uid, personnelPosition: formData.personnelPosition, status: formData.status as any, salaryGrade: Number(formData.salaryGrade), annualSalary: Number(formData.annualSalary), personnelType: formData.personnelType as any }, ...prev]);
            } else {
                setOtherProgramExpenses(prev => [{ ...commonData, id: newId, uid, particulars: formData.particulars, amount: Number(formData.amount) }, ...prev]);
            }
        }
        setView('list');
        setEditingItem(null);
    };

    const handleDelete = () => {
        if (itemToDelete) {
             if (activeTab === 'Office') {
                setOfficeReqs(prev => prev.filter(i => i.id !== itemToDelete.id));
            } else if (activeTab === 'Staffing') {
                 setStaffingReqs(prev => prev.filter(i => i.id !== itemToDelete.id));
            } else {
                setOtherProgramExpenses(prev => prev.filter(i => i.id !== itemToDelete.id));
            }
            setIsDeleteModalOpen(false);
            setItemToDelete(null);
        }
    };

    const renderForm = () => (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-800 dark:text-white">
                    {editingItem ? 'Edit' : 'Add'} {activeTab === 'Office' ? 'Office Requirement' : activeTab === 'Staffing' ? 'Staffing Requirement' : 'Other Expense'}
                </h3>
                <button onClick={() => { setView('list'); setEditingItem(null); }} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">Cancel</button>
            </div>
            
            <form onSubmit={handleFormSubmit} className="space-y-6">
                <fieldset className="border border-gray-200 dark:border-gray-700 p-4 rounded-md">
                    <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">General Information</legend>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                         <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Operating Unit</label>
                            <select name="operatingUnit" value={formData.operatingUnit} onChange={handleInputChange} disabled={!canViewAll && !!currentUser} className={commonInputClasses}>
                                {operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}
                            </select>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fund Year</label>
                            <input type="number" name="fundYear" value={formData.fundYear} onChange={handleInputChange} className={commonInputClasses} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fund Type</label>
                            <select name="fundType" value={formData.fundType} onChange={handleInputChange as any} className={commonInputClasses}>
                                {fundTypes.map(ft => <option key={ft} value={ft}>{ft}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tier</label>
                            <select name="tier" value={formData.tier} onChange={handleInputChange as any} className={commonInputClasses}>
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
                </fieldset>

                <fieldset className="border border-gray-200 dark:border-gray-700 p-4 rounded-md">
                    <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">UACS Classification</legend>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                         <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Object Type</label>
                            <select value={selectedObjectType} onChange={e => { setSelectedObjectType(e.target.value as ObjectType); setSelectedParticular(''); setFormData(p => ({...p, uacsCode: ''})); }} className={commonInputClasses}>
                                {objectTypes.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Particular</label>
                            <select value={selectedParticular} onChange={e => { setSelectedParticular(e.target.value); setFormData(p => ({...p, uacsCode: ''})); }} className={commonInputClasses}>
                                <option value="">Select Particular</option>
                                {Object.keys(uacsCodes[selectedObjectType]).map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">UACS Code</label>
                            <select name="uacsCode" value={formData.uacsCode} onChange={handleInputChange} disabled={!selectedParticular} className={commonInputClasses}>
                                <option value="">Select Code</option>
                                {selectedParticular && Object.entries(uacsCodes[selectedObjectType][selectedParticular]).map(([code, desc]) => (
                                    <option key={code} value={code}>{code} - {desc}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </fieldset>

                <fieldset className="border border-gray-200 dark:border-gray-700 p-4 rounded-md">
                    <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Specific Details</legend>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {activeTab === 'Office' && (
                            <>
                                <div><label className="block text-sm font-medium">Equipment</label><input type="text" name="equipment" value={formData.equipment} onChange={handleInputChange} required className={commonInputClasses} /></div>
                                <div><label className="block text-sm font-medium">Specifications</label><input type="text" name="specs" value={formData.specs} onChange={handleInputChange} className={commonInputClasses} /></div>
                                <div className="md:col-span-2"><label className="block text-sm font-medium">Purpose</label><textarea name="purpose" value={formData.purpose} onChange={handleInputChange} rows={2} className={commonInputClasses} /></div>
                                <div><label className="block text-sm font-medium">No. of Units</label><input type="number" name="numberOfUnits" value={formData.numberOfUnits} onChange={handleInputChange} min="0" className={commonInputClasses} /></div>
                                <div><label className="block text-sm font-medium">Price per Unit</label><input type="number" name="pricePerUnit" value={formData.pricePerUnit} onChange={handleInputChange} min="0" step="0.01" className={commonInputClasses} /></div>
                                <div className="md:col-span-2 text-right font-bold text-lg mt-2">Total: {formatCurrency(formData.numberOfUnits * formData.pricePerUnit)}</div>
                            </>
                        )}
                         {activeTab === 'Staffing' && (
                            <>
                                <div><label className="block text-sm font-medium">Position</label><input type="text" name="personnelPosition" value={formData.personnelPosition} onChange={handleInputChange} required className={commonInputClasses} /></div>
                                <div>
                                    <label className="block text-sm font-medium">Status</label>
                                    <select name="status" value={formData.status} onChange={handleInputChange} className={commonInputClasses}>
                                        <option value="Permanent">Permanent</option>
                                        <option value="Contractual">Contractual</option>
                                        <option value="COS">COS</option>
                                        <option value="Job Order">Job Order</option>
                                    </select>
                                </div>
                                <div><label className="block text-sm font-medium">Salary Grade</label><input type="number" name="salaryGrade" value={formData.salaryGrade} onChange={handleInputChange} min="1" max="33" className={commonInputClasses} /></div>
                                <div><label className="block text-sm font-medium">Annual Salary + Incentives</label><input type="number" name="annualSalary" value={formData.annualSalary} onChange={handleInputChange} min="0" step="0.01" className={commonInputClasses} /></div>
                                <div>
                                    <label className="block text-sm font-medium">Personnel Type</label>
                                    <select name="personnelType" value={formData.personnelType} onChange={handleInputChange} className={commonInputClasses}>
                                        <option value="Technical">Technical</option>
                                        <option value="Administrative">Administrative</option>
                                        <option value="Support">Support</option>
                                    </select>
                                </div>
                            </>
                        )}
                        {activeTab === 'Other' && (
                            <>
                                <div className="md:col-span-2"><label className="block text-sm font-medium">Particulars</label><textarea name="particulars" value={formData.particulars} onChange={handleInputChange} rows={3} required className={commonInputClasses} /></div>
                                <div><label className="block text-sm font-medium">Amount</label><input type="number" name="amount" value={formData.amount} onChange={handleInputChange} min="0" step="0.01" className={commonInputClasses} /></div>
                            </>
                        )}
                    </div>
                </fieldset>
                
                <div className="flex justify-end gap-4">
                    <button type="button" onClick={() => { setView('list'); setEditingItem(null); }} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-md text-sm font-medium">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:brightness-95">Save Record</button>
                </div>
            </form>
        </div>
    );

    return (
        <div className="space-y-6">
             {isDeleteModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl">
                        <h3 className="text-lg font-bold">Confirm Deletion</h3>
                        <p className="my-4">Are you sure you want to delete this item?</p>
                        <div className="flex justify-end gap-4">
                            <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700">Cancel</button>
                            <button onClick={handleDelete} className="px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-wrap justify-between items-center gap-4">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Program Management</h2>
                <div className="flex items-center gap-4">
                    {canEdit && view === 'list' && (
                         <button onClick={() => { setEditingItem(null); setView('form'); }} className="px-4 py-2 bg-accent text-white rounded-md font-medium hover:brightness-95 shadow-sm">
                            + Add New {activeTab === 'Office' ? 'Item' : activeTab === 'Staffing' ? 'Personnel' : 'Expense'}
                         </button>
                    )}
                </div>
            </div>

            {view === 'list' && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
                     {/* Tabs & Filters */}
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="flex space-x-1 bg-gray-100 dark:bg-gray-900 p-1 rounded-lg">
                            {(['Office', 'Staffing', 'Other'] as ActiveTab[]).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                                        activeTab === tab ? 'bg-white dark:bg-gray-700 shadow-sm text-accent dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                    }`}
                                >
                                    {tab === 'Office' ? 'Office Requirements' : tab === 'Staffing' ? 'Staffing Requirements' : 'Other Expenses'}
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-2">
                             {canViewAll && (
                                <select value={ouFilter} onChange={e => setOuFilter(e.target.value)} className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md text-sm">
                                    <option value="All">All OUs</option>
                                    {operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}
                                </select>
                            )}
                             <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md text-sm">
                                <option value="All">All Years</option>
                                {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-700/50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">UID</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">OU</th>
                                    
                                    {activeTab === 'Office' && (
                                        <>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Equipment</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Specs/Purpose</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Units</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Total Amount</th>
                                        </>
                                    )}
                                    {activeTab === 'Staffing' && (
                                        <>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Position</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Annual Salary</th>
                                        </>
                                    )}
                                    {activeTab === 'Other' && (
                                        <>
                                             <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Particulars</th>
                                             <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                                        </>
                                    )}

                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Fund</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {currentList.length === 0 ? (
                                    <tr><td colSpan={10} className="px-6 py-4 text-center text-gray-500">No records found.</td></tr>
                                ) : (
                                    currentList.map((item: any) => (
                                        <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500 dark:text-gray-400">{item.uid}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{item.operatingUnit}</td>
                                            
                                            {activeTab === 'Office' && (
                                                <>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{item.equipment}</td>
                                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300">
                                                        <div className="truncate w-48" title={item.specs}>{item.specs}</div>
                                                        <div className="text-xs text-gray-400 truncate w-48">{item.purpose}</div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500 dark:text-gray-300">{item.numberOfUnits}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(item.numberOfUnits * item.pricePerUnit)}</td>
                                                </>
                                            )}
                                             {activeTab === 'Staffing' && (
                                                <>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                                        {item.personnelPosition}
                                                        <div className="text-xs text-gray-400">SG-{item.salaryGrade}</div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.status}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.personnelType}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(item.annualSalary)}</td>
                                                </>
                                            )}
                                            {activeTab === 'Other' && (
                                                <>
                                                     <td className="px-6 py-4 text-sm text-gray-900 dark:text-white"><div className="truncate w-64" title={item.particulars}>{item.particulars}</div></td>
                                                     <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(item.amount)}</td>
                                                </>
                                            )}

                                            <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                                <div>{item.fundType} {item.fundYear}</div>
                                                <div>{item.tier}</div>
                                                <div className="mt-1 text-xs font-mono">{item.uacsCode}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                 {canEdit && (
                                                    <>
                                                        <button onClick={() => { setEditingItem(item); setView('form'); }} className="text-accent hover:text-green-900 mr-3">Edit</button>
                                                        <button onClick={() => { setItemToDelete(item); setIsDeleteModalOpen(true); }} className="text-red-600 hover:text-red-900">Delete</button>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {view === 'form' && renderForm()}
        </div>
    );
};

export default ProgramManagement;
