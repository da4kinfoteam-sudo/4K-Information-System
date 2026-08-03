import { supabase } from '../supabaseClient';
import type { ActualObligationRecordLike } from './financialObligationUtils';

export type FinancialObligationEntityType =
    | 'subproject_detail'
    | 'activity_expense'
    | 'staffing_expense'
    | 'office_requirement'
    | 'other_program_expense';

export const replaceFinancialObligationRecords = async ({
    entityType,
    parentId,
    itemId,
    records,
}: {
    entityType: FinancialObligationEntityType;
    parentId: number;
    itemId?: number | string | null;
    records: ActualObligationRecordLike[];
}) => {
    if (!supabase) return;

    let deleteQuery = supabase
        .from('financial_obligations')
        .delete()
        .eq('entity_type', entityType)
        .eq('parent_id', parentId);

    deleteQuery = itemId === undefined || itemId === null
        ? deleteQuery.is('item_id', null)
        : deleteQuery.eq('item_id', String(itemId));

    const { error: deleteError } = await deleteQuery;
    if (deleteError) throw deleteError;

    if (records.length === 0) return;

    const payload = records.map(record => ({
        entity_type: entityType,
        parent_id: parentId,
        item_id: itemId === undefined || itemId === null ? null : String(itemId),
        obligation_date: record.date,
        amount: Number(record.amount),
        remarks: String(record.remarks || '').trim(),
    }));

    const { error: insertError } = await supabase.from('financial_obligations').insert(payload);
    if (insertError) throw insertError;
};
