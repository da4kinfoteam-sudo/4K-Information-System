import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDcfPolicy } from '../contexts/DcfPolicyContext';
import { useLogAction } from './useLogAction';
import {
    canDeleteDcfItem,
    canEditDcfSection,
    canUseAccomplishmentMonth,
    DcfModuleKey,
    DcfPolicyAction,
    DcfPolicyDecision,
    DcfPolicyStatus,
    getDcfItemPolicyStatus,
} from '../lib/dcfPolicy';

export interface DcfPolicyGuardContext {
    moduleKey: DcfModuleKey;
    item?: any;
    itemId?: number | string;
    itemName?: string;
    status?: DcfPolicyStatus;
    action?: DcfPolicyAction;
    month?: string;
    entityType?: string;
}

export const buildDcfOverrideAuditMetadata = ({
    decision,
    context,
    reason,
    serverDate,
    userRole,
}: {
    decision: DcfPolicyDecision;
    context: DcfPolicyGuardContext;
    reason: string | null;
    serverDate: string;
    userRole?: string;
}) => {
    const normalizedMonth = normalizePolicyMonth(context.month);
    return {
        auditType: 'dcf_policy_override',
        moduleKey: context.moduleKey,
        moduleLabel: getDcfModuleLabel(context.moduleKey),
        sourceEntity: context.entityType || context.moduleKey,
        itemId: context.itemId,
        itemName: context.itemName,
        status: context.status,
        action: context.action,
        targetMonth: normalizedMonth,
        originalBlockedAction: context.action || (normalizedMonth ? 'accomplishmentPeriod' : 'dcfPolicy'),
        originalBlockedMonth: normalizedMonth,
        decisionCode: decision.code,
        decisionMessage: decision.message,
        overrideReason: reason || null,
        overrideUserRole: userRole || null,
        serverDate,
        clientTimestamp: new Date().toISOString(),
        policyVersion: 1,
    };
};

const ALLOWED_DECISION: DcfPolicyDecision = {
    allowed: true,
    code: 'allowed',
    message: 'Allowed.',
};

export const getDcfModuleKeyForSourceType = (sourceType?: string): DcfModuleKey | null => {
    switch (sourceType) {
        case 'Subproject':
            return 'subprojects';
        case 'Activity':
            return 'activities';
        case 'Office':
            return 'office_requirements';
        case 'Staffing':
            return 'staffing_requirements';
        case 'Other':
            return 'other_program_expenses';
        default:
            return null;
    }
};

export const normalizePolicyMonth = (value?: string | null): string | null => {
    if (!value) return null;
    const match = String(value).match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
    return match ? `${match[1]}-${match[2]}` : null;
};

export const getDcfModuleLabel = (moduleKey: DcfModuleKey): string => {
    switch (moduleKey) {
        case 'subprojects':
            return 'Subprojects';
        case 'activities':
            return 'Activities';
        case 'office_requirements':
            return 'Office Requirements';
        case 'staffing_requirements':
            return 'Staffing Requirements';
        case 'other_program_expenses':
            return 'Other Program Expenses';
        default:
            return 'DCF record';
    }
};

export const useDcfPolicyGuard = () => {
    const { currentUser } = useAuth();
    const { policy, serverDate, loading, error } = useDcfPolicy();
    const { logAction } = useLogAction();

    const getStatusDecision = useCallback(({
        moduleKey,
        item,
        status,
        action,
        hasModuleAccess,
    }: {
        moduleKey: DcfModuleKey;
        item?: any;
        status?: DcfPolicyStatus;
        action: DcfPolicyAction;
        hasModuleAccess: boolean;
    }): DcfPolicyDecision => {
        if (loading) {
            return { allowed: false, code: 'blocked_by_status', message: 'DCF editing policy is still loading.' };
        }
        const resolvedStatus = status || getDcfItemPolicyStatus(moduleKey, item || {});
        return canEditDcfSection({
            user: currentUser,
            hasModuleAccess,
            policy,
            moduleKey,
            status: resolvedStatus,
            action,
        });
    }, [currentUser, loading, policy]);

    const getDeleteDecision = useCallback(({
        moduleKey,
        item,
        status,
        hasModuleAccess,
    }: {
        moduleKey: DcfModuleKey;
        item?: any;
        status?: DcfPolicyStatus;
        hasModuleAccess: boolean;
    }): DcfPolicyDecision => {
        if (loading) {
            return { allowed: false, code: 'blocked_by_status', message: 'DCF editing policy is still loading.' };
        }
        const resolvedStatus = status || getDcfItemPolicyStatus(moduleKey, item || {});
        return canDeleteDcfItem({
            user: currentUser,
            hasModuleAccess,
            policy,
            moduleKey,
            status: resolvedStatus,
        });
    }, [currentUser, loading, policy]);

    const getMonthDecision = useCallback((month?: string | null): DcfPolicyDecision => {
        const normalizedMonth = normalizePolicyMonth(month);
        if (!normalizedMonth) return ALLOWED_DECISION;
        if (loading) {
            return { allowed: false, code: 'blocked_by_month_lock', message: 'DCF period-lock policy is still loading.' };
        }
        return canUseAccomplishmentMonth({
            user: currentUser,
            policy,
            targetMonth: normalizedMonth,
            serverDate,
        });
    }, [currentUser, loading, policy, serverDate]);

    const requestOverrideReason = useCallback((decision: DcfPolicyDecision, context: DcfPolicyGuardContext): string | null => {
        if (decision.code !== 'allowed_by_override' || !decision.requiresOverrideReason) {
            return null;
        }

        const label = context.month
            ? `${getDcfModuleLabel(context.moduleKey)} ${context.action || 'period'} override for ${context.month}`
            : `${getDcfModuleLabel(context.moduleKey)} ${context.action || 'policy'} override`;
        const reason = window.prompt(`${label}\n\n${decision.message}\n\nEnter override reason:`);
        if (!reason || !reason.trim()) {
            return '';
        }
        return reason.trim();
    }, []);

    const logOverride = useCallback(async (decision: DcfPolicyDecision, context: DcfPolicyGuardContext, reason: string | null) => {
        if (decision.code !== 'allowed_by_override') return;
        await logAction(
            'DCF Policy Override',
            `${getDcfModuleLabel(context.moduleKey)} override used${context.itemName ? ` for ${context.itemName}` : ''}.`,
            undefined,
            context.entityType || context.moduleKey,
            context.itemId !== undefined ? String(context.itemId) : undefined,
            buildDcfOverrideAuditMetadata({
                decision,
                context,
                reason,
                serverDate,
                userRole: currentUser?.role,
            })
        );
    }, [currentUser?.role, logAction, serverDate]);

    const ensureDecisionAllowed = useCallback(async (decision: DcfPolicyDecision, context: DcfPolicyGuardContext): Promise<boolean> => {
        if (!decision.allowed) {
            window.alert(decision.message);
            return false;
        }

        const reason = requestOverrideReason(decision, context);
        if (reason === '') {
            window.alert('Override reason is required.');
            return false;
        }
        await logOverride(decision, context, reason);
        return true;
    }, [logOverride, requestOverrideReason]);

    return {
        policy,
        serverDate,
        loading,
        error,
        getStatusDecision,
        getDeleteDecision,
        getMonthDecision,
        ensureDecisionAllowed,
    };
};
