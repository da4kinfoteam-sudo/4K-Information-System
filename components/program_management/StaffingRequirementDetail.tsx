// Author: 4K 
import React, { useState, useEffect, useMemo } from 'react';
import { StaffingRequirement, StaffingExpense, operatingUnits, fundTypes, tiers, objectTypes, ObjectType } from '../../constants';
import { formatCurrency } from '../reports/ReportUtils';
import { useAuth } from '../../contexts/AuthContext';
import { getUserPermissions } from '../mainfunctions/TableHooks';
import { supabase } from '../../supabaseClient';

interface StaffingRequirementDetailProps {
    item: StaffingRequirement;
    onBack: () => void;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    onUpdate: (item: StaffingRequirement) => void;
}

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm disabled:bg-gray-100 disabled:dark:bg-gray-800 disabled:cursor-not-allowed";

const DetailItem: React.FC<{ label: string; value?: string | number | React.ReactNode }> = ({ label, value }) => (
    <div>
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{value || 'N/A'}</dd>
    </div>
);

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString; // Return original if parse fails
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const StaffingRequirementDetail: React.FC<StaffingRequirementDetailProps> = ({ item, onBack, uacsCodes, onUpdate }) => {
    const { currentUser } = useAuth();
    const { canEdit, canViewAll } = getUserPermissions(currentUser);
    const isAdmin = currentUser?.role === 'Administrator';
    
    const [editMode, setEditMode] = useState<'none' | 'details' | 'accomplishment'>('none');
    const [formData, setFormData] = useState<StaffingRequirement>(item);
    
    // Construct display expenses, handling legacy data where expenses array might be empty but root data exists
    const displayExpenses = useMemo(() => {
        if (item.expenses && item.expenses.length > 0) return item.expenses;

        // Legacy Fallback: Construct a single expense from root fields
        if (item.annualSalary > 0 || item.uacsCode) {
             const legacy: StaffingExpense = {
                id: 99999, // Dummy ID for display
                objectType: 'MOOE',
                expenseParticular: 'Salaries & Wages',
                uacsCode: item.uacsCode || '',
                obligationDate: item.obligationDate,
                amount: item.annualSalary,
                
                // Map Targets
                disbursementJan: item.disbursementJan || 0, disbursementFeb: item.disbursementFeb || 0, disbursementMar: item.disbursementMar || 0,
                disbursementApr: item.disbursementApr || 0, disbursementMay: item.disbursementMay || 0, disbursementJun: item.disbursementJun || 0,
                disbursementJul: item.disbursementJul || 0, disbursementAug: item.disbursementAug || 0, disbursementSep: item.disbursementSep || 0,
                disbursementOct: item.disbursementOct || 0, disbursementNov: item.disbursementNov || 0, disbursementDec: item.disbursementDec || 0,

                // Map Actuals
                actualObligationAmount: item.actualObligationAmount,
                actualObligationDate: item.actualObligationDate,
                actualDisbursementAmount: item.actualDisbursementAmount,
                actualDisbursementDate: item.actualDisbursementDate,

                actualDisbursementJan: item.actualDisbursementJan || 0, actualDisbursementFeb: item.actualDisbursementFeb || 0, actualDisbursementMar: item.actualDisbursementMar || 0,
                actualDisbursementApr: item.actualDisbursementApr || 0, actualDisbursementMay: item.actualDisbursementMay || 0, actualDisbursementJun: item.actualDisbursementJun || 0,
                actualDisbursementJul: item.actualDisbursementJul || 0, actualDisbursementAug: item.actualDisbursementAug || 0, actualDisbursementSep: item.actualDisbursementSep || 0,
                actualDisbursementOct: item.actualDisbursementOct || 0, actualDisbursementNov: item.actualDisbursementNov || 0, actualDisbursementDec: item.actualDisbursementDec || 0,
            };
            return [legacy];
        }
        return [];
    }, [item]);

    // Expense Management State
    const [expensesList, setExpensesList] = useState<StaffingExpense[]>([]);
    const [expandedExpenseIds, setExpandedExpenseIds] = useState<Set<number>>(new Set());
    
    // Temp State for adding/editing expense in detail view
    const initialExpenseState = {
        id: 0,
        objectType: 'MOOE' as ObjectType,
        expenseParticular: '',
        uacsCode: '',
        obligationDate: '',
        amount: 0,
        disbursementJan: 0, disbursementFeb: 0, disbursementMar: 0, disbursementApr: 0, disbursementMay: 0, disbursementJun: 0,
        disbursementJul: 0, disbursementAug: 0, disbursementSep: 0, disbursementOct: 0, disbursementNov: 0, disbursementDec: 0
    };
    const [currentExpense, setCurrentExpense] = useState(initialExpenseState);
    const [selectedParticular, setSelectedParticular] = useState('');
    const [isExpenseScheduleOpen, setIsExpenseScheduleOpen] = useState(false);
    const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);

    // Reset form data and hydrate expenses list (including legacy fix) when item changes
    useEffect(() => {
        setFormData(item);
        setExpensesList(displayExpenses);
    }, [item, displayExpenses, editMode]);

    // Helper to calculate total actual disbursement for an item
    const calculateActualDisbursementTotal = (expense: StaffingExpense) => {
        return months.reduce((sum, m) => sum + (Number((expense as any)[`actualDisbursement${m}`]) || 0), 0);
    };

    // Recalculate Totals only for accomplishment here, detailed target aggregation happens on submit
    useEffect(() => {
        if (editMode === 'accomplishment') {
            // Aggregate from expensesList for accomplishment
            const totalActualObligation = expensesList.reduce((acc, exp) => acc + (exp.actualObligationAmount || 0), 0);
            
            // Calculate actual disbursement from monthly fields
            const totalActualDisbursement = expensesList.reduce((acc, exp) => {
                return acc + calculateActualDisbursementTotal(exp);
            }, 0);
            
            // Only update if different to avoid loop
            if (totalActualObligation !== formData.actualObligationAmount || totalActualDisbursement !== formData.actualDisbursementAmount) {
                setFormData(prev => ({ 
                    ...prev, 
                    actualObligationAmount: totalActualObligation,
                    actualDisbursementAmount: totalActualDisbursement
                }));
            }
        }
    }, [expensesList, editMode]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // Expense Handlers
    const handleExpenseChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setCurrentExpense(prev => ({ ...prev, [name]: value }));
    };

    const handleAddExpense = () => {
        if (!currentExpense.uacsCode || !currentExpense.amount) {
            alert("UACS Code and Amount are required.");
            return;
        }
        
        const newExpenseData: StaffingExpense = {
            id: editingExpenseId || Date.now(),
            ...currentExpense,
            amount: Number(currentExpense.amount),
            // @ts-ignore
            disbursementJan: Number(currentExpense.disbursementJan), disbursementFeb: Number(currentExpense.disbursementFeb), disbursementMar: Number(currentExpense.disbursementMar),
            disbursementApr: Number(currentExpense.disbursementApr), disbursementMay: Number(currentExpense.disbursementMay), disbursementJun: Number(currentExpense.disbursementJun),
            disbursementJul: Number(currentExpense.disbursementJul), disbursementAug: Number(currentExpense.disbursementAug), disbursementSep: Number(currentExpense.disbursementSep),
            disbursementOct: Number(currentExpense.disbursementOct), disbursementNov: Number(currentExpense.disbursementNov), disbursementDec: Number(currentExpense.disbursementDec)
        };

        if (editingExpenseId) {
            setExpensesList(prev => prev.map(e => e.id === editingExpenseId ? { ...e, ...newExpenseData } : e));
            setEditingExpenseId(null);
        } else {
            setExpensesList(prev => [...prev, newExpenseData]);
        }
        
        setCurrentExpense(initialExpenseState);
        setSelectedParticular('');
        setIsExpenseScheduleOpen(false);
    };

    const handleEditExpense = (expense: StaffingExpense) => {
        setEditingExpenseId(expense.id);
        setCurrentExpense({
            ...initialExpenseState,
            ...expense,
            // Ensure month fields are copied
            disbursementJan: expense.disbursementJan || 0, disbursementFeb: expense.disbursementFeb || 0, disbursementMar: expense.disbursementMar || 0,
            disbursementApr: expense.disbursementApr || 0, disbursementMay: expense.disbursementMay || 0, disbursementJun: expense.disbursementJun || 0,
            disbursementJul: expense.disbursementJul || 0, disbursementAug: expense.disbursementAug || 0, disbursementSep: expense.disbursementSep || 0,
            disbursementOct: expense.disbursementOct || 0, disbursementNov: expense.disbursementNov || 0, disbursementDec: expense.disbursementDec || 0
        });
        setSelectedParticular(expense.expenseParticular);
        setIsExpenseScheduleOpen(true);
    };

    const handleRemoveExpense = (id: number) => {
        setExpensesList(prev => prev.filter(e => e.id !== id));
        if (editingExpenseId === id) {
            setEditingExpenseId(null);
            setCurrentExpense(initialExpenseState);
        }
    };

    const handleCancelExpenseEdit = () => {
        setEditingExpenseId(null);
        setCurrentExpense(initialExpenseState);
        setSelectedParticular('');
        setIsExpenseScheduleOpen(false);
    };

    // Accomplishment Per Expense Handler
    const handleExpenseAccomplishmentChange = (id: number, field: keyof StaffingExpense, value: any) => {
        setExpensesList(prev => prev.map(e => {
            if (e.id === id) {
                const updated = { ...e, [field]: value };
                // Also update the aggregated actualDisbursementAmount if a month field changed
                if (String(field).startsWith('actualDisbursement')) {
                    updated.actualDisbursementAmount = calculateActualDisbursementTotal(updated);
                }
                return updated;
            }
            return e;
        }));
    };

    const toggleExpenseExpand = (id: number) => {
        setExpandedExpenseIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    // Locking Logic
    const isLocked = (value: any) => {
        // If user is admin, never locked
        if (isAdmin) return false;
        // If user is 'User' role, check if value exists
        if (value !== undefined && value !== null && value !== '' && value !== 0) {
            return true;
        }
        return false;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Aggregate totals from expensesList
        const aggregatedTotals = {
            annualSalary: 0,
            disbursementJan: 0, disbursementFeb: 0, disbursementMar: 0, disbursementApr: 0, disbursementMay: 0, disbursementJun: 0,
            disbursementJul: 0, disbursementAug: 0, disbursementSep: 0, disbursementOct: 0, disbursementNov: 0, disbursementDec: 0,
            // Calculate Actuals Total from breakdown
            actualObligationAmount: 0,
            actualDisbursementAmount: 0,
            // Actual Monthly Aggregates for root level
            actualDisbursementJan: 0, actualDisbursementFeb: 0, actualDisbursementMar: 0, actualDisbursementApr: 0, actualDisbursementMay: 0, actualDisbursementJun: 0,
            actualDisbursementJul: 0, actualDisbursementAug: 0, actualDisbursementSep: 0, actualDisbursementOct: 0, actualDisbursementNov: 0, actualDisbursementDec: 0
        };
        
        let primaryUacs = formData.uacsCode; 
        let primaryObligationDate = formData.obligationDate;

        if (expensesList.length > 0) {
            primaryUacs = expensesList[0].uacsCode;
            primaryObligationDate = expensesList[0].obligationDate;
            
            // Reset totals to sum up from list
            aggregatedTotals.annualSalary = 0; 
            months.forEach(m => { 
                // @ts-ignore
                aggregatedTotals[`disbursement${m}`] = 0; 
                // @ts-ignore
                aggregatedTotals[`actualDisbursement${m}`] = 0; 
            });

            expensesList.forEach(exp => {
                aggregatedTotals.annualSalary += exp.amount;
                aggregatedTotals.actualObligationAmount += (exp.actualObligationAmount || 0);
                
                // Recalculate total actual disbursement per item
                const itemActualDisbursement = calculateActualDisbursementTotal(exp);
                aggregatedTotals.actualDisbursementAmount += itemActualDisbursement;
                exp.actualDisbursementAmount = itemActualDisbursement;

                months.forEach(m => {
                    // @ts-ignore
                    aggregatedTotals[`disbursement${m}`] += (exp[`disbursement${m}`] || 0);
                    // @ts-ignore
                    aggregatedTotals[`actualDisbursement${m}`] += (exp[`actualDisbursement${m}`] || 0);
                });
            });
        }

        const updatedItem: any = {
            ...formData,
            ...aggregatedTotals,
            uacsCode: primaryUacs,
            obligationDate: primaryObligationDate,
            salaryGrade: Number(formData.salaryGrade),
            fundYear: Number(formData.fundYear),
            expenses: expensesList,
            actualAmount: 0, // Removed usage as per request, ensuring 0
            updated_at: new Date().toISOString()
        };

        if (supabase) {
            const { id, ...payload } = updatedItem;
            const { error } = await supabase.from('staffing_requirements').update(payload).eq('id', item.id);
            if (error) {
                alert('Failed to update: ' + error.message);
                return;
            }
        }
        
        onUpdate(updatedItem as StaffingRequirement);
        setEditMode('none');
    };

    if (editMode === 'details') {
        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Editing Details: {item.personnelPosition}</h1>
                    <button onClick={() => setEditMode('none')} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel Editing</button>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
                    <form onSubmit={handleSubmit} className="space-y-8">
                        {/* Group 1: Profile */}
                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Position Profile</legend>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Position Title</label><input type="text" name="personnelPosition" value={formData.personnelPosition} onChange={handleInputChange} required className={commonInputClasses} /></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label><select name="status" value={formData.status} onChange={handleInputChange} className={commonInputClasses}><option value="Permanent">Permanent</option><option value="Contractual">Contractual</option><option value="COS">COS</option><option value="Job Order">Job Order</option></select></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Salary Grade</label><input type="number" name="salaryGrade" value={formData.salaryGrade} onChange={handleInputChange} min="1" max="33" className={commonInputClasses} /></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Personnel Type</label><select name="personnelType" value={formData.personnelType} onChange={handleInputChange} className={commonInputClasses}><option value="Technical">Technical</option><option value="Administrative">Administrative</option><option value="Support">Support</option></select></div>
                                <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Operating Unit</label><select name="operatingUnit" value={formData.operatingUnit} onChange={handleInputChange} className={commonInputClasses} disabled={!canViewAll}><option value="">Select OU</option>{operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}</select></div>
                            </div>
                        </fieldset>

                        {/* Group 2: Funding */}
                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Funding Source</legend>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fund Year</label><input type="number" name="fundYear" value={formData.fundYear} onChange={handleInputChange} className={commonInputClasses} /></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fund Type</label><select name="fundType" value={formData.fundType} onChange={handleInputChange} className={commonInputClasses}>{fundTypes.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tier</label><select name="tier" value={formData.tier} onChange={handleInputChange} className={commonInputClasses}>{tiers.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                            </div>
                        </fieldset>

                        {/* Group 3: Financial Requirements */}
                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md bg-gray-50 dark:bg-gray-700/30">
                            <legend className="px-2 font-semibold text-emerald-700 dark:text-emerald-400">Financial Requirements</legend>
                            
                            <div className="space-y-3 mb-6">
                                {expensesList.map((expense, idx) => (
                                    <div key={idx} className="bg-white dark:bg-gray-800 p-3 rounded-md border border-gray-200 dark:border-gray-600 flex justify-between items-start">
                                        <div>
                                            <p className="font-semibold text-gray-800 dark:text-white text-sm">{expense.expenseParticular || 'Unspecified Particular'}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">{expense.uacsCode} | Obligated: {expense.obligationDate}</p>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <p className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(expense.amount)}</p>
                                            <div className="flex gap-2">
                                                <button type="button" onClick={() => handleEditExpense(expense)} className="text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
                                                </button>
                                                <button type="button" onClick={() => handleRemoveExpense(expense.id)} className="text-red-500 hover:text-red-700">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {expensesList.length === 0 && <p className="text-sm text-gray-500 italic text-center py-4">No financial items added.</p>}
                                <div className="flex justify-end pt-2 border-t border-gray-300 dark:border-gray-600">
                                    <span className="font-bold text-gray-700 dark:text-gray-300 mr-2">Total Annual Requirement:</span>
                                    <span className="font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(expensesList.reduce((acc, curr) => acc + curr.amount, 0))}</span>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-gray-800 p-4 rounded-md border border-emerald-200 dark:border-emerald-800">
                                <h4 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 border-b border-gray-100 dark:border-gray-700 pb-2">
                                    {editingExpenseId ? 'Edit Financial Item' : 'Add Financial Item'}
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                                    <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Object Type</label><select name="objectType" value={currentExpense.objectType} onChange={handleExpenseChange} className={commonInputClasses}>{objectTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                    <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Particular</label><select value={selectedParticular} onChange={e => { setSelectedParticular(e.target.value); setCurrentExpense(prev => ({...prev, uacsCode: ''})); }} className={commonInputClasses}><option value="">Select</option>{uacsCodes[currentExpense.objectType] && Object.keys(uacsCodes[currentExpense.objectType]).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                                    <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400">UACS Code</label><select name="uacsCode" value={currentExpense.uacsCode} onChange={(e) => {
                                        const code = e.target.value;
                                        const part = selectedParticular;
                                        setCurrentExpense(prev => ({ ...prev, uacsCode: code, expenseParticular: part }));
                                    }} className={commonInputClasses} disabled={!selectedParticular}><option value="">Select Code</option>{selectedParticular && uacsCodes[currentExpense.objectType][selectedParticular] && Object.entries(uacsCodes[currentExpense.objectType][selectedParticular]).map(([code, desc]) => (<option key={code} value={code}>{code} - {desc}</option>))}</select></div>
                                    
                                    <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Obligation Date</label><input type="date" name="obligationDate" value={currentExpense.obligationDate} onChange={handleExpenseChange} className={commonInputClasses} /></div>
                                    <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400">Amount</label><input type="number" name="amount" value={currentExpense.amount} onChange={handleExpenseChange} className={commonInputClasses} min="0" /></div>
                                </div>
                                
                                <div className="mb-3">
                                    <button type="button" onClick={() => setIsExpenseScheduleOpen(!isExpenseScheduleOpen)} className="text-xs text-emerald-600 hover:underline flex items-center gap-1">
                                        {isExpenseScheduleOpen ? 'Hide' : 'Show'} Disbursement Schedule (Target)
                                    </button>
                                    {isExpenseScheduleOpen && (
                                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mt-2 p-2 bg-gray-50 dark:bg-gray-900/50 rounded border border-gray-200 dark:border-gray-700">
                                            {months.map(month => (
                                                <div key={`exp-${month}`}>
                                                    <label className="block text-[10px] font-medium text-gray-500 uppercase">{month}</label>
                                                    <input type="number" name={`disbursement${month}`} 
                                                    // @ts-ignore
                                                    value={currentExpense[`disbursement${month}`]} onChange={handleExpenseChange} className="w-full px-1 py-1 text-xs border rounded dark:bg-gray-700 dark:border-gray-600" />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-2">
                                    <button type="button" onClick={handleAddExpense} className="flex-1 py-2 bg-emerald-600 text-white rounded-md text-sm hover:bg-emerald-700 transition-colors">
                                        {editingExpenseId ? 'Update Item' : 'Add Item to List'}
                                    </button>
                                    {editingExpenseId && (
                                        <button type="button" onClick={handleCancelExpenseEdit} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300 transition-colors">
                                            Cancel
                                        </button>
                                    )}
                                </div>
                            </div>
                        </fieldset>

                        <div className="flex justify-end gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <button type="button" onClick={() => setEditMode('none')} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600">Cancel</button>
                            <button type="submit" className="px-4 py-2 rounded-md text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 hover:brightness-95">Save Changes</button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    if (editMode === 'accomplishment') {
        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Editing Accomplishment: {item.personnelPosition}</h1>
                    <button onClick={() => setEditMode('none')} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Cancel Editing</button>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Accomplishment Data</legend>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Obligation Date</label><input type="date" name="actualObligationDate" value={formData.actualObligationDate} onChange={handleInputChange} className={commonInputClasses} /></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Actual Obligation Amount</label><input type="number" name="actualObligationAmount" value={formData.actualObligationAmount} onChange={handleInputChange} className={commonInputClasses} /></div>
                            </div>
                        </fieldset>

                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Actual Monthly Disbursement</legend>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                {months.map(month => (
                                    <div key={`actual-${month}`}><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{month}</label><input type="number" name={`actualDisbursement${month}`} 
                                    // @ts-ignore
                                    value={(formData as any)[`actualDisbursement${month}`]} onChange={handleInputChange} min="0" step="0.01" className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-accent focus:border-accent dark:bg-gray-700 dark:text-white" /></div>
                                ))}
                            </div>
                            <div className="mt-4 pt-2 border-t border-gray-200 dark:border-gray-700 flex justify-end items-center gap-2">
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Actual Disbursement:</span>
                                <span className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(formData.actualDisbursementAmount || 0)}</span>
                            </div>
                        </fieldset>

                        <div className="flex justify-end gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <button type="button" onClick={() => setEditMode('none')} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600">Cancel</button>
                            <button type="submit" className="px-4 py-2 rounded-md text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700">Save Accomplishment</button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    // --- Read Only View ---

    return (
        <div className="space-y-8 animate-fadeIn">
            {/* Header */}
            <header className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">{item.personnelPosition}</h1>
                    <p className="text-md text-gray-500 dark:text-gray-400">{item.operatingUnit} | {item.uid}</p>
                </div>
                <div className="flex items-center gap-4">
                    {canEdit && (
                        <button onClick={() => setEditMode('details')} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
                            Edit Details
                        </button>
                    )}
                    {canEdit && (
                        <button onClick={() => setEditMode('accomplishment')} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Edit Accomplishment
                        </button>
                    )}
                    <button onClick={onBack} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        Back
                    </button>
                </div>
            </header>

            {/* Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Details Section */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                    <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Requirement Details</h3>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <DetailItem label="Position" value={item.personnelPosition} />
                        <DetailItem label="Status" value={item.status} />
                        <DetailItem label="Salary Grade" value={`SG-${item.salaryGrade}`} />
                        <DetailItem label="Type" value={item.personnelType} />
                        <DetailItem label="Fund Source" value={`${item.fundType} ${item.fundYear} - ${item.tier}`} />
                        <DetailItem label="Total Annual Requirement" value={formatCurrency(item.annualSalary)} />
                        <DetailItem label="Encoded By" value={item.encodedBy} />
                    </div>
                    
                    {/* Breakdown of Expenses with Toggleable Schedule */}
                    {displayExpenses.length > 0 && (
                        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <h4 className="font-medium text-gray-600 dark:text-gray-300 mb-3">Cost Breakdown</h4>
                            <ul className="space-y-3 text-sm">
                                {displayExpenses.map((exp, i) => (
                                    <li key={i} className="flex flex-col bg-gray-50 dark:bg-gray-700/50 rounded overflow-hidden border border-gray-200 dark:border-gray-600">
                                        <div className="flex justify-between items-center p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => toggleExpenseExpand(exp.id)}>
                                            <div>
                                                <span className="font-semibold text-gray-800 dark:text-gray-200 block">{exp.expenseParticular}</span>
                                                <span className="text-xs text-gray-500 dark:text-gray-400">{exp.uacsCode}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(exp.amount)}</span>
                                                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-gray-400 transition-transform ${expandedExpenseIds.has(exp.id) ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </div>
                                        </div>
                                        {expandedExpenseIds.has(exp.id) && (
                                            <div className="p-3 border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
                                                <div className="flex justify-between mb-2">
                                                    <div>
                                                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase block">Target Obligation Date</span>
                                                        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{formatDate(exp.obligationDate)}</span>
                                                    </div>
                                                </div>
                                                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">Target Monthly Disbursement</p>
                                                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                                                    {months.map(m => (
                                                        <div key={m} className="flex flex-col">
                                                            <span className="text-[10px] text-gray-400">{m}</span>
                                                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{formatCurrency((exp as any)[`disbursement${m}`] || 0)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                {/* Accomplishment Section */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                    <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Accomplishment Report</h3>
                    <div className="space-y-6">
                        
                        <div>
                            <h4 className="font-medium text-gray-600 dark:text-gray-300 mb-2 border-b border-gray-200 dark:border-gray-600 pb-1">Financial Performance Summary</h4>
                            <div className="grid grid-cols-2 gap-4 mt-3">
                                <div className="space-y-3">
                                    <p className="text-xs font-bold uppercase text-gray-400">Total Obligation</p>
                                    <DetailItem label="Amount" value={formatCurrency(item.actualObligationAmount || 0)} />
                                </div>
                                <div className="space-y-3">
                                    <p className="text-xs font-bold uppercase text-gray-400">Total Disbursement</p>
                                    <DetailItem label="Amount" value={formatCurrency(item.actualDisbursementAmount || 0)} />
                                </div>
                            </div>
                        </div>

                        {displayExpenses.length > 0 && (
                            <div className="mt-4">
                                <h4 className="font-medium text-gray-600 dark:text-gray-300 mb-2 border-b border-gray-200 dark:border-gray-600 pb-1">Per Item Actuals</h4>
                                <div className="space-y-4">
                                    {displayExpenses.map((exp, idx) => (
                                        <div key={idx} className="bg-gray-50 dark:bg-gray-700/30 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="font-bold text-sm text-gray-800 dark:text-white">{exp.expenseParticular}</span>
                                                <div className="text-right text-xs">
                                                    <div className="text-gray-500">Act. Obli: <span className="font-semibold text-gray-800 dark:text-gray-200">{formatCurrency(exp.actualObligationAmount || 0)}</span></div>
                                                    <div className="text-emerald-600">Act. Disb: <span className="font-bold">{formatCurrency(calculateActualDisbursementTotal(exp))}</span></div>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                                                {months.map(m => {
                                                    const val = (exp as any)[`actualDisbursement${m}`] || 0;
                                                    if (val === 0) return null;
                                                    return (
                                                        <div key={m} className="flex flex-col bg-white dark:bg-gray-800 p-1 rounded border border-gray-200 dark:border-gray-600">
                                                            <span className="text-[10px] text-gray-400 text-center">{m}</span>
                                                            <span className="text-[10px] font-bold text-center text-emerald-600 dark:text-emerald-400">{formatCurrency(val)}</span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                            {calculateActualDisbursementTotal(exp) === 0 && <p className="text-xs text-gray-400 italic text-center">No disbursement recorded</p>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default StaffingRequirementDetail;