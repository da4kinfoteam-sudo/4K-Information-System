// Author: 4K 
import React from 'react';
import { DisbursementRecord } from '../../constants';
import { Trash2, Plus } from 'lucide-react';
import { MonthYearPicker } from './MonthYearPicker';
import { FormattedAmountInput } from './FormattedAmountInput';

interface Props {
    disbursements: DisbursementRecord[];
    onChange: (disbursements: DisbursementRecord[]) => void;
    readOnly?: boolean;
    hideHeaderAddButton?: boolean;
    validateMonthChange?: (month: string) => boolean | Promise<boolean>;
}

export const DisbursementListEditor: React.FC<Props> = ({ disbursements = [], onChange, readOnly = false, hideHeaderAddButton = false, validateMonthChange }) => {
    const handleAdd = () => {
        if (readOnly) return;
        const newRecord: DisbursementRecord = {
            id: Date.now(),
            amount: 0,
            date: new Date().toISOString().split('T')[0]
        };
        onChange([...disbursements, newRecord]);
    };

    const handleRemove = (id: number) => {
        if (readOnly) return;
        onChange(disbursements.filter(o => o.id !== id));
    };

    const handleUpdate = async (id: number, updates: Partial<DisbursementRecord>) => {
        if (readOnly) return;
        if (updates.date && validateMonthChange) {
            const allowed = await validateMonthChange(updates.date);
            if (!allowed) return;
        }
        onChange(disbursements.map(o => o.id === id ? { ...o, ...updates } : o));
    };

    const total = disbursements.reduce((sum, o) => sum + (o.amount || 0), 0);

    return (
        <div className="budget-record-list space-y-3">
            <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg border border-gray-100 dark:border-gray-700">
                <div className="flex flex-col">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Disbursed Amount</span>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(total)}
                    </span>
                </div>
                {!readOnly && !hideHeaderAddButton && (
                    <button
                        type="button"
                        onClick={handleAdd}
                        className="financial-record-list-add flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-all"
                    >
                        <Plus className="w-3 h-3" />
                        Add Record
                    </button>
                )}
            </div>

            {disbursements.length === 0 ? (
                <div className="text-center py-6 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-xl">
                    <p className="text-xs text-gray-400 font-medium">No disbursement records yet.</p>
                    {!readOnly && (
                        <button
                            type="button"
                            onClick={handleAdd}
                            className="mt-2 text-xs text-emerald-600 font-bold hover:underline"
                        >
                            Click here to add one
                        </button>
                    )}
                </div>
            ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {disbursements.map((disb) => (
                        <div 
                            key={disb.id} 
                            className="group flex items-start gap-2 bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow relative"
                        >
                            <div className="flex-1 grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Month</label>
                                    <MonthYearPicker
                                        value={disb.date}
                                        onChange={(val) => handleUpdate(disb.id, { date: val })}
                                        disabled={readOnly}
                                        className="h-8 text-[11px] px-2"
                                        allowClear
                                    />
                                </div>
                                <div>
                                    <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Amount</label>
                                    <FormattedAmountInput
                                        value={Number(disb.amount) || 0}
                                        onValueChange={(value) => handleUpdate(disb.id, { amount: value })}
                                        disabled={readOnly}
                                        emptyWhenZero
                                        placeholder="0.00"
                                        className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border-none rounded-lg text-xs font-bold text-emerald-600 dark:text-emerald-400 focus:ring-1 focus:ring-emerald-500 transition-all disabled:opacity-50"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Remarks (Optional)</label>
                                    <input
                                        type="text"
                                        value={disb.remarks || ''}
                                        onChange={(e) => handleUpdate(disb.id, { remarks: e.target.value })}
                                        disabled={readOnly}
                                        placeholder="e.g. 1st Tranche, Final payment..."
                                        className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border-none rounded-lg text-xs font-medium focus:ring-1 focus:ring-emerald-500 transition-all disabled:opacity-50"
                                    />
                                </div>
                            </div>
                            {!readOnly && (
                                <button
                                    type="button"
                                    onClick={() => handleRemove(disb.id)}
                                    className="p-1.5 text-gray-300 hover:text-red-500 transition-colors bg-gray-50 dark:bg-gray-800 rounded-lg"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// --- End of DisbursementListEditor.tsx ---
