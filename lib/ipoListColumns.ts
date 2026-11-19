import type { Activity, IPO, LodAssessment, Subproject } from '../constants';
import { getLodEffectiveState } from './lodScoring';

export const IPO_NOT_RECORDED = '__not_recorded__';
export const IPO_DEFAULT_COLUMNS = ['id', 'name', 'location', 'flags', 'commodities', 'levelOfDevelopment'] as const;
export interface IpoColumnContext {
    levels: Record<number, LodAssessment>;
    withSubprojects: Set<string>;
    withTrainings: Set<string>;
}
export interface IpoListColumn {
    key: string;
    label: string;
    group: string;
    width: number;
    kind?: 'number' | 'date' | 'boolean' | 'flags' | 'lod';
    value: (ipo: IPO, context: IpoColumnContext) => unknown;
}
const scalar = (key: keyof IPO, label: string, group: string, width = 200, kind?: IpoListColumn['kind']): IpoListColumn => ({
    key, label, group, width, kind, value: ipo => ipo[key],
});
export const IPO_FLAG_FIELDS = [
    ['isWomenLed', 'Women-Led', 'womenLed'], ['isWithinGida', 'GIDA', 'withinGida'],
    ['isWithinElcac', 'ELCAC', 'withinElcac'], ['isWithScad', 'SCAD', 'withScad'],
    ['isF2c2Cluster', 'F2C2 Cluster', 'f2c2Cluster'], ['isFfedisRegistered', 'FFEDIS Registered', 'ffedisRegistered'],
] as const;
export const IPO_FLAG_OPTIONS = [...IPO_FLAG_FIELDS.map(([, label]) => label), 'With Subprojects', 'With Trainings'];
export const IPO_LIST_COLUMNS: IpoListColumn[] = [
    scalar('id', 'IPO ID', 'Default', 90, 'number'),
    scalar('name', 'IPO Name', 'Default', 280),
    scalar('location', 'Location', 'Default', 240),
    { key: 'flags', label: 'Indicators', group: 'Default', width: 160, kind: 'flags', value: ipo => IPO_FLAG_FIELDS.filter(([key]) => ipo[key] === true).map(([, label]) => label) },
    { key: 'commodities', label: 'Commodities', group: 'Default', width: 170, value: ipo => [...new Set((ipo.commodities || []).map(row => row.particular).filter(Boolean))] },
    { key: 'levelOfDevelopment', label: 'Level of Development', group: 'Default', width: 210, kind: 'lod', value: (ipo, context) => getLodEffectiveState(context.levels[ipo.id]).label },
    scalar('region', 'Region', 'Profile', 210),
    scalar('indigenousCulturalCommunity', 'Indigenous Cultural Community', 'Profile', 270),
    scalar('ancestralDomainNo', 'Ancestral Domain No.', 'Profile', 205),
    scalar('registeringBody', 'Registering Body', 'Profile', 180),
    scalar('registrationDate', 'Registration Date', 'Profile', 175, 'date'),
    scalar('contactPerson', 'Contact Person', 'Profile', 175),
    scalar('contactNumber', 'Contact Number', 'Profile', 170),
    scalar('totalMembers', 'Total Members', 'Membership', 160, 'number'),
    scalar('totalIpMembers', 'Total IP Members', 'Membership', 175, 'number'),
    scalar('totalMaleMembers', 'Male Members', 'Membership', 155, 'number'),
    scalar('totalFemaleMembers', 'Female Members', 'Membership', 165, 'number'),
    scalar('totalYouthMembers', 'Youth Members', 'Membership', 165, 'number'),
    scalar('totalSeniorMembers', 'Senior Citizen Members', 'Membership', 225, 'number'),
    scalar('total4PsMembers', '4Ps Beneficiaries', 'Membership', 180, 'number'),
    { key: 'ffedisRegistrationNumber', label: 'FFEDIS Registration Number', group: 'FFEDIS', width: 270, value: ipo => ipo.isFfedisRegistered === true ? ipo.ffedisRegistrationNumber : null },
    { key: 'ffedisRegistrationDate', label: 'FFEDIS Registration Date', group: 'FFEDIS', width: 245, kind: 'date', value: ipo => ipo.isFfedisRegistered === true ? ipo.ffedisRegistrationDate : null },
];
export const ipoColumnByKey = new Map(IPO_LIST_COLUMNS.map(column => [column.key, column]));
export const isDefaultIpoColumn = (key: string) => (IPO_DEFAULT_COLUMNS as readonly string[]).includes(key);
export const visibleIpoColumns = (optional: string[]) => IPO_LIST_COLUMNS.filter(column => isDefaultIpoColumn(column.key) || optional.includes(column.key));

