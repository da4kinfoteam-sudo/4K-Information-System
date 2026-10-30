// Author: 4K
import React from 'react';
import { getActivityDisplayTitle, normalizeActivityTitle } from '../../lib/activityTitles';
import { getActivityBudgetSummary } from '../../lib/activitySupplementalBudget';
import { 
    Subproject, Activity, IPO, Commodity, OfficeRequirement, StaffingRequirement, OtherProgramExpense,
    SubprojectDetail, ActivityExpense, fundTypes, tiers, objectTypes, ObjectType, philippineRegions, operatingUnits, Tier, FundType, RefFundSource
} from '../../constants';
import { parseLocation } from '../LocationPicker';
import { supabase } from '../../supabaseClient';
import { parseOfficeRequirementRow } from '../program_management/OfficeRequirementsTab';
import { parseStaffingRequirementRow } from '../program_management/StaffingRequirementsTab';
import { parseOtherExpenseRow } from '../program_management/OtherExpensesTab';
import { normalizeImportedCommodity } from '../../lib/commodityProfile';
import { parseImportedIpoIndicators } from '../../lib/ipoProfileIndicators';
import { getBudgetLineAmount, isBudgetLineExcludedFromTargets, isParentExcludedFromTargets } from '../../lib/budgetLineAdjustments';
import { DEFAULT_FUND_SOURCE_UID, getFundSourceByUid, getFundSourceLabel, getNewSubprojectDefaultFundSource, normalizeFundSourceLabel, resolveFundSourceUidFromLegacyLabel } from '../../lib/fundSources';
import { exportTargetRows, importedBudgetItemId, importedOptionalBudgetAmount, targetWorkbookImporter, TARGET_SHEET_HEADERS, TARGET_SHEET_NAMES } from '../../lib/budgetTargetExcel';
import type { TargetPlanOwner } from '../../lib/budgetTargetSchedules';
import { requireIndependentTargetSupport } from '../../lib/budgetTargetPersistence';

declare const XLSX: any;

const appendTargetSheets = (workbook: any, owners: Array<{ uid?: string; line: TargetPlanOwner }>) => {
    for (const stage of ['obligation', 'disbursement'] as const) XLSX.utils.book_append_sheet(workbook,
        XLSX.utils.json_to_sheet(exportTargetRows(owners, stage), { header: TARGET_SHEET_HEADERS }), TARGET_SHEET_NAMES[stage]);
};
const targetImporter = (workbook: any) => targetWorkbookImporter(Object.fromEntries(
    (['obligation', 'disbursement'] as const).map(stage => [stage, workbook.Sheets[TARGET_SHEET_NAMES[stage]] ? XLSX.utils.sheet_to_json(workbook.Sheets[TARGET_SHEET_NAMES[stage]]) : []]),
) as Parameters<typeof targetWorkbookImporter>[0]);

// Helper to map short codes/numbers to full Region names
export const resolveRegion = (input: string | number | undefined): string => {
    if (!input) return '';
    const s = String(input).toUpperCase().trim();
    
    // Direct match check (case insensitive)
    const exactMatch = philippineRegions.find(r => r.toUpperCase() === s);
    if (exactMatch) return exactMatch;

    // Mapping for Short Codes / Numbers
    if (s === 'NCR' || s === '130000000') return 'National Capital Region (NCR)';
    if (s === 'CAR') return 'Cordillera Administrative Region (CAR)';
    if (s === '1' || s === 'I') return 'Region I (Ilocos Region)';
    if (s === '2' || s === 'II') return 'Region II (Cagayan Valley)';
    if (s === '3' || s === 'III') return 'Region III (Central Luzon)';
    if (['4A', '4-A', 'IV-A', 'IVA'].includes(s)) return 'Region IV-A (CALABARZON)';
    if (['4B', '4-B', 'IV-B', 'IVB', 'MIMAROPA'].includes(s)) return 'MIMAROPA Region';
    if (s === '5' || s === 'V') return 'Region V (Bicol Region)';
    if (s === '6' || s === 'VI') return 'Region VI (Western Visayas)';
    if (s === '7' || s === 'VII') return 'Region VII (Central Visayas)';
    if (s === '8' || s === 'VIII') return 'Region VIII (Eastern Visayas)';
    if (s === '9' || s === 'IX') return 'Region IX (Zamboanga Peninsula)';
    if (s === '10' || s === 'X') return 'Region X (Northern Mindanao)';
    if (s === '11' || s === 'XI') return 'Region XI (Davao Region)';
    if (s === '12' || s === 'XII') return 'Region XII (SOCCSKSARGEN)';
    if (['13', 'XIII', 'CARAGA'].includes(s)) return 'Region XIII (Caraga)';
    if (['BARMM', 'ARMM'].includes(s)) return 'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)';
    if (s === 'NIR') return 'Negros Island Region (NIR)'; 

    return String(input).trim();
};

// Helper to map short codes/numbers to Operating Units
export const resolveOperatingUnit = (input: string | number | undefined): string => {
    if (!input) return '';
    const s = String(input).toUpperCase().trim();
    
    // Direct match check (case insensitive against existing operatingUnits)
    const exactMatch = operatingUnits.find(ou => ou.toUpperCase() === s);
    if (exactMatch) return exactMatch;

    // Mapping for Short Codes / Numbers
    if (s === 'NPMO') return 'NPMO';
    if (s === 'CAR') return 'RPMO CAR';
    if (s === '1' || s === 'I') return 'RPMO 1';
    if (s === '2' || s === 'II') return 'RPMO 2';
    if (s === '3' || s === 'III') return 'RPMO 3';
    if (['4A', '4-A', 'IV-A', 'IVA'].includes(s)) return 'RPMO 4A';
    if (['4B', '4-B', 'IV-B', 'IVB', 'MIMAROPA'].includes(s)) return 'RPMO 4B';
    if (s === '5' || s === 'V') return 'RPMO 5';
    if (s === '6' || s === 'VI') return 'RPMO 6';
    if (s === '7' || s === 'VII') return 'RPMO 7';
    if (s === '8' || s === 'VIII') return 'RPMO 8';
    if (s === '9' || s === 'IX') return 'RPMO 9';
    if (s === '10' || s === 'X') return 'RPMO 10';
    if (s === '11' || s === 'XI') return 'RPMO 11';
    if (s === '12' || s === 'XII') return 'RPMO 12';
    if (['13', 'XIII', 'CARAGA'].includes(s)) return 'RPMO 13';
    if (['NIR', 'NEGROS'].includes(s)) return 'RPMO NIR';

    return String(input).trim();
};

// Helper to resolve Tier input (1 -> Tier 1, 2 -> Tier 2)
export const resolveTier = (input: string | number | undefined): Tier | undefined => {
    if (input === undefined || input === null) return undefined;
    const s = String(input).trim().toLowerCase();
    
    if (s === '1' || s === 'tier 1' || s === 'tier1') return 'Tier 1';
    if (s === '2' || s === 'tier 2' || s === 'tier2') return 'Tier 2';
    
    // Check if it matches existing types exactly (case sensitive fallback)
    if (tiers.includes(input as Tier)) return input as Tier;
    
    return undefined;
};

