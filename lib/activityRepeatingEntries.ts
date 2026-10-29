import type { Activity, IPO } from '../constants';
import { remapActivityExpenseGroups } from './activityBudgetSchedules';
import { reconcileActivityIpoLinks } from './activityIpoLinks';
import { activityTitleForSave } from './activityTitles';
import { createBudgetScheduleId, isValidTargetMonth } from './subprojectBudgetSchedules';

export interface RepeatingActivityEntry {
    key: string;
    date: string;
    endDate: string;
    isMultiDay: boolean;
    participantsMale: number | '';
    participantsFemale: number | '';
    participatingIpos: string[];
    participating_ipo_ids: number[];
}

export const emptyRepeatingActivityEntry = (): RepeatingActivityEntry => ({
    key: crypto.randomUUID(), date: '', endDate: '', isMultiDay: false,
    participantsMale: 0, participantsFemale: 0, participatingIpos: [], participating_ipo_ids: [],
});

export const hasRepeatingEntryDraft = (entry: RepeatingActivityEntry) => !!(
    entry.date || entry.endDate || entry.isMultiDay || entry.participantsMale !== 0
    || entry.participantsFemale !== 0 || entry.participatingIpos.length || entry.participating_ipo_ids.length
);

export function validateRepeatingActivityEntry(entry: RepeatingActivityEntry): string | null {
    if (!isValidTargetMonth(entry.date)) return 'Select a valid Start Date.';
    if (entry.isMultiDay && (!isValidTargetMonth(entry.endDate) || entry.endDate < entry.date)) {
        return 'End Date must be valid and on or after Start Date.';
    }
    if (![entry.participantsMale, entry.participantsFemale].every(value =>
        typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)) {
        return 'Male and Female must be nonnegative whole numbers.';
    }
    if (!Number.isSafeInteger(Number(entry.participantsMale) + Number(entry.participantsFemale))) return 'Total Participants is too large.';
    return null;
}

export const normalizeRepeatingActivityEntry = (entry: RepeatingActivityEntry): RepeatingActivityEntry => ({
    ...structuredClone(entry), endDate: entry.isMultiDay ? entry.endDate : entry.date,
});

export const canChooseActivityOu = (role: string | undefined, canEdit: boolean, scope: string) =>
    role === 'Super Admin' || (canEdit && scope === 'All');

export function buildRepeatingActivityPayload(shared: Activity, entry: RepeatingActivityEntry, ipos: IPO[],
    options: { userName: string; requiresApprover: boolean; reservedExpenseIds: Set<string> }): Omit<Activity, 'id'> {
    const issue = validateRepeatingActivityEntry(entry);
    if (issue) throw new Error(issue);
    const { id: _id, ...metadata } = structuredClone(shared);
    const normalized = normalizeRepeatingActivityEntry(entry);
    const now = new Date().toISOString();
    const payload: Omit<Activity, 'id'> = {
        ...metadata,
        uid: `${shared.type === 'Training' ? 'TRN' : 'ACT'}-${new Date().getFullYear()}-${crypto.randomUUID().replace(/-/g, '').toUpperCase()}`,
        date: normalized.date, endDate: normalized.endDate,
        participantsMale: Number(normalized.participantsMale), participantsFemale: Number(normalized.participantsFemale),
        ...reconcileActivityIpoLinks(normalized, ipos),
        activity_title: activityTitleForSave(shared),
        expenses: remapActivityExpenseGroups(metadata.expenses).map(expense => ({
            ...expense, id: createBudgetScheduleId(options.reservedExpenseIds),
        })),
        workflow_status: options.requiresApprover ? 'PENDING' : 'APPROVED',
        created_at: now, updated_at: now,
        history: [{ date: now, event: 'Created (Repeating)', user: options.userName }],
    };
    // Queue keys and editor flags are never part of the persisted parent metadata.
    for (const field of ['newTargetDate', 'actualDate', 'actualEndDate'] as const) {
        if (payload[field] === '') payload[field] = null;
    }
    return payload;
}
