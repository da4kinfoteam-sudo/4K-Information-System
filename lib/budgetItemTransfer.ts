import type { Activity, ActivityExpense, RoleConfig, Subproject, SubprojectDetail } from '../constants';
import { supabase } from '../supabaseClient';
import type { BudgetTransferSourceType, ParentActualAllocation } from './budgetItemTransferRules';
export {
    PARENT_ACTUAL_FIELDS,
    buildActualAllocation,
    buildDestinationActualAllocation,
    isTransferAccomplishmentActive,
    reparentSelectedFinancialActualRows,
    validateActualAllocation,
} from './budgetItemTransferRules';
export type { BudgetTransferSourceType, ParentActualAllocation, ParentActualField } from './budgetItemTransferRules';

export type TransferLine = SubprojectDetail | ActivityExpense;

export const getTransferEligibleLines = (
    sourceType: BudgetTransferSourceType,
    record: Subproject | Activity,
): TransferLine[] => {
    if (record.status === 'Cancelled') return [];
    const lines = sourceType === 'subproject'
        ? (record as Subproject).details || []
        : (record as Activity).expenses || [];
    return lines.filter(line => !line.isCancelled && !('isSuperseded' in line && line.isSuperseded));
};

export const canTransferBudgetItems = (
    role: string | undefined,
    module: 'Subprojects' | 'Activities',
    roleConfigs: RoleConfig[],
    permissionOverrides?: Record<string, { can_transfer_budget_items?: boolean }> | null,
) => {
    if (role === 'Super Admin') return true;
    const override = permissionOverrides?.[module]?.can_transfer_budget_items;
    if (typeof override === 'boolean') return override;
    return !!roleConfigs.find(config => config.role === role && config.module === module)?.can_transfer_budget_items;
};

export interface SubmitBudgetItemTransferInput {
    sourceType: BudgetTransferSourceType;
    sourceId: number;
    selectedItemIds: string[];
    destinationMetadata: Record<string, unknown>;
    destinationActuals: ParentActualAllocation;
    sourceActualRemainder: ParentActualAllocation;
    reason: string;
    requestKey: string;
    actorId: number;
    actorPassword: string;
}

export interface BudgetItemTransferResult {
    transfer_id: string;
    status: 'pending' | 'applied' | 'rejected';
    source: Subproject | Activity;
    destination: Subproject | Activity;
}

export const submitBudgetItemTransfer = async (input: SubmitBudgetItemTransferInput) => {
    if (!supabase) throw new Error('The database connection is unavailable. No transfer was made.');
    const { data, error } = await supabase.rpc('submit_budget_item_transfer', {
        p_actor_id: input.actorId,
        p_actor_password: input.actorPassword,
        p_source_type: input.sourceType,
        p_source_id: input.sourceId,
        p_selected_item_ids: input.selectedItemIds,
        p_destination_metadata: input.destinationMetadata,
        p_destination_actuals: input.destinationActuals,
        p_source_actual_remainder: input.sourceActualRemainder,
        p_reason: input.reason,
        p_request_key: input.requestKey,
    });
    if (error) throw new Error(error.message || 'The transfer could not be saved.');
    if (!data || !data.transfer_id || !data.destination) {
        throw new Error('The server returned an incomplete transfer result. Refresh the record before continuing.');
    }
    return data as BudgetItemTransferResult;
};

export const resolveBudgetItemTransfer = async (
    transferId: string,
    decision: 'approve' | 'reject',
    reason?: string,
    actor?: { id: number; password: string },
) => {
    if (!supabase) throw new Error('The database connection is unavailable.');
    if (!actor) throw new Error('Your user session is unavailable. Sign in again before resolving this transfer.');
    const { data, error } = await supabase.rpc('resolve_budget_item_transfer', {
        p_actor_id: actor.id,
        p_actor_password: actor.password,
        p_transfer_id: transferId,
        p_decision: decision,
        p_reason: reason || null,
    });
    if (error) throw new Error(error.message || 'The transfer request could not be resolved.');
    return data as BudgetItemTransferResult;
};
