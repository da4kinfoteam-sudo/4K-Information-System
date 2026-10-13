import type { Activity } from '../constants';

import { getActivityDisplayTitle } from '../supabase/functions/_shared/activityTitles';
export { getActivityDisplayTitle, getActivityTypeLabel, normalizeActivityTitle, activityTitleForSave } from '../supabase/functions/_shared/activityTitles';

// Legacy label/code links are accepted only when unambiguous. New links use the primary ID.
export const resolveActivitySelection = (activities: Activity[], key: string): Activity | undefined => {
    const byId = activities.find(activity => String(activity.id) === key);
    if (byId) return byId;
    const byCode = activities.filter(activity => activity.uid === key);
    if (byCode.length) return byCode.length === 1 ? byCode[0] : undefined;
    const byLabel = activities.filter(activity => getActivityDisplayTitle(activity) === key || activity.name === key);
    return byLabel.length === 1 ? byLabel[0] : undefined;
};

export const escapeActivityHtml = (value: string): string => value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);
