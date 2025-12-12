
// Author: AI
// OS support: Any
// Description: Constants and type definitions for the application

import React from 'react';

// --- Base Interface for Database Fields ---
export interface BaseEntity {
    created_at?: string;
    updated_at?: string;
    deleted_at?: string; // For soft deletes
}

export interface HistoryEntry {
    date: string;
    event: string;
    user: string;
}

export interface Commodity {
    type: string;
    particular: string;
    value: number; 
    isScad?: boolean;
}

export interface IPO extends BaseEntity {
    id: number;
    name: string;
    acronym: string;
    location: string;
    region: string;
    indigenousCulturalCommunity: string;
    ancestralDomainNo: string;
    registeringBody: string;
    isWomenLed: boolean;
    isWithinGida: boolean;
    isWithinElcac: boolean;
    isWithScad: boolean;
    contactPerson: string;
    contactNumber: string;
    registrationDate: string;
    commodities: Commodity[];
    levelOfDevelopment: 1 | 2 | 3 | 4 | 5;
    history?: HistoryEntry[];
    lat?: number;
    lng?: number;
}

export interface User extends BaseEntity {
    id: number;
    username: string;
    fullName: string;
    email: string;
    role: 'Administrator' | 'User' | 'Management';
    operatingUnit: string;
    password?: string; // Simple storage for this demo
}

// --- System Management Types ---
export interface Deadline {
    id: number;
    name: string;
    date: string;
}

export interface PlanningSchedule {
    id: number;
    name: string;
    startDate: string;
    endDate: string;
}

export interface SystemSettings {
    deadlines: Deadline[];
    planningSchedules: PlanningSchedule[];
}

export const defaultSystemSettings: SystemSettings = {
    deadlines: [
        { id: 1, name: "Budget Proposal Submission", date: "2024-03-31" }
    ],
    planningSchedules: [
        { id: 1, name: "Q1 Planning Workshop", startDate: "2024-01-15", endDate: "2024-01-20" },
        { id: 2, name: "Mid-Year Assessment", startDate: "2024-06-15", endDate: "2024-06-20" }
    ]
};

export const initialUacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } } = {
  MOOE: {
    "Travelling Expenses": {
      "50201010-00": "Travelling Expenses - Local",
      "50201020-00": "Travelling Expenses - Foreign",
    },
    "Training and Scholarship Expenses": {
        "50202010-01": "Training Expenses",
        "50202020-01": "Scholarship Grants/Expenses"
    },
    "Supplies and Materials Expenses": {
        "50203010-01": "Office Supplies Expenses",
        "50203080-00": "Agricultural and Marine Supplies Expenses",
        "50203990-00": "Other Supplies and Materials Expenses",
    },
    "Utility Expenses": {
        "50204010-00": "Water Expenses",
        "50204020-00": "Electricity Expenses",
    },
    "Professional Services": {
        "50211010-00": "Legal Services",
        "50211990-00": "Other Professional Services (Labor)",
    },
    "Repairs and Maintenance": {
        "50213040-00": "Repairs and Maintenance - Buildings and Other Structures",
        "50213050-00": "Repairs and Maintenance - Machinery and Equipment",
    },
    "Other MOOE": {
        "50299070-00": "Rent Expenses",
        "50299990-99": "Other MOOE",
    },
    "Personal Services": {
        "50101010-01": "Salaries and Wages - Casual/Contractual",
    },
  },
  CO: {
    "Buildings and Other Structures": {
        "10604020-00": "Buildings",
        "10604070-00": "Irrigation, Canals and Laterals"
    },
    "Machinery and Equipment": {
        "10605010-00": "Machinery",
        "10605030-00": "Agricultural, Fishery and Forestry Equipment",
        "10605150-00": "Technical and Scientific Equipment",
    },
    "Transportation Equipment": {
        "10606010-00": "Motor Vehicles",
    },
    "Breeding Stocks": {
        "10607010-00": "Breeding Stocks"
    }
  }
};

export const uacsCodes = initialUacsCodes;

export const objectTypes = ['MOOE', 'CO'] as const;
export type ObjectType = typeof objectTypes[number];


export interface SubprojectDetail {
    id: number;
    type: string;
    particulars: string;
    deliveryDate: string;
    unitOfMeasure: 'pcs' | 'kgs' | 'unit' | 'lot' | 'heads' | 'bags' | 'packs' | 'sets' | 'rolls' | 'cans' | 'liters' | 'meters' | 'boxes';
    pricePerUnit: number;
    numberOfUnits: number;
    objectType: ObjectType;
    expenseParticular: string;
    uacsCode: string;
    obligationMonth: string;
    disbursementMonth: string;
    // Accomplishment Fields
    actualDeliveryDate?: string;
    actualObligationDate?: string;
    actualDisbursementDate?: string;
    actualAmount?: number;
}

export interface SubprojectCommodity {
    typeName: string;
    name: string;
    area: number; // This represents Hectares for crops, or Number of Heads for livestock
    averageYield?: number; // e.g. kg/ha. Optional for Livestock.
    actualYield?: number; // Actual yield based on impact assessment
}

export const targetCommodityCategories: { [key: string]: string[] } = {
    'Crop Commodity': ['Coffee', 'Cacao', 'Coconut', 'Abaca', 'Corn', 'Rice', 'Banana', 'Vegetables', 'Root Crops', 'Spices', 'Rubber', 'Fruit Trees'],
    'Livestock': ['Poultry', 'Cattle', 'Swine', 'Goat', 'Fisheries']
};

export const targetCommodities = [
    ...targetCommodityCategories['Crop Commodity'],
    ...targetCommodityCategories['Livestock']
];

export const fundTypes = ['Current', 'Continuing', 'Insertion'] as const;
export type FundType = typeof fundTypes[number];

export const tiers = ['Tier 1', 'Tier 2'] as const;
export type Tier = typeof tiers[number];

export interface Subproject extends BaseEntity {
    id: number;
    uid: string;
    name: string;
    location: string;
    indigenousPeopleOrganization: string;
    ipo_id?: number; // Foreign Key to IPO
    status: 'Proposed' | 'Ongoing' | 'Completed' | 'Cancelled';
    details: SubprojectDetail[];
    subprojectCommodities?: SubprojectCommodity[];
    packageType: `Package ${number}`;
    startDate: string;
    estimatedCompletionDate: string;
    actualCompletionDate?: string;
    remarks?: string;
    lat: number;
    lng: number;
    history?: HistoryEntry[];
    fundingYear?: number;
    fundType?: FundType;
    tier?: Tier;
    operatingUnit: string;
    encodedBy: string;
    // Catch Up Plan
    catchUpPlanRemarks?: string;
    newTargetCompletionDate?: string;
}

export type TrainingComponentType = 'Social Preparation' | 'Production and Livelihood' | 'Marketing and Enterprise' | 'Program Management';

export const trainingComponents: TrainingComponentType[] = [
    'Social Preparation',
    'Production and Livelihood',
    'Marketing and Enterprise',
    'Program Management'
];

export const months = [
    'January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December'
] as const;
export type Month = typeof months[number];

export interface OtherActivityExpense {
    id: number;
    objectType: ObjectType;
    expenseParticular: string;
    uacsCode: string;
    obligationMonth: string;
    disbursementMonth: string;
    amount: number;
    // Accomplishment Fields
    actualObligationDate?: string;
    actualDisbursementDate?: string;
    actualAmount?: number;
}

export interface Training extends BaseEntity {
    id: number;
    uid?: string;
    name: string;
    date: string;
    description: string;
    location: string;
    facilitator: string;
    participatingIpos: string[];
    participating_ipo_ids?: number[]; // Foreign Keys for participating IPOs
    lat?: number;
    lng?: number;
    participantsMale: number;
    participantsFemale: number;
    expenses: OtherActivityExpense[];
    component: TrainingComponentType;
    fundingYear?: number;
    fundType?: FundType;
    tier?: Tier;
    operatingUnit: string;
    encodedBy: string;
    // Catch Up Plan
    catchUpPlanRemarks?: string;
    newTargetDate?: string;
    // Accomplishment Fields
    actualDate?: string;
    actualParticipantsMale?: number;
    actualParticipantsFemale?: number;
}

export type OtherActivityComponentType = 'Social Preparation' | 'Production and Livelihood' | 'Marketing and Enterprise' | 'Program Management';

export const otherActivityComponents: OtherActivityComponentType[] = [
    'Social Preparation',
    'Production and Livelihood',
    'Marketing and Enterprise',
    'Program Management'
];

export const socialPreparationActivities = [
    'Meetings', 'Orientation', 'Profiling', 'Community Needs Assessment', 
    'Review and Planning Workshop', 'IPO Registration Drive (RSBSA, SEC, DOLE, CDA)'
] as const;

export const marketingEnterpriseActivities = [
    'Market Linkaging', 'Trade and Promotional Activity'
] as const;

