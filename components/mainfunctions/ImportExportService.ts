// Author: 4K
import React from 'react';
import { 
    Subproject, Activity, IPO, OfficeRequirement, StaffingRequirement, OtherProgramExpense,
    SubprojectDetail, ActivityExpense, fundTypes, tiers, objectTypes, ObjectType, philippineRegions
} from '../../constants';
import { parseLocation } from '../LocationPicker';
import { supabase } from '../../supabaseClient';
import { parseOfficeRequirementRow } from '../program_management/OfficeRequirementsTab';
import { parseStaffingRequirementRow } from '../program_management/StaffingRequirementsTab';
import { parseOtherExpenseRow } from '../program_management/OtherExpensesTab';

declare const XLSX: any;

// Helper to map short codes/numbers to full Region names
const resolveRegion = (input: string | number | undefined): string => {
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

// --- SUBPROJECTS ---

export const downloadSubprojectsReport = (subprojects: Subproject[]) => {
    const calculateTotalBudget = (details: SubprojectDetail[]) => {
        return details.reduce((total, item) => total + (item.pricePerUnit * item.numberOfUnits), 0);
    };

    const data = subprojects.map(s => ({
        UID: s.uid,
        Name: s.name,
        IPO: s.indigenousPeopleOrganization,
        Location: s.location,
        Status: s.status,
        Budget: calculateTotalBudget(s.details),
        'Start Date': s.startDate,
        'End Date': s.estimatedCompletionDate,
        'Operating Unit': s.operatingUnit
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Subprojects");
    XLSX.writeFile(wb, "Subprojects_Report.xlsx");
};

export const downloadSubprojectsTemplate = () => {
    const headers = [
        'uid', 'name', 'indigenousPeopleOrganization', 'province', 'municipality', 'status', 'packageType', 
        'startDate', 'estimatedCompletionDate', 'actualCompletionDate', 'fundingYear', 'fundType', 'tier', 'operatingUnit', 'remarks',
        'detail_type', 'detail_particulars', 'detail_deliveryDate', 'detail_unitOfMeasure', 'detail_pricePerUnit', 'detail_numberOfUnits', 
        'detail_objectType', 'detail_expenseParticular', 'detail_uacsCode', 'detail_obligationMonth', 'detail_disbursementMonth'
    ];

    const exampleData = [
        {
            uid: 'SP-TEMP-001',
            name: 'Sample Coffee Production',
            indigenousPeopleOrganization: 'Samahan ng mga Katutubong Dumagat',
            province: 'Rizal',
            municipality: 'Tanay',
            status: 'Ongoing',
            packageType: 'Package 1',
            startDate: '2024-01-15',
            estimatedCompletionDate: '2024-06-15',
            actualCompletionDate: '',
            fundingYear: 2024,
            fundType: 'Current',
            tier: 'Tier 1',
            operatingUnit: 'RPMO 4A',
            remarks: 'Sample upload with multiple items',
            detail_type: 'Equipment',
            detail_particulars: 'Coffee Roaster',
            detail_deliveryDate: '2024-03-01',
            detail_unitOfMeasure: 'unit',
            detail_pricePerUnit: 150000,
            detail_numberOfUnits: 1,
            detail_objectType: 'CO',
            detail_expenseParticular: 'Machinery and Equipment',
            detail_uacsCode: '10605030-00',
            detail_obligationMonth: '2024-02-01',
            detail_disbursementMonth: '2024-03-15'
        }
    ];

    const instructions = [
        ["Column", "Description"],
        ["uid", "Unique Identifier. REQUIRED. Rows with the same UID will be grouped into one subproject."],
        ["name", "Name of the subproject."],
        ["indigenousPeopleOrganization", "Name of the IPO."],
        ["province", "Province name. (Required)"],
        ["municipality", "City or Municipality name. (Required)"],
        ["status", "Proposed, Ongoing, Completed, or Cancelled."],
        ["packageType", "Package 1, Package 2, etc."],
        ["startDate", "YYYY-MM-DD"],
        ["estimatedCompletionDate", "YYYY-MM-DD"],
        ["actualCompletionDate", "YYYY-MM-DD (Optional)"],
        ["fundingYear", "Year (e.g., 2024)"],
        ["fundType", "Current, Continuing, or Insertion"],
        ["tier", "Tier 1 or Tier 2"],
        ["operatingUnit", "e.g., RPMO 4A. If specified, this takes precedence over your current account's OU."],
        ["remarks", "Optional remarks"],
        ["detail_type", "Item Type (e.g., Equipment, Livestock, etc.)"],
        ["detail_particulars", "Specific item name."],
        ["detail_deliveryDate", "YYYY-MM-DD"],
        ["detail_unitOfMeasure", "pcs, kgs, unit, lot, heads"],
        ["detail_pricePerUnit", "Number"],
        ["detail_numberOfUnits", "Number"],
        ["detail_objectType", "MOOE or CO"],
        ["detail_expenseParticular", "Expense Class"],
        ["detail_uacsCode", "Specific UACS Code"],
        ["detail_obligationMonth", "YYYY-MM-DD (Date of Obligation)"],
        ["detail_disbursementMonth", "YYYY-MM-DD (Date of Disbursement)"]
    ];

    const wb = XLSX.utils.book_new();
    const ws_data = XLSX.utils.json_to_sheet(exampleData, { header: headers });
    const ws_instructions = XLSX.utils.aoa_to_sheet(instructions);

    XLSX.utils.book_append_sheet(wb, ws_data, "Subprojects Data");
    XLSX.utils.book_append_sheet(wb, ws_instructions, "Instructions");

    XLSX.writeFile(wb, "Subprojects_Upload_Template.xlsx");
};

export const handleSubprojectsUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    subprojects: Subproject[],
    setSubprojects: React.Dispatch<React.SetStateAction<Subproject[]>>,
    logAction: (action: string, details: string, ipoName?: string) => void,
    setIsUploading: (val: boolean) => void,
    uacsCodes: any,
    currentUser: any
) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = event.target?.result;
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

            const groupedData = new Map<string, any>();
            let maxId = subprojects.reduce((max, s) => Math.max(max, s.id), 0);
            const currentTimestamp = new Date().toISOString();

            jsonData.forEach((row: any, index: number) => {
                if (!row.uid) return; 
                
                if (!groupedData.has(row.uid)) {
                    maxId++;
                    const municipality = String(row.municipality || '').trim();
                    const province = String(row.province || '').trim();
                    const locationString = `${municipality}, ${province}`;

                    // Prioritize row.operatingUnit from Excel
                    const operatingUnit = row.operatingUnit ? String(row.operatingUnit).trim() : (currentUser?.operatingUnit || '');

                    groupedData.set(row.uid, {
                        id: maxId,
                        uid: String(row.uid),
                        name: String(row.name),
                        location: locationString,
                        indigenousPeopleOrganization: String(row.indigenousPeopleOrganization),
                        status: row.status,
                        packageType: row.packageType,
                        startDate: String(row.startDate),
                        estimatedCompletionDate: String(row.estimatedCompletionDate),
                        actualCompletionDate: row.actualCompletionDate ? String(row.actualCompletionDate) : undefined,
                        fundingYear: Number(row.fundingYear),
                        fundType: row.fundType,
                        tier: row.tier,
                        operatingUnit: operatingUnit,
                        encodedBy: currentUser?.fullName || 'System Upload',
                        remarks: row.remarks,
                        lat: 14.5995 + (Math.random() * 0.1 - 0.05), 
                        lng: 120.9842 + (Math.random() * 0.1 - 0.05),
                        details: [],
                        subprojectCommodities: [],
                        created_at: currentTimestamp,
                        updated_at: currentTimestamp
                    });
                }

                const subproject = groupedData.get(row.uid);
                
                if (row.detail_particulars) {
                    let objectType = row.detail_objectType;
                    let expenseParticular = row.detail_expenseParticular;
                    let uacsCode = String(row.detail_uacsCode || '').trim();

                    const normalizedUpload = uacsCode.replace(/[^a-zA-Z0-9]/g, '');
                    let matchFound = false;

                    if (uacsCodes && objectType && expenseParticular && uacsCodes[objectType] && uacsCodes[objectType][expenseParticular]) {
                        const validCodes = Object.keys(uacsCodes[objectType][expenseParticular]);
                        const match = validCodes.find(c => c === uacsCode || c.replace(/[^a-zA-Z0-9]/g, '') === normalizedUpload);
                        if (match) {
                            uacsCode = match;
                            matchFound = true;
                        }
                    }

                    if (!matchFound && uacsCodes) {
                        outerLoop:
                        for (const ot of Object.keys(uacsCodes)) {
                            for (const part of Object.keys(uacsCodes[ot])) {
                                const validCodes = Object.keys(uacsCodes[ot][part]);
                                const match = validCodes.find(c => c === uacsCode || c.replace(/[^a-zA-Z0-9]/g, '') === normalizedUpload);
                                if (match) {
                                    uacsCode = match;
                                    objectType = ot;
                                    expenseParticular = part;
                                    matchFound = true;
                                    break outerLoop;
                                }
                            }
                        }
                    }

                    subproject.details.push({
                        id: Date.now() + index, 
                        type: row.detail_type,
                        particulars: row.detail_particulars,
                        deliveryDate: String(row.detail_deliveryDate),
                        unitOfMeasure: row.detail_unitOfMeasure,
                        pricePerUnit: Number(row.detail_pricePerUnit),
                        numberOfUnits: Number(row.detail_numberOfUnits),
                        objectType: objectType,
                        expenseParticular: expenseParticular,
                        uacsCode: uacsCode,
                        obligationMonth: String(row.detail_obligationMonth),
                        disbursementMonth: String(row.detail_disbursementMonth)
                    });
                }
            });

            const newSubprojects = Array.from(groupedData.values());
            logAction('Imported Subprojects', `Imported ${newSubprojects.length} subprojects from Excel`);
            setSubprojects(prev => [...prev, ...newSubprojects]);
            alert(`${newSubprojects.length} subprojects imported successfully!`);

        } catch (error: any) {
            console.error("Error processing XLSX file:", error);
            alert(`Failed to import file. ${error.message}`);
        } finally {
            setIsUploading(false);
            if (e.target) e.target.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
};


// --- ACTIVITIES ---

export const downloadActivitiesReport = (activities: Activity[]) => {
    const dataToExport = activities.map(a => ({
        'UID': a.uid || '',
        'Type': a.type,
        'Component': a.component,
        'Activity Name': a.name,
        'Date': a.date,
        'Location': a.location,
        'Male Participants': a.participantsMale,
        'Female Participants': a.participantsFemale,
        'Total Budget': a.expenses.reduce((sum, e) => sum + e.amount, 0),
        'Funding Year': a.fundingYear,
        'Fund Type': a.fundType,
        'Tier': a.tier,
        'Operating Unit': a.operatingUnit,
        'Encoded By': a.encodedBy,
        'Participating IPOs': a.participatingIpos.join(', '),
        'Facilitator': a.type === 'Training' ? a.facilitator : 'N/A',
        'Description': a.description,
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Activities Report");
    XLSX.writeFile(wb, "Activities_Report.xlsx");
};

export const downloadActivitiesTemplate = () => {
    const headers = [
        'uid', 'type', 'component', 'name', 'date', 'province', 'municipality', 'facilitator', 'description',
        'participatingIpos', 'participantsMale', 'participantsFemale',
        'fundingYear', 'fundType', 'tier', 'operatingUnit',
        'expense_uacsCode', 'expense_obligationMonth', 'expense_disbursementMonth', 'expense_amount'
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
            operatingUnit: 'RPMO 4A',
            expense_uacsCode: '50202010-01',
            expense_obligationMonth: '2024-03-01',
            expense_disbursementMonth: '2024-03-20',
            expense_amount: 25000
        }
    ];

    const instructions = [
        ["Column", "Description"],
        ["participatingIpos", "Names of IPOs. Separate multiple IPOs with a semicolon (;). Example: 'IPO One; IPO Two'"],
        ["province", "Province name."],
        ["municipality", "City or Municipality name."],
        ["operatingUnit", "e.g., RPMO 4A. If specified, this takes precedence over your current account's OU."],
        ["expense_uacsCode", "UACS Code used to identify Expense Particular and Object Type."],
        ["expense_amount", "Amount for the expense entry."]
    ];

    const wb = XLSX.utils.book_new();
    const ws_data = XLSX.utils.json_to_sheet(exampleData, { header: headers });
    const ws_instructions = XLSX.utils.aoa_to_sheet(instructions);
    XLSX.utils.book_append_sheet(wb, ws_data, "Activities Data");
    XLSX.utils.book_append_sheet(wb, ws_instructions, "Instructions");
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
    currentUser: any
) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = event.target?.result;
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

            let currentId = activities.reduce((max, a) => Math.max(max, a.id), 0);
            const existingIpoNames = new Set(ipos.map(ipo => ipo.name));

            const groupedData = new Map<string, any>();

            jsonData.forEach((row: any, index: number) => {
                const rowNum = index + 2;
                const uid = String(row.uid || '').trim();
                if (!uid) return; // Skip empty rows

                if (!groupedData.has(uid)) {
                    // Removed required check for province and municipality
                    if (!row.type || !row.component || !row.name || !row.date) {
                        throw new Error(`Row ${rowNum} (UID: ${uid}): Missing required common fields (type, component, name, date).`);
                    }

                    let participatingIpos: string[] = [];
                    const rawIpos = (row.participatingIpos || '').toString().trim();

                    if (rawIpos) {
                        // 1. Exact match check (handles "Name, Inc" single entry)
                        if (existingIpoNames.has(rawIpos)) {
                            participatingIpos = [rawIpos];
                        } 
                        // 2. Semicolon delimiter check (Preferred for multiple)
                        else if (rawIpos.includes(';')) {
                            participatingIpos = rawIpos.split(';').map((s: string) => s.trim()).filter(Boolean);
                        } 
                        // 3. Fallback to comma (Legacy, risky for names with Inc.)
                        else {
                            participatingIpos = rawIpos.split(',').map((s: string) => s.trim()).filter(Boolean);
                        }
                    }

                    for (const ipoName of participatingIpos) {
                        if (!existingIpoNames.has(ipoName)) throw new Error(`Row ${rowNum}: IPO "${ipoName}" not found in system.`);
                    }

                    const municipality = String(row.municipality || '').trim();
                    const province = String(row.province || '').trim();
                    // Handle empty location fields gracefully
                    const locationString = (municipality && province) ? `${municipality}, ${province}` : (municipality || province || '');

                    // Prioritize row.operatingUnit
                    const operatingUnit = row.operatingUnit ? String(row.operatingUnit).trim() : (currentUser?.operatingUnit || 'NPMO');

                    groupedData.set(uid, {
                        common: {
                            uid: uid,
                            type: row.type,
                            component: row.component as any,
                            name: String(row.name),
                            date: String(row.date),
                            description: String(row.description || ''),
                            location: locationString,
                            participatingIpos: participatingIpos,
                            participantsMale: Number(row.participantsMale) || 0,
                            participantsFemale: Number(row.participantsFemale) || 0,
                            fundingYear: Number(row.fundingYear) || undefined,
                            fundType: fundTypes.includes(row.fundType) ? row.fundType : undefined,
                            tier: tiers.includes(row.tier) ? row.tier : undefined,
                            operatingUnit: operatingUnit,
                            encodedBy: currentUser?.fullName || 'System',
                            facilitator: String(row.facilitator || ''),
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        },
                        expenses: []
                    });
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

                    groupedData.get(uid).expenses.push({
                        id: Date.now() + index * 10,
                        objectType: objectType as any,
                        expenseParticular: expenseParticular,
                        uacsCode: uacsCode,
                        obligationMonth: String(row.expense_obligationMonth || ''),
                        disbursementMonth: String(row.expense_disbursementMonth || ''),
                        amount: Number(row.expense_amount)
                    });
                }
            });

            const newActivities: any[] = [];
            groupedData.forEach((group) => {
                newActivities.push({
                    ...group.common,
                    expenses: group.expenses,
                });
            });

            if (newActivities.length > 0) {
                logAction('Imported Activities', `Imported ${newActivities.length} activities from Excel`);

                // We rely on the useSupabaseTable hook's setActivities to sync data to Supabase.
                // Explicitly inserting into Supabase here creates duplicate entries.
                const localActivities = newActivities.map((act, i) => ({ id: currentId + i + 1, ...act }));
                setActivities(prev => [...prev, ...localActivities]);
                
                alert(`${newActivities.length} activities imported successfully!`);
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
        contactPerson: 'Juan Dela Cruz',
        contactNumber: '09171234567',
        registrationDate: '2023-01-15',
        commodities: '[{"type":"Crop Commodity","particular":"Rice Seeds","value":50,"isScad":true}]',
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
        ["contactPerson", "Name of the contact person."],
        ["contactNumber", "Contact phone number."],
        ["registrationDate", "Date in YYYY-MM-DD format."],
        ["commodities", `A JSON string for commodities. Format: '[{"type":"Type","particular":"Name","value":Number,"isScad":boolean}]'. Example: '[{"type":"Livestock","particular":"Goats","value":100,"isScad":false}]'. Use '[]' for none.`],
        ["levelOfDevelopment", "A number from 1 to 5."]
    ];

    const wb = XLSX.utils.book_new();
    const ws_data = XLSX.utils.json_to_sheet(exampleData, { header: headers });
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
    setIsUploading: (val: boolean) => void
) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = event.target?.result;
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

            let currentMaxId = ipos.reduce((max, ipo) => Math.max(max, ipo.id), 0);
            
            const newIpos: Omit<IPO, 'id'>[] = jsonData.map((row: any, index: number) => {
                if (!row.name || !row.region || !row.province || !row.municipality) {
                    throw new Error(`Row ${index + 2} is missing required fields (name, region, province, municipality).`);
                }

                let commodities: any[];
                try {
                    commodities = typeof row.commodities === 'string' ? JSON.parse(row.commodities) : [];
                } catch {
                    console.warn(`Row ${index + 2}: Invalid JSON in 'commodities' column. Defaulting to empty.`);
                    commodities = [];
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

                return {
                    name: String(row.name),
                    location: locationString,
                    region: region,
                    indigenousCulturalCommunity: String(row.indigenousCulturalCommunity || ''),
                    ancestralDomainNo: String(row.ancestralDomainNo || ''),
                    registeringBody: String(row.registeringBody || ''),
                    isWomenLed: String(row.isWomenLed).toUpperCase() === 'TRUE',
                    isWithinGida: String(row.isWithinGida).toUpperCase() === 'TRUE',
                    isWithinElcac: String(row.isWithinElcac).toUpperCase() === 'TRUE',
                    isWithScad: isWithScad,
                    contactPerson: String(row.contactPerson || ''),
                    contactNumber: String(row.contactNumber || ''),
                    registrationDate: row.registrationDate ? String(row.registrationDate) : null,
                    commodities: commodities,
                    levelOfDevelopment: parseInt(row.levelOfDevelopment, 10) as IPO['levelOfDevelopment'] || 1,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
            });

            // Prevent double entry:
            // When using useSupabaseTable hook, updating the state will trigger an upsert/insert to DB.
            // Therefore, we should NOT explicitly insert here if the hook is active.
            logAction('Imported IPOs', `Imported ${newIpos.length} IPOs from Excel`);
            
            const localIpos = newIpos.map((ipo, idx) => ({ id: currentMaxId + idx + 1, ...ipo }));
            setIpos(prev => [...prev, ...localIpos]);
            
            alert(`${newIpos.length} IPO(s) imported successfully!`);
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


// --- PROGRAM MANAGEMENT ---

export const downloadProgramManagementReport = (
    activeTab: 'Office' | 'Staffing' | 'Other',
    currentList: OfficeRequirement[] | StaffingRequirement[] | OtherProgramExpense[]
) => {
    let data: any[] = [];
    let sheetName = "";
    let fileName = "";

    if (activeTab === 'Office') {
        data = (currentList as OfficeRequirement[]).map(item => ({
            UID: item.uid,
            OU: item.operatingUnit,
            Equipment: item.equipment,
            Specs: item.specs,
            Purpose: item.purpose,
            'No. of Units': item.numberOfUnits,
            'Price/Unit': item.pricePerUnit,
            'Total Amount': item.numberOfUnits * item.pricePerUnit,
            'Fund Type': item.fundType,
            'Fund Year': item.fundYear,
            Tier: item.tier,
            'Obligation Date': item.obligationDate,
            'Disbursement Date': item.disbursementDate
        }));
        sheetName = "Office Requirements";
        fileName = "Office_Requirements_Report.xlsx";
    } else if (activeTab === 'Staffing') {
        data = (currentList as StaffingRequirement[]).map(item => ({
            UID: item.uid,
            OU: item.operatingUnit,
            Position: item.personnelPosition,
            Status: item.status,
            'Salary Grade': item.salaryGrade,
            'Annual Salary': item.annualSalary,
            Type: item.personnelType,
            'Fund Type': item.fundType,
            'Fund Year': item.fundYear,
            Tier: item.tier,
            'Obligation Date': item.obligationDate,
            'Disbursement Date': item.disbursementDate
        }));
        sheetName = "Staffing Requirements";
        fileName = "Staffing_Requirements_Report.xlsx";
    } else {
        data = (currentList as OtherProgramExpense[]).map(item => ({
            UID: item.uid,
            OU: item.operatingUnit,
            Particulars: item.particulars,
            Amount: item.amount,
            'Fund Type': item.fundType,
            'Fund Year': item.fundYear,
            Tier: item.tier,
            'Obligation Date': item.obligationDate,
            'Disbursement Date': item.disbursementDate
        }));
        sheetName = "Other Expenses";
        fileName = "Other_Expenses_Report.xlsx";
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, fileName);
};

export const downloadProgramManagementTemplate = (activeTab: 'Office' | 'Staffing' | 'Other') => {
    let headers: string[] = [];
    let commonHeaders = ['operatingUnit', 'fundYear', 'fundType', 'tier', 'obligationDate', 'disbursementDate', 'uacsCode'];
    let exampleData: any[] = [];

    if (activeTab === 'Office') {
        headers = [...commonHeaders, 'equipment', 'specs', 'purpose', 'numberOfUnits', 'pricePerUnit'];
        exampleData = [{
            operatingUnit: 'NPMO', fundYear: 2024, fundType: 'Current', tier: 'Tier 1', obligationDate: '2024-01-15', disbursementDate: '2024-02-15', uacsCode: '50203010-00',
            equipment: 'Laptop', specs: 'i7, 16GB RAM', purpose: 'For administrative use', numberOfUnits: 1, pricePerUnit: 50000
        }];
    } else if (activeTab === 'Staffing') {
        headers = [...commonHeaders, 'personnelPosition', 'status', 'salaryGrade', 'annualSalary', 'personnelType'];
        exampleData = [{
            operatingUnit: 'NPMO', fundYear: 2024, fundType: 'Current', tier: 'Tier 1', obligationDate: '2024-01-15', disbursementDate: '2024-02-15', uacsCode: '50100000-00',
            personnelPosition: 'Project Development Officer II', status: 'Contractual', salaryGrade: 15, annualSalary: 450000, personnelType: 'Technical'
        }];
    } else {
        headers = [...commonHeaders, 'particulars', 'amount'];
        exampleData = [{
            operatingUnit: 'NPMO', fundYear: 2024, fundType: 'Current', tier: 'Tier 1', obligationDate: '2024-01-15', disbursementDate: '2024-02-15', uacsCode: '50299990-99',
            particulars: 'Miscellaneous Expenses', amount: 10000
        }];
    }

    const ws = XLSX.utils.json_to_sheet(exampleData, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, `${activeTab}_Template.xlsx`);
};

export const handleProgramManagementUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    activeTab: 'Office' | 'Staffing' | 'Other',
    setFunction: React.Dispatch<React.SetStateAction<any[]>>,
    setIsUploading: (val: boolean) => void,
    currentUser: any
) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = event.target?.result;
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

            let tableName = '';
            let prefix = '';
            
            if (activeTab === 'Office') { tableName = 'office_requirements'; prefix = 'OR'; }
            else if (activeTab === 'Staffing') { tableName = 'staffing_requirements'; prefix = 'SR'; }
            else { tableName = 'other_program_expenses'; prefix = 'OE'; }

            const currentTimestamp = new Date().toISOString();
            const newItems = jsonData.map((row: any, index: number) => {
                const uid = `${prefix}-${row.fundYear || new Date().getFullYear()}-${Date.now().toString().slice(-4)}${index}`;
                
                // Prioritize row.operatingUnit
                const operatingUnit = row.operatingUnit ? String(row.operatingUnit).trim() : (currentUser?.operatingUnit || '');

                const common = {
                    operatingUnit: operatingUnit,
                    fundYear: row.fundYear,
                    fundType: row.fundType,
                    tier: row.tier,
                    obligationDate: row.obligationDate,
                    disbursementDate: row.disbursementDate,
                    uacsCode: row.uacsCode,
                    encodedBy: currentUser?.fullName || 'Upload',
                    created_at: currentTimestamp,
                    updated_at: currentTimestamp
                };

                if (activeTab === 'Office') return parseOfficeRequirementRow(row, { uid, ...common });
                if (activeTab === 'Staffing') return parseStaffingRequirementRow(row, { uid, ...common });
                return parseOtherExpenseRow(row, { uid, ...common });
            });

            if (supabase) {
                const { error } = await supabase.from(tableName).insert(newItems);
                if (error) throw error;
                // Fetch data again to sync (or rely on parent to refresh via other means, here we assume manual set)
                const { data } = await supabase.from(tableName).select('*').order('id', { ascending: true });
                if (data) setFunction(data);
            } else {
                setFunction((prev: any[]) => [...newItems.map((i, idx) => ({ ...i, id: Date.now() + idx })), ...prev]);
            }
            
            alert(`${newItems.length} items imported successfully.`);

        } catch (error: any) {
            console.error("Error processing file:", error);
            alert(`Failed to import: ${error.message}`);
        } finally {
            setIsUploading(false);
            if (e.target) e.target.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
};
