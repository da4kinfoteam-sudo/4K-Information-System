export const GAD_PIMME_SIGNATORY_ROLES = [
    { key: 'prepared', label: 'Prepared by' },
    { key: 'reviewed', label: 'Reviewed by' },
    { key: 'approved', label: 'Approved by' },
] as const;

export const GAD_PIMME_SIGNATORY_FIELDS = [
    'prepared_by_name', 'prepared_by_position',
    'reviewed_by_name', 'reviewed_by_position',
    'approved_by_name', 'approved_by_position',
] as const;

export type GadPimmeSignatoryField = typeof GAD_PIMME_SIGNATORY_FIELDS[number];
export type GadPimmeSignatories = Record<GadPimmeSignatoryField, string>;
export type GadPimmeStoredSignatories = Partial<Record<GadPimmeSignatoryField, string | null>>;

export const getGadPimmeSignatories = (record?: GadPimmeStoredSignatories | null): GadPimmeSignatories =>
    Object.fromEntries(GAD_PIMME_SIGNATORY_FIELDS.map(field => [field, record?.[field] ?? ''])) as GadPimmeSignatories;

export const getGadPimmeSignatoryPayload = (signatories: GadPimmeSignatories) =>
    Object.fromEntries(GAD_PIMME_SIGNATORY_FIELDS.map(field => [field, signatories[field].trim() || null]));
