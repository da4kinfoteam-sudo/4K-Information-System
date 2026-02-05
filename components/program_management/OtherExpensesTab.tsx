// Author: 4K 
import React, { useState, useEffect, useMemo } from 'react';
import { OtherProgramExpense, operatingUnits, fundTypes, tiers, objectTypes, FundType, Tier, ObjectType } from '../../constants';
import { formatCurrency } from '../reports/ReportUtils';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection, getUserPermissions, usePagination } from '../mainfunctions/TableHooks';
import { supabase } from '../../supabaseClient';
import { resolveOperatingUnit, resolveTier } from '../mainfunctions/ImportExportService';
import useLocalStorageState from '../../hooks/useLocalStorageState'; // Import for persistent state

declare const XLSX: any;

const TrashIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const commonInputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm";

export const parseOtherExpenseRow = (row: any, commonData: any): OtherProgramExpense => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Calculate totals from monthly columns if present for defaults, but prioritize row.amount
    let calculatedAmount = 0;
    months.forEach(m => { calculatedAmount += (Number(row[`disbursement${m}`]) || 0); });
    
    let calculatedActual = 0;
    months.forEach(m => { calculatedActual += (Number(row[`actualDisbursement${m}`]) || 0); });

    // Use row.amount if present (Target Obligation), otherwise fallback to calculated
    const finalAmount = Number(row.amount) || calculatedAmount || 0;
    const finalActualDisbursement = calculatedActual > 0 ? calculatedActual : (Number(row.actualDisbursementAmount) || 0);

    const result: any = {
        ...commonData,
        particulars: row.particulars || '',
        amount: finalAmount,
        obligatedAmount: Number(row.obligatedAmount) || finalAmount, // Default to amount if missing
        actualDisbursementAmount: finalActualDisbursement
    };

    months.forEach(m => {
        result[`disbursement${m}`] = Number(row[`disbursement${m}`]) || 0;
        result[`actualDisbursement${m}`] = Number(row[`actualDisbursement${m}`]) || 0;
    });

    return result as OtherProgramExpense;
};

interface OtherExpensesTabProps {
    items: OtherProgramExpense[];
    setItems: React.Dispatch<React.SetStateAction<OtherProgramExpense[]>>;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    onSelect: (item: OtherProgramExpense) => void;
}