export const resolveImportFundSource = (uid: string, label: string, references: RefFundSource[]) => {
    if (uid) {
        const byUid = getFundSourceByUid(uid, references);
        return byUid?.is_active ? byUid : undefined;
    }
    if (label) {
        const normalized = normalizeFundSourceLabel(label);
        const labelMatches = references.filter(source => normalizeFundSourceLabel(source.label) === normalized);
        if (labelMatches.length > 1) return undefined;
        if (labelMatches.length === 1) return labelMatches[0].is_active ? labelMatches[0] : undefined;
        const legacyUid = resolveFundSourceUidFromLegacyLabel(label, references);
        const legacySource = legacyUid ? getFundSourceByUid(legacyUid, references) : undefined;
        return legacySource?.is_active ? legacySource : undefined;
    }
    return getNewSubprojectDefaultFundSource(references);
};

// Helper to parse various date/month formats to YYYY-MM-01
const parseMonthToDate = (input: any): string => {
    if (!input) return '';
    
    // If it's a number (Excel serial date)
    if (typeof input === 'number') {
        // Excel base date is 1899-12-30
        const date = new Date(Math.round((input - 25569) * 86400 * 1000));
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
    }
    
    const str = String(input).trim();
    
    // Try YYYY-MM-DD or YYYY-MM
    if (str.match(/^\d{4}-\d{2}/)) {
        return str.substring(0, 7) + '-01';
    }
    
    // Try Month Year (e.g. "January 2024", "Jan 2024", "Jan-24")
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
    }
    
    return '';
};

// --- SUBPROJECTS ---

