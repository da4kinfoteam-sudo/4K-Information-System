import type { Activity, IPO } from '../constants';

export interface ActivityIpoLinks {
    participating_ipo_ids?: number[] | null;
    participatingIpos?: string[] | null;
}

export interface ActivityIpoSelectionRow {
    key: string;
    ipoId: number | null;
    name: string;
    uid: string;
    region: string;
    unavailable: boolean;
}

export const getActivityIpoIds = (links: ActivityIpoLinks): number[] => {
    const values = Array.isArray(links.participating_ipo_ids) ? links.participating_ipo_ids : [];
    return [...new Set(values.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
};

export const getActivityIpoNames = (links: ActivityIpoLinks): string[] => {
    const value: unknown = links.participatingIpos;
    const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(';') : [];
    return values.map(name => String(name || '').trim()).filter(Boolean);
};

const comparableName = (name: string) => name.trim().toLowerCase();

export const getActivityIpoSelection = (links: ActivityIpoLinks, ipos: IPO[]): ActivityIpoSelectionRow[] => {
    const ids = getActivityIpoIds(links);
    const names = getActivityIpoNames(links);
    const byId = new Map(ipos.map(ipo => [Number(ipo.id), ipo]));
    const rowForIpo = (ipo: IPO): ActivityIpoSelectionRow => ({
        key: `id:${ipo.id}`, ipoId: Number(ipo.id), name: ipo.name,
        uid: `IPO-${ipo.id}`, region: ipo.region || '', unavailable: false,
    });
    const legacyRow = (name: string): ActivityIpoSelectionRow => ({
        key: `legacy:${name}`, ipoId: null, name, uid: '', region: '', unavailable: true,
    });

    if (ids.length) {
        const rows: ActivityIpoSelectionRow[] = ids.map((id, index) => {
            const ipo = byId.get(id);
            if (ipo) return rowForIpo(ipo);
            return {
                key: `id:${id}`, ipoId: id,
                name: names.length === ids.length ? names[index] : '',
                uid: '', region: '', unavailable: true,
            };
        });
        // Unmatched labels need an explicit user decision, not an invented ID or silent removal.
        names.forEach(name => {
            if (rows.some(row => comparableName(row.name) === comparableName(name))) return;
            rows.push(legacyRow(name));
        });
        return rows;
    }

    const rows = names.map(name => {
        const matches = ipos.filter(ipo => comparableName(ipo.name) === comparableName(name));
        return matches.length === 1 ? rowForIpo(matches[0]) : legacyRow(name);
    });
    return rows.filter((row, index) => rows.findIndex(item => item.key === row.key) === index);
};

export const activityIpoLinksFromSelection = (rows: ActivityIpoSelectionRow[]) => ({
    participating_ipo_ids: [...new Set(rows.flatMap(row => row.ipoId === null ? [] : [row.ipoId]))],
    participatingIpos: rows.map(row => row.name).filter(Boolean),
});

export const reconcileActivityIpoLinks = (links: ActivityIpoLinks, ipos: IPO[]) =>
    activityIpoLinksFromSelection(getActivityIpoSelection(links, ipos));

export const activityIncludesIpo = (links: ActivityIpoLinks, ipoId: number, ipoName: string) => {
    const ids = getActivityIpoIds(links);
    if (ids.length) return ids.includes(Number(ipoId));
    return getActivityIpoNames(links).some(name => comparableName(name) === comparableName(ipoName));
};

export const resolveActivityIpos = (links: ActivityIpoLinks, ipos: IPO[]) => {
    const ids = new Set(getActivityIpoSelection(links, ipos).flatMap(row => row.ipoId === null ? [] : [row.ipoId]));
    return ipos.filter(ipo => ids.has(Number(ipo.id)));
};

const DETAIL_FIELDS = [
    'type', 'name', 'activity_title', 'status', 'operatingUnit', 'component', 'reference_activity_id',
    'date', 'endDate', 'description', 'location', 'lat', 'lng', 'facilitator',
    'participantsMale', 'participantsFemale', 'fundingYear', 'fundType', 'tier',
    'fundSource', 'fundSourceUid', 'isRealignment', 'isSavings',
    'participatingIpos', 'participating_ipo_ids', 'updated_at', 'history',
] as const;

// Details writes deliberately exclude expenses, financial/physical actuals and protected transfer metadata.
export const buildActivityDetailsPayload = (activity: Activity): Partial<Activity> =>
    Object.fromEntries(DETAIL_FIELDS.filter(field => activity[field] !== undefined).map(field => [field, activity[field]]));