export const programManagementActivities = [
    'Sub-Project Monitoring', 'Performance and Budget Utilization Review (PBUR)', 'Planning and BEDS Preparation'
] as const;

export const otherActivityOptions: { [key in OtherActivityComponentType]: readonly string[] } = {
    'Social Preparation': socialPreparationActivities,
    'Production and Livelihood': [],
    'Marketing and Enterprise': marketingEnterpriseActivities,
    'Program Management': programManagementActivities,
};

export interface OtherActivity extends BaseEntity {
    id: number;
    uid?: string;
    component: OtherActivityComponentType;
    name: string;
    date: string;
    description: string;
    location: string;
    participatingIpos: string[]; 
    participating_ipo_ids?: number[]; // Foreign Keys
    participantsMale: number;
    participantsFemale: number;
    expenses: OtherActivityExpense[];
    fundingYear?: number;
    fundType?: FundType;
    tier?: Tier;
    operatingUnit: string;
    encodedBy: string;
    // Catch Up Plan
    catchUpPlanRemarks?: string;
    newTargetDate?: string;
    // Accomplishment Fields
    actualDate?: string;
    actualParticipantsMale?: number;
    actualParticipantsFemale?: number;
}

// --- Program Management Interfaces ---

export interface BaseProgramManagementItem extends BaseEntity {
    id: number;
    uid: string;
    operatingUnit: string;
    uacsCode: string;
    obligationDate: string;
    disbursementDate: string;
    fundType: FundType;
    fundYear: number;
    tier: Tier;
    encodedBy: string;
}

export interface OfficeRequirement extends BaseProgramManagementItem {
    equipment: string;
    specs: string;
    purpose: string;
    numberOfUnits: number;
    pricePerUnit: number;
}

export interface StaffingRequirement extends BaseProgramManagementItem {
    personnelPosition: string;
    status: 'Permanent' | 'Contractual' | 'COS' | 'Job Order';
    salaryGrade: number;
    annualSalary: number; // Includes incentives
    personnelType: 'Technical' | 'Administrative' | 'Support';
}

export interface OtherProgramExpense extends BaseProgramManagementItem {
    particulars: string;
    amount: number;
}


export interface NavLink {
    name: string;
    href: string;
    type?: 'separator';
}

export const commodityTypes: string[] = ['Crop Commodity', 'Livestock'];

export const initialParticularTypes: { [key: string]: string[] } = {
  'Livestock': ['Cattle', 'Goats', 'Pigs', 'Chicken', 'Carabao'],
  'Crop Commodity': ['Rice Seeds', 'Corn Seeds', 'Fertilizer', 'Pesticides', 'Coffee Seedlings', 'Vegetable Seeds', 'Fruit Tree Seedlings', 'Rubber Seedlings', 'Abaca Corms'],
  'Equipment': ['Tractor', 'Water Pump', 'Thresher', 'Harvester', 'Processing Equipment', 'Floating cages', 'Solar Dryer', 'Weighing Scale'],
  'Infrastructure': ['Cement', 'Gravel and Sand', 'Pipes and Fittings', 'Skilled Labor', 'Installation Labor', 'Processing Shed', 'Warehouse', 'Storage unit', 'Multi-purpose Drying Pavement'],
  'Others': ['Project Management', 'Heavy Equipment Rental', 'Training Materials', 'Catering Services', 'Fuel and Oil', 'Office Supplies']
};

export const particularTypes = initialParticularTypes;

export const operatingUnits = [
    "NPMO", "RPMO CAR", "RPMO 1", "RPMO 2", "RPMO 3", 
    "RPMO 4A", "RPMO 4B", "RPMO 5", "RPMO 6", "RPMO 7", 
    "RPMO 8", "RPMO 9", "RPMO 10", "RPMO 11", "RPMO 12", 
    "RPMO 13", "RPMO NIR"
];

export const ouToRegionMap: { [key: string]: string } = {
    'NPMO': 'National Capital Region (NCR)',
    'RPMO CAR': 'Cordillera Administrative Region (CAR)',
    'RPMO 1': 'Region I (Ilocos Region)',
    'RPMO 2': 'Region II (Cagayan Valley)',
    'RPMO 3': 'Region III (Central Luzon)',
    'RPMO 4A': 'Region IV-A (CALABARZON)',
    'RPMO 4B': 'MIMAROPA Region',
    'RPMO 5': 'Region V (Bicol Region)',
    'RPMO 6': 'Region VI (Western Visayas)',
    'RPMO 7': 'Region VII (Central Visayas)',
    'RPMO 8': 'Region VIII (Eastern Visayas)',
    'RPMO 9': 'Region IX (Zamboanga Peninsula)',
    'RPMO 10': 'Region X (Northern Mindanao)',
    'RPMO 11': 'Region XI (Davao Region)',
    'RPMO 12': 'Region XII (SOCCSKSARGEN)',
    'RPMO 13': 'Region XIII (Caraga)',
    'RPMO NIR': 'Negros Island Region (NIR)' // Placeholder if not in API yet
};

export const philippineRegions: string[] = [
    'National Capital Region (NCR)',
    'Cordillera Administrative Region (CAR)',
    'Region I (Ilocos Region)',
    'Region II (Cagayan Valley)',
    'Region III (Central Luzon)',
    'Region IV-A (CALABARZON)',
    'MIMAROPA Region',
    'Region V (Bicol Region)',
    'Region VI (Western Visayas)',
    'Region VII (Central Visayas)',
    'Region VIII (Eastern Visayas)',
    'Region IX (Zamboanga Peninsula)',
    'Region X (Northern Mindanao)',
    'Region XI (Davao Region)',
    'Region XII (SOCCSKSARGEN)',
    'Region XIII (Caraga)',
    'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)',
];


export const HomeIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
);

export const ProjectsIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
);

export const TrainingIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
        <path d="M12 14l9-5-9-5-9 5 9 5z" />
        <path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-9.998 12.078 12.078 0 01.665-6.479L12 14z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-9.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222 4 2.222V20" />
    </svg>
);

export const ActivitiesIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
);

export const IpoIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.184-1.268-.5-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.653.184-1.268.5-1.857m0 0a5.002 5.002 0 019 0m-4.5 5.002v-10a4.5 4.5 0 00-9 0v10m9 0a4.5 4.5 0 00-9 0" />
    </svg>
);

export const SettingsIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

export const ManagementIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
);


export const navigationLinks: NavLink[] = [
    { name: 'Homepage', href: '/' },
    { name: 'separator1', href: '#', type: 'separator' },
    { name: 'Dashboard', href: '/dashboards' },
    { name: 'Reports', href: '/reports' },
    { name: 'separator2', href: '#', type: 'separator' },
    { name: 'Subprojects', href: '/subprojects' },
    { name: 'Activities', href: '/activities' },
    { name: 'Program Management', href: '/program-management' },
    { name: 'separator3', href: '#', type: 'separator' },
    { name: 'Indigenous Peoples Organization', href: '/ipo' },
    { name: 'References', href: '/references' },
];


const flattenUacs = () => {
    const list: any[] = [];
    let id = 1;
    for (const objType in initialUacsCodes) {
        for (const particular in initialUacsCodes[objType]) {
             for (const code in initialUacsCodes[objType][particular]) {
                 list.push({
                     id: String(id++),
                     objectType: objType,
                     particular: particular,
                     uacsCode: code,
                     description: initialUacsCodes[objType][particular][code]
                 });
             }
        }
    }
    return list;
};

const flattenParticulars = () => {
    const list: any[] = [];
    let id = 1;
    for (const type in initialParticularTypes) {
        initialParticularTypes[type].forEach(p => {
            list.push({
                id: String(id++),
                type: type,
                particular: p
            });
        });
    }
    return list;
}


export const sampleReferenceUacsList = flattenUacs();
export const sampleReferenceParticularList = flattenParticulars();