export const downloadSubprojectsReport = (subprojects: Subproject[], fundSources: RefFundSource[] = []) => {
    const calculateTotalBudget = (details: SubprojectDetail[], status?: Subproject['status'], parent?: Subproject) => {
        if (isParentExcludedFromTargets(parent)) return 0;
        return details.reduce((total, item) => total + (isBudgetLineExcludedFromTargets(item, status) ? 0 : item.pricePerUnit * item.numberOfUnits), 0);
    };

    const data = subprojects.map(s => ({
        UID: s.uid,
        Name: s.name,
        IPO: s.indigenousPeopleOrganization,
        Location: s.location,
        Status: s.status,
        'Fund Year': s.fundingYear,
        'Fund Type': s.fundType,
        'Fund Source UID': s.fundSourceUid ?? '',
        'Fund Source': getFundSourceLabel(s, fundSources),
        'Tier': s.tier,
        Budget: calculateTotalBudget(s.details, s.status, s),
        'End Date': s.estimatedCompletionDate,
        'Actual Male Beneficiaries': s.actualMaleBeneficiaries ?? '',
        'Actual Female Beneficiaries': s.actualFemaleBeneficiaries ?? '',
        'Actual 4Ps Beneficiaries': s.actualFourPsBeneficiaries ?? '',
        'Operating Unit': s.operatingUnit
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Subprojects");
    const schedules = subprojects.flatMap(parent => parent.details.map(row => ({
        uid: parent.uid, name: parent.name, detail_id: row.id, detail_budgetItemGroupId: row.budgetItemGroupId || '',
        detail_type: row.type, detail_particulars: row.particulars, detail_unitOfMeasure: row.unitOfMeasure,
        detail_uacsCode: row.uacsCode, detail_pricePerUnit: row.pricePerUnit, detail_numberOfUnits: row.numberOfUnits,
        detail_obligationMonth: row.obligationMonth, detail_deliveryDate: row.deliveryDate, detail_disbursementMonth: row.disbursementMonth,
        detail_targetScheduleVersion: row.targetScheduleVersion ?? '',
        detail_amount_is_set: Object.hasOwn(row, 'amount'), detail_amount: (row as any).amount ?? '',
    })));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(schedules), 'Budget Schedules');
    const importRows = subprojects.flatMap(parent => (parent.details.length ? parent.details : [null]).map(row => ({
        uid: parent.uid, name: parent.name, indigenousPeopleOrganization: parent.indigenousPeopleOrganization,
        status: 'Proposed', packageType: parent.packageType, estimatedCompletionDate: parent.estimatedCompletionDate,
        fundingYear: parent.fundingYear, fundType: parent.fundType, fundSourceUid: parent.fundSourceUid || '', fundSource: parent.fundSource || '', tier: parent.tier, operatingUnit: parent.operatingUnit,
        ...(row ? { detail_id: row.id, detail_budgetItemGroupId: row.budgetItemGroupId || '', detail_type: row.type, detail_particulars: row.particulars,
            detail_deliveryDate: row.deliveryDate, detail_unitOfMeasure: row.unitOfMeasure, detail_pricePerUnit: row.pricePerUnit, detail_numberOfUnits: row.numberOfUnits,
            detail_uacsCode: row.uacsCode, detail_obligationMonth: row.obligationMonth, detail_disbursementMonth: row.disbursementMonth, detail_targetScheduleVersion: row.targetScheduleVersion ?? '',
            detail_amount_is_set: Object.hasOwn(row, 'amount'), detail_amount: (row as any).amount ?? '' } : {}),
    })));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(importRows), 'Subprojects Data');
    appendTargetSheets(wb, subprojects.flatMap(parent => parent.details.map(line => ({ uid: parent.uid, line }))));
    XLSX.writeFile(wb, "Subprojects_Report.xlsx");
};

export const downloadSubprojectsTemplate = () => {
    const headers = [
        'uid', 'name', 'indigenousPeopleOrganization', 'status', 'packageType', 
        'estimatedCompletionDate', 'actualCompletionDate', 'actualMaleBeneficiaries', 'actualFemaleBeneficiaries', 'actualFourPsBeneficiaries', 'fundingYear', 'fundType', 'fundSourceUid', 'fundSource', 'tier', 'operatingUnit', 'remarks',
        'detail_type', 'detail_particulars', 'detail_deliveryDate', 'detail_unitOfMeasure', 'detail_pricePerUnit', 'detail_numberOfUnits', 
        'detail_uacsCode', 'detail_obligationMonth', 'detail_disbursementMonth', 'detail_budgetItemGroupId', 'detail_id', 'detail_targetScheduleVersion', 'detail_amount_is_set', 'detail_amount'
    ];

    const exampleData = [
        {
            uid: 'SP-TEMP-001',
            name: 'Sample Coffee Production',
            indigenousPeopleOrganization: 'Samahan ng mga Katutubong Dumagat',
            status: 'Ongoing',
            packageType: 'Package 1',
            estimatedCompletionDate: 'June 2024',
            actualCompletionDate: '',
            actualMaleBeneficiaries: '',
            actualFemaleBeneficiaries: '',
            actualFourPsBeneficiaries: '',
            fundingYear: 2024,
            fundType: 'Current',
            fundSourceUid: DEFAULT_FUND_SOURCE_UID,
            fundSource: '4K Fund',
            tier: 'Tier 1',
            operatingUnit: 'RPMO 4A',
            remarks: 'Sample upload with multiple items',
            detail_type: 'Equipment',
            detail_particulars: 'Coffee Roaster',
            detail_deliveryDate: 'March 2024',
            detail_unitOfMeasure: 'unit',
            detail_pricePerUnit: 150000,
            detail_numberOfUnits: 1,
            detail_uacsCode: '10605030-00',
            detail_obligationMonth: 'February 2024',
            detail_disbursementMonth: 'March 2024'
        }
    ];

    const instructions = [
        ["Column", "Description"],
        ["uid", "Unique Identifier. REQUIRED. Rows with the same UID will be grouped into one subproject."],
        ["name", "Name of the subproject."],
        ["indigenousPeopleOrganization", "Name of the IPO. Location will be automatically derived from the system's IPO list."],
        ["status", "Proposed, Ongoing, Completed, or Cancelled."],
        ["packageType", "Package 1, Package 2, etc."],
        ["estimatedCompletionDate", "Month Year (e.g., June 2024)"],
        ["actualCompletionDate", "Month Year (Optional)"],
        ["actualMaleBeneficiaries", "Optional nonnegative whole number. Leave blank when not reported."],
        ["actualFemaleBeneficiaries", "Optional nonnegative whole number. Leave blank when not reported."],
        ["actualFourPsBeneficiaries", "Optional nonnegative whole number. Leave blank when not reported."],
        ["fundingYear", "Year (e.g., 2024)"],
        ["fundType", "Current, Continuing, or Insertion"],
        ["fundSourceUid", "Canonical Fund Source UID. Prefer this column when importing; UID values must be active references."],
        ["fundSource", "Current Fund Source label for compatibility. Existing labels are matched case-insensitively; leave blank only when the legacy record has no Fund Source."],
        ["tier", "Tier 1 or Tier 2"],
        ["operatingUnit", "e.g., RPMO 4A. If specified, this takes precedence over your current account's OU."],
        ["remarks", "Optional remarks"],
        ["detail_type", "Item Type (e.g., Equipment, Livestock, etc.)"],
        ["detail_particulars", "Specific item name."],
        ["detail_deliveryDate", "Month Year (e.g., March 2024)"],
        ["detail_unitOfMeasure", "pcs, kgs, unit, lot, heads"],
        ["detail_pricePerUnit", "Number"],
        ["detail_numberOfUnits", "Number"],
        ["detail_uacsCode", "Specific UACS Code. Object Type and Expense Particular will be derived from this code."],
        ["detail_obligationMonth", "Month Year (e.g., February 2024)"],
        ["detail_disbursementMonth", "Month Year (e.g., March 2024)"],
        ["detail_budgetItemGroupId", "Optional shared item identity within this Subproject. Leave blank for independent legacy rows."],
        ["detail_id / detail_targetScheduleVersion", "For independent plans, use a unique whole-number detail_id within each UID and set detail_targetScheduleVersion to 2. Blank version retains legacy scalar target dates."],
        ["Obligation Targets / Disbursement Targets", "Enter each stage independently: uid, item_id (matching detail_id), schedule_id (unique within the item), month (YYYY-MM-DD), amount. Empty stages are allowed. Do not repeat the cost/delivery row for financial dates."],
        ["Report re-import", "The report includes a Subprojects Data planning sheet with Proposed status and no copied actual ledgers. Existing UIDs are skipped; importing does not update existing records."]
    ];

    const wb = XLSX.utils.book_new();
    const ws_data = XLSX.utils.json_to_sheet(exampleData, { header: headers });
    const ws_instructions = XLSX.utils.aoa_to_sheet(instructions);

    XLSX.utils.book_append_sheet(wb, ws_data, "Subprojects Data");
    XLSX.utils.book_append_sheet(wb, ws_instructions, "Instructions");
    appendTargetSheets(wb, []);

    XLSX.writeFile(wb, "Subprojects_Upload_Template.xlsx");
};

export const handleSubprojectsUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    subprojects: Subproject[],
    setSubprojects: React.Dispatch<React.SetStateAction<Subproject[]>>,
    ipos: IPO[],
    logAction: (action: string, details: string, ipoName?: string) => void,
    setIsUploading: (val: boolean) => void,
    uacsCodes: any,
    currentUser: any,
    canChooseOperatingUnit = false,
    fundSources: RefFundSource[] = [],
    replaceSubprojects?: (nextData: Subproject[]) => void
) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = event.target?.result;
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.Sheets['Subprojects Data'] ? 'Subprojects Data' : workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];
            const targets = targetImporter(workbook);

            const groupedData = new Map<string, any>();
            let maxId = subprojects.reduce((max, s) => Math.max(max, s.id), 0);
            const currentTimestamp = new Date().toISOString();

            // Track existing UIDs to prevent duplicates
            const existingUids = new Set(subprojects.map(s => s.uid));
            let skippedCount = 0;
            const invalidFundSourceRows: string[] = [];

            jsonData.forEach((row: any, index: number) => {
                const uid = String(row.uid || '').trim();
                if (!uid) return; 

                const sourceLabelInput = row.fundSource ?? row['Fund Source'] ?? row.fund_source;
                const sourceUidInput = row.fundSourceUid ?? row['Fund Source UID'] ?? row.fund_source_uid;
                const rawFundSource = sourceLabelInput == null ? '' : String(sourceLabelInput).trim();
                const rawFundSourceUid = sourceUidInput == null ? '' : String(sourceUidInput).trim();
                const fundSource = resolveImportFundSource(rawFundSourceUid, rawFundSource, fundSources);
                if (!fundSource) {
                    invalidFundSourceRows.push(`row ${index + 2}: ${rawFundSourceUid || rawFundSource || 'no active default Fund Source'}`);
                    return;
                }
                
                // Skip rows that belong to already existing subprojects
                if (existingUids.has(uid)) {
                    // Only increment count if we haven't seen this UID in this loop yet
                    // (since multiple rows can have same UID)
                    if (!groupedData.has(uid)) skippedCount++;
                    return; 
                }

                if (!groupedData.has(uid)) {
                    maxId++;
                    
                    // Lookup IPO for Location
                    const ipoName = String(row.indigenousPeopleOrganization || '').trim();
                    const matchedIpo = ipos.find(i => i.name === ipoName);
                    const locationString = matchedIpo ? matchedIpo.location : '';

                    // Only All-OU editors may assign the OU supplied by the workbook.
                    const rawOU = row.operatingUnit ? String(row.operatingUnit) : undefined;
                    const operatingUnit = canChooseOperatingUnit && rawOU
                        ? resolveOperatingUnit(rawOU)
                        : (currentUser?.operatingUnit || '');

                    groupedData.set(uid, {
                        id: maxId, // Only for offline use, stripped before Supabase insert
                        uid: uid,
                        name: String(row.name),
                        location: locationString,
                        indigenousPeopleOrganization: ipoName,
                        ipo_id: matchedIpo?.id,
                        status: row.status,
                        packageType: row.packageType,
                        startDate: `${row.fundingYear || new Date().getFullYear()}-01-01`, // Default since start date is removed
                        estimatedCompletionDate: parseMonthToDate(row.estimatedCompletionDate),
                        actualCompletionDate: row.actualCompletionDate ? parseMonthToDate(row.actualCompletionDate) : undefined,
                        actualMaleBeneficiaries: row.actualMaleBeneficiaries === '' || row.actualMaleBeneficiaries == null ? null : Math.max(0, Math.trunc(Number(row.actualMaleBeneficiaries))),
                        actualFemaleBeneficiaries: row.actualFemaleBeneficiaries === '' || row.actualFemaleBeneficiaries == null ? null : Math.max(0, Math.trunc(Number(row.actualFemaleBeneficiaries))),
                        actualFourPsBeneficiaries: row.actualFourPsBeneficiaries === '' || row.actualFourPsBeneficiaries == null ? null : Math.max(0, Math.trunc(Number(row.actualFourPsBeneficiaries))),
                        fundingYear: Number(row.fundingYear),
                        fundType: row.fundType,
                        fundSourceUid: fundSource?.uid || null,
                        fundSource: fundSource?.label || null,
                        tier: resolveTier(row.tier),
                        operatingUnit: operatingUnit,
                        encodedBy: currentUser?.fullName || 'System Upload',
                        remarks: row.remarks,
                        lat: matchedIpo?.lat || 14.5995 + (Math.random() * 0.1 - 0.05), 
                        lng: matchedIpo?.lng || 120.9842 + (Math.random() * 0.1 - 0.05),
                        details: [],
                        subprojectCommodities: [],
                        created_at: currentTimestamp,
                        updated_at: currentTimestamp
                    });
                }

                const subproject = groupedData.get(uid);
                
                if (row.detail_particulars && subproject) {
                    let uacsCode = String(row.detail_uacsCode || '').trim();
                    let objectType = 'MOOE'; // Default
                    let expenseParticular = '';

                    // Derive Object Type and Expense Particular from UACS Code
                    if (uacsCodes && uacsCode) {
                        const normalizedUpload = uacsCode.replace(/[^a-zA-Z0-9]/g, '');
                        let matchFound = false;

                        outerLoop:
                        for (const ot of Object.keys(uacsCodes)) {
                            for (const part of Object.keys(uacsCodes[ot])) {
                                const validCodes = Object.keys(uacsCodes[ot][part]);
                                const match = validCodes.find(c => c === uacsCode || c.replace(/[^a-zA-Z0-9]/g, '') === normalizedUpload);
                                if (match) {
                                    uacsCode = match; // Canonical code
                                    objectType = ot;
                                    expenseParticular = part;
                                    matchFound = true;
                                    break outerLoop;
                                }
                            }
                        }
                    }

                    const detailId = importedBudgetItemId(row.detail_id, Date.now() + index);
                    if (subproject.details.some(detail => detail.id === detailId)) throw new Error(`Row ${index + 2}: Duplicate budget item ID.`);
                    subproject.details.push({
                        ...targets.read(uid, detailId, row.detail_targetScheduleVersion),
                        id: detailId,
                        ...importedOptionalBudgetAmount(row.detail_amount_is_set, row.detail_amount),
                        budgetItemGroupId: String(row.detail_budgetItemGroupId || '').trim() || undefined,
                        type: row.detail_type,
                        particulars: row.detail_particulars,
                        deliveryDate: parseMonthToDate(row.detail_deliveryDate),
                        unitOfMeasure: row.detail_unitOfMeasure,
                        pricePerUnit: Number(row.detail_pricePerUnit),
                        numberOfUnits: Number(row.detail_numberOfUnits),
                        objectType: objectType,
                        expenseParticular: expenseParticular,
                        uacsCode: uacsCode,
                        obligationMonth: parseMonthToDate(row.detail_obligationMonth),
                        disbursementMonth: parseMonthToDate(row.detail_disbursementMonth)
                    });
                }
            });

            if (invalidFundSourceRows.length > 0) {
                alert(`Import cancelled. These Fund Source values do not match an active reference: ${invalidFundSourceRows.join(', ')}. Use an active Fund Source UID or label from References.`);
                return;
            }

            const newSubprojects = Array.from(groupedData.values());
            targets.assertUsed(existingUids);

            if (newSubprojects.length > 0) {
                if (supabase) {
                    if (!replaceSubprojects) throw new Error('Local synchronization is unavailable. Reload before importing.');
                    await requireIndependentTargetSupport(newSubprojects.flatMap(parent => parent.details || []));
                    // Explicit insert to prevent doubling and ID issues
                    // Remove ID so Postgres auto-generates it based on sequence
                    const payload = newSubprojects.map(({ id, ...rest }) => rest);
                    const { data, error } = await supabase.from('subprojects').insert(payload).select();
                    
                    if (error) {
                        console.error("Error inserting subprojects:", error);
                        alert(`Error inserting data: ${error.message}`);
                    } else if (data) {
                        logAction('Imported Subprojects', `Imported ${data.length} subprojects from Excel`);
                        // Confirmed rows reconcile locally; never send them through a database-writing setter.
                        if (replaceSubprojects) replaceSubprojects([...subprojects, ...(data as Subproject[])]);
                        let msg = `${data.length} subprojects imported successfully!`;
                        if (skippedCount > 0) msg += ` (${skippedCount} duplicates skipped)`;
                        alert(msg);
                    }
                } else {
                    if (replaceSubprojects) replaceSubprojects([...subprojects, ...(newSubprojects as Subproject[])]);
                    else setSubprojects(prev => [...prev, ...newSubprojects]);
                    let msg = `${newSubprojects.length} subprojects imported locally!`;
                    if (skippedCount > 0) msg += ` (${skippedCount} duplicates skipped)`;
                    alert(msg);
                }
            } else if (skippedCount > 0) {
                alert(`All ${skippedCount} items in the file were skipped because they already exist in the system (Duplicate UIDs).`);
            } else {
                alert("No valid data found to import.");
            }

        } catch (error: any) {
            console.error("Error processing XLSX file:", error);
            alert(`Failed to import file. ${error.message}`);
        } finally {
            setIsUploading(false);
            if(e.target) e.target.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
};


