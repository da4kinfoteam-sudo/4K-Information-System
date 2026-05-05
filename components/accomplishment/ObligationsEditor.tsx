import React, { useState } from 'react';
import { ObligationRecord } from '../../constants';
import { MonthYearPicker } from '../ui/MonthYearPicker';
import { Plus, Trash2 } from 'lucide-react';

interface ObligationsEditorProps {
    obligations: ObligationRecord[];
    onChange: (obligations: ObligationRecord[], totalAmount: number) => void;
    defaultYear?: string;
    readOnly?: boolean;
}

export const ObligationsEditor: React.FC<ObligationsEditorProps> = ({ obligations = [], onChange, defaultYear, readOnly = false }) => {
    const handleAdd = () => {
        const newOb: ObligationRecord = {
            id: Date.now() + Math.floor(Math.random() * 1000), // temp id
            date: '',
            amount: 0,
            remarks: ''
        };
        const updated = [...obligations, newOb];
        onChange(updated, updated.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
    };

    const handleUpdate = (id: number, field: keyof ObligationRecord, value: any) => {
        const updated = obligations.map(ob => ob.id === id ? { ...ob, [field]: value } : ob);
        onChange(updated, updated.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
    };

    const handleDelete = (id: number) => {
        const updated = obligations.filter(ob => ob.id !== id);
        onChange(updated, updated.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
    };

    const totalAmount = obligations.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

    return (
        <div className="flex flex-col gap-2 relative min-w-[200px]">
            {obligations.map((ob, idx) => (
                <div key={ob.id || idx} className="flex flex-col gap-1 p-2 bg-gray-50 dark:bg-gray-800/50 rounded border dark:border-gray-700/50">
                    <div className="flex gap-2 items-center">
                        <div className="flex-1 min-w-[100px]">
                            <MonthYearPicker
                                value={ob.date}
                                onChange={(val) => handleUpdate(ob.id, 'date', val)}
                                placeholder="Month"
                                defaultYear={defaultYear}
                                className="h-8 text-xs w-full"
                                disabled={readOnly}
                            />
                        </div>
                        <div className="flex-1 flex items-center gap-1 min-w-[90px]">
                            <input
                                type="number"
                                value={ob.amount === 0 && !ob.date ? '' : ob.amount} /* Avoid showing 0 initially */
                                onChange={(e) => handleUpdate(ob.id, 'amount', parseFloat(e.target.value))}
                                className="h-8 text-xs px-2 rounded border dark:bg-gray-700 dark:border-gray-600 w-full bg-white dark:text-gray-200"
                                placeholder="0.00"
                                disabled={readOnly}
                            />
                        </div>
                        {!readOnly && (
                            <button type="button" title="Remove Row" onClick={() => handleDelete(ob.id)} className="text-red-500 hover:text-red-700 p-1 shrink-0">
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                </div>
            ))}
            {!readOnly && (
                <button type="button" onClick={handleAdd} className="flex items-center justify-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium py-1.5 border border-dashed border-emerald-300 dark:border-emerald-700/50 rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors">
                    <Plus size={14} /> Add Obligation
                </button>
            )}
            {obligations.length > 0 && (
                <div className="text-xs font-semibold text-right text-emerald-800 dark:text-emerald-400 mt-1 pb-1">
                    Total: ₱{new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalAmount)}
                </div>
            )}
        </div>
    );
};
