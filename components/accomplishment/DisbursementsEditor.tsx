import React from 'react';
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
    const getTotal = (items: DisbursementRecord[]) => items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

    const handleAdd = () => {
        const updated = [
            ...disbursements,
            { id: Date.now() + Math.floor(Math.random() * 1000), date: '', amount: 0, remarks: '' },
        ];
        onChange(updated, getTotal(updated));
    };

    const handleUpdate = (id: number, field: keyof DisbursementRecord, value: any) => {
        const updated = disbursements.map(db => db.id === id ? { ...db, [field]: value } : db);
        onChange(updated, getTotal(updated));
    };

    const handleDelete = (id: number) => {
        const updated = disbursements.filter(db => db.id !== id);
        onChange(updated, getTotal(updated));
    };

    const totalAmount = getTotal(disbursements);

    return (
        <div className="budget-record-editor budget-record-editor--disbursement">
            {disbursements.map((db, idx) => (
                <div key={db.id || idx} className="budget-record-row">
                    <div className="budget-record-row__fields">
                        <div className="budget-record-row__month">
                            <MonthYearPicker
                                value={db.date}
                                onChange={(val) => handleUpdate(db.id, 'date', val)}
                                placeholder="Month"
                                defaultYear={defaultYear}
                                className="h-8 text-xs w-full"
                                disabled={readOnly}
                            />
                        </div>
                        <div className="budget-record-row__amount">
                            <input
                                type="number"
                                value={db.amount === 0 && !db.date ? '' : db.amount}
                                onChange={(e) => handleUpdate(db.id, 'amount', parseFloat(e.target.value))}
                                className="form-control form-control--compact"
                                placeholder="0.00"
                                disabled={readOnly}
                            />
                        </div>
                        {!readOnly && (
                            <button type="button" title="Remove Row" onClick={() => handleDelete(db.id)} className="budget-record-row__remove">
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                </div>
            ))}
            {!readOnly && (
                <button type="button" onClick={handleAdd} className="budget-record-add">
                    <Plus size={14} /> Add Disbursement
                </button>
            )}
            {disbursements.length > 0 && (
                <div className="budget-record-total">
                    Total: ₱{new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalAmount)}
                </div>
            )}
        </div>
    );
};