// --- ACTIVITIES ---

export const downloadActivitiesReport = (activities: Activity[], fundSources: RefFundSource[]) => {
    const dataToExport = activities.map(a => ({
        'UID': a.uid || '',
        'Type': a.type,
        'Component': a.component,
        'Activity Name': getActivityDisplayTitle(a),
        'name': a.name,
        'activity_title': normalizeActivityTitle(a.activity_title) || '',
        'Date': a.date,
        'Location': a.location,
        'Male Participants': a.participantsMale,
        'Female Participants': a.participantsFemale,
        'Total Budget': getActivityBudgetSummary(a).target,
        'Original Allocation': getActivityBudgetSummary(a).original ?? '',
        'Supplemental Budget': getActivityBudgetSummary(a).supplemental,
        'Current Active Budget': getActivityBudgetSummary(a).current,
        'Funding Year': a.fundingYear,
        'Fund Type': a.fundType,
        'Tier': a.tier,
        'Fund Source UID': a.fundSourceUid || '',
        'Fund Source': getFundSourceLabel(a, fundSources),
        'Operating Unit': a.operatingUnit,
        'Encoded By': a.encodedBy,
        'Participating IPOs': a.participatingIpos.join(', '),
        'Facilitator': a.type === 'Training' ? a.facilitator : 'N/A',
        'Description': a.description,
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Activities Report");
    const schedules = activities.flatMap(parent => (parent.expenses || []).map(row => ({
        UID: parent.uid || '', 'Activity Name': getActivityDisplayTitle(parent), 'Expense ID': row.id,
        'Group ID': row.budgetItemGroupId || '', 'Object Type': row.objectType, 'Expense Particular': row.expenseParticular,
        'UACS Code': row.uacsCode, 'Obligation Month': row.obligationMonth, 'Disbursement Month': row.disbursementMonth,
        Amount: getBudgetLineAmount(row), Cancelled: !!row.isCancelled, Savings: !!row.isSavings, Realignment: !!row.isRealignment,
        Reason: row.adjustmentReason || '',
        'Funding Origin': row.fundingOrigin || '', 'Supplement UID': row.supplementUid || '',
        'Supplement Source': row.supplementalSource || '', 'Supplement Approval': row.supplementStatus || '',
        'Revision Pending': !!row.supplementRevisionPending,
    })));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(schedules), "Budget Schedules");
    const importRows = activities.flatMap(parent => ((parent.expenses || []).length ? parent.expenses : [null]).map(row => ({
        uid: parent.uid || '', type: parent.type, component: parent.component, name: parent.name, activity_title: parent.activity_title || '', date: parent.date,
        location: parent.location, facilitator: parent.facilitator || '', description: parent.description, participatingIpos: (parent.participatingIpos || []).join('; '),
        participantsMale: parent.participantsMale, participantsFemale: parent.participantsFemale, fundingYear: parent.fundingYear, fundType: parent.fundType,
        tier: parent.tier, fundSourceUid: parent.fundSourceUid || '', fundSource: parent.fundSource || '', operatingUnit: parent.operatingUnit,
        ...(row ? { expense_id: row.id, expense_budgetItemGroupId: row.budgetItemGroupId || '', expense_uacsCode: row.uacsCode, expense_amount: row.amount,
            expense_obligationMonth: row.obligationMonth, expense_disbursementMonth: row.disbursementMonth, expense_targetScheduleVersion: row.targetScheduleVersion ?? '',
            expense_supplementalSource: row.supplementalSource || (row.isSavings ? 'Savings' : row.isRealignment ? 'Realignment' : '') } : {}),
    })));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(importRows), 'Activities Data');
    appendTargetSheets(wb, activities.flatMap(parent => (parent.expenses || []).map(line => ({ uid: parent.uid, line }))));
    XLSX.writeFile(wb, "Activities_Report.xlsx");
};

export const downloadActivitiesTemplate = (fundSources: RefFundSource[]) => {
    const defaultSource = getNewSubprojectDefaultFundSource(fundSources);
    const headers = [
        'uid', 'type', 'component', 'name', 'activity_title', 'date', 'province', 'municipality', 'facilitator', 'description',
        'participatingIpos', 'participantsMale', 'participantsFemale',
        'fundingYear', 'fundType', 'tier', 'fundSourceUid', 'fundSource', 'operatingUnit',
        'expense_uacsCode', 'expense_obligationMonth', 'expense_disbursementMonth', 'expense_amount', 'expense_budgetItemGroupId', 'expense_supplementalSource', 'expense_id', 'expense_targetScheduleVersion'
    ];
    const exampleData = [
        {
            uid: 'TRN-2024-001',
            type: 'Training',
            component: 'Social Preparation',
            name: 'Basic Leadership Training',
            date: '2024-03-15',
            province: 'Rizal',
            municipality: 'Tanay',
            facilitator: 'John Doe',
            description: 'Leadership skills training.',
            participatingIpos: 'San Isidro Farmers Association; Other IPO',
            participantsMale: 10,
            participantsFemale: 15,
            fundingYear: 2024,
            fundType: 'Current',
            tier: 'Tier 1',
            fundSourceUid: defaultSource?.uid || '',
            fundSource: defaultSource?.label || '',
            operatingUnit: 'RPMO 4A',
            expense_uacsCode: '50202010-01',
            expense_obligationMonth: '2024-03-01',
            expense_disbursementMonth: '2024-03-20',
            expense_amount: 25000
        }
    ];

    const instructions = [
        ["Column", "Description"],
        ["activity_title", "Optional specific title for an Activity. Blank keeps its generic name. Training uses name instead."],
        ["participatingIpos", "Names of IPOs. Separate multiple IPOs with a semicolon (;). Example: 'IPO One; IPO Two'"],
        ["province", "Province name."],
        ["municipality", "City or Municipality name."],
        ["operatingUnit", "e.g., RPMO 4A. If specified, this takes precedence over your current account's OU."],
        ["fundSourceUid / fundSource", "Use the canonical Fund Source UID where available, or its unambiguous current label. If both are blank, the active 4K Fund default is used for a new record."],
        ["expense_uacsCode", "UACS Code used to identify Expense Particular and Object Type."],
        ["expense_amount", "Amount for the expense entry."],
        ["expense_supplementalSource", "Optional Savings or Realignment. Imported supplemental schedules are unsubmitted drafts; complete their authorization and approval in Supplemental Information. Approval or ledger UIDs cannot be imported."],
        ["expense_id / expense_targetScheduleVersion", "For independent plans, use a unique whole-number expense_id within each UID and set expense_targetScheduleVersion to 2. Blank version retains legacy scalar target dates."],
        ["Obligation Targets / Disbursement Targets", "Enter each stage independently: uid, item_id (matching expense_id), schedule_id (unique within the item), month (YYYY-MM-DD), amount. Empty stages are allowed. Do not repeat the expense row for financial dates."],
        ["Report re-import", "The report includes an Activities Data planning sheet without copied actual ledgers or approval state. Existing UIDs are skipped; importing does not update existing records."]
    ];

    const wb = XLSX.utils.book_new();
    const ws_data = XLSX.utils.json_to_sheet(exampleData, { header: headers });
    const ws_instructions = XLSX.utils.aoa_to_sheet(instructions);
    XLSX.utils.book_append_sheet(wb, ws_data, "Activities Data");
    XLSX.utils.book_append_sheet(wb, ws_instructions, "Instructions");
    appendTargetSheets(wb, []);
    XLSX.writeFile(wb, "Activities_Upload_Template.xlsx");
};

export const handleActivitiesUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    activities: Activity[],
    setActivities: React.Dispatch<React.SetStateAction<Activity[]>>,
    ipos: IPO[],
    logAction: (action: string, details: string) => void,
    setIsUploading: (val: boolean) => void,
    uacsCodes: any,
    currentUser: any,
    fundSources: RefFundSource[],
    upsertActivitiesLocally?: (rows: Activity[]) => void
) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = event.target?.result;
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.Sheets['Activities Data'] ? 'Activities Data' : workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];
            const targets = targetImporter(workbook);
            const existingUids = new Set(activities.map(activity => activity.uid));

            let currentId = activities.reduce((max, a) => Math.max(max, a.id), 0);
            const existingIpoNames = new Set(ipos.map(ipo => ipo.name));

            const groupedData = new Map<string, any>();

            jsonData.forEach((row: any, index: number) => {
                const rowNum = index + 2;
                const uid = String(row.uid || '').trim();
                if (!uid) return; // Skip empty rows
                if (existingUids.has(uid)) return;
                if (row.expense_supplementUid || row.supplementUid || row['Supplement UID'] || row.expense_supplementStatus || row.supplementStatus || row['Supplement Approval']) {
                    throw new Error(`Row ${rowNum}: Supplemental approval and ledger identities cannot be imported.`);
                }
                const supplementalSource = String(row.expense_supplementalSource || '').trim();
                if (supplementalSource && !['Savings','Realignment'].includes(supplementalSource)) throw new Error(`Row ${rowNum}: Select Savings or Realignment for supplemental funding.`);

                // Extract participating IPOs for this row (moved out of new entry block to support merging)
                let rowParticipatingIpos: string[] = [];
                const rowActivityTitle = normalizeActivityTitle(row.activity_title == null ? null : String(row.activity_title));
                const rawIpos = (row.participatingIpos || '').toString().trim();
                const sourceUidInput = row.fundSourceUid ?? row['Fund Source UID'] ?? row.fund_source_uid;
                const sourceLabelInput = row.fundSource ?? row['Fund Source'] ?? row.fund_source;
                const rawSourceUid = sourceUidInput == null ? '' : String(sourceUidInput).trim();
                const rawSourceLabel = sourceLabelInput == null ? '' : String(sourceLabelInput).trim();
                const fundSource = resolveImportFundSource(rawSourceUid, rawSourceLabel, fundSources);
                if (!fundSource) {
                    throw new Error(`Row ${rowNum}: Fund Source "${rawSourceUid || rawSourceLabel || '4K Fund default'}" is invalid, inactive, or unavailable.`);
                }

                if (rawIpos) {
                    // 1. Exact match check (handles "Name, Inc" single entry)
                    if (existingIpoNames.has(rawIpos)) {
                        rowParticipatingIpos = [rawIpos];
                    } 
                    // 2. Semicolon delimiter check (Preferred for multiple)
                    else if (rawIpos.includes(';')) {
                        rowParticipatingIpos = rawIpos.split(';').map((s: string) => s.trim()).filter(Boolean);
                    } 
                    // 3. Fallback to comma (Legacy, risky for names with Inc.)
                    else {
                        rowParticipatingIpos = rawIpos.split(',').map((s: string) => s.trim()).filter(Boolean);
                    }
                }

                // Verify IPOs
                for (const ipoName of rowParticipatingIpos) {
                    if (!existingIpoNames.has(ipoName)) throw new Error(`Row ${rowNum}: IPO "${ipoName}" not found in system.`);
                }

                if (!groupedData.has(uid)) {
                    // Removed required check for province and municipality
                    if (!row.type || !row.component || !row.name || !row.date) {
                        throw new Error(`Row ${rowNum} (UID: ${uid}): Missing required common fields (type, component, name, date).`);
                    }

                    const municipality = String(row.municipality || '').trim();
                    const province = String(row.province || '').trim();
                    // Handle empty location fields gracefully
                    const locationString = String(row.location || '').trim() || ((municipality && province) ? `${municipality}, ${province}` : (municipality || province || ''));

                    // Prioritize row.operatingUnit
                    const rawOU = row.operatingUnit ? String(row.operatingUnit) : undefined;
                    const operatingUnit = rawOU ? resolveOperatingUnit(rawOU) : (currentUser?.operatingUnit || 'NPMO');

                    groupedData.set(uid, {
                        common: {
                            uid: uid,
                            type: row.type,
                            component: row.component as any,
                            name: String(row.name),
                            activity_title: rowActivityTitle,
                            date: String(row.date),
                            description: String(row.description || ''),
                            location: locationString,
                            participatingIpos: rowParticipatingIpos, // Use row's IPOs for initial entry
                            participantsMale: Number(row.participantsMale) || 0,
                            participantsFemale: Number(row.participantsFemale) || 0,
                            fundingYear: Number(row.fundingYear) || undefined,
                            fundType: fundTypes.includes(row.fundType) ? row.fundType : undefined,
                            tier: resolveTier(row.tier),
                            fundSourceUid: fundSource.uid,
                            fundSource: fundSource.label,
                            operatingUnit: operatingUnit,
                            encodedBy: currentUser?.fullName || 'System',
                            facilitator: String(row.facilitator || ''),
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        },
                        expenses: []
                    });
                } else {
                    // Entry exists, merge participating IPOs
                    const entry = groupedData.get(uid);
                    if (rowActivityTitle) {
                        if (entry.common.activity_title && rowActivityTitle !== entry.common.activity_title) {
                            throw new Error(`Row ${rowNum}: Activity UID ${uid} contains conflicting Activity Titles across its rows.`);
                        }
                        entry.common.activity_title = rowActivityTitle;
                    }
                    if (entry.common.fundSourceUid !== fundSource.uid) {
                        throw new Error(`Row ${rowNum}: Activity UID ${uid} contains conflicting Fund Sources across its rows.`);
                    }
                    const currentIpos = new Set(entry.common.participatingIpos);
                    rowParticipatingIpos.forEach(ipo => currentIpos.add(ipo));
                    entry.common.participatingIpos = Array.from(currentIpos);
                }

                if (row.expense_amount !== undefined) {
                    let uacsCode = String(row.expense_uacsCode || '').trim();
                    let objectType = 'MOOE'; // Default
                    let expenseParticular = '';

                    // Look up details from uacsCodes reference
                    if (uacsCodes && uacsCode) {
                        const normalizedUpload = uacsCode.replace(/[^a-zA-Z0-9]/g, '');
                        let matchFound = false;

                        outerLoop:
                        for (const ot of Object.keys(uacsCodes)) {
                            for (const part of Object.keys(uacsCodes[ot])) {
                                const validCodes = Object.keys(uacsCodes[ot][part]);
                                const match = validCodes.find(c => c === uacsCode || c.replace(/[^a-zA-Z0-9]/g, '') === normalizedUpload);
                                if (match) {
                                    uacsCode = match; // Canonical code
                                    objectType = ot;
                                    expenseParticular = part;
                                    matchFound = true;
                                    break outerLoop;
                                }
                            }
                        }
                    }

                    const expenseId = importedBudgetItemId(row.expense_id, Date.now() + index * 10);
                    if (groupedData.get(uid).expenses.some(expense => expense.id === expenseId)) throw new Error(`Row ${rowNum}: Duplicate expense ID.`);
                    groupedData.get(uid).expenses.push({
                        ...targets.read(uid, expenseId, row.expense_targetScheduleVersion),
                        id: expenseId,
                        objectType: objectType as any,
                        expenseParticular: expenseParticular,
                        uacsCode: uacsCode,
                        budgetItemGroupId: row.expense_budgetItemGroupId ? String(row.expense_budgetItemGroupId).trim() : null,
                        obligationMonth: String(row.expense_obligationMonth || ''),
                        disbursementMonth: String(row.expense_disbursementMonth || ''),
                        amount: Number(row.expense_amount),
                        ...(supplementalSource ? { fundingOrigin: 'SupplementalDraft', supplementStatus: 'DRAFT', supplementalSource } : {})
                    });
                }
            });

            const newActivities: any[] = [];
            targets.assertUsed(existingUids);
            groupedData.forEach((group) => {
                newActivities.push({
                    ...group.common,
                    expenses: group.expenses,
                });
            });

            if (newActivities.length > 0) {
                if (supabase) {
                    if (!upsertActivitiesLocally) throw new Error('Local synchronization is unavailable. Reload before importing.');
                    await requireIndependentTargetSupport(newActivities.flatMap(parent => parent.expenses || []));
                    // Explicit insert to generate proper IDs
                    const { data, error } = await supabase.from('activities').insert(newActivities).select();
                    if (error) {
                        console.error("Error inserting activities:", error);
                        alert(`Error inserting data: ${error.message}`);
                    } else if (data) {
                        upsertActivitiesLocally(data as Activity[]);
                        logAction('Imported Activities', `Imported ${data.length} activities from Excel`);
                        alert(`${data.length} activities imported successfully!`);
                    }
                } else {
                    const localActivities = newActivities.map((act, i) => ({ id: currentId + i + 1, ...act }));
                    setActivities(prev => [...prev, ...localActivities]);
                    alert(`${newActivities.length} activities imported locally!`);
                }
            }

        } catch (error: any) {
            console.error("Error processing XLSX file:", error);
            alert(`Failed to import file. ${error.message}`);
        } finally {
            setIsUploading(false);
            if(e.target) e.target.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
};


