import { SubprojectDetail } from '../constants';

export interface SubprojectCompletionRollup {
    details: SubprojectDetail[];
    activeCount: number;
    completedCount: number;
    isComplete: boolean;
    status: 'Completed' | 'Ongoing';
    actualCompletionDate: string | null;
}

const hasDateValue = (value?: string | null) => typeof value === 'string' && value.trim().length > 0;

const getDateTime = (value?: string | null) => {
    if (!hasDateValue(value)) return Number.NEGATIVE_INFINITY;
    const time = Date.parse(value as string);
    return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
};

export const isActiveSubprojectDeliveryDetail = (detail: SubprojectDetail) => !detail.isCancelled;

export const normalizeSubprojectCompletionDetails = (details: SubprojectDetail[]) => (
    (details || []).map(detail => {
        if (!isActiveSubprojectDeliveryDetail(detail)) return detail;
        if (hasDateValue(detail.actualDeliveryDate) && detail.isCompleted === undefined) {
            return { ...detail, isCompleted: true };
        }
        return detail;
    })
);

export const isSubprojectDeliveryDetailComplete = (detail: SubprojectDetail) => (
    isActiveSubprojectDeliveryDetail(detail)
    && hasDateValue(detail.actualDeliveryDate)
    && detail.isCompleted === true
);

export const resolveSubprojectCompletionRollup = (details: SubprojectDetail[]): SubprojectCompletionRollup => {
    const normalizedDetails = normalizeSubprojectCompletionDetails(details);
    const activeDetails = normalizedDetails.filter(isActiveSubprojectDeliveryDetail);
    const completedDetails = activeDetails.filter(isSubprojectDeliveryDetailComplete);

    if (activeDetails.length === 0 || completedDetails.length !== activeDetails.length) {
        return {
            details: normalizedDetails,
            activeCount: activeDetails.length,
            completedCount: completedDetails.length,
            isComplete: false,
            status: 'Ongoing',
            actualCompletionDate: null
        };
    }

    const latestCompletedDetail = completedDetails.reduce((latest, current) => (
        getDateTime(current.actualDeliveryDate) > getDateTime(latest.actualDeliveryDate) ? current : latest
    ), completedDetails[0]);

    return {
        details: normalizedDetails,
        activeCount: activeDetails.length,
        completedCount: completedDetails.length,
        isComplete: true,
        status: 'Completed',
        actualCompletionDate: latestCompletedDetail.actualDeliveryDate || null
    };
};
