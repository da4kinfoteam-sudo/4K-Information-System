export const REPOSITORY_COLUMNS = ['subject', 'kind', 'state', 'year', 'due', 'assigned', 'own', 'updated'] as const;
export type RepositoryColumnKey = typeof REPOSITORY_COLUMNS[number];
export interface RepositoryColumnFilter { mode: 'include' | 'exclude'; values: string[]; }
export type RepositoryFilters = Partial<Record<RepositoryColumnKey, RepositoryColumnFilter>>;
export interface RepositorySort { key: RepositoryColumnKey; direction: 'ascending' | 'descending'; }
export const REPOSITORY_DEFAULT_SORT: RepositorySort = { key: 'updated', direction: 'descending' };
export interface RepositoryChoice { value: string; label: string; }

export function repositoryChoiceChecked(filter: RepositoryColumnFilter | undefined, value: string) {
    return !filter || (filter.mode === 'include' ? filter.values.includes(value) : !filter.values.includes(value));
}

// Exclusions preserve Select All semantics even when choices span multiple server pages.
export function toggleRepositoryChoice(filter: RepositoryColumnFilter | undefined, value: string, checked: boolean): RepositoryColumnFilter | undefined {
    const mode = filter?.mode || 'exclude';
    const values = new Set(filter?.values || []);
    if (checked === (mode === 'include')) values.add(value); else values.delete(value);
    return mode === 'exclude' && !values.size ? undefined : { mode, values: [...values] };
}

export function repositoryListArgs(filters: RepositoryFilters, search: string, sort: RepositorySort, parentId?: string) {
    const requiredKind = !!filters.kind && repositoryChoiceChecked(filters.kind, 'Required Folder') && !['Folder', 'File'].some(value => repositoryChoiceChecked(filters.kind, value));
    const assignedOnly = !!filters.own && !repositoryChoiceChecked(filters.own, 'Not Assigned') && ['Submitted', 'Pending My Submission', 'Waived'].some(value => repositoryChoiceChecked(filters.own, value));
    const datedOnly = !!filters.due && !repositoryChoiceChecked(filters.due, 'No Deadline') && ['Upcoming', 'Overdue'].some(value => repositoryChoiceChecked(filters.due, value));
    return {
        search, filters, sort_key: sort.key, sort_direction: sort.direction,
        ...(parentId ? { parent_id: parentId } : requiredKind || assignedOnly || datedOnly || search ? {} : { parent_id: null }),
    };
}