export const sampleIPOs: IPO[] = [
    {
        id: 1,
        name: "Samahan ng mga Katutubong Dumagat",
        acronym: "SKD",
        location: "Brgy. Daraitan, Tanay, Rizal",
        region: "Region IV-A (CALABARZON)",
        indigenousCulturalCommunity: "Dumagat",
        ancestralDomainNo: "R4A-RIZ-TAN-001",
        registeringBody: "SEC",
        isWomenLed: false,
        isWithinGida: true,
        isWithinElcac: false,
        isWithScad: true,
        contactPerson: "Juan dela Cruz",
        contactNumber: "09171234567",
        registrationDate: "2020-05-15",
        commodities: [{ type: "Crop Commodity", particular: "Coffee Seedlings", value: 50, isScad: true }],
        levelOfDevelopment: 3,
        lat: 14.6127,
        lng: 121.3632,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 2,
        name: "Buhangin Farmers Association",
        acronym: "BFA",
        location: "Brgy. Buhangin, Malita, Davao Occidental",
        region: "Region XI (Davao Region)",
        indigenousCulturalCommunity: "Tagakaolo",
        ancestralDomainNo: "R11-DOC-MAL-002",
        registeringBody: "DOLE",
        isWomenLed: true,
        isWithinGida: true,
        isWithinElcac: true,
        isWithScad: false,
        contactPerson: "Maria Clara",
        contactNumber: "09187654321",
        registrationDate: "2021-08-20",
        commodities: [{ type: "Livestock", particular: "Goats", value: 30, isScad: false }],
        levelOfDevelopment: 2,
        lat: 6.4125,
        lng: 125.6115,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 3,
        name: "Macaingalan Coconut Farmers",
        acronym: "MCF",
        location: "Brgy. Macaingalan, General Nakar, Quezon",
        region: "Region IV-A (CALABARZON)",
        indigenousCulturalCommunity: "Dumagat-Remontado",
        ancestralDomainNo: "R4A-QUE-GEN-003",
        registeringBody: "CDA",
        isWomenLed: false,
        isWithinGida: true,
        isWithinElcac: false,
        isWithScad: true,
        contactPerson: "Pedro Penduko",
        contactNumber: "09191239876",
        registrationDate: "2019-03-10",
        commodities: [{ type: "Crop Commodity", particular: "Coconut", value: 100, isScad: true }],
        levelOfDevelopment: 4,
        lat: 14.7647,
        lng: 121.6329,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 4,
        name: "Adecor Mandaya Tribe",
        acronym: "AMT",
        location: "Brgy. Adecor, Island Garden City of Samal, Davao del Norte",
        region: "Region XI (Davao Region)",
        indigenousCulturalCommunity: "Mandaya",
        ancestralDomainNo: "R11-DNO-SAM-004",
        registeringBody: "NCIP",
        isWomenLed: true,
        isWithinGida: false,
        isWithinElcac: false,
        isWithScad: false,
        contactPerson: "Gabriela Silang",
        contactNumber: "09205554444",
        registrationDate: "2022-01-12",
        commodities: [{ type: "Crop Commodity", particular: "Cacao", value: 20, isScad: false }],
        levelOfDevelopment: 2,
        lat: 7.0565,
        lng: 125.7562,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 5,
        name: "Marilog Indigenous Women",
        acronym: "MIW",
        location: "Brgy. Marilog, Davao City, Davao del Sur",
        region: "Region XI (Davao Region)",
        indigenousCulturalCommunity: "Matigsalug",
        ancestralDomainNo: "R11-DCS-MAR-005",
        registeringBody: "SEC",
        isWomenLed: true,
        isWithinGida: true,
        isWithinElcac: true,
        isWithScad: true,
        contactPerson: "Teresa Magbanua",
        contactNumber: "09219998888",
        registrationDate: "2023-06-30",
        commodities: [{ type: "Livestock", particular: "Chicken", value: 200, isScad: true }],
        levelOfDevelopment: 1,
        lat: 7.4486,
        lng: 125.2646,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 6,
        name: "Kalinga Coffee Growers Association",
        acronym: "KCGA",
        location: "Brgy. Balbalan, Balbalan, Kalinga",
        region: "Cordillera Administrative Region (CAR)",
        indigenousCulturalCommunity: "Kalinga",
        ancestralDomainNo: "CAR-KAL-BAL-006",
        registeringBody: "CDA",
        isWomenLed: true,
        isWithinGida: true,
        isWithinElcac: false,
        isWithScad: true,
        contactPerson: "Luming Wan",
        contactNumber: "09223334455",
        registrationDate: "2018-11-05",
        commodities: [{ type: "Crop Commodity", particular: "Coffee Seedlings", value: 80, isScad: true }],
        levelOfDevelopment: 4,
        lat: 17.4439,
        lng: 121.1989,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 7,
        name: "Ilocos Norte Native Pig Raisers",
        acronym: "INNPR",
        location: "Brgy. Adams, Adams, Ilocos Norte",
        region: "Region I (Ilocos Region)",
        indigenousCulturalCommunity: "Isnag",
        ancestralDomainNo: "R1-ILN-ADA-007",
        registeringBody: "DOLE",
        isWomenLed: false,
        isWithinGida: true,
        isWithinElcac: false,
        isWithScad: false,
        contactPerson: "Andres Bonifacio",
        contactNumber: "09234445566",
        registrationDate: "2021-04-22",
        commodities: [{ type: "Livestock", particular: "Pigs", value: 50, isScad: false }],
        levelOfDevelopment: 2,
        lat: 18.4619,
        lng: 120.9631,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 8,
        name: "Cagayan Corn Farmers Cooperative",
        acronym: "CCFC",
        location: "Brgy. Peñablanca, Peñablanca, Cagayan",
        region: "Region II (Cagayan Valley)",
        indigenousCulturalCommunity: "Ibanag",
        ancestralDomainNo: "R2-CAG-PEN-008",
        registeringBody: "CDA",
        isWomenLed: false,
        isWithinGida: false,
        isWithinElcac: false,
        isWithScad: true,
        contactPerson: "Emilio Aguinaldo",
        contactNumber: "09245556677",
        registrationDate: "2017-09-15",
        commodities: [{ type: "Crop Commodity", particular: "Corn Seeds", value: 150, isScad: true }],
        levelOfDevelopment: 5,
        lat: 17.6536,
        lng: 121.8214,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 9,
        name: "Zambales Mango Growers",
        acronym: "ZMG",
        location: "Brgy. Botolan, Botolan, Zambales",
        region: "Region III (Central Luzon)",
        indigenousCulturalCommunity: "Aeta",
        ancestralDomainNo: "R3-ZAM-BOT-009",
        registeringBody: "SEC",
        isWomenLed: true,
        isWithinGida: true,
        isWithinElcac: true,
        isWithScad: true,
        contactPerson: "Gregoria de Jesus",
        contactNumber: "09256667788",
        registrationDate: "2019-02-28",
        commodities: [{ type: "Crop Commodity", particular: "Fruit Tree Seedlings", value: 60, isScad: true }],
        levelOfDevelopment: 3,
        lat: 15.2893,
        lng: 120.0234,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 10,
        name: "Mindoro Organic Rice Farmers",
        acronym: "MORF",
        location: "Brgy. Sablayan, Sablayan, Occidental Mindoro",
        region: "MIMAROPA Region",
        indigenousCulturalCommunity: "Mangyan",
        ancestralDomainNo: "R4B-OCM-SAB-010",
        registeringBody: "CDA",
        isWomenLed: false,
        isWithinGida: true,
        isWithinElcac: false,
        isWithScad: true,
        contactPerson: "Apolinario Mabini",
        contactNumber: "09267778899",
        registrationDate: "2020-12-10",
        commodities: [{ type: "Crop Commodity", particular: "Rice Seeds", value: 120, isScad: true }],
        levelOfDevelopment: 3,
        lat: 12.8378,
        lng: 120.8717,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 11,
        name: "Bicol Abaca Weavers Association",
        acronym: "BAWA",
        location: "Brgy. Virac, Virac, Catanduanes",
        region: "Region V (Bicol Region)",
        indigenousCulturalCommunity: "Agta",
        ancestralDomainNo: "R5-CAT-VIR-011",
        registeringBody: "DOLE",
        isWomenLed: true,
        isWithinGida: true,
        isWithinElcac: false,
        isWithScad: true,
        contactPerson: "Melchora Aquino",
        contactNumber: "09278889900",
        registrationDate: "2021-06-18",
        commodities: [{ type: "Crop Commodity", particular: "Abaca Corms", value: 75, isScad: true }],
        levelOfDevelopment: 3,
        lat: 13.5833,
        lng: 124.2333,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 12,
        name: "Panay Island Indigenous Fisherfolk",
        acronym: "PIIF",
        location: "Brgy. Malay, Malay, Aklan",
        region: "Region VI (Western Visayas)",
        indigenousCulturalCommunity: "Ati",
        ancestralDomainNo: "R6-AKL-MAL-012",
        registeringBody: "SEC",
        isWomenLed: false,
        isWithinGida: false,
        isWithinElcac: false,
        isWithScad: false,
        contactPerson: "Lapu Lapu",
        contactNumber: "09289990011",
        registrationDate: "2022-03-05",
        commodities: [{ type: "Livestock", particular: "Fisheries", value: 40, isScad: false }],
        levelOfDevelopment: 2,
        lat: 11.9000,
        lng: 121.9500,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 13,
        name: "Bukidnon Vegetable Gardeners",
        acronym: "BVG",
        location: "Brgy. Lantapan, Lantapan, Bukidnon",
        region: "Region X (Northern Mindanao)",
        indigenousCulturalCommunity: "Talaandig",
        ancestralDomainNo: "R10-BUK-LAN-013",
        registeringBody: "CDA",
        isWomenLed: true,
        isWithinGida: true,
        isWithinElcac: true,
        isWithScad: true,
        contactPerson: "Jose Rizal",
        contactNumber: "09290001122",
        registrationDate: "2018-05-20",
        commodities: [{ type: "Crop Commodity", particular: "Vegetable Seeds", value: 60, isScad: true }],
        levelOfDevelopment: 4,
        lat: 8.0500,
        lng: 125.0167,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 14,
        name: "Cotabato Rubber Tappers",
        acronym: "CRT",
        location: "Brgy. Makilala, Makilala, Cotabato",
        region: "Region XII (SOCCSKSARGEN)",
        indigenousCulturalCommunity: "Manobo",
        ancestralDomainNo: "R12-COT-MAK-014",
        registeringBody: "DOLE",
        isWomenLed: false,
        isWithinGida: true,
        isWithinElcac: false,
        isWithScad: true,
        contactPerson: "Sultan Kudarat",
        contactNumber: "09301112233",
        registrationDate: "2019-11-12",
        commodities: [{ type: "Crop Commodity", particular: "Rubber Seedlings", value: 100, isScad: true }],
        levelOfDevelopment: 3,
        lat: 6.9500,
        lng: 125.0833,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 15,
        name: "Caraga Manobo Tribal Council",
        acronym: "CMTC",
        location: "Brgy. Prosperidad, Prosperidad, Agusan del Sur",
        region: "Region XIII (Caraga)",
        indigenousCulturalCommunity: "Manobo",
        ancestralDomainNo: "R13-ADS-PRO-015",
        registeringBody: "NCIP",
        isWomenLed: false,
        isWithinGida: true,
        isWithinElcac: true,
        isWithScad: false,
        contactPerson: "Datu Lapu",
        contactNumber: "09312223344",
        registrationDate: "2023-01-25",
        commodities: [{ type: "Crop Commodity", particular: "Fruit Tree Seedlings", value: 50, isScad: false }],
        levelOfDevelopment: 1,
        lat: 8.6000,
        lng: 125.9000,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }
];

