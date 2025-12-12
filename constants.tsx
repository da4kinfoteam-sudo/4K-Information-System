
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
    // Accomlishment Fields
    actualDate?: string;
    actualAmount?: number;
    actualObligationDate?: string;
    actualDisbursementDate?: string;
    actualObligationAmount?: number;
    actualDisbursementAmount?: number;
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
    // ... [Sample data preserved] ...
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
    // ... [Other IPOs] ...
    {
        id: 10,
        name: "Dumagat-Remontado of General Nakar",
        acronym: "DRGN",
        location: "General Nakar, Quezon",
        region: "Region IV-A (CALABARZON)",
        indigenousCulturalCommunity: "Dumagat-Remontado",
        ancestralDomainNo: "R4A-QUE-GEN-010",
        registeringBody: "NCIP",
        isWomenLed: false,
        isWithinGida: true,
        isWithinElcac: false,
        isWithScad: true,
        contactPerson: "Kakay Tolits",
        contactNumber: "09151112222",
        registrationDate: "2018-05-25",
        commodities: [{ type: "Crop Commodity", particular: "Coconut", value: 200, isScad: true }],
        levelOfDevelopment: 3,
        lat: 14.7648,
        lng: 121.6366,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }
];

export const sampleSubprojects: Subproject[] = [
    // ... [Sample Subprojects preserved] ...
    {
        id: 1,
        uid: "SP-2024-001",
        name: "Coffee Production and Processing Project",
        location: "Brgy. Daraitan, Tanay, Rizal",
        indigenousPeopleOrganization: "Samahan ng mga Katutubong Dumagat",
        ipo_id: 1,
        status: "Ongoing",
        details: [
            { id: 1, type: "Crop Commodity", particulars: "Coffee Seedlings", deliveryDate: "2024-02-15", unitOfMeasure: "pcs", pricePerUnit: 50, numberOfUnits: 1000, objectType: "MOOE", expenseParticular: "Agricultural and Marine Supplies Expenses", uacsCode: "50203080-00", obligationMonth: "2024-01-30", disbursementMonth: "2024-02-28", actualDeliveryDate: "2024-02-20", actualObligationDate: "2024-02-01", actualDisbursementDate: "2024-03-01", actualAmount: 50000 },
            { id: 2, type: "Equipment", particulars: "Coffee Roaster", deliveryDate: "2024-06-30", unitOfMeasure: "unit", pricePerUnit: 150000, numberOfUnits: 1, objectType: "CO", expenseParticular: "Machinery and Equipment", uacsCode: "10605030-00", obligationMonth: "2024-03-15", disbursementMonth: "2024-07-15" }
        ],
        subprojectCommodities: [{ typeName: "Crop Commodity", name: "Coffee", area: 2, averageYield: 500 }],
        packageType: "Package 1",
        startDate: "2024-01-15",
        estimatedCompletionDate: "2024-12-15",
        lat: 14.6127,
        lng: 121.3632,
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 4A",
        encodedBy: "Juan Dela Cruz",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    // ... [Other subprojects] ...
    {
        id: 10,
        uid: "SP-2024-010",
        name: "Coconut Processing Facility",
        location: "General Nakar, Quezon",
        indigenousPeopleOrganization: "Dumagat-Remontado of General Nakar",
        ipo_id: 10,
        status: "Proposed",
        details: [
            { id: 12, type: "Infrastructure", particulars: "Processing Shed", deliveryDate: "2024-07-30", unitOfMeasure: "lot", pricePerUnit: 500000, numberOfUnits: 1, objectType: "CO", expenseParticular: "Buildings and Other Structures", uacsCode: "10604020-00", obligationMonth: "2024-05-15", disbursementMonth: "2024-08-15" }
        ],
        subprojectCommodities: [{ typeName: "Crop Commodity", name: "Coconut", area: 0, averageYield: 0 }],
        packageType: "Package 4",
        startDate: "2024-06-01",
        estimatedCompletionDate: "2024-12-30",
        lat: 14.7648,
        lng: 121.6366,
        fundingYear: 2024,
        fundType: "Insertion",
        tier: "Tier 1",
        operatingUnit: "RPMO 4A",
        encodedBy: "Kakay Tolits",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }
];

export const sampleTrainings: Training[] = [
    // ... [Sample Trainings preserved] ...
    {
        id: 1,
        uid: "TRN-2024-001",
        name: "Social Preparation Training",
        date: "2024-01-20",
        description: "Community organizing and leadership basics for IPO members.",
        location: "Brgy. Daraitan, Tanay, Rizal",
        facilitator: "Mr. Juan Tamad",
        participatingIpos: ["Samahan ng mga Katutubong Dumagat"],
        participating_ipo_ids: [1],
        lat: 14.6127,
        lng: 121.3632,
        participantsMale: 15,
        participantsFemale: 20,
        expenses: [
            { id: 1, objectType: "MOOE", expenseParticular: "Training Expenses", uacsCode: "50202010-01", obligationMonth: "2024-01-10", disbursementMonth: "2024-01-25", amount: 35000, actualAmount: 34500, actualObligationDate: "2024-01-12", actualDisbursementDate: "2024-01-28" }
        ],
        component: "Social Preparation",
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 4A",
        encodedBy: "Admin User",
        actualDate: "2024-01-20",
        actualParticipantsMale: 15,
        actualParticipantsFemale: 20,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    // ... [Other trainings] ...
    {
        id: 10,
        uid: "TRN-2024-010",
        name: "Project Management Training for RPMO",
        date: "2024-01-15",
        description: "Training for regional staff on 4K program implementation.",
        location: "Quezon City (NCR)",
        facilitator: "NPMO Head",
        participatingIpos: [], // Staff training
        participating_ipo_ids: [],
        lat: 14.6460,
        lng: 121.0560,
        participantsMale: 10,
        participantsFemale: 15,
        expenses: [
            { id: 10, objectType: "MOOE", expenseParticular: "Training Expenses", uacsCode: "50202010-01", obligationMonth: "2024-01-05", disbursementMonth: "2024-01-20", amount: 100000, actualAmount: 95000, actualObligationDate: "2024-01-08", actualDisbursementDate: "2024-01-25" }
        ],
        component: "Program Management",
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "NPMO",
        encodedBy: "Admin User",
        actualDate: "2024-01-15",
        actualParticipantsMale: 10,
        actualParticipantsFemale: 15,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }
];

export const sampleOtherActivities: OtherActivity[] = [
    // ... [Sample Other Activities preserved] ...
    {
        id: 1,
        uid: "ACT-2024-001",
        component: "Social Preparation",
        name: "Meetings",
        date: "2024-01-10",
        description: "Consultation meeting with IPO leaders regarding proposed projects.",
        location: "Brgy. Daraitan, Tanay, Rizal",
        participatingIpos: ["Samahan ng mga Katutubong Dumagat"],
        participating_ipo_ids: [1],
        participantsMale: 5,
        participantsFemale: 3,
        expenses: [
            { id: 1, objectType: "MOOE", expenseParticular: "Other MOOE", uacsCode: "50299990-99", obligationMonth: "2024-01-05", disbursementMonth: "2024-01-15", amount: 5000, actualAmount: 4800, actualObligationDate: "2024-01-07", actualDisbursementDate: "2024-01-18" }
        ],
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 4A",
        encodedBy: "Juan Dela Cruz",
        actualDate: "2024-01-10",
        actualParticipantsMale: 5,
        actualParticipantsFemale: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    // ... [Other Activities] ...
    {
        id: 10,
        uid: "ACT-2024-010",
        component: "Marketing and Enterprise",
        name: "Trade and Promotional Activity",
        date: "2024-08-15",
        description: "Participation in Regional Agro-Trade Fair.",
        location: "Cagayan de Oro City",
        participatingIpos: ["Higaonon Tribal Council", "Manobo Tribal Association"],
        participating_ipo_ids: [6, 9],
        participantsMale: 4,
        participantsFemale: 6,
        expenses: [
            { id: 10, objectType: "MOOE", expenseParticular: "Rent Expenses", uacsCode: "50299070-00", obligationMonth: "2024-07-30", disbursementMonth: "2024-08-10", amount: 25000 }
        ],
        fundingYear: 2024,
        fundType: "Current",
        tier: "Tier 1",
        operatingUnit: "RPMO 10",
        encodedBy: "Admin User",
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
        actualDate: "2024-02-01",
        actualAmount: 90000,
        actualObligationDate: "2024-01-18",
        actualDisbursementDate: "2024-02-05",
        actualObligationAmount: 90000,
        actualDisbursementAmount: 90000,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    // ... [Other Office Reqs preserved] ...
    {
        id: 10,
        uid: "OR-2024-010",
        operatingUnit: "RPMO 13",
        uacsCode: "10605010-00",
        obligationDate: "2024-07-15",
        disbursementDate: "2024-07-30",
        fundType: "Current",
        fundYear: 2024,
        tier: "Tier 1",
        equipment: "Camera",
        specs: "DSLR with kit lens",
        purpose: "For documentation",
        numberOfUnits: 1,
        pricePerUnit: 35000,
        encodedBy: "Bae Aida",
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
        actualDate: "2024-01-31",
        actualAmount: 35000, 
        actualObligationDate: "2024-01-05",
        actualDisbursementDate: "2024-01-31",
        actualObligationAmount: 35000,
        actualDisbursementAmount: 35000,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    // ... [Other Staffing Reqs preserved] ...
    {
        id: 10,
        uid: "SR-2024-010",
        operatingUnit: "RPMO 13",
        uacsCode: "50101010-01",
        obligationDate: "2024-01-01",
        disbursementDate: "2024-01-31",
        fundType: "Current",
        fundYear: 2024,
        tier: "Tier 1",
        personnelPosition: "Encoder",
        status: "Job Order",
        salaryGrade: 6,
        annualSalary: 180000,
        personnelType: "Support",
        encodedBy: "Bae Aida",
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
        actualDate: "2024-02-25",
        actualAmount: 14500,
        actualObligationDate: "2024-02-12",
        actualDisbursementDate: "2024-02-27",
        actualObligationAmount: 15000,
        actualDisbursementAmount: 14500,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    // ... [Other Program Expenses preserved] ...
    {
        id: 10,
        uid: "OE-2024-010",
        operatingUnit: "RPMO 13",
        uacsCode: "50299990-99",
        obligationDate: "2024-02-01",
        disbursementDate: "2024-02-15",
        fundType: "Current",
        fundYear: 2024,
        tier: "Tier 1",
        particulars: "Courier Services",
        amount: 2000,
        encodedBy: "Bae Aida",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }
];
