import React, { useId, useMemo, useState } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import type { IPO } from '../../constants';
import { philippineRegions } from '../../constants';
import {
    activityIpoLinksFromSelection, getActivityIpoSelection,
    type ActivityIpoLinks,
} from '../../lib/activityIpoLinks';
import { SelectionCheckbox, TruncatedTableCell } from './MajorDataTable';

interface ActivityIpoSelectorProps {
    ipos: IPO[];
    links: ActivityIpoLinks;
    region: string;
    onRegionChange: (region: string) => void;
    onChange: (links: ReturnType<typeof activityIpoLinksFromSelection>) => void;
    disabled?: boolean;
}

export const ActivityIpoSelector: React.FC<ActivityIpoSelectorProps> = ({
    ipos, links, region, onRegionChange, onChange, disabled = false,
}) => {
    const id = useId();
    const [search, setSearch] = useState('');
    const [candidateIds, setCandidateIds] = useState<string[]>([]);
    const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
    const rows = useMemo(() => getActivityIpoSelection(links, ipos), [links, ipos]);
    const candidates = useMemo(() => {
        const selectedIds = new Set(rows.map(row => row.ipoId));
        const needle = search.trim().toLowerCase();
        return ipos.filter(ipo => !selectedIds.has(Number(ipo.id)))
            .filter(ipo => region === 'All' || ipo.region === region)
            .filter(ipo => `${ipo.name} IPO-${ipo.id} ${ipo.region || ''}`.toLowerCase().includes(needle))
            .sort((left, right) => left.name.localeCompare(right.name));
    }, [ipos, region, rows, search]);
    const visibleCandidateIds = candidateIds.filter(id => candidates.some(ipo => String(ipo.id) === id));
    const checkedKeys = selectedKeys.filter(key => rows.some(row => row.key === key));

    const addCandidates = () => {
        const added = getActivityIpoSelection({ participating_ipo_ids: visibleCandidateIds.map(Number) }, ipos);
        onChange(activityIpoLinksFromSelection([...rows, ...added]));
        setCandidateIds([]);
    };
    const removeRows = (keys: string[]) => {
        onChange(activityIpoLinksFromSelection(rows.filter(row => !keys.includes(row.key))));
        setSelectedKeys(previous => previous.filter(key => !keys.includes(key)));
    };

    return (
        <div className="activity-ipo-selector">
            <div className="activity-ipo-selector__filters">
                <label className="form-field">
                    <span className="form-label">Filter IPOs by Region</span>
                    <select className="form-control" value={region} disabled={disabled} onChange={event => {
                        setCandidateIds([]);
                        onRegionChange(event.target.value);
                    }}>
                        <option value="All">All Regions</option>
                        {philippineRegions.map(value => <option key={value} value={value}>{value}</option>)}
                    </select>
                </label>
                <label className="major-table-search">
                    <Search aria-hidden="true" />
                    <input aria-label="Search available IPOs" value={search} disabled={disabled} placeholder="Search IPOs" onChange={event => {
                        setSearch(event.target.value);
                        setCandidateIds([]);
                    }} />
                </label>
            </div>
            <div className="activity-ipo-selector__candidates">
                <label htmlFor={`${id}-available`} className="form-label">Available IPOs</label>
                <select id={`${id}-available`} multiple size={5} className="form-control form-control--multiselect"
                    value={visibleCandidateIds} disabled={disabled} onChange={event => setCandidateIds(
                        Array.from(event.currentTarget.selectedOptions, (option: HTMLOptionElement) => option.value)
                    )}>
                    {candidates.map(ipo => <option key={ipo.id} value={String(ipo.id)} title={ipo.name}>
                        IPO-{ipo.id} - {ipo.name}
                    </option>)}
                </select>
                <button type="button" className="btn btn-secondary" disabled={disabled || !visibleCandidateIds.length} onClick={addCandidates}>
                    <Plus className="btn-symbol" aria-hidden="true" /> Add
                </button>
            </div>
            <div className="activity-ipo-selector__toolbar">
                <label className="form-label" id={`${id}-selected`}>Participating IPOs ({rows.length})</label>
                <button type="button" className="btn btn-secondary" disabled={disabled || !checkedKeys.length} onClick={() => removeRows(checkedKeys)}>
                    <Trash2 className="btn-symbol" aria-hidden="true" /> Remove selected
                </button>
            </div>
            <div className="data-table-scroll activity-ipo-selector__table" tabIndex={0} aria-labelledby={`${id}-selected`}>
                <table className="data-table">
                    <colgroup><col className="activity-ipo-selector__check" /><col className="activity-ipo-selector__code" /><col /><col className="activity-ipo-selector__region" /><col className="activity-ipo-selector__action" /></colgroup>
                    <thead><tr>
                        <th><SelectionCheckbox aria-label="Select all participating IPOs" disabled={disabled || !rows.length}
                            checked={rows.length > 0 && checkedKeys.length === rows.length} indeterminate={checkedKeys.length > 0 && checkedKeys.length < rows.length}
                            onChange={event => setSelectedKeys(event.target.checked ? rows.map(row => row.key) : [])} /></th>
                        <th>IPO Code/UID</th><th>IPO Name</th><th>Region</th><th>Remove</th>
                    </tr></thead>
                    <tbody>
                        {!rows.length && <tr><td colSpan={5} className="activity-ipo-selector__empty">No participating IPOs</td></tr>}
                        {rows.map(row => <tr key={row.key}>
                            <td><SelectionCheckbox aria-label={`Select ${row.name || `IPO ${row.ipoId}`}`} disabled={disabled} checked={checkedKeys.includes(row.key)}
                                onChange={event => setSelectedKeys(previous => event.target.checked ? [...previous, row.key] : previous.filter(key => key !== row.key))} /></td>
                            <td><TruncatedTableCell value={row.uid || (row.ipoId !== null ? String(row.ipoId) : '')} /></td>
                            <td><TruncatedTableCell value={row.name || `IPO ${row.ipoId}`} fullText={row.unavailable ? `${row.name || `IPO ${row.ipoId}`} (Unresolved or unavailable in current scope)` : row.name} /></td>
                            <td><TruncatedTableCell value={row.region} /></td>
                            <td><button type="button" className="table-action table-action--danger" title="Remove participating IPO" aria-label={`Remove ${row.name || `IPO ${row.ipoId}`}`}
                                disabled={disabled} onClick={() => removeRows([row.key])}><Trash2 className="btn-symbol" aria-hidden="true" /></button></td>
                        </tr>)}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