// --- IPOS ---

export const downloadIposReport = (ipos: IPO[]) => {
    const dataToExport = ipos.map(ipo => ({
        'Name': ipo.name,
        'Location': ipo.location,
        'Region': ipo.region,
        'ICC': ipo.indigenousCulturalCommunity,
        'AD No.': ipo.ancestralDomainNo,
        'Registering Body': ipo.registeringBody,
        'Women-Led': ipo.isWomenLed ? 'Yes' : 'No',
        'GIDA': ipo.isWithinGida ? 'Yes' : 'No',
        'ELCAC': ipo.isWithinElcac ? 'Yes' : 'No',
        'With SCAD': ipo.isWithScad ? 'Yes' : 'No',
        'F2C2 Cluster': ipo.isF2c2Cluster == null ? '' : ipo.isF2c2Cluster ? 'Yes' : 'No',
        'FFEDIS Registered': ipo.isFfedisRegistered == null ? '' : ipo.isFfedisRegistered ? 'Yes' : 'No',
        'FFEDIS Registration Number': ipo.ffedisRegistrationNumber || '',
        'FFEDIS Registration Date': ipo.ffedisRegistrationDate || '',
        'Contact Person': ipo.contactPerson,
        'Contact Number': ipo.contactNumber,
        'Registration Date': ipo.registrationDate,
        'Commodities': JSON.stringify(ipo.commodities),
        'Level of Development': ipo.levelOfDevelopment
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "IPO Report");
    XLSX.writeFile(wb, "IPO_Report.xlsx");
};

export const downloadIposTemplate = () => {
    const headers = [
        'name', 'region', 'province', 'municipality', 'barangay', 'indigenousCulturalCommunity', 
        'ancestralDomainNo', 'registeringBody', 'isWomenLed', 'isWithinGida', 'isWithinElcac', 'isWithScad',
        'isF2c2Cluster', 'isFfedisRegistered', 'ffedisRegistrationNumber', 'ffedisRegistrationDate',
        'contactPerson', 'contactNumber', 'registrationDate', 'commodities', 
        'levelOfDevelopment'
    ];
    
    const exampleData = [{
        name: 'Sample Farmers Association',
        region: 'Region IV-A (CALABARZON)',
        province: 'Rizal',
        municipality: 'Tanay',
        barangay: 'Brgy. Daraitan',
        indigenousCulturalCommunity: 'Dumagat',
        ancestralDomainNo: 'AD-12345',
        registeringBody: 'CDA',
        isWomenLed: 'TRUE',
        isWithinGida: 'FALSE',
        isWithinElcac: 'TRUE',
        isWithScad: 'TRUE',
        isF2c2Cluster: 'FALSE',
        isFfedisRegistered: 'FALSE',
        ffedisRegistrationNumber: '',
        ffedisRegistrationDate: '',
        contactPerson: 'Juan Dela Cruz',
        contactNumber: '09171234567',
        registrationDate: '2023-01-15',
        commodities: '[{"type":"Crop","particular":"Rice Seeds","value":50,"potentialExpansionArea":12.5,"numberOfFarmers":40,"numberOfTrees":1200,"isScad":true}]',
        levelOfDevelopment: 2
    }];

    const instructions = [
        ["Column", "Description"],
        ["name", "Full name of the IPO. (Required)"],
        ["region", "Region. You can enter the full name or short codes: '1'-'13', 'NCR', 'CAR', 'BARMM', 'NIR', '4A', '4B'. (Required)"],
        ["province", "Province name. (Required)"],
        ["municipality", "City or Municipality name. (Required)"],
        ["barangay", "Barangay name(s). Optional. Separate multiple barangays with a comma (e.g., 'Brgy A, Brgy B')."],
        ["indigenousCulturalCommunity", "The name of the indigenous cultural community."],
        ["ancestralDomainNo", "The ancestral domain number, if any."],
        ["registeringBody", "e.g., SEC, DOLE, CDA, National Commission on Indigenous Peoples."],
        ["isWomenLed", "Enter TRUE or FALSE."],
        ["isWithinGida", "Enter TRUE or FALSE."],
        ["isWithinElcac", "Enter TRUE or FALSE."],
        ["isWithScad", "Enter TRUE or FALSE. Note: This will be auto-recalculated based on commodities upon upload to ensure consistency."],
        ["isF2c2Cluster", "Enter TRUE or FALSE; blank means not recorded."],
        ["isFfedisRegistered", "Enter TRUE or FALSE; blank means not recorded. TRUE requires FFEDIS number and date."],
        ["ffedisRegistrationNumber", "Store as Text to preserve leading zeros and punctuation. Required when FFEDIS Registered is TRUE."],
        ["ffedisRegistrationDate", "FFEDIS date in YYYY-MM-DD format or an Excel date cell. Required when FFEDIS Registered is TRUE; independent of IPO registrationDate."],
        ["contactPerson", "Name of the contact person."],
        ["contactNumber", "Contact phone number."],
        ["registrationDate", "Date in YYYY-MM-DD format."],
        ["commodities", `A JSON array for commodities. Crop entries may optionally include potentialExpansionArea, numberOfFarmers, and numberOfTrees. Livestock entries may optionally include numberOfFarmers only. Omit optional properties when blank. Example: '[{"type":"Crop","particular":"Rice Seeds","value":50,"potentialExpansionArea":12.5,"numberOfFarmers":40,"numberOfTrees":1200,"isScad":true}]'. Use '[]' for none.`],
        ["levelOfDevelopment", "A number from 1 to 5."]
    ];

    const wb = XLSX.utils.book_new();
    const ws_data = XLSX.utils.json_to_sheet(exampleData, { header: headers });
    const numberAddress = XLSX.utils.encode_cell({ r: 1, c: headers.indexOf('ffedisRegistrationNumber') });
    ws_data[numberAddress] = { t: 's', v: '', z: '@' };
    const ws_instructions = XLSX.utils.aoa_to_sheet(instructions);
    
    XLSX.utils.book_append_sheet(wb, ws_data, "IPO Data");
    XLSX.utils.book_append_sheet(wb, ws_instructions, "Instructions");

    XLSX.writeFile(wb, "IPO_Upload_Template.xlsx");
};

export const handleIposUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    ipos: IPO[],
    setIpos: React.Dispatch<React.SetStateAction<IPO[]>>,
    logAction: (action: string, details: string) => void,
    setIsUploading: (val: boolean) => void,
    gidaAreas: any[],
    elcacAreas: any[],
    onIposSaved: (records: IPO[]) => void
) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    const finishUpload = () => {
        setIsUploading(false);
        if (e.target) e.target.value = '';
    };
    reader.onerror = () => { alert('Failed to read the IPO file. Select the file again to retry.'); finishUpload(); };
    reader.onabort = finishUpload;
    reader.onload = async (event) => {
        try {
            const data = event.target?.result;
            const workbook = XLSX.read(data, { type: 'array', cellNF: true });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];
            const headers = (XLSX.utils.sheet_to_json(worksheet, { header: 1 })[0] || []) as string[];
            const ffedisNumberColumn = headers.indexOf('ffedisRegistrationNumber');

            let currentMaxId = ipos.reduce((max, ipo) => Math.max(max, ipo.id), 0);
            
            const newIpos: Omit<IPO, 'id'>[] = jsonData.map((row: any, index: number) => {
                if (!row.name || !row.region || !row.province || !row.municipality) {
                    throw new Error(`Row ${index + 2} is missing required fields (name, region, province, municipality).`);
                }
                let indicators;
                try {
                    const numberCell = ffedisNumberColumn < 0 ? null : worksheet[XLSX.utils.encode_cell({ r: row.__rowNum__ ?? index + 1, c: ffedisNumberColumn })];
                    indicators = parseImportedIpoIndicators({ ...row,
                        ...(numberCell?.t === 'n' && numberCell.z ? { ffedisRegistrationNumber: XLSX.utils.format_cell(numberCell) } : {}),
                    }, serial => {
                        const date = XLSX.SSF.parse_date_code(serial, { date1904: workbook.Workbook?.WBProps?.date1904 === true });
                        if (!date) throw new Error('Invalid FFEDIS Excel date.');
                        return `${String(date.y).padStart(4, '0')}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
                    });
                } catch (error) {
                    throw new Error(`Row ${index + 2}: ${error instanceof Error ? error.message : 'Invalid IPO indicators.'}`);
                }

                let commodities: Commodity[];
                try {
                    const parsedCommodities = typeof row.commodities === 'string' ? JSON.parse(row.commodities) : [];
                    if (!Array.isArray(parsedCommodities)) {
                        throw new Error('Commodities must be a JSON array.');
                    }
                    commodities = parsedCommodities.map((commodity, commodityIndex) => {
                        try {
                            return normalizeImportedCommodity(commodity);
                        } catch (error) {
                            const message = error instanceof Error ? error.message : 'Invalid commodity.';
                            throw new Error(`Commodity ${commodityIndex + 1}: ${message}`);
                        }
                    });
                } catch (error) {
                    throw new Error(`Row ${index + 2}: Invalid commodities data${error instanceof Error ? ` (${error.message})` : ''}.`);
                }

                let locationString = '';
                const brgy = row.barangay ? String(row.barangay).trim() : '';
                const municipality = String(row.municipality).trim();
                const province = String(row.province).trim();
                const region = resolveRegion(row.region);

                if (brgy) {
                    const brgyList = brgy.split(',').map((b: string) => b.trim()).filter((b: string) => b !== '');
                    const formattedBrgys = brgyList.map((b: string) => b.startsWith('Brgy.') || b.startsWith('Sitio') ? b : `Brgy. ${b}`);
                    locationString = `${formattedBrgys.join(', ')}, ${municipality}, ${province}`;
                } else {
                    locationString = `${municipality}, ${province}`;
                }

                const isWithScad = commodities.some((c: any) => c.isScad);

                // Auto-check GIDA status
                const { province: parsedProvince, municipality: parsedMunicipality, barangays: parsedBarangays } = parseLocation(locationString);
                const matchedGida = gidaAreas.some(g => 
                    g.region === region &&
                    g.province.toLowerCase() === parsedProvince.toLowerCase() &&
                    g.municipality.toLowerCase() === parsedMunicipality.toLowerCase() &&
                    parsedBarangays.some(b => b.toLowerCase() === g.barangay.toLowerCase())
                );
                const isWithinGida = String(row.isWithinGida).toUpperCase() === 'TRUE' || matchedGida;

                // Auto-check ELCAC status
                const matchedElcac = elcacAreas.some(e => 
                    e.region === region &&
                    e.province.toLowerCase() === parsedProvince.toLowerCase() &&
                    e.municipality.toLowerCase() === parsedMunicipality.toLowerCase() &&
                    parsedBarangays.some(b => b.toLowerCase() === e.barangay.toLowerCase())
                );
                const isWithinElcac = String(row.isWithinElcac).toUpperCase() === 'TRUE' || matchedElcac;

                return {
                    ...indicators,
                    name: String(row.name),
                    location: locationString,
                    region: region,
                    indigenousCulturalCommunity: String(row.indigenousCulturalCommunity || ''),
                    ancestralDomainNo: String(row.ancestralDomainNo || ''),
                    registeringBody: String(row.registeringBody || ''),
                    isWomenLed: String(row.isWomenLed).toUpperCase() === 'TRUE',
                    isWithinGida: isWithinGida,
                    isWithinElcac: isWithinElcac,
                    isWithScad: isWithScad,
                    contactPerson: String(row.contactPerson || ''),
                    contactNumber: String(row.contactNumber || ''),
                    registrationDate: row.registrationDate ? String(row.registrationDate) : null,
                    commodities: commodities,
                    levelOfDevelopment: parseInt(row.levelOfDevelopment, 10) as IPO['levelOfDevelopment'] || 1,
                    totalMembers: Number(row.totalMembers) || 0,
                    totalIpMembers: Number(row.totalIpMembers) || 0,
                    totalMaleMembers: Number(row.totalMaleMembers) || 0,
                    totalFemaleMembers: Number(row.totalFemaleMembers) || 0,
                    totalYouthMembers: Number(row.totalYouthMembers) || 0,
                    totalSeniorMembers: Number(row.totalSeniorMembers) || 0,
                    total4PsMembers: Number(row.total4PsMembers) || 0,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
            });

            if (supabase) {
                // Insert to DB directly to generate correct IDs and avoid conflict
                const { data, error } = await supabase.from('ipos').insert(newIpos).select();
                if (error) throw error;
                if (!data || data.length !== newIpos.length) throw new Error('The complete saved IPO response was not returned. Refresh before retrying.');
                onIposSaved(data as IPO[]);
                logAction('Imported IPOs', `Imported ${data.length} IPOs from Excel`);
                alert(`${data.length} IPO(s) imported successfully!`);
            } else {
                const localIpos = newIpos.map((ipo, idx) => ({ id: currentMaxId + idx + 1, ...ipo }));
                onIposSaved(localIpos);
                logAction('Imported IPOs', `Imported ${localIpos.length} IPOs from Excel`);
                alert(`${newIpos.length} IPO(s) imported locally!`);
            }

        } catch (error: any) {
            console.error("Error processing XLSX file:", error);
            alert(`Failed to import file. ${error.message}`);
        } finally {
            finishUpload();
        }
    };
    try { reader.readAsArrayBuffer(file); }
    catch { alert('Failed to read the IPO file. Select the file again to retry.'); finishUpload(); }
};