export const sampleSubprojects: Subproject[] = [
    {
        id: 1,
        uid: "SP-2024-001",
        name: "Coffee Processing Facility",
        location: "Brgy. Daraitan, Tanay, Rizal",
        indigenousPeopleOrganization: "Samahan ng mga Katutubong Dumagat",
        ipo_id: 1,
        status: "Ongoing",
        packageType: "Package 1",
        startDate: "2024-01-15",
        estimatedCompletionDate: "2024-06-15",
        lat: 14.6127,
        lng: 121.3632,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 4A",
        encodedBy: "Juan Dela Cruz",
        details: [
            { id: 1, type: "Infrastructure", particulars: "Processing Shed", deliveryDate: "2024-03-01", unitOfMeasure: "unit", pricePerUnit: 500000, numberOfUnits: 1, objectType: "CO", expenseParticular: "Buildings and Other Structures", uacsCode: "10604020-00", obligationMonth: "2024-01-30", disbursementMonth: "2024-03-15" },
            { id: 2, type: "Equipment", particulars: "Coffee Roaster", deliveryDate: "2024-04-01", unitOfMeasure: "unit", pricePerUnit: 150000, numberOfUnits: 1, objectType: "CO", expenseParticular: "Machinery and Equipment", uacsCode: "10605030-00", obligationMonth: "2024-02-28", disbursementMonth: "2024-04-15" }
        ],
        subprojectCommodities: [
            { typeName: "Crop Commodity", name: "Coffee", area: 5, averageYield: 800 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 2,
        uid: "SP-2024-002",
        name: "Goat Dispersal Project",
        location: "Brgy. Buhangin, Malita, Davao Occidental",
        indigenousPeopleOrganization: "Buhangin Farmers Association",
        ipo_id: 2,
        status: "Completed",
        actualCompletionDate: "2024-05-20",
        packageType: "Package 2",
        startDate: "2024-02-01",
        estimatedCompletionDate: "2024-05-30",
        lat: 6.4125,
        lng: 125.6115,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 11",
        encodedBy: "Admin User",
        details: [
            { id: 1, type: "Livestock", particulars: "Goats (Breeder)", deliveryDate: "2024-03-15", unitOfMeasure: "heads", pricePerUnit: 10000, numberOfUnits: 30, objectType: "CO", expenseParticular: "Breeding Stocks", uacsCode: "10607010-00", obligationMonth: "2024-02-15", disbursementMonth: "2024-03-20", actualDeliveryDate: "2024-03-15", actualObligationDate: "2024-02-15", actualDisbursementDate: "2024-03-20", actualAmount: 300000 }
        ],
        subprojectCommodities: [
            { typeName: "Livestock", name: "Goat", area: 30 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 3,
        uid: "SP-2024-003",
        name: "Virgin Coconut Oil Processing",
        location: "Brgy. Macaingalan, General Nakar, Quezon",
        indigenousPeopleOrganization: "Macaingalan Coconut Farmers",
        ipo_id: 3,
        status: "Proposed",
        packageType: "Package 3",
        startDate: "2024-07-01",
        estimatedCompletionDate: "2024-12-31",
        lat: 14.7647,
        lng: 121.6329,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 2",
        operatingUnit: "RPMO 4A",
        encodedBy: "Juan Dela Cruz",
        details: [
            { id: 1, type: "Equipment", particulars: "VCO Press", deliveryDate: "2024-08-01", unitOfMeasure: "unit", pricePerUnit: 80000, numberOfUnits: 2, objectType: "CO", expenseParticular: "Machinery and Equipment", uacsCode: "10605030-00", obligationMonth: "2024-07-15", disbursementMonth: "2024-08-15" }
        ],
        subprojectCommodities: [
            { typeName: "Crop Commodity", name: "Coconut", area: 10, averageYield: 1500 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 4,
        uid: "SP-2023-004",
        name: "Cacao Nursery Establishment",
        location: "Brgy. Adecor, Island Garden City of Samal, Davao del Norte",
        indigenousPeopleOrganization: "Adecor Mandaya Tribe",
        ipo_id: 4,
        status: "Cancelled",
        packageType: "Package 1",
        startDate: "2023-05-01",
        estimatedCompletionDate: "2023-10-30",
        remarks: "Cancelled due to land dispute.",
        lat: 7.0565,
        lng: 125.7562,
        fundingYear: 2023,
        fundType: "Continuing",
        tier: "Tier 1",
        operatingUnit: "RPMO 11",
        encodedBy: "Admin User",
        details: [
            { id: 1, type: "Crop Commodity", particulars: "Cacao Seedlings", deliveryDate: "2023-06-01", unitOfMeasure: "pcs", pricePerUnit: 50, numberOfUnits: 5000, objectType: "MOOE", expenseParticular: "Supplies and Materials Expenses", uacsCode: "50203080-00", obligationMonth: "2023-05-15", disbursementMonth: "2023-06-15" }
        ],
        subprojectCommodities: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 5,
        uid: "SP-2024-005",
        name: "Native Chicken Production",
        location: "Brgy. Marilog, Davao City, Davao del Sur",
        indigenousPeopleOrganization: "Marilog Indigenous Women",
        ipo_id: 5,
        status: "Ongoing",
        packageType: "Package 2",
        startDate: "2024-04-01",
        estimatedCompletionDate: "2024-09-30",
        lat: 7.4486,
        lng: 125.2646,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 11",
        encodedBy: "Admin User",
        details: [
            { id: 1, type: "Livestock", particulars: "Native Chicken", deliveryDate: "2024-05-01", unitOfMeasure: "heads", pricePerUnit: 500, numberOfUnits: 200, objectType: "MOOE", expenseParticular: "Supplies and Materials Expenses", uacsCode: "50203080-00", obligationMonth: "2024-04-15", disbursementMonth: "2024-05-15" }
        ],
        subprojectCommodities: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 6,
        uid: "SP-2024-006",
        name: "Abaca Fiber Production Expansion",
        location: "Brgy. Virac, Virac, Catanduanes",
        indigenousPeopleOrganization: "Bicol Abaca Weavers Association",
        ipo_id: 11,
        status: "Ongoing",
        packageType: "Package 1",
        startDate: "2024-02-10",
        estimatedCompletionDate: "2024-08-30",
        lat: 13.5833,
        lng: 124.2333,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 5",
        encodedBy: "Staff 5",
        details: [
            { id: 1, type: "Equipment", particulars: "Decorticating Machine", deliveryDate: "2024-04-15", unitOfMeasure: "unit", pricePerUnit: 250000, numberOfUnits: 2, objectType: "CO", expenseParticular: "Machinery and Equipment", uacsCode: "10605030-00", obligationMonth: "2024-03-01", disbursementMonth: "2024-04-30" }
        ],
        subprojectCommodities: [{ typeName: "Crop Commodity", name: "Abaca", area: 15, averageYield: 1200 }],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 7,
        uid: "SP-2024-007",
        name: "Solar Dryer Construction",
        location: "Brgy. Peñablanca, Peñablanca, Cagayan",
        indigenousPeopleOrganization: "Cagayan Corn Farmers Cooperative",
        ipo_id: 8,
        status: "Completed",
        actualCompletionDate: "2024-06-30",
        packageType: "Package 2",
        startDate: "2024-03-01",
        estimatedCompletionDate: "2024-06-30",
        lat: 17.6536,
        lng: 121.8214,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 2",
        encodedBy: "Staff 2",
        details: [
            { id: 1, type: "Infrastructure", particulars: "Multi-purpose Drying Pavement", deliveryDate: "2024-06-15", unitOfMeasure: "unit", pricePerUnit: 850000, numberOfUnits: 1, objectType: "CO", expenseParticular: "Buildings and Other Structures", uacsCode: "10604020-00", obligationMonth: "2024-03-15", disbursementMonth: "2024-06-20", actualDeliveryDate: "2024-06-15", actualObligationDate: "2024-03-15", actualDisbursementDate: "2024-06-20", actualAmount: 850000 }
        ],
        subprojectCommodities: [{ typeName: "Crop Commodity", name: "Corn", area: 25, averageYield: 3500 }],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 8,
        uid: "SP-2024-008",
        name: "Native Pig Production Project",
        location: "Brgy. Adams, Adams, Ilocos Norte",
        indigenousPeopleOrganization: "Ilocos Norte Native Pig Raisers",
        ipo_id: 7,
        status: "Ongoing",
        packageType: "Package 1",
        startDate: "2024-05-01",
        estimatedCompletionDate: "2024-10-30",
        lat: 18.4619,
        lng: 120.9631,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 1",
        encodedBy: "Staff 1",
        details: [
            { id: 1, type: "Livestock", particulars: "Native Pig Breeders", deliveryDate: "2024-06-01", unitOfMeasure: "heads", pricePerUnit: 5000, numberOfUnits: 40, objectType: "CO", expenseParticular: "Breeding Stocks", uacsCode: "10607010-00", obligationMonth: "2024-05-15", disbursementMonth: "2024-06-15" }
        ],
        subprojectCommodities: [{ typeName: "Livestock", name: "Swine", area: 40 }],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 9,
        uid: "SP-2024-009",
        name: "Community Coffee Roasting Center",
        location: "Brgy. Balbalan, Balbalan, Kalinga",
        indigenousPeopleOrganization: "Kalinga Coffee Growers Association",
        ipo_id: 6,
        status: "Proposed",
        packageType: "Package 3",
        startDate: "2024-09-01",
        estimatedCompletionDate: "2025-02-28",
        lat: 17.4439,
        lng: 121.1989,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 2",
        operatingUnit: "RPMO CAR",
        encodedBy: "Staff CAR",
        details: [
            { id: 1, type: "Equipment", particulars: "Industrial Coffee Roaster", deliveryDate: "2024-11-01", unitOfMeasure: "unit", pricePerUnit: 1200000, numberOfUnits: 1, objectType: "CO", expenseParticular: "Machinery and Equipment", uacsCode: "10605030-00", obligationMonth: "2024-09-15", disbursementMonth: "2024-11-15" },
            { id: 2, type: "Equipment", particulars: "Coffee Grinder", deliveryDate: "2024-11-01", unitOfMeasure: "unit", pricePerUnit: 80000, numberOfUnits: 2, objectType: "CO", expenseParticular: "Machinery and Equipment", uacsCode: "10605030-00", obligationMonth: "2024-09-15", disbursementMonth: "2024-11-15" }
        ],
        subprojectCommodities: [{ typeName: "Crop Commodity", name: "Coffee", area: 20, averageYield: 900 }],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 10,
        uid: "SP-2024-010",
        name: "Organic Fertilizer Processing",
        location: "Brgy. Lantapan, Lantapan, Bukidnon",
        indigenousPeopleOrganization: "Bukidnon Vegetable Gardeners",
        ipo_id: 13,
        status: "Ongoing",
        packageType: "Package 1",
        startDate: "2024-04-15",
        estimatedCompletionDate: "2024-09-15",
        lat: 8.0500,
        lng: 125.0167,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 10",
        encodedBy: "Staff 10",
        details: [
            { id: 1, type: "Equipment", particulars: "Shredder Machine", deliveryDate: "2024-05-15", unitOfMeasure: "unit", pricePerUnit: 180000, numberOfUnits: 1, objectType: "CO", expenseParticular: "Machinery and Equipment", uacsCode: "10605030-00", obligationMonth: "2024-04-30", disbursementMonth: "2024-05-30" },
            { id: 2, type: "Crop Commodity", particulars: "Microbial Inoculant", deliveryDate: "2024-05-15", unitOfMeasure: "packs", pricePerUnit: 500, numberOfUnits: 200, objectType: "MOOE", expenseParticular: "Agricultural and Marine Supplies Expenses", uacsCode: "50203080-00", obligationMonth: "2024-04-30", disbursementMonth: "2024-05-30" }
        ],
        subprojectCommodities: [{ typeName: "Crop Commodity", name: "Vegetables", area: 12, averageYield: 5000 }],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 11,
        uid: "SP-2024-011",
        name: "Aquaculture Livelihood Project",
        location: "Brgy. Malay, Malay, Aklan",
        indigenousPeopleOrganization: "Panay Island Indigenous Fisherfolk",
        ipo_id: 12,
        status: "Proposed",
        packageType: "Package 1",
        startDate: "2024-08-01",
        estimatedCompletionDate: "2024-12-15",
        lat: 11.9000,
        lng: 121.9500,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 6",
        encodedBy: "Staff 6",
        details: [
            { id: 1, type: "Equipment", particulars: "Floating Cages", deliveryDate: "2024-09-01", unitOfMeasure: "unit", pricePerUnit: 75000, numberOfUnits: 10, objectType: "CO", expenseParticular: "Machinery and Equipment", uacsCode: "10605030-00", obligationMonth: "2024-08-15", disbursementMonth: "2024-09-15" }
        ],
        subprojectCommodities: [{ typeName: "Livestock", name: "Fisheries", area: 10 }],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 12,
        uid: "SP-2023-012",
        name: "Mango Post-Harvest Facility",
        location: "Brgy. Botolan, Botolan, Zambales",
        indigenousPeopleOrganization: "Zambales Mango Growers",
        ipo_id: 9,
        status: "Completed",
        actualCompletionDate: "2023-11-20",
        packageType: "Package 2",
        startDate: "2023-06-01",
        estimatedCompletionDate: "2023-11-30",
        lat: 15.2893,
        lng: 120.0234,
        fundingYear: 2023,
        fundType: "Continuing",
        tier: "Tier 1",
        operatingUnit: "RPMO 3",
        encodedBy: "Staff 3",
        details: [
            { id: 1, type: "Infrastructure", particulars: "Packing House", deliveryDate: "2023-10-15", unitOfMeasure: "unit", pricePerUnit: 1500000, numberOfUnits: 1, objectType: "CO", expenseParticular: "Buildings and Other Structures", uacsCode: "10604020-00", obligationMonth: "2023-06-15", disbursementMonth: "2023-10-30", actualDeliveryDate: "2023-10-15", actualObligationDate: "2023-06-15", actualDisbursementDate: "2023-10-30", actualAmount: 1500000 }
        ],
        subprojectCommodities: [{ typeName: "Crop Commodity", name: "Fruit Trees", area: 50, averageYield: 6000 }],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 13,
        uid: "SP-2024-013",
        name: "Heirloom Rice Input Support",
        location: "Brgy. Sablayan, Sablayan, Occidental Mindoro",
        indigenousPeopleOrganization: "Mindoro Organic Rice Farmers",
        ipo_id: 10,
        status: "Ongoing",
        packageType: "Package 1",
        startDate: "2024-05-15",
        estimatedCompletionDate: "2024-08-15",
        lat: 12.8378,
        lng: 120.8717,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 4B",
        encodedBy: "Staff 4B",
        details: [
            { id: 1, type: "Crop Commodity", particulars: "Organic Fertilizer", deliveryDate: "2024-06-01", unitOfMeasure: "bags", pricePerUnit: 1200, numberOfUnits: 500, objectType: "MOOE", expenseParticular: "Agricultural and Marine Supplies Expenses", uacsCode: "50203080-00", obligationMonth: "2024-05-20", disbursementMonth: "2024-06-10" }
        ],
        subprojectCommodities: [{ typeName: "Crop Commodity", name: "Rice", area: 40, averageYield: 4000 }],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 14,
        uid: "SP-2024-014",
        name: "Rubber Sheet Processing Center",
        location: "Brgy. Makilala, Makilala, Cotabato",
        indigenousPeopleOrganization: "Cotabato Rubber Tappers",
        ipo_id: 14,
        status: "Proposed",
        packageType: "Package 2",
        startDate: "2024-10-01",
        estimatedCompletionDate: "2025-03-31",
        lat: 6.9500,
        lng: 125.0833,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 12",
        encodedBy: "Staff 12",
        details: [
            { id: 1, type: "Infrastructure", particulars: "Processing Shed", deliveryDate: "2025-01-15", unitOfMeasure: "unit", pricePerUnit: 600000, numberOfUnits: 1, objectType: "CO", expenseParticular: "Buildings and Other Structures", uacsCode: "10604020-00", obligationMonth: "2024-10-15", disbursementMonth: "2025-01-30" },
            { id: 2, type: "Equipment", particulars: "Rubber Sheeter", deliveryDate: "2025-02-15", unitOfMeasure: "unit", pricePerUnit: 90000, numberOfUnits: 4, objectType: "CO", expenseParticular: "Machinery and Equipment", uacsCode: "10605030-00", obligationMonth: "2024-10-15", disbursementMonth: "2025-02-28" }
        ],
        subprojectCommodities: [{ typeName: "Crop Commodity", name: "Rubber", area: 30, averageYield: 2000 }],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 15,
        uid: "SP-2024-015",
        name: "Agro-forestry Nursery Project",
        location: "Brgy. Prosperidad, Prosperidad, Agusan del Sur",
        indigenousPeopleOrganization: "Caraga Manobo Tribal Council",
        ipo_id: 15,
        status: "Ongoing",
        packageType: "Package 1",
        startDate: "2024-03-15",
        estimatedCompletionDate: "2024-09-15",
        lat: 8.6000,
        lng: 125.9000,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 13",
        encodedBy: "Staff 13",
        details: [
            { id: 1, type: "Infrastructure", particulars: "Nursery Shed", deliveryDate: "2024-05-01", unitOfMeasure: "unit", pricePerUnit: 300000, numberOfUnits: 1, objectType: "CO", expenseParticular: "Buildings and Other Structures", uacsCode: "10604020-00", obligationMonth: "2024-03-30", disbursementMonth: "2024-05-15" },
            { id: 2, type: "Crop Commodity", particulars: "Poly Bags", deliveryDate: "2024-04-15", unitOfMeasure: "packs", pricePerUnit: 250, numberOfUnits: 1000, objectType: "MOOE", expenseParticular: "Agricultural and Marine Supplies Expenses", uacsCode: "50203080-00", obligationMonth: "2024-03-30", disbursementMonth: "2024-04-30" }
        ],
        subprojectCommodities: [{ typeName: "Crop Commodity", name: "Fruit Trees", area: 20 }],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }
];

export const sampleTrainings: Training[] = [
    {
        id: 1,
        uid: "TRN-2024-001",
        name: "Organizational Management Training",
        date: "2024-02-10",
        description: "Training for IPO officers on leadership and management.",
        location: "Tanay, Rizal",
        facilitator: "DA-4K Regional Staff",
        participatingIpos: ["Samahan ng mga Katutubong Dumagat"],
        participating_ipo_ids: [1],
        participantsMale: 10,
        participantsFemale: 15,
        component: "Social Preparation",
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 4A",
        encodedBy: "Juan Dela Cruz",
        expenses: [
            { id: 1, objectType: "MOOE", expenseParticular: "Training and Scholarship Expenses", uacsCode: "50202010-01", obligationMonth: "2024-02-01", disbursementMonth: "2024-02-15", amount: 45000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 2,
        uid: "TRN-2024-002",
        name: "Goat Raising Technology",
        date: "2024-03-05",
        description: "Technical training on goat production.",
        location: "Malita, Davao Occidental",
        facilitator: "Provincial Veterinarian Office",
        participatingIpos: ["Buhangin Farmers Association"],
        participating_ipo_ids: [2],
        participantsMale: 20,
        participantsFemale: 5,
        component: "Production and Livelihood",
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 11",
        encodedBy: "Admin User",
        expenses: [
            { id: 1, objectType: "MOOE", expenseParticular: "Training and Scholarship Expenses", uacsCode: "50202010-01", obligationMonth: "2024-02-20", disbursementMonth: "2024-03-10", amount: 30000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 3,
        uid: "TRN-2024-003",
        name: "VCO Processing Workshop",
        date: "2024-07-15",
        description: "Workshop on standard VCO processing methods.",
        location: "General Nakar, Quezon",
        facilitator: "PCA",
        participatingIpos: ["Macaingalan Coconut Farmers"],
        participating_ipo_ids: [3],
        participantsMale: 12,
        participantsFemale: 12,
        component: "Production and Livelihood",
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 2",
        operatingUnit: "RPMO 4A",
        encodedBy: "Juan Dela Cruz",
        expenses: [
            { id: 1, objectType: "MOOE", expenseParticular: "Training and Scholarship Expenses", uacsCode: "50202010-01", obligationMonth: "2024-07-01", disbursementMonth: "2024-07-20", amount: 50000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 4,
        uid: "TRN-2023-004",
        name: "Cacao Rehabilitation Training",
        date: "2023-06-20",
        description: "Training on rehabilitating old cacao trees.",
        location: "Island Garden City of Samal, Davao del Norte",
        facilitator: "DA High Value Crops",
        participatingIpos: ["Adecor Mandaya Tribe"],
        participating_ipo_ids: [4],
        participantsMale: 25,
        participantsFemale: 10,
        component: "Production and Livelihood",
        fundingYear: 2023,
        fundType: "Continuing",
        tier: "Tier 1",
        operatingUnit: "RPMO 11",
        encodedBy: "Admin User",
        expenses: [
            { id: 1, objectType: "MOOE", expenseParticular: "Training and Scholarship Expenses", uacsCode: "50202010-01", obligationMonth: "2023-06-01", disbursementMonth: "2023-06-25", amount: 35000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 5,
        uid: "TRN-2024-005",
        name: "Financial Literacy Workshop",
        date: "2024-05-10",
        description: "Basic bookkeeping and financial management.",
        location: "Davao City",
        facilitator: "Cooperative Development Authority",
        participatingIpos: ["Marilog Indigenous Women", "Buhangin Farmers Association"],
        participating_ipo_ids: [5, 2],
        participantsMale: 5,
        participantsFemale: 25,
        component: "Social Preparation",
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 11",
        encodedBy: "Admin User",
        expenses: [
            { id: 1, objectType: "MOOE", expenseParticular: "Training and Scholarship Expenses", uacsCode: "50202010-01", obligationMonth: "2024-05-01", disbursementMonth: "2024-05-15", amount: 60000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 6,
        uid: "TRN-2024-006",
        name: "Abaca Fiber Grading and Classification",
        date: "2024-03-20",
        description: "Standard grading systems for abaca fiber quality.",
        location: "Virac, Catanduanes",
        facilitator: "PhilFIDA",
        participatingIpos: ["Bicol Abaca Weavers Association"],
        participating_ipo_ids: [11],
        participantsMale: 18,
        participantsFemale: 12,
        component: "Marketing and Enterprise",
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 5",
        encodedBy: "Staff 5",
        expenses: [
            { id: 1, objectType: "MOOE", expenseParticular: "Training and Scholarship Expenses", uacsCode: "50202010-01", obligationMonth: "2024-03-05", disbursementMonth: "2024-03-25", amount: 40000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 7,
        uid: "TRN-2024-007",
        name: "GAP for Corn Production",
        date: "2024-02-15",
        description: "Good Agricultural Practices for sustainable corn farming.",
        location: "Peñablanca, Cagayan",
        facilitator: "DA Regional Field Office 02",
        participatingIpos: ["Cagayan Corn Farmers Cooperative"],
        participating_ipo_ids: [8],
        participantsMale: 25,
        participantsFemale: 5,
        component: "Production and Livelihood",
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 2",
        encodedBy: "Staff 2",
        expenses: [
            { id: 1, objectType: "MOOE", expenseParticular: "Training and Scholarship Expenses", uacsCode: "50202010-01", obligationMonth: "2024-02-01", disbursementMonth: "2024-02-20", amount: 35000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 8,
        uid: "TRN-2024-008",
        name: "Swine Management and Biosecurity",
        date: "2024-04-10",
        description: "Preventing ASF and improving swine productivity.",
        location: "Adams, Ilocos Norte",
        facilitator: "Provincial Vet",
        participatingIpos: ["Ilocos Norte Native Pig Raisers"],
        participating_ipo_ids: [7],
        participantsMale: 15,
        participantsFemale: 15,
        component: "Production and Livelihood",
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 1",
        encodedBy: "Staff 1",
        expenses: [
            { id: 1, objectType: "MOOE", expenseParticular: "Training and Scholarship Expenses", uacsCode: "50202010-01", obligationMonth: "2024-03-25", disbursementMonth: "2024-04-15", amount: 38000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 9,
        uid: "TRN-2024-009",
        name: "Coffee Quality Cupping",
        date: "2024-08-05",
        description: "Training on sensory evaluation of coffee.",
        location: "Balbalan, Kalinga",
        facilitator: "Barista Association",
        participatingIpos: ["Kalinga Coffee Growers Association"],
        participating_ipo_ids: [6],
        participantsMale: 8,
        participantsFemale: 12,
        component: "Marketing and Enterprise",
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 2",
        operatingUnit: "RPMO CAR",
        encodedBy: "Staff CAR",
        expenses: [
            { id: 1, objectType: "MOOE", expenseParticular: "Training and Scholarship Expenses", uacsCode: "50202010-01", obligationMonth: "2024-07-20", disbursementMonth: "2024-08-10", amount: 55000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 10,
        uid: "TRN-2024-010",
        name: "Organic Vegetable Farming",
        date: "2024-03-12",
        description: "Techniques for organic vegetable production.",
        location: "Lantapan, Bukidnon",
        facilitator: "ATI",
        participatingIpos: ["Bukidnon Vegetable Gardeners"],
        participating_ipo_ids: [13],
        participantsMale: 10,
        participantsFemale: 20,
        component: "Production and Livelihood",
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 10",
        encodedBy: "Staff 10",
        expenses: [
            { id: 1, objectType: "MOOE", expenseParticular: "Training and Scholarship Expenses", uacsCode: "50202010-01", obligationMonth: "2024-02-28", disbursementMonth: "2024-03-15", amount: 32000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 11,
        uid: "TRN-2024-011",
        name: "Fisheries Law Enforcement",
        date: "2024-06-08",
        description: "Bantay Dagat training for community.",
        location: "Malay, Aklan",
        facilitator: "BFAR",
        participatingIpos: ["Panay Island Indigenous Fisherfolk"],
        participating_ipo_ids: [12],
        participantsMale: 25,
        participantsFemale: 5,
        component: "Social Preparation",
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 6",
        encodedBy: "Staff 6",
        expenses: [
            { id: 1, objectType: "MOOE", expenseParticular: "Training and Scholarship Expenses", uacsCode: "50202010-01", obligationMonth: "2024-05-25", disbursementMonth: "2024-06-15", amount: 42000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 12,
        uid: "TRN-2023-012",
        name: "Mango Processing Technology",
        date: "2023-09-15",
        description: "Dried mango and puree making.",
        location: "Botolan, Zambales",
        facilitator: "DOST",
        participatingIpos: ["Zambales Mango Growers"],
        participating_ipo_ids: [9],
        participantsMale: 5,
        participantsFemale: 25,
        component: "Marketing and Enterprise",
        fundingYear: 2023,
        fundType: "Continuing",
        tier: "Tier 1",
        operatingUnit: "RPMO 3",
        encodedBy: "Staff 3",
        expenses: [
            { id: 1, objectType: "MOOE", expenseParticular: "Training and Scholarship Expenses", uacsCode: "50202010-01", obligationMonth: "2023-09-01", disbursementMonth: "2023-09-20", amount: 45000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 13,
        uid: "TRN-2024-013",
        name: "System of Rice Intensification",
        date: "2024-05-22",
        description: "Water saving technology for rice.",
        location: "Sablayan, Occidental Mindoro",
        facilitator: "PhilRice",
        participatingIpos: ["Mindoro Organic Rice Farmers"],
        participating_ipo_ids: [10],
        participantsMale: 20,
        participantsFemale: 10,
        component: "Production and Livelihood",
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 4B",
        encodedBy: "Staff 4B",
        expenses: [
            { id: 1, objectType: "MOOE", expenseParticular: "Training and Scholarship Expenses", uacsCode: "50202010-01", obligationMonth: "2024-05-10", disbursementMonth: "2024-05-30", amount: 36000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 14,
        uid: "TRN-2024-014",
        name: "Proper Rubber Tapping",
        date: "2024-07-10",
        description: "Techniques to prolong rubber tree life.",
        location: "Makilala, Cotabato",
        facilitator: "DA",
        participatingIpos: ["Cotabato Rubber Tappers"],
        participating_ipo_ids: [14],
        participantsMale: 25,
        participantsFemale: 5,
        component: "Production and Livelihood",
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 12",
        encodedBy: "Staff 12",
        expenses: [
            { id: 1, objectType: "MOOE", expenseParticular: "Training and Scholarship Expenses", uacsCode: "50202010-01", obligationMonth: "2024-06-25", disbursementMonth: "2024-07-15", amount: 33000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 15,
        uid: "TRN-2024-015",
        name: "Values Formation and Leadership",
        date: "2024-01-30",
        description: "Strengthening IPO organizational structure.",
        location: "Prosperidad, Agusan del Sur",
        facilitator: "NCIP",
        participatingIpos: ["Caraga Manobo Tribal Council"],
        participating_ipo_ids: [15],
        participantsMale: 15,
        participantsFemale: 15,
        component: "Social Preparation",
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 13",
        encodedBy: "Staff 13",
        expenses: [
            { id: 1, objectType: "MOOE", expenseParticular: "Training and Scholarship Expenses", uacsCode: "50202010-01", obligationMonth: "2024-01-15", disbursementMonth: "2024-02-05", amount: 48000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }
];

export const sampleOtherActivities: OtherActivity[] = [
    {
        id: 1,
        uid: "ACT-2024-001",
        component: "Social Preparation",
        name: "Community Needs Assessment",
        date: "2024-01-20",
        description: "Conducted CNA to identify priority projects.",
        location: "Brgy. Daraitan, Tanay, Rizal",
        participatingIpos: ["Samahan ng mga Katutubong Dumagat"],
        participating_ipo_ids: [1],
        participantsMale: 15,
        participantsFemale: 20,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 4A",
        encodedBy: "Juan Dela Cruz",
        expenses: [
             { id: 1, objectType: "MOOE", expenseParticular: "Travelling Expenses", uacsCode: "50201010-00", obligationMonth: "2024-01-15", disbursementMonth: "2024-01-25", amount: 15000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 2,
        uid: "ACT-2024-002",
        component: "Program Management",
        name: "Sub-Project Monitoring",
        date: "2024-04-15",
        description: "Monitoring of ongoing goat dispersal project.",
        location: "Malita, Davao Occidental",
        participatingIpos: ["Buhangin Farmers Association"],
        participating_ipo_ids: [2],
        participantsMale: 3,
        participantsFemale: 2,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 11",
        encodedBy: "Admin User",
        expenses: [
             { id: 1, objectType: "MOOE", expenseParticular: "Travelling Expenses", uacsCode: "50201010-00", obligationMonth: "2024-04-01", disbursementMonth: "2024-04-20", amount: 20000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 3,
        uid: "ACT-2024-003",
        component: "Marketing and Enterprise",
        name: "Market Linkaging",
        date: "2024-06-10",
        description: "Meeting with potential buyers for coffee products.",
        location: "Manila",
        participatingIpos: ["Samahan ng mga Katutubong Dumagat"],
        participating_ipo_ids: [1],
        participantsMale: 2,
        participantsFemale: 3,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 4A",
        encodedBy: "Juan Dela Cruz",
        expenses: [
             { id: 1, objectType: "MOOE", expenseParticular: "Representation Expenses", uacsCode: "50299030-00", obligationMonth: "2024-06-01", disbursementMonth: "2024-06-15", amount: 5000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 4,
        uid: "ACT-2024-004",
        component: "Social Preparation",
        name: "IPO Registration Drive (RSBSA, SEC, DOLE, CDA)",
        date: "2024-02-15",
        description: "Assisted IPOs in completing registration requirements.",
        location: "General Nakar, Quezon",
        participatingIpos: ["Macaingalan Coconut Farmers"],
        participating_ipo_ids: [3],
        participantsMale: 10,
        participantsFemale: 10,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 4A",
        encodedBy: "Juan Dela Cruz",
        expenses: [
             { id: 1, objectType: "MOOE", expenseParticular: "Office Supplies Expenses", uacsCode: "50203010-01", obligationMonth: "2024-02-01", disbursementMonth: "2024-02-20", amount: 8000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 5,
        uid: "ACT-2024-005",
        component: "Program Management",
        name: "Performance and Budget Utilization Review (PBUR)",
        date: "2024-07-05",
        description: "Mid-year review of program performance.",
        location: "Quezon City",
        participatingIpos: [],
        participating_ipo_ids: [],
        participantsMale: 10,
        participantsFemale: 15,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "NPMO",
        encodedBy: "Admin User",
        expenses: [
             { id: 1, objectType: "MOOE", expenseParticular: "Other Supplies and Materials Expenses", uacsCode: "50203990-00", obligationMonth: "2024-06-20", disbursementMonth: "2024-07-10", amount: 50000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 6,
        uid: "ACT-2024-006",
        component: "Marketing and Enterprise",
        name: "Trade Fair Participation",
        date: "2024-05-15",
        description: "Participation in Regional Trade Fair.",
        location: "Legazpi City",
        participatingIpos: ["Bicol Abaca Weavers Association"],
        participating_ipo_ids: [11],
        participantsMale: 2,
        participantsFemale: 3,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 5",
        encodedBy: "Staff 5",
        expenses: [
             { id: 1, objectType: "MOOE", expenseParticular: "Travelling Expenses", uacsCode: "50201010-00", obligationMonth: "2024-05-01", disbursementMonth: "2024-05-20", amount: 12000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 7,
        uid: "ACT-2024-007",
        component: "Social Preparation",
        name: "Profiling",
        date: "2024-01-10",
        description: "Detailed profiling of farmer members.",
        location: "Peñablanca, Cagayan",
        participatingIpos: ["Cagayan Corn Farmers Cooperative"],
        participating_ipo_ids: [8],
        participantsMale: 20,
        participantsFemale: 20,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 2",
        encodedBy: "Staff 2",
        expenses: [
             { id: 1, objectType: "MOOE", expenseParticular: "Office Supplies Expenses", uacsCode: "50203010-01", obligationMonth: "2024-01-05", disbursementMonth: "2024-01-25", amount: 5000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 8,
        uid: "ACT-2024-008",
        component: "Social Preparation",
        name: "Orientation",
        date: "2024-02-05",
        description: "Program orientation for new beneficiaries.",
        location: "Adams, Ilocos Norte",
        participatingIpos: ["Ilocos Norte Native Pig Raisers"],
        participating_ipo_ids: [7],
        participantsMale: 15,
        participantsFemale: 15,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 1",
        encodedBy: "Staff 1",
        expenses: [
             { id: 1, objectType: "MOOE", expenseParticular: "Other Supplies and Materials Expenses", uacsCode: "50203990-00", obligationMonth: "2024-01-25", disbursementMonth: "2024-02-10", amount: 7000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 9,
        uid: "ACT-2024-009",
        component: "Marketing and Enterprise",
        name: "Market Linkaging",
        date: "2024-09-10",
        description: "Linking coffee growers with Manila buyers.",
        location: "Baguio City",
        participatingIpos: ["Kalinga Coffee Growers Association"],
        participating_ipo_ids: [6],
        participantsMale: 3,
        participantsFemale: 2,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO CAR",
        encodedBy: "Staff CAR",
        expenses: [
             { id: 1, objectType: "MOOE", expenseParticular: "Representation Expenses", uacsCode: "50299030-00", obligationMonth: "2024-08-25", disbursementMonth: "2024-09-15", amount: 8000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 10,
        uid: "ACT-2024-010",
        component: "Marketing and Enterprise",
        name: "Trade and Promotional Activity",
        date: "2024-08-20",
        description: "Kadayawan Agri-Trade Fair participation.",
        location: "Davao City",
        participatingIpos: ["Marilog Indigenous Women"],
        participating_ipo_ids: [5],
        participantsMale: 2,
        participantsFemale: 5,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 11",
        encodedBy: "Admin User",
        expenses: [
             { id: 1, objectType: "MOOE", expenseParticular: "Rent Expenses", uacsCode: "50299070-00", obligationMonth: "2024-08-01", disbursementMonth: "2024-08-25", amount: 15000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 11,
        uid: "ACT-2024-011",
        component: "Social Preparation",
        name: "Meetings",
        date: "2024-01-15",
        description: "Consultation meeting with tribal leaders.",
        location: "Prosperidad, Agusan del Sur",
        participatingIpos: ["Caraga Manobo Tribal Council"],
        participating_ipo_ids: [15],
        participantsMale: 10,
        participantsFemale: 5,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 13",
        encodedBy: "Staff 13",
        expenses: [
             { id: 1, objectType: "MOOE", expenseParticular: "Representation Expenses", uacsCode: "50299030-00", obligationMonth: "2024-01-05", disbursementMonth: "2024-01-20", amount: 4000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 12,
        uid: "ACT-2024-012",
        component: "Program Management",
        name: "Planning and BEDS Preparation",
        date: "2023-11-15",
        description: "Preparation of 2024 Work and Financial Plan.",
        location: "Koronadal City",
        participatingIpos: [],
        participating_ipo_ids: [],
        participantsMale: 5,
        participantsFemale: 5,
        fundingYear: 2023,
        fundType: "Continuing",
        tier: "Tier 1",
        operatingUnit: "RPMO 12",
        encodedBy: "Staff 12",
        expenses: [
             { id: 1, objectType: "MOOE", expenseParticular: "Office Supplies Expenses", uacsCode: "50203010-01", obligationMonth: "2023-11-01", disbursementMonth: "2023-11-20", amount: 6000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 13,
        uid: "ACT-2024-013",
        component: "Social Preparation",
        name: "IPO Registration Drive (RSBSA, SEC, DOLE, CDA)",
        date: "2024-03-10",
        description: "Processing of RSBSA enrollment.",
        location: "Lantapan, Bukidnon",
        participatingIpos: ["Bukidnon Vegetable Gardeners"],
        participating_ipo_ids: [13],
        participantsMale: 20,
        participantsFemale: 20,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 10",
        encodedBy: "Staff 10",
        expenses: [
             { id: 1, objectType: "MOOE", expenseParticular: "Travelling Expenses", uacsCode: "50201010-00", obligationMonth: "2024-03-01", disbursementMonth: "2024-03-15", amount: 8000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 14,
        uid: "ACT-2024-014",
        component: "Social Preparation",
        name: "Review and Planning Workshop",
        date: "2024-06-25",
        description: "Mid-year assessment with fisherfolk.",
        location: "Malay, Aklan",
        participatingIpos: ["Panay Island Indigenous Fisherfolk"],
        participating_ipo_ids: [12],
        participantsMale: 15,
        participantsFemale: 10,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 6",
        encodedBy: "Staff 6",
        expenses: [
             { id: 1, objectType: "MOOE", expenseParticular: "Other Supplies and Materials Expenses", uacsCode: "50203990-00", obligationMonth: "2024-06-15", disbursementMonth: "2024-06-30", amount: 15000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: 15,
        uid: "ACT-2024-015",
        component: "Program Management",
        name: "Sub-Project Monitoring",
        date: "2024-05-20",
        description: "Inspection of delivered inputs.",
        location: "Sablayan, Occidental Mindoro",
        participatingIpos: ["Mindoro Organic Rice Farmers"],
        participating_ipo_ids: [10],
        participantsMale: 2,
        participantsFemale: 1,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 4B",
        encodedBy: "Staff 4B",
        expenses: [
             { id: 1, objectType: "MOOE", expenseParticular: "Travelling Expenses", uacsCode: "50201010-00", obligationMonth: "2024-05-10", disbursementMonth: "2024-05-25", amount: 10000 }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }
];

// --- Program Management Sample Data ---

export const sampleOfficeRequirements: OfficeRequirement[] = [
    {
        id: 1,
        uid: "OR-2024-001",
        operatingUnit: "RPMO 4A",
        uacsCode: "10605010-00",
        obligationDate: "2024-01-15",
        disbursementDate: "2024-02-01",
        fundType: "Current",
        fundYear: 2024,
        tier: "Tier 1",
        equipment: "Laptop",
        specs: "Intel i5, 8GB RAM, 512GB SSD",
        purpose: "For Project Monitoring Officer",
        numberOfUnits: 2,
        pricePerUnit: 45000,
        encodedBy: "Juan Dela Cruz",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }
];

export const sampleStaffingRequirements: StaffingRequirement[] = [
    {
        id: 1,
        uid: "SR-2024-001",
        operatingUnit: "RPMO 4A",
        uacsCode: "50101010-01",
        obligationDate: "2024-01-01",
        disbursementDate: "2024-01-31",
        fundType: "Current",
        fundYear: 2024,
        tier: "Tier 1",
        personnelPosition: "Project Development Officer II",
        status: "Contractual",
        salaryGrade: 15,
        annualSalary: 420000,
        personnelType: "Technical",
        encodedBy: "Juan Dela Cruz",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }
];

export const sampleOtherProgramExpenses: OtherProgramExpense[] = [
    {
        id: 1,
        uid: "OE-2024-001",
        operatingUnit: "RPMO 4A",
        uacsCode: "50203010-01",
        obligationDate: "2024-02-10",
        disbursementDate: "2024-02-25",
        fundType: "Current",
        fundYear: 2024,
        tier: "Tier 1",
        particulars: "Office Supplies for Q1",
        amount: 15000,
        encodedBy: "Juan Dela Cruz",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }
];
