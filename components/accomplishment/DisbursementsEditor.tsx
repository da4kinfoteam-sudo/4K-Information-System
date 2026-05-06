import React, { useState } from 'react';
import { DisbursementRecord } from '../../constants';
import { MonthYearPicker } from '../ui/MonthYearPicker';
import { Plus, Trash2 } from 'lucide-react';

interface DisbursementsEditorProps {
    disbursements: DisbursementRecord[];
    onChange: (disbursements: DisbursementRecord[], totalAmount: number) => void;
    defaultYear?: string;
    readOnly?: boolean;
}

export const DisbursementsEditor: React.FC<DisbursementsEditorProps> = ({ disbursements = [], onChange, defaultYear, readOnly = false }) => {
    const handleAdd = () => {
        const newDb: DisbursementRecord = {
            id: Date.now() + Math.floor(Math.random() * 1000), // temp id
            date: '',
            amount: 0,
            remarks: ''
        };
        const updated = [...disbursements, newDb];
        onChange(updated, updated.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
    };

    const handleUpdate = (id: number, field: keyof DisbursementRecord, value: any) => {
        const updated = disbursements.map(db => db.id === id ? { ...db, [field]: value } : db);
        onChange(updated, updated.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
    };

    const handleDelete = (id: number) => {
        const updated = disbursements.filter(db => db.id !== id);
        onChange(updated, updated.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
    };

    const totalAmount = disbursements.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

    return (
        <div className="flex flex-col gap-2 relative min-w-[200px]">
            {disbursements.map((db, idx) => (
                <div key={db.id || idx} className="flex flex-col gap-1 p-2 bg-gray-50 dark:bg-gray-800/50 rounded border dark:border-gray-700/50">
                    <div className="flex gap-2 items-center">
                        <div className="flex-1 min-w-[100px]">
                            <MonthYearPicker
                                value={db.date}
                                onChange={(val) => handleUpdate(db.id, 'date', val)}
                                placeholder="Month"
                                defaultYear={defaultYear}
                                className="h-8 text-xs w-full"
                                disabled={readOnly}
                            />
                        </div>
                        <div className="flex-1 flex items-center gap-1 min-w-[90px]">
                            <input
                                type="number"
                                value={db.amount === 0 && !db.date ? '' : db.amount} /* Avoid showing 0 initially */
                                onChange={(e) => handleUpdate(db.id, 'amount', parseFloat(e.target.value))}
                                className="h-8 text-xs px-2 rounded border dark:border-gray-600 w-full bg-white dark:bg-gray-700 dark:text-gray-200"
                                placeholder="0.00"
                                disabled={readOnly}
                            />
                        </div>
                        {!readOnly && (
                            <button type="button" title="Remove Row" onClick={() => handleDelete(db.id)} className="text-red-500 hover:text-red-700 p-1 shrink-0">
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                </div>
            ))}
            {!readOnly && (
                <button type="button" onClick={handleAdd} className="flex items-center justify-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium py-1.5 border border-dashed border-blue-300 dark:border-blue-700/50 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                    <Plus size={14} /> Add Disbursement
                </button>
            )}
            {disbursements.length > 0 && (
                <div className="text-xs font-semibold text-right text-blue-800 dark:text-blue-400 mt-1 pb-1">
                    Total: ₱{new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalAmount)}
                </div>
            )}
        </div>
    );
};