export const OtherExpensesTab: React.FC<OtherExpensesTabProps> = ({ items, setItems, uacsCodes, onSelect }) => {
    const { currentUser } = useAuth();
    const { canEdit, canViewAll } = getUserPermissions(currentUser);
    
    // Local State
    const [view, setView] = useState<'list' | 'form'>('list');
    const [editingItem, setEditingItem] = useState<OtherProgramExpense | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<OtherProgramExpense | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    // Filters - Persistent
    const [ouFilter, setOuFilter] = useLocalStorageState('otherExpenses_ouFilter', 'All');
    const [yearFilter, setYearFilter] = useLocalStorageState('otherExpenses_yearFilter', 'All');

    const { 
        isSelectionMode, selectedIds, setSelectedIds, 
        isMultiDeleteModalOpen, setIsMultiDeleteModalOpen, toggleSelectionMode, 
        handleSelectAll, handleSelectRow, resetSelection 
    } = useSelection<OtherProgramExpense>();

    // Form State
    const initialFormState = {
        id: 0, uid: '', operatingUnit: '', uacsCode: '', obligationDate: '', disbursementDate: '', fundType: 'Current' as FundType, fundYear: new Date().getFullYear(), tier: 'Tier 1' as Tier, encodedBy: '',
        particulars: '', amount: 0, obligatedAmount: 0,
        actualDate: '', actualAmount: 0, actualObligationDate: '', actualDisbursementDate: '', actualObligationAmount: 0, actualDisbursementAmount: 0,
        // Target Schedule
        disbursementJan: 0, disbursementFeb: 0, disbursementMar: 0, disbursementApr: 0, disbursementMay: 0, disbursementJun: 0,
        disbursementJul: 0, disbursementAug: 0, disbursementSep: 0, disbursementOct: 0, disbursementNov: 0, disbursementDec: 0,
        // Actual Schedule (Init to 0)
        actualDisbursementJan: 0, actualDisbursementFeb: 0, actualDisbursementMar: 0, actualDisbursementApr: 0, actualDisbursementMay: 0, actualDisbursementJun: 0,
        actualDisbursementJul: 0, actualDisbursementAug: 0, actualDisbursementSep: 0, actualDisbursementOct: 0, actualDisbursementNov: 0, actualDisbursementDec: 0
    };
    const [formData, setFormData] = useState(initialFormState);
    const [selectedObjectType, setSelectedObjectType] = useState<ObjectType>('MOOE');
    const [selectedParticular, setSelectedParticular] = useState('');

    useEffect(() => {
        if (currentUser && !canViewAll) setOuFilter(currentUser.operatingUnit);
    }, [currentUser, canViewAll]);

    useEffect(() => {
        if (view === 'form') {
            if (editingItem) {
                // Should technically not be reachable via Add New but keeping logic robust
                setFormData({ ...initialFormState, ...editingItem });
                let foundType: ObjectType = 'MOOE'; let foundParticular = '';
                outerLoop: for (const type of objectTypes) { if(uacsCodes[type]) { for (const part in uacsCodes[type]) { if (uacsCodes[type][part].hasOwnProperty(editingItem.uacsCode)) { foundType = type; foundParticular = part; break outerLoop; } } } }
                setSelectedObjectType(foundType); setSelectedParticular(foundParticular);
            } else {
                setFormData({ ...initialFormState, operatingUnit: currentUser?.operatingUnit || (canViewAll ? 'NPMO' : currentUser?.operatingUnit || ''), encodedBy: currentUser?.fullName || '' });
                setSelectedObjectType('MOOE'); setSelectedParticular('');
            }
        }
    }, [view, editingItem, uacsCodes, currentUser, canViewAll]);

    // Auto-calc totals from target schedules only
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const targetDisbursementTotal = months.reduce((sum, m) => sum + (Number((formData as any)[`disbursement${m}`]) || 0), 0);

    const availableYears = useMemo(() => {
        const years = new Set<string>(); 
        items.forEach(i => {
            if(i.fundYear) years.add(i.fundYear.toString());
        }); 
        return Array.from(years).sort().reverse();
    }, [items]);

    const filteredItems = useMemo(() => {
        let filtered = items;
        if (!canViewAll && currentUser) filtered = filtered.filter(item => item.operatingUnit === currentUser.operatingUnit);
        else if (canViewAll && ouFilter !== 'All') filtered = filtered.filter(item => item.operatingUnit === ouFilter);
        if (yearFilter !== 'All') filtered = filtered.filter(item => item.fundYear?.toString() === yearFilter);
        return filtered.sort((a,b) => b.id - a.id);
    }, [items, ouFilter, yearFilter, canViewAll, currentUser]);

    const { currentPage, setCurrentPage, itemsPerPage, setItemsPerPage, totalPages, paginatedData } = usePagination(filteredItems, [ouFilter, yearFilter]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => {
            const newData = { ...prev, [name]: value };
            // Sync Obligated Amount with Target Allocation (amount)
            if (name === 'amount') {
                newData.obligatedAmount = Number(value);
            }
            return newData;
        });
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.operatingUnit) return alert("Operating Unit is required.");
        if (!formData.uacsCode) return alert("UACS Code is required.");

        const submissionData: any = {
            ...formData,
            amount: Number(formData.amount), obligatedAmount: Number(formData.obligatedAmount), fundYear: Number(formData.fundYear),
            // Default 0 for new accomplishments
            actualAmount: 0, actualObligationAmount: 0, actualDisbursementAmount: 0,
            encodedBy: formData.encodedBy || currentUser?.fullName || 'System', updated_at: new Date().toISOString()
        };

        // Ensure monthly fields are numbers (Target)
        months.forEach(m => {
            // @ts-ignore
            submissionData[`disbursement${m}`] = Number(formData[`disbursement${m}`]);
            // @ts-ignore
            submissionData[`actualDisbursement${m}`] = 0; // Initialize actuals to 0
        });

        // Always remove ID from payload
        delete submissionData.id;

        submissionData.uid = formData.uid || `OE-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
        submissionData.created_at = new Date().toISOString();

        if (supabase) {
            const { data, error } = await supabase.from('other_program_expenses').insert([submissionData]).select().single();
            if (error) { 
                console.error("Create error:", error); 
                alert(`Failed to create: ${error.message}`); 
                return; 
            }
            if (data) setItems(prev => [data, ...prev]);
        } else {
            const newItem = { ...submissionData, id: Date.now() } as OtherProgramExpense;
            setItems(prev => [newItem, ...prev]);
        }
        setView('list'); setEditingItem(null);
    };

    const handleDelete = async () => {
        if (!itemToDelete) return;
        if (supabase) {
            const { error } = await supabase.from('other_program_expenses').delete().eq('id', itemToDelete.id);
            if (error) { console.error(error); alert("Failed to delete."); return; }
        }
        setItems(prev => prev.filter(i => i.id !== itemToDelete.id));
        setIsDeleteModalOpen(false); setItemToDelete(null);
    };

    const handleMultiDelete = async () => {
        if (supabase) {
            const { error } = await supabase.from('other_program_expenses').delete().in('id', selectedIds);
            if (error) { console.error(error); alert("Failed to delete selected."); return; }
        }
        setItems(prev => prev.filter(i => !selectedIds.includes(i.id)));
        setIsMultiDeleteModalOpen(false); setSelectedIds([]);
    };

    const handleDownloadReport = () => {
        const data = filteredItems.map(item => ({
            UID: item.uid, OU: item.operatingUnit, Particulars: item.particulars, Amount: item.amount, 'Obligated Amount': item.obligatedAmount, 'Fund Type': item.fundType, 'Fund Year': item.fundYear, Tier: item.tier, 'Obligation Date': item.obligationDate, 'Disbursement Date': item.disbursementDate
        }));
        const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Other Expenses"); XLSX.writeFile(wb, "Other_Expenses_Report.xlsx");
    };

    const handleDownloadTemplate = () => {
        const monthHeaders = ['disbursementJan', 'disbursementFeb', 'disbursementMar', 'disbursementApr', 'disbursementMay', 'disbursementJun', 'disbursementJul', 'disbursementAug', 'disbursementSep', 'disbursementOct', 'disbursementNov', 'disbursementDec'];
        const headers = ['operatingUnit', 'fundYear', 'fundType', 'tier', 'obligationDate', 'amount', 'obligatedAmount', 'uacsCode', 'particulars', ...monthHeaders];
        const exampleData = [{ operatingUnit: 'NPMO', fundYear: 2024, fundType: 'Current', tier: 'Tier 1', obligationDate: '2024-01-15', amount: 20000, obligatedAmount: 10000, uacsCode: '50299990-99', particulars: 'Miscellaneous Expenses', disbursementJan: 10000, disbursementFeb: 5000 }];
        const ws = XLSX.utils.json_to_sheet(exampleData, { header: headers }); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Template"); XLSX.writeFile(wb, "Other_Exp_Template.xlsx");
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file) return; setIsUploading(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = event.target?.result; const workbook = XLSX.read(data, { type: 'array' });
                const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as any[];
                const currentTimestamp = new Date().toISOString();
                const newItems = jsonData.map((row: any, index: number) => {
                    const fundYear = Number(row.fundYear) || new Date().getFullYear();
                    const uid = `OE-${fundYear}-${Date.now().toString().slice(-4)}${index}`;
                    const resolvedOU = row.operatingUnit ? resolveOperatingUnit(row.operatingUnit) : 'NPMO';

                    return parseOtherExpenseRow(row, {
                        uid, 
                        operatingUnit: resolvedOU, 
                        fundYear: fundYear, 
                        fundType: row.fundType || 'Current', 
                        tier: resolveTier(row.tier) || 'Tier 1', 
                        obligationDate: row.obligationDate || '', 
                        uacsCode: row.uacsCode || '', 
                        encodedBy: currentUser?.fullName || 'Upload', 
                        created_at: currentTimestamp, 
                        updated_at: currentTimestamp
                    });
                });
                if (supabase) {
                    const { error } = await supabase.from('other_program_expenses').insert(newItems); if (error) throw error;
                    const { data } = await supabase.from('other_program_expenses').select('*').order('id', { ascending: true }); if (data) setItems(data as OtherProgramExpense[]);
                } else { setItems(prev => [...newItems.map((i, idx) => ({ ...i, id: Date.now() + idx })), ...prev]); }
                alert(`${newItems.length} items imported.`);
            } catch (err: any) { alert(`Import failed: ${err.message}`); } finally { setIsUploading(false); if(e.target) e.target.value = ''; }
        };
        reader.readAsArrayBuffer(file);
    };

    if (view === 'form') {
        const monthFields = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white">Add Other Expense</h3>
                    <button onClick={() => { setView('list'); setEditingItem(null); }} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md text-sm">Cancel</button>
                </div>
                <form onSubmit={handleFormSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border border-gray-200 dark:border-gray-700 rounded-md">
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Operating Unit</label><select name="operatingUnit" value={formData.operatingUnit} onChange={handleInputChange} disabled={!canViewAll && !!currentUser} className={`${commonInputClasses} disabled:bg-gray-100 disabled:cursor-not-allowed`}><option value="">Select OU</option>{operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}</select></div>
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fund Year</label><input type="number" name="fundYear" value={formData.fundYear} onChange={handleInputChange} className={commonInputClasses} /></div>
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Fund Type</label><select name="fundType" value={formData.fundType} onChange={handleInputChange} className={commonInputClasses}>{fundTypes.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tier</label><select name="tier" value={formData.tier} onChange={handleInputChange} className={commonInputClasses}>{tiers.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Obligation Date</label><input type="date" name="obligationDate" value={formData.obligationDate} onChange={handleInputChange} className={commonInputClasses} /></div>
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Target Allocation</label><input type="number" name="amount" value={formData.amount} onChange={handleInputChange} min="0" step="0.01" className={commonInputClasses} /></div>
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Obligated Amount</label><input type="number" name="obligatedAmount" value={formData.obligatedAmount} onChange={handleInputChange} min="0" step="0.01" className={commonInputClasses} /></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border border-gray-200 dark:border-gray-700 rounded-md">
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Object Type</label><select value={selectedObjectType} onChange={e => { setSelectedObjectType(e.target.value as ObjectType); setSelectedParticular(''); setFormData(prev => ({...prev, uacsCode: ''})); }} className={commonInputClasses}>{objectTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Particular</label><select value={selectedParticular} onChange={e => { setSelectedParticular(e.target.value); setFormData(prev => ({...prev, uacsCode: ''})); }} className={commonInputClasses}><option value="">Select</option>{uacsCodes[selectedObjectType] && Object.keys(uacsCodes[selectedObjectType]).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                        <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">UACS Code</label><select name="uacsCode" value={formData.uacsCode} onChange={handleInputChange} className={commonInputClasses} disabled={!selectedParticular}><option value="">Select Code</option>{selectedParticular && uacsCodes[selectedObjectType][selectedParticular] && Object.entries(uacsCodes[selectedObjectType][selectedParticular]).map(([code, desc]) => (<option key={code} value={code}>{code} - {desc}</option>))}</select></div>
                    </div>
                    <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-md space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Particulars</label><textarea name="particulars" value={formData.particulars} onChange={handleInputChange} rows={3} required className={commonInputClasses} /></div>
                        </div>
                        <fieldset className="border border-gray-300 dark:border-gray-600 p-4 rounded-md">
                            <legend className="px-2 font-semibold text-gray-700 dark:text-gray-300">Disbursement Schedule (Target)</legend>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                {monthFields.map(month => (
                                    <div key={`target-${month}`}><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{month}</label><input type="number" name={`disbursement${month}`} 
                                    // @ts-ignore
                                    value={formData[`disbursement${month}`]} onChange={handleInputChange} min="0" step="0.01" className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-accent focus:border-accent dark:bg-gray-700 dark:text-white" /></div>
                                ))}
                            </div>
                            <div className="mt-4 pt-2 border-t border-gray-200 dark:border-gray-700 flex flex-col items-end gap-1">
                                <div className="flex justify-end items-center gap-2">
                                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Disbursement Target:</span>
                                    <span className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(targetDisbursementTotal)}</span>
                                </div>
                            </div>
                        </fieldset>
                    </div>
                    <div className="flex justify-end gap-4"><button type="button" onClick={() => { setView('list'); setEditingItem(null); }} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md text-sm">Cancel</button><button type="submit" className="px-4 py-2 bg-accent text-white rounded-md text-sm hover:brightness-95">Save Item</button></div>
                </form>
            </div>
        );
    }

    // List View
    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            {isDeleteModalOpen && (<div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"><div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl"><h3 className="text-lg font-bold">Confirm Deletion</h3><p className="my-4">Are you sure?</p><div className="flex justify-end gap-4"><button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 rounded-md text-sm bg-gray-200 dark:bg-gray-700">Cancel</button><button onClick={handleDelete} className="px-4 py-2 rounded-md text-sm bg-red-600 text-white">Delete</button></div></div></div>)}
            {isMultiDeleteModalOpen && (<div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"><div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl"><h3 className="text-lg font-bold">Confirm Bulk Deletion</h3><p className="my-4">Delete {selectedIds.length} items?</p><div className="flex justify-end gap-4"><button onClick={() => setIsMultiDeleteModalOpen(false)} className="px-4 py-2 rounded-md text-sm bg-gray-200 dark:bg-gray-700">Cancel</button><button onClick={handleMultiDelete} className="px-4 py-2 rounded-md text-sm bg-red-600 text-white">Delete All</button></div></div></div>)}

            <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                <div className="flex items-center gap-4">
                    {canViewAll && <select value={ouFilter} onChange={e => setOuFilter(e.target.value)} className={commonInputClasses}><option value="All">All OUs</option>{operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}</select>}
                    <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} className={commonInputClasses}><option value="All">All Years</option>{availableYears.map(y => <option key={y} value={y}>{y}</option>)}</select>
                </div>
                <div className="flex items-center gap-2">
                    {isSelectionMode && selectedIds.length > 0 && (
                        <button onClick={() => setIsMultiDeleteModalOpen(true)} className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700">Delete Selected ({selectedIds.length})</button>
                    )}
                    {canEdit && (
                        <button 
                            onClick={() => { setEditingItem(null); setView('form'); }} 
                            className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95"
                        >
                            + Add New
                        </button>
                    )}
                    <button onClick={handleDownloadReport} className="inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">Download Report</button>
                    {canEdit && (
                        <>
                            <button onClick={handleDownloadTemplate} className="inline-flex items-center justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">Template</button>
                            <label className={`inline-flex items-center justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-accent hover:brightness-95 ${isUploading ? 'bg-gray-400 cursor-not-allowed' : 'cursor-pointer'}`}>
                                {isUploading ? 'Uploading...' : 'Upload XLSX'}
                                <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleFileUpload} disabled={isUploading} />
                            </label>
                            <button onClick={toggleSelectionMode} className={`inline-flex items-center justify-center p-2 border border-gray-300 dark:border-gray-600 shadow-sm rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 ${isSelectionMode ? 'bg-gray-200 dark:bg-gray-600 text-red-600' : 'bg-white dark:bg-gray-700 text-gray-500'}`} title="Toggle Multi-Delete Mode">
                                <TrashIcon />
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">UID</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">OU</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">UACS Code</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Particulars</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Fund</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{isSelectionMode ? "Select" : "Actions"}</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {paginatedData.map((item) => (
                            <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500 dark:text-gray-400">{item.uid}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{item.operatingUnit}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-medium">
                                    <button onClick={() => onSelect(item)} className="text-left text-accent hover:underline focus:outline-none">
                                        {item.uacsCode}
                                    </button>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-900 dark:text-white"><div className="truncate w-64" title={item.particulars}>{item.particulars}</div></td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(item.amount)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400"><div>{item.fundType} {item.fundYear}</div><div>{item.tier}</div></td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    {canEdit && (isSelectionMode ? <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={(e) => { e.stopPropagation(); handleSelectRow(item.id); }} className="mr-3 h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"/> : <button onClick={() => { setItemToDelete(item); setIsDeleteModalOpen(true); }} className="text-red-600 hover:text-red-900">Delete</button>)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            <div className="py-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm"><span className="text-gray-700 dark:text-gray-300">Show</span><select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-1 pl-2 pr-8 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm">{[10, 20, 50, 100].map(size => ( <option key={size} value={size}>{size}</option> ))}</select><span className="text-gray-700 dark:text-gray-300">entries</span></div>
                <div className="flex items-center gap-4 text-sm"><span className="text-gray-700 dark:text-gray-300">Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredItems.length)} to {Math.min(currentPage * itemsPerPage, filteredItems.length)} of {filteredItems.length} entries</span><div className="flex items-center gap-2"><button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">Previous</button><span className="px-2 font-medium">{currentPage} / {totalPages}</span><button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">Next</button></div></div>
            </div>
        </div>
    );
};