import React, { useId } from 'react';
import type { RefFundSource } from '../../constants';
import { getFundSourceByUid, resolveFundSourceUidFromLegacyLabel, sortFundSources } from '../../lib/fundSources';

interface FundSourceFieldProps {
    uid?: string | null;
    label?: string | null;
    references: RefFundSource[];
    onChange: (uid: string | null, label: string | null) => void;
    required?: boolean;
    invalid?: boolean;
    disabled?: boolean;
}

const LEGACY_VALUE = '__unmapped_legacy_fund_source__';

export const FundSourceField: React.FC<FundSourceFieldProps> = ({
    uid,
    label,
    references,
    onChange,
    required = false,
    invalid = false,
    disabled = false,
}) => {
    const selectId = useId();
    const resolvedUid = uid || resolveFundSourceUidFromLegacyLabel(label, references);
    const selectedSource = getFundSourceByUid(resolvedUid, references);
    const hasLegacyLabel = !resolvedUid && !!label?.trim();
    const value = resolvedUid || (hasLegacyLabel ? LEGACY_VALUE : '');
    const options = sortFundSources(references.filter(source => source.is_active || source.uid === resolvedUid));
    const className = `form-control${invalid ? ' form-control--invalid' : ''}`;

    return (
        <div>
            <label className="form-label" htmlFor={selectId}>Fund Source{required && <> <span className="form-required">*</span></>}</label>
            <select
                id={selectId}
                name="fundSourceUid"
                value={value}
                required={required}
                disabled={disabled}
                className={className}
                onChange={event => {
                    const source = getFundSourceByUid(event.target.value, references);
                    if (source) onChange(source.uid, source.label);
                    else onChange(null, null);
                }}
            >
                <option value="">{required ? 'Select Fund Source' : 'Not specified'}</option>
                {hasLegacyLabel && <option value={LEGACY_VALUE} disabled>{`Unmapped legacy value: ${label}`}</option>}
                {uid && !selectedSource && <option value={uid} disabled>{label || uid}</option>}
                {options.map(source => (
                    <option key={source.uid} value={source.uid}>
                        {source.label}{source.is_active ? '' : ' (Inactive)'}
                    </option>
                ))}
            </select>
        </div>
    );
};