export function createIpoColumnContext(levels: Record<number, LodAssessment>, subprojects: Subproject[], activities: Activity[]): IpoColumnContext {
    return {
        levels,
        withSubprojects: new Set(subprojects.map(row => row.indigenousPeopleOrganization)),
        withTrainings: new Set(activities.filter(row => row.type === 'Training').flatMap(row => row.participatingIpos || [])),
    };
}
const missing = (value: unknown) => value === null || value === undefined || value === '';
const text = (value: unknown) => missing(value) ? '' : String(value);
const dateLabel = (value: unknown) => {
    const raw = text(value);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!match) return raw;
    const [, y, m, d] = match.map(Number);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
        ? date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : raw;
};
export function ipoColumnLabel(column: IpoListColumn, value: unknown): string {
    if (value === IPO_NOT_RECORDED || missing(value)) return 'Not Recorded';
    if (column.kind === 'boolean') return value === true || value === 'true' ? 'Yes' : 'No';
    if (column.kind === 'date') return dateLabel(value);
    if (column.kind === 'number' && column.key !== 'id' && Number.isFinite(Number(value))) return Number(value).toLocaleString('en-US');
    return String(value);
}
export function ipoColumnValues(column: IpoListColumn, ipo: IPO, context: IpoColumnContext): string[] {
    const value = column.value(ipo, context);
    if (Array.isArray(value)) {
        const result = value.length ? value.map(String) : [IPO_NOT_RECORDED];
        if (column.key === 'flags') {
            if (context.withSubprojects.has(ipo.name)) result.push('With Subprojects');
            if (context.withTrainings.has(ipo.name)) result.push('With Trainings');
        }
        return result;
    }
    return [missing(value) ? IPO_NOT_RECORDED : String(value)];
}
export function ipoColumnDisplay(column: IpoListColumn, ipo: IPO, context: IpoColumnContext) {
    const value = column.value(ipo, context);
    if (Array.isArray(value)) return { text: value.length ? `${value[0]}${value.length > 1 ? ` +${value.length - 1}` : ''}` : '\u2014', fullText: value.join(', ') || `No ${column.label.toLowerCase()}` };
    const fullText = missing(value) ? (column.kind === 'boolean' ? 'Not Recorded' : '\u2014') : ipoColumnLabel(column, value);
    return { text: fullText, fullText };
}
export function ipoColumnOptions(column: IpoListColumn, rows: IPO[], context: IpoColumnContext, selected: string[] = []) {
    const values = new Set([...rows.flatMap(row => ipoColumnValues(column, row, context)), ...selected]);
    if (column.kind === 'flags') IPO_FLAG_OPTIONS.forEach(value => values.add(value));
    return [...values].sort((a, b) => {
        if (a === IPO_NOT_RECORDED || b === IPO_NOT_RECORDED) return a === b ? 0 : a === IPO_NOT_RECORDED ? 1 : -1;
        if (column.kind === 'number') return Number(a) - Number(b);
        return ipoColumnLabel(column, a).localeCompare(ipoColumnLabel(column, b), undefined, { numeric: true });
    }).map(value => ({ value, label: ipoColumnLabel(column, value) }));
}
export type IpoColumnFilters = Record<string, string[]>;
export interface IpoListSort { key: string; direction: 'ascending' | 'descending' }
export const IPO_DEFAULT_SORT: IpoListSort = { key: 'registrationDate', direction: 'descending' };
export const isIpoSortableColumn = (key: string) => ipoColumnByKey.has(key) && key !== 'flags' && key !== 'commodities';
export const normalizeIpoListSort = (sort: IpoListSort | null): IpoListSort => sort && isIpoSortableColumn(sort.key)
    && (sort.direction === 'ascending' || sort.direction === 'descending') ? sort : IPO_DEFAULT_SORT;
