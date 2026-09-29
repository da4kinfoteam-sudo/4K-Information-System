import type { SubprojectDetail } from '../constants';
import { supabase } from '../supabaseClient';
import { getProposedBudgetItemLocalBlocker } from './subprojectBudgetItemLifecycleRules';

export { getProposedBudgetItemLocalBlocker } from './subprojectBudgetItemLifecycleRules';

export const checkProposedBudgetItemDeletion = async (parentId: number, item: SubprojectDetail) => {
    const localBlocker = getProposedBudgetItemLocalBlocker(item);
    if (localBlocker) return `This item has linked ${localBlocker} and cannot be deleted from a Proposed subproject.`;
    if (!supabase) return null;

    const itemId = String(item.id);
    const [obligations, disbursements, accomplishments, adjustmentHistory] = await Promise.all([
        supabase.from('financial_obligations')
            .select('item_id')
            .eq('entity_type', 'subproject_detail')
            .eq('parent_id', parentId)
            .eq('item_id', itemId)
            .limit(1),
        supabase.from('financial_disbursements')
            .select('item_id')
            .eq('entity_type', 'subproject_detail')
            .eq('parent_id', parentId)
            .eq('item_id', itemId)
            .limit(1),
        supabase.from('subproject_accomplishments')
            .select('detail_id')
            .eq('subproject_id', parentId)
            .eq('detail_id', item.id)
            .limit(1),
        supabase.from('budget_item_adjustment_history')
            .select('item_id')
            .eq('source_type', 'subproject_detail')
            .eq('parent_id', parentId)
            .or(`item_id.eq.${itemId},source_item_id.eq.${itemId}`)
            .limit(1),
    ]);

    const failedCheck = [obligations, disbursements, accomplishments, adjustmentHistory]
        .find(result => result.error);
    if (failedCheck?.error) {
        console.error('Unable to verify linked subproject budget item records:', failedCheck.error);
        return 'Linked actuals and adjustment history could not be verified. No changes were made; try again when the connection is available.';
    }

    if (obligations.data?.length) return 'This item has linked actual obligation records and cannot be deleted from a Proposed subproject.';
    if (disbursements.data?.length) return 'This item has linked actual disbursement records and cannot be deleted from a Proposed subproject.';
    if (accomplishments.data?.length) return 'This item has linked physical accomplishment records and cannot be deleted from a Proposed subproject.';
    if (adjustmentHistory.data?.length) return 'This item has budget adjustment or replacement history and cannot be deleted from a Proposed subproject.';

    return null;
};
