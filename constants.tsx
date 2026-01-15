
// Author: 4K 
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
    // Membership Information
    totalMembers?: number;
    totalIpMembers?: number;
    totalMaleMembers?: number;
    totalFemaleMembers?: number;
    totalYouthMembers?: number;
    totalSeniorMembers?: number;
    total4PsMembers?: number;
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

// Initial UACS Codes cleared to allow user uploads
export const initialUacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } } = {};

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

export type ActivityComponentType = 'Social Preparation' | 'Production and Livelihood' | 'Marketing and Enterprise' | 'Program Management';

export const otherActivityComponents: ActivityComponentType[] = [
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

export const otherActivityOptions: { [key in ActivityComponentType]: readonly string[] } = {
    'Social Preparation': socialPreparationActivities,
    'Production and Livelihood': [],
    'Marketing and Enterprise': marketingEnterpriseActivities,
    'Program Management': programManagementActivities,
};

export const months = [
    'January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December'
] as const;
export type Month = typeof months[number];

export interface ActivityExpense {
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

// Unified Activity Interface
export interface Activity extends BaseEntity {
    id: number;
    uid?: string;
    type: 'Training' | 'Activity'; // Database Discriminator
    name: string;
    date: string;
    description: string;
    location: string;
    facilitator?: string; // Specific to Training
    participatingIpos: string[];
    participating_ipo_ids?: number[]; // Foreign Keys for participating IPOs
    lat?: number;
    lng?: number;
    participantsMale: number;
    participantsFemale: number;
    expenses: ActivityExpense[];
    component: ActivityComponentType;
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

// Aliases for backward compatibility with Report components
export type Training = Activity;
export type OtherActivity = Activity;
export type OtherActivityExpense = ActivityExpense;
export type OtherActivityComponentType = ActivityComponentType;
export type TrainingComponentType = ActivityComponentType;

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
  'Agricultural Inputs': [
      // Combined list
      'Rice Seeds', 'Corn Seeds', 'Fertilizer', 'Pesticides', 'Coffee Seedlings', 
      'Vegetable Seeds', 'Fruit Tree Seedlings', 'Rubber Seedlings', 'Abaca Corms',
      'Cattle', 'Goats', 'Pigs', 'Chicken', 'Carabao'
  ],
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

export interface ReferenceUacs {
    id: string;
    objectType: string;
    particular: string;
    uacsCode: string;
    description: string;
}

export interface ReferenceParticular {
    id: string;
    type: string;
    particular: string;
}