export function processIpoList(rows: IPO[], columns: IpoListColumn[], context: IpoColumnContext, filters: IpoColumnFilters, search: string, sort: IpoListSort | null): IPO[] {
    const needle = search.trim().toLocaleLowerCase();
    const searchColumns = [...new Map([...columns, ...IPO_LIST_COLUMNS.filter(column => ['contactPerson', 'ancestralDomainNo'].includes(column.key))].map(column => [column.key, column])).values()];
    const result = rows.filter(ipo => {
        for (const [key, selected] of Object.entries(filters)) {
            const column = ipoColumnByKey.get(key);
            if (!column) continue;
            const values = ipoColumnValues(column, ipo, context);
            if (!selected.length || !(column.kind === 'flags' ? selected.every(value => values.includes(value)) : selected.some(value => values.includes(value)))) return false;
        }
        if (!needle) return true;
        return searchColumns.some(column => {
            const value = column.value(ipo, context);
            const values = Array.isArray(value) ? value : [value];
            if (column.key === 'commodities') values.push(...(ipo.commodities || []).map(row => row.type));
            return values.some(value => !missing(value) && `${text(value)} ${ipoColumnLabel(column, value)}`.toLocaleLowerCase().includes(needle));
        });
    });
    const column = sort && ipoColumnByKey.get(sort.key);
    if (!column || !sort) return result;
    return result.sort((a, b) => {
        const av = column.value(a, context), bv = column.value(b, context);
        if (missing(av) || missing(bv)) return missing(av) === missing(bv) ? 0 : missing(av) ? 1 : -1;
        let comparison: number;
        if (column.kind === 'lod') {
            const al = getLodEffectiveState(context.levels[a.id]).level;
            const bl = getLodEffectiveState(context.levels[b.id]).level;
            comparison = al && bl ? al - bl : al ? -1 : bl ? 1 : text(av).localeCompare(text(bv));
        } else if (column.kind === 'number') comparison = Number(av) - Number(bv);
        else comparison = text(av).localeCompare(text(bv), undefined, { numeric: true });
        return sort.direction === 'ascending' ? comparison : -comparison;
    });
}

export interface IpoListPreferences { version: 1; optionalColumns: string[]; filters: IpoColumnFilters; search: string }
export function normalizeIpoListPreferences(value: unknown): IpoListPreferences {
    const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const optionalColumns = IPO_LIST_COLUMNS.filter(column => !isDefaultIpoColumn(column.key) && Array.isArray(raw.optionalColumns) && raw.optionalColumns.includes(column.key)).map(column => column.key);
    const allowed = new Set(visibleIpoColumns(optionalColumns).map(column => column.key));
    const filters: IpoColumnFilters = {};
    if (raw.filters && typeof raw.filters === 'object' && !Array.isArray(raw.filters)) {
        for (const [key, values] of Object.entries(raw.filters)) {
            if (allowed.has(key) && Array.isArray(values) && values.every(value => typeof value === 'string')) filters[key] = [...new Set(values)];
        }
    }
    return { version: 1, optionalColumns, filters, search: typeof raw.search === 'string' ? raw.search : '' };
}
export function migrateIpoListPreferences(legacy: { search?: unknown; region?: unknown; flags?: unknown; filters?: unknown }): IpoListPreferences {
    const filters: IpoColumnFilters = {};
    const old = legacy.filters && typeof legacy.filters === 'object' && !Array.isArray(legacy.filters) ? legacy.filters as Record<string, unknown> : {};
    const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((value): value is string => typeof value === 'string') : [];
    // Region used to be labelled Location. Preserve its actual meaning in a visible Region column.
    const regions = strings(old.region).filter(Boolean);
    if (typeof legacy.region === 'string' && legacy.region && legacy.region !== 'All') {
        if (!regions.length) regions.push(legacy.region);
        else if (!regions.includes(legacy.region)) filters.region = [];
        else regions.splice(0, regions.length, legacy.region);
    }
    if (regions.length && !Object.hasOwn(filters, 'region')) filters.region = regions;
    for (const key of ['commodities', 'levelOfDevelopment']) {
        const values = strings(old[key]);
        if (values.length) filters[key] = key === 'levelOfDevelopment' ? values.map(value => /^[1-5]$/.test(value) ? `Level ${value}` : value) : values;
    }
    const flags = legacy.flags && typeof legacy.flags === 'object' ? legacy.flags as Record<string, unknown> : {};
    const names = IPO_FLAG_FIELDS.filter(([, , oldKey]) => flags[oldKey] === true).map(([, label]) => label as string);
    if (flags.withSubprojects === true) names.push('With Subprojects');
    if (flags.withTrainings === true) names.push('With Trainings');
    if (names.length) filters.flags = names;
    return normalizeIpoListPreferences({ optionalColumns: Object.hasOwn(filters, 'region') ? ['region'] : [], filters, search: legacy.search });
}
