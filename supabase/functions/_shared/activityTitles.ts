export interface ActivityTitleRecord {
    type?: string | null;
    name?: string | null;
    activity_title?: string | null;
}

export const normalizeActivityTitle = (value: unknown): string | null =>
    typeof value === 'string' ? value.trim() || null : null;

// Keep classification and Training naming separate from optional display metadata.
export const getActivityDisplayTitle = (activity: ActivityTitleRecord): string =>
    (activity.type === 'Activity' ? normalizeActivityTitle(activity.activity_title) : null)
    || activity.name || '';

export const getActivityTypeLabel = (activity: ActivityTitleRecord): string => activity.name || '';

export const activityTitleForSave = (activity: ActivityTitleRecord): string | null =>
    normalizeActivityTitle(activity.activity_title);
