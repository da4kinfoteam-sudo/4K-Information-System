import React, { useEffect, useId, useMemo, useState } from 'react';
import { Activity, ActivityExpense, IPO, RefFundSource, Subproject, SubprojectDetail, User, filterYears, fundTypes, operatingUnits, otherActivityComponents, tiers } from '../../constants';
import {
    BudgetTransferSourceType,
    ParentActualField,
    TransferLine,
    PARENT_ACTUAL_FIELDS,
    buildActualAllocation,
    buildDestinationActualAllocation,
    submitBudgetItemTransfer,
    validateActualAllocation,
} from '../../lib/budgetItemTransfer';
import { getBudgetLineAmount } from '../../lib/budgetLineAdjustments';
import { getActualDisbursementSummary, getActualObligationSummary } from '../../lib/financialActualSummary';
import { resolveFundSourceUidFromLegacyLabel } from '../../lib/fundSources';
import { X } from 'lucide-react';

type SourceRecord = Subproject | Activity;
type MetadataDraft = Record<string, string>;

interface BudgetItemTransferDialogProps {
    sourceType: BudgetTransferSourceType;
    source: SourceRecord;
    selectedLines: TransferLine[];
    ipos: IPO[];
    fundSources: RefFundSource[];
    currentUser: User;
    canChangeOperatingUnit: boolean;
    onClose: () => void;
    onComplete: (result: Awaited<ReturnType<typeof submitBudgetItemTransfer>>) => void;
}

const metadataKeys = (sourceType: BudgetTransferSourceType) => sourceType === 'subproject'
    ? ['name', 'status', 'operatingUnit', 'fundingYear', 'fundType', 'fundSourceUid', 'tier', 'location', 'lat', 'lng', 'ipo_id', 'indigenousPeopleOrganization', 'packageType', 'startDate', 'estimatedCompletionDate', 'actualCompletionDate', 'remarks', 'accomplishmentRemarks']
    : ['name', 'status', 'operatingUnit', 'fundingYear', 'fundType', 'fundSourceUid', 'tier', 'date', 'endDate', 'description', 'location', 'lat', 'lng', 'facilitator', 'participating_ipo_ids', 'participatingIpos', 'participantsMale', 'participantsFemale', 'component', 'actualDate', 'actualEndDate', 'remarks'];

const toMetadataDraft = (source: SourceRecord, sourceType: BudgetTransferSourceType, ipos: IPO[], fundSources: RefFundSource[]): MetadataDraft => {
    const record = source as unknown as Record<string, unknown>;
    const draft = Object.fromEntries(metadataKeys(sourceType).map(key => [key, String(record[key] ?? '')]));
    draft.fundSourceUid = String(record.fundSourceUid || resolveFundSourceUidFromLegacyLabel(String(record.fundSource || ''), fundSources) || '');
    if (sourceType === 'subproject') {
        const linkedIpo = ipos.find(ipo => Number(ipo.id) === Number(record.ipo_id))
            || ipos.find(ipo => ipo.name === String(record.indigenousPeopleOrganization || ''));
        draft.ipo_id = linkedIpo ? String(linkedIpo.id) : (record.indigenousPeopleOrganization ? 'legacy' : '');
    } else {
        const activity = source as Activity;
        const linkedIds = activity.participating_ipo_ids?.length
            ? activity.participating_ipo_ids
            : (activity.participatingIpos || []).flatMap(name => {
                const ipo = ipos.find(item => item.name === name);
                return ipo ? [ipo.id] : [];
            });
        draft.participating_ipo_ids = linkedIds.map(String).join(',');
        draft.participatingIpos = (activity.participatingIpos || []).join('\n');
    }
    return draft;
};

const getLineLabel = (sourceType: BudgetTransferSourceType, line: TransferLine) => sourceType === 'subproject'
    ? (line as SubprojectDetail).particulars
    : (line as ActivityExpense).expenseParticular;

const getLineAmount = (sourceType: BudgetTransferSourceType, line: TransferLine) => sourceType === 'subproject'
    ? getBudgetLineAmount(line as SubprojectDetail)
    : getBudgetLineAmount(line as ActivityExpense);

const toInputDate = (value: string) => value ? value.slice(0, 10) : '';

