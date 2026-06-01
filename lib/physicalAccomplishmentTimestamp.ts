type TimestampInput = {
    hasPhysicalAccomplishment: boolean;
    hasChanged: boolean;
    previousSubmittedAt?: string | null;
    submittedAt: string;
};

export const normalizePhysicalDate = (value?: string | null) => {
    if (!value) return '';
    return String(value).trim();
};

export const valuesDiffer = (previous: unknown, next: unknown) => {
    const normalize = (value: unknown) => {
        if (value === null || value === undefined || value === '') return '';
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
        return String(value).trim();
    };

    return normalize(previous) !== normalize(next);
};

export const resolvePhysicalAccomplishmentSubmittedAt = ({
    hasPhysicalAccomplishment,
    hasChanged,
    previousSubmittedAt,
    submittedAt
}: TimestampInput) => {
    if (!hasPhysicalAccomplishment) return null;
    if (hasChanged) return submittedAt;
    return previousSubmittedAt || null;
};

export const getProgramManagementPhysicalDateBasis = (item: { actualDate?: string | null; actualObligationDate?: string | null }) =>
    normalizePhysicalDate(item.actualDate) || normalizePhysicalDate(item.actualObligationDate);
