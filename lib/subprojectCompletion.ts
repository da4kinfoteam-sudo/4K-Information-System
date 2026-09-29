import { SubprojectDetail } from '../constants';
import { isActiveSubprojectDetail as isActiveAdjustedSubprojectDetail } from './subprojectItemAdjustments';

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

export const isActiveSubprojectDeliveryDetail = (detail: SubprojectDetail, parentStatus?: string) => isActiveAdjustedSubprojectDetail(detail, parentStatus);

export const normalizeSubprojectCompletionDetails = (details: SubprojectDetail[], parentStatus?: string) => (
    (details || []).map(detail => {
        if (!isActiveSubprojectDeliveryDetail(detail, parentStatus)) return detail;
        if (hasDateValue(detail.actualDeliveryDate) && detail.isCompleted === undefined) {
            return { ...detail, isCompleted: true };
        }
        return detail;
    })
);

export const isSubprojectDeliveryDetailComplete = (detail: SubprojectDetail, parentStatus?: string) => (
    isActiveSubprojectDeliveryDetail(detail, parentStatus)
    && hasDateValue(detail.actualDeliveryDate)
    && detail.isCompleted === true
);

export const resolveSubprojectCompletionRollup = (details: SubprojectDetail[], parentStatus?: string): SubprojectCompletionRollup => {
    const normalizedDetails = normalizeSubprojectCompletionDetails(details, parentStatus);
    const activeDetails = normalizedDetails.filter(detail => isActiveSubprojectDeliveryDetail(detail, parentStatus));
    const completedDetails = activeDetails.filter(detail => isSubprojectDeliveryDetailComplete(detail, parentStatus));

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
