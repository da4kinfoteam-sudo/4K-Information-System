import React, {useEffect, useId, useRef} from 'react';

export default function RepositoryOuSelector({label, options, selected, disabled = [], onChange}: {
    label: string; options: readonly string[]; selected: string[]; disabled?: string[]; onChange: (values: string[]) => void;
}) {
    const id = useId(), all = useRef<HTMLInputElement>(null);
    const eligible = options.filter(value => !disabled.includes(value));
    const count = eligible.filter(value => selected.includes(value)).length;
    useEffect(() => {if (all.current) all.current.indeterminate = count > 0 && count < eligible.length;}, [count, eligible.length]);
    return <div className="repository-ou-selector" role="group" aria-labelledby={id}>
        <div id={id} className="repository-ou-selector-label">{label}</div>
        <div className="repository-ou-scroll custom-scrollbar" tabIndex={0} aria-label={`${label} list`}>
            <table className="data-table repository-ou-table"><thead><tr><th scope="col"><input ref={all} type="checkbox" className="form-checkbox" aria-label={`Select all ${label}`} checked={!!eligible.length && count === eligible.length} disabled={!eligible.length} onChange={event => onChange(event.target.checked ? [...new Set([...selected, ...eligible])] : selected.filter(value => !eligible.includes(value)))}/></th><th scope="col">Operating Unit</th></tr></thead>
                <tbody>{options.map(value => <tr key={value}><td><input type="checkbox" className="form-checkbox" aria-label={value} checked={selected.includes(value)} disabled={disabled.includes(value)} onChange={event => onChange(event.target.checked ? [...new Set([...selected, value])] : selected.filter(item => item !== value))}/></td><td title={disabled.includes(value) ? `${value} - Waived; use Restore in OU Submissions` : value}>{value}{disabled.includes(value) && ' (Waived)'}</td></tr>)}</tbody>
            </table>
        </div>
    </div>;
}
