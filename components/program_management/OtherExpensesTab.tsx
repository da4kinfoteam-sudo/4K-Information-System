
import React from 'react';
import { OtherProgramExpense } from '../../constants';
import { formatCurrency } from '../reports/ReportUtils';

export const constructOtherExpense = (id: number, uid: string, formData: any, commonFields: any, accomplishmentFields: any): OtherProgramExpense => {
    return {
        id,
        uid,
        ...commonFields,
        ...accomplishmentFields,
        particulars: formData.particulars,
        amount: Number(formData.amount)
    };
};

export const parseOtherExpenseRow = (row: any, commonData: any): OtherProgramExpense => {
    return {
        ...commonData,
        particulars: row.particulars || '',
        amount: Number(row.amount) || 0
    };
};

interface OtherExpensesTableProps {
    items: OtherProgramExpense[];
    canEdit: boolean;
    isSelectionMode: boolean;
    selectedIds: number[];
    onSelectRow: (id: number) => void;
    onEdit: (item: OtherProgramExpense) => void;
    onDelete: (item: OtherProgramExpense) => void;
}

export const OtherExpensesTable: React.FC<OtherExpensesTableProps> = ({
    items, canEdit, isSelectionMode, selectedIds, onSelectRow, onEdit, onDelete
}) => {
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">UID</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">OU</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Particulars</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Fund</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                            {isSelectionMode ? "Select" : "Actions"}
                        </th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {items.length === 0 ? (
                        <tr><td colSpan={6} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">No records found.</td></tr>
                    ) : (
                        items.map((item) => (
                            <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500 dark:text-gray-400">{item.uid}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{item.operatingUnit}</td>
                                <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                                    <div className="truncate w-64" title={item.particulars}>{item.particulars}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-gray-900 dark:text-white">{formatCurrency(item.amount)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                    <div>{item.fundType} {item.fundYear}</div>
                                    <div>{item.tier}</div>
                                    <div className="mt-1 text-xs font-mono">{item.uacsCode}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    {canEdit && (
                                        <>
                                            {isSelectionMode ? (
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedIds.includes(item.id)} 
                                                    onChange={(e) => { e.stopPropagation(); onSelectRow(item.id); }} 
                                                    className="mr-3 h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                                                />
                                            ) : (
                                                <>
                                                    <button onClick={() => onEdit(item)} className="text-accent hover:text-green-900 mr-3">Edit</button>
                                                    <button onClick={() => onDelete(item)} className="text-red-600 hover:text-red-900">Delete</button>
                                                </>
                                            )}
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
};

interface OtherExpensesFormFieldsProps {
    formData: any;
    handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    commonInputClasses: string;
}

export const OtherExpensesFormFields: React.FC<OtherExpensesFormFieldsProps> = ({
    formData, handleInputChange, commonInputClasses
}) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Particulars</label>
                <textarea name="particulars" value={formData.particulars} onChange={handleInputChange} rows={3} required className={commonInputClasses} />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Amount</label>
                <input type="number" name="amount" value={formData.amount} onChange={handleInputChange} min="0" step="0.01" className={commonInputClasses} required />
            </div>
        </div>
    );
};