const TransferField: React.FC<{
    label: string;
    name: string;
    value: string;
    type?: 'text' | 'date' | 'number' | 'textarea' | 'select';
    options?: Array<{ value: string; label: string }>;
    disabled?: boolean;
    required?: boolean;
    min?: number;
    max?: number;
    step?: number | 'any';
    onChange: (name: string, value: string) => void;
}> = ({ label, name, value, type = 'text', options = [], disabled = false, required = false, min, max, step, onChange }) => (
    <label className="form-field budget-transfer-dialog__field">
        <span className="form-label">{label}{required ? ' *' : ''}</span>
        {type === 'textarea' ? (
            <textarea className="form-control" rows={2} value={value} disabled={disabled} required={required} onChange={event => onChange(name, event.target.value)} />
        ) : type === 'select' ? (
            <select className="form-control" value={value} disabled={disabled} required={required} onChange={event => onChange(name, event.target.value)}>
                {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
        ) : (
            <input className="form-control" type={type} min={min} max={max} step={step} value={type === 'date' ? toInputDate(value) : value} disabled={disabled} required={required} onChange={event => onChange(name, event.target.value)} />
        )}
    </label>
);

const AllocationField: React.FC<{
    field: ParentActualField;
    original: number;
    destination: number;
    onChange: (key: string, value: number) => void;
}> = ({ field, original, destination, onChange }) => (
    <div className="budget-transfer-dialog__allocation-row">
        <span>{field.label}</span>
        <span>{original.toLocaleString()}</span>
        <input
            className="form-control"
            aria-label={`${field.label} allocated to destination`}
            type="number"
            min="0"
            max={original}
            step="1"
            value={destination}
            onChange={event => onChange(field.key, event.target.value === '' ? 0 : Number(event.target.value))}
        />
        <output>{Math.max(original - destination, 0).toLocaleString()}</output>
    </div>
);

export const BudgetItemTransferDialog: React.FC<BudgetItemTransferDialogProps> = ({
    sourceType, source, selectedLines, fundSources, currentUser, canChangeOperatingUnit, onClose, onComplete,
    ipos,
}) => {
    const titleId = useId();
    const [metadata, setMetadata] = useState(() => toMetadataDraft(source, sourceType, ipos, fundSources));
    const actualFields = PARENT_ACTUAL_FIELDS[sourceType];
    const [destinationActuals, setDestinationActuals] = useState<Record<string, number>>(() =>
        Object.fromEntries(actualFields.map(({ key }) => [key, 0])));
    const [reason, setReason] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const sourceActualValues = useMemo(() => Object.fromEntries(actualFields.map(({ key }) => [key, (source as unknown as Record<string, unknown>)[key]])), [actualFields, source]);
    const sourceActuals = useMemo(() => Object.fromEntries(actualFields.map(({ key }) => [key, Number(sourceActualValues[key] ?? 0)])), [actualFields, sourceActualValues]);
    const sourceRemainder = useMemo(() => buildActualAllocation(actualFields, sourceActualValues, destinationActuals), [actualFields, sourceActualValues, destinationActuals]);
    const scopeUnits = Array.from(new Set([...operatingUnits, source.operatingUnit])).filter(Boolean);
    const sourceFundSource = fundSources.find(option => option.uid === metadata.fundSourceUid);
    const yearOptions = Array.from(new Set([...filterYears, metadata.fundingYear])).filter(Boolean).sort();
    const sourceIpoName = (source as Subproject).indigenousPeopleOrganization;
    const ipoOptions = sourceType === 'subproject'
        ? [...ipos, ...(
            sourceIpoName && !ipos.some(ipo => ipo.name === sourceIpoName)
                ? [{ id: 0, name: sourceIpoName } as IPO]
                : []
        )]
        : [];

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !saving) onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose, saving]);

    const setField = (name: string, value: string) => setMetadata(previous => ({ ...previous, [name]: value }));
    const setAllocation = (key: string, value: number) => setDestinationActuals(previous => ({ ...previous, [key]: value }));

    const updateActivityIpos = (selectedIds: string[]) => {
        const names = selectedIds.flatMap(id => {
            const ipo = ipos.find(item => String(item.id) === id);
            return ipo ? [ipo.name] : [];
        });
        setMetadata(previous => ({
            ...previous,
            participating_ipo_ids: selectedIds.join(','),
            participatingIpos: names.join('\n'),
        }));
    };

    const buildDestinationMetadata = () => {
        const output: Record<string, unknown> = {};
        metadataKeys(sourceType).forEach(key => {
            const value = metadata[key] ?? '';
            if (key === 'fundingYear') {
                output[key] = value && Number.isFinite(Number(value)) ? Number(value) : null;
            } else if (key === 'ipo_id') {
                output[key] = value && value !== 'legacy' ? Number(value) : null;
            } else if (key === 'participating_ipo_ids') {
                output[key] = value ? value.split(',').filter(Boolean).map(Number).filter(Number.isFinite) : [];
            } else if (key === 'participatingIpos') {
                output[key] = value ? value.split('\n').filter(Boolean) : [];
            } else if (['participantsMale', 'participantsFemale'].includes(key)) {
                output[key] = value === '' ? 0 : Number(value);
            } else if (['lat', 'lng'].includes(key)) {
                output[key] = value === '' ? null : Number(value);
            } else if (['startDate', 'estimatedCompletionDate', 'actualCompletionDate', 'date', 'endDate', 'actualDate', 'actualEndDate'].includes(key)) {
                output[key] = value || null;
            } else if (key === 'fundSourceUid' || key === 'fundType' || key === 'tier') {
                output[key] = value || null;
            } else {
                output[key] = value;
            }
        });
        const fundSource = fundSources.find(option => option.uid === String(output.fundSourceUid || ''));
        if (fundSource) output.fundSource = fundSource.label;
        else if (Object.prototype.hasOwnProperty.call(output, 'fundSourceUid')) output.fundSource = null;
        if (sourceType === 'subproject') {
            const ipo = ipos.find(item => String(item.id) === String(output.ipo_id));
            if (ipo) output.indigenousPeopleOrganization = ipo.name;
            else if (metadata.ipo_id === 'legacy') output.indigenousPeopleOrganization = sourceIpoName;
            else if (output.ipo_id === null) output.indigenousPeopleOrganization = '';
        }
        return output;
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        const allocationError = validateActualAllocation(actualFields, sourceActualValues, destinationActuals, sourceRemainder);
        if (allocationError) {
            setError(allocationError);
            return;
        }
        if (!reason.trim()) {
            setError('Enter a reason for this transfer.');
            return;
        }
        if (!metadata.name.trim()) {
            setError('The destination name is required.');
            return;
        }

        setSaving(true);
        try {
            const result = await submitBudgetItemTransfer({
                sourceType,
                sourceId: source.id,
                selectedItemIds: selectedLines.map(line => String(line.id)),
                destinationMetadata: buildDestinationMetadata(),
                destinationActuals: buildDestinationActualAllocation(actualFields, sourceActualValues, destinationActuals),
                sourceActualRemainder: sourceRemainder,
                reason: reason.trim(),
                requestKey: crypto.randomUUID(),
                actorId: currentUser.id,
                actorPassword: currentUser.password || '',
            });
            onComplete(result);
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : 'The transfer could not be saved.');
        } finally {
            setSaving(false);
        }
    };

    const inputDateNames = sourceType === 'subproject'
        ? ['startDate', 'estimatedCompletionDate', 'actualCompletionDate']
        : ['date', 'endDate', 'actualDate', 'actualEndDate'];

    return (
        <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
            <section className="modal-card budget-transfer-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
                <header className="modal-card__header">
                    <div>
                        <h2 id={titleId}>Transfer budget items</h2>
                        <p>{source.name} · {selectedLines.length} selected</p>
                    </div>
                    <button className="modal-card__close" type="button" aria-label="Close transfer dialog" disabled={saving} onClick={onClose}><X aria-hidden="true" /></button>
                </header>
                <form onSubmit={handleSubmit}>
                    <div className="budget-transfer-dialog__body">
                        <section className="budget-transfer-dialog__section" aria-labelledby={`${titleId}-destination`}>
                            <h3 id={`${titleId}-destination`}>Destination preview</h3>
                            <div className="budget-transfer-dialog__fields">
                                <TransferField label="Name" name="name" value={metadata.name} required onChange={setField} />
                                <TransferField label="Status" name="status" value={metadata.status} type="select" required options={['Proposed', 'Ongoing', 'Completed'].map(value => ({ value, label: value }))} onChange={setField} />
                                <TransferField label="Operating Unit" name="operatingUnit" value={metadata.operatingUnit} type="select" disabled={!canChangeOperatingUnit} options={scopeUnits.map(value => ({ value, label: value }))} onChange={setField} />
                                <TransferField label="Fund Year" name="fundingYear" value={metadata.fundingYear} type="select" options={[{ value: '', label: 'Not specified' }, ...yearOptions.map(value => ({ value, label: value }))]} onChange={setField} />
                                <TransferField label="Fund Type" name="fundType" value={metadata.fundType} type="select" options={[{ value: '', label: 'Not specified' }, ...fundTypes.map(value => ({ value, label: value }))]} onChange={setField} />
                                <TransferField label="Fund Source" name="fundSourceUid" value={metadata.fundSourceUid} type="select" options={[{ value: '', label: 'Not specified' }, ...fundSources.filter(item => item.is_active || item.uid === metadata.fundSourceUid).map(item => ({ value: item.uid, label: item.label }))]} onChange={setField} />
                                <TransferField label="Tier" name="tier" value={metadata.tier} type="select" options={[{ value: '', label: 'Not specified' }, ...tiers.map(value => ({ value, label: value }))]} onChange={setField} />
                                {sourceType === 'subproject' ? (
                                    <>
                                        <TransferField label="Location" name="location" value={metadata.location} onChange={setField} />
                                        <TransferField label="Latitude" name="lat" value={metadata.lat} type="number" min={-90} max={90} step="any" onChange={setField} />
                                        <TransferField label="Longitude" name="lng" value={metadata.lng} type="number" min={-180} max={180} step="any" onChange={setField} />
                                        <label className="form-field budget-transfer-dialog__field">
                                            <span className="form-label">IPO</span>
                                            <select className="form-control" value={metadata.ipo_id} onChange={event => {
                                                const ipo = ipos.find(item => String(item.id) === event.target.value);
                                                setMetadata(previous => ({
                                                    ...previous,
                                                    ipo_id: event.target.value,
                                                    indigenousPeopleOrganization: ipo?.name || sourceIpoName || '',
                                                }));
                                            }}>
                                                <option value="">No IPO selected</option>
                                                {ipoOptions.map(ipo => <option key={ipo.id || `legacy-${ipo.name}`} value={ipo.id ? String(ipo.id) : 'legacy'}>{ipo.name}</option>)}
                                            </select>
                                        </label>
                                        <TransferField label="Package Type" name="packageType" value={metadata.packageType} onChange={setField} />
                                    </>
                                ) : (
                                    <>
                                        <TransferField label="Location" name="location" value={metadata.location} onChange={setField} />
                                        <TransferField label="Latitude" name="lat" value={metadata.lat} type="number" min={-90} max={90} step="any" onChange={setField} />
                                        <TransferField label="Longitude" name="lng" value={metadata.lng} type="number" min={-180} max={180} step="any" onChange={setField} />
                                        <TransferField label="Component" name="component" value={metadata.component} type="select" options={otherActivityComponents.map(value => ({ value, label: value }))} onChange={setField} />
                                        <TransferField label="Facilitator" name="facilitator" value={metadata.facilitator} onChange={setField} />
                                        <TransferField label="Target male participants" name="participantsMale" value={metadata.participantsMale} type="number" min={0} step={1} onChange={setField} />
                                        <TransferField label="Target female participants" name="participantsFemale" value={metadata.participantsFemale} type="number" min={0} step={1} onChange={setField} />
                                        <TransferField label="Description" name="description" value={metadata.description} type="textarea" onChange={setField} />
                                        <label className="form-field budget-transfer-dialog__field">
                                            <span className="form-label">Participating IPOs</span>
                                            <select className="form-control" multiple value={(metadata.participating_ipo_ids || '').split(',').filter(Boolean)} onChange={event => updateActivityIpos(Array.from(event.currentTarget.selectedOptions).map((option: HTMLOptionElement) => option.value))}>
                                                {ipos.map(ipo => <option key={ipo.id} value={String(ipo.id)}>{ipo.name}</option>)}
                                            </select>
                                        </label>
                                    </>
                                )}
                                {inputDateNames.map(name => (
                                    <TransferField key={name} label={name.replace(/([A-Z])/g, ' $1').replace(/^./, text => text.toUpperCase())} name={name} value={metadata[name]} type="date" onChange={setField} />
                                ))}
                                <TransferField label="Remarks" name="remarks" value={metadata.remarks} type="textarea" onChange={setField} />
                                {sourceType === 'subproject' && <TransferField label="Accomplishment Remarks" name="accomplishmentRemarks" value={metadata.accomplishmentRemarks} type="textarea" onChange={setField} />}
                            </div>
                            {sourceType === 'activity' && <p className="budget-transfer-dialog__type-note">Activity type is preserved: <strong>{(source as Activity).type}</strong></p>}
                            {sourceFundSource && <p className="budget-transfer-dialog__type-note">Fund Source UID: {sourceFundSource.uid}</p>}
                        </section>

                        <section className="budget-transfer-dialog__section" aria-labelledby={`${titleId}-items`}>
                            <h3 id={`${titleId}-items`}>Selected items</h3>
                            <div className="data-table-scroll budget-transfer-dialog__items">
                                <table className="data-table">
                                    <thead><tr><th>Item</th><th>UACS</th><th>Target / Quantity</th><th>Actual Physical Delivery</th><th className="data-table__numeric">Target Amount</th><th className="data-table__numeric">Actual Obligation</th><th className="data-table__numeric">Actual Disbursement</th></tr></thead>
                                    <tbody>{selectedLines.map(line => (
                                        <tr key={line.id}>
                                            <td className="data-table__primary">{getLineLabel(sourceType, line)}</td>
                                            <td>{line.uacsCode || '-'}</td>
                                            <td>{sourceType === 'subproject'
                                                ? `${(line as SubprojectDetail).numberOfUnits ?? 0} ${(line as SubprojectDetail).unitOfMeasure || ''}`
                                                : (line as ActivityExpense).objectType || '-'}</td>
                                            <td>{sourceType === 'subproject'
                                                ? `${(line as SubprojectDetail).actualNumberOfUnits ?? 0} ${(line as SubprojectDetail).unitOfMeasure || ''} · ${(line as SubprojectDetail).actualDeliveryDate || 'No date'}`
                                                : 'See activity-level accomplishment'}</td>
                                            <td className="data-table__numeric">{getLineAmount(sourceType, line).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}</td>
                                            <td className="data-table__numeric">{getActualObligationSummary(line as SubprojectDetail | ActivityExpense).amount.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}</td>
                                            <td className="data-table__numeric">{getActualDisbursementSummary(line as SubprojectDetail | ActivityExpense).amount.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}</td>
                                        </tr>
                                    ))}</tbody>
                                </table>
                            </div>
                        </section>

                        <section className="budget-transfer-dialog__section" aria-labelledby={`${titleId}-allocation`}>
                            <h3 id={`${titleId}-allocation`}>Parent physical actual allocation</h3>
                            <div className="budget-transfer-dialog__allocation-heading"><span>Measure</span><span>Original</span><span>Destination</span><span>Source remainder</span></div>
                            {actualFields.map(field => (
                                <AllocationField key={field.key} field={field} original={sourceActuals[field.key] || 0} destination={destinationActuals[field.key] || 0} onChange={setAllocation} />
                            ))}
                        </section>

                        <label className="form-field budget-transfer-dialog__reason">
                            <span className="form-label">Transfer reason *</span>
                            <textarea className="form-control" rows={3} value={reason} required onChange={event => setReason(event.target.value)} />
                        </label>
                        {error && <p className="budget-transfer-dialog__error" role="alert">{error}</p>}
                    </div>
                    <footer className="modal-card__footer budget-transfer-dialog__footer">
                        <button className="btn btn-secondary" type="button" disabled={saving} onClick={onClose}>Cancel</button>
                        <button className="btn btn-primary" type="submit" disabled={saving || !selectedLines.length}>
                            {saving ? 'Saving…' : currentUser.requires_approver ? 'Submit transfer request' : 'Transfer items'}
                        </button>
                    </footer>
                </form>
            </section>
        </div>
    );
};
