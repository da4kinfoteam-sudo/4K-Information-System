

import React from 'react';

// Centralized Type Definitions
export interface HistoryEntry {
    date: string;
    event: string;
    user: string;
}

export interface Commodity {
    type: string;
    particular: string;
    value: number; // Hectares for crops, heads for livestock
    isScad?: boolean;
}

export interface IPO {
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
}

export const objectCodes = ['MOOE', 'CO', 'PS'] as const;
export type ObjectCode = typeof objectCodes[number];

export interface SubprojectDetail {
    id: number;
    type: string;
    particulars: string;
    deliveryDate: string;
    unitOfMeasure: 'pcs' | 'kgs' | 'unit' | 'lot';
    pricePerUnit: number;
    numberOfUnits: number;
    objectCode: ObjectCode;
    obligationMonth: string;
    disbursementMonth: string;
}

export const fundTypes = ['Current', 'Continuing', 'Insertion'] as const;
export type FundType = typeof fundTypes[number];

export const tiers = ['Tier 1', 'Tier 2'] as const;
export type Tier = typeof tiers[number];

export interface Subproject {
    id: number;
    name: string;
    location: string;
    indigenousPeopleOrganization: string;
    status: 'Proposed' | 'Ongoing' | 'Completed' | 'Cancelled';
    details: SubprojectDetail[];
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

export interface Disbursement {
    month: Month;
    amount: number;
}

export interface Training {
    id: number;
    name: string;
    date: string;
    description: string;
    location: string;
    facilitator: string;
    participatingIpos: string[];
    lat?: number;
    lng?: number;
    participantsMale: number;
    participantsFemale: number;
    trainingExpenses: number;
    component: TrainingComponentType;
    otherExpenses?: number;
    fundingYear?: number;
    fundType?: FundType;
    tier?: Tier;
    monthOfObligation?: Month;
    disbursementSchedule?: Disbursement[];
}

export interface Activity {
    id: number;
    name: string;
    date: string;
}


export interface NavLink {
    name: string;
    href: string;
}

export const commodityTypes: string[] = ['Crop Commodity', 'Livestock'];

export const particularTypes: { [key: string]: string[] } = {
  'Livestock': ['Cattle', 'Goats', 'Pigs', 'Chicken', 'Carabao'],
  'Crop Commodity': ['Rice Seeds', 'Corn Seeds', 'Fertilizer', 'Pesticides', 'Coffee Seedlings'],
  'Equipment': ['Tractor', 'Water Pump', 'Thresher', 'Harvester', 'Processing Equipment', 'Floating cages'],
  'Infrastructure': ['Cement', 'Gravel and Sand', 'Pipes and Fittings', 'Skilled Labor', 'Installation Labor', 'Processing Shed', 'Warehouse', 'Storage unit'],
  'Others': ['Project Management', 'Heavy Equipment Rental', 'Training Materials']
};


export const philippineLocations: { [key: string]: any } = {
  "Online": {},
  "CALABARZON (Region IV-A)": {
    "Rizal": {
      "Tanay": ["San Isidro", "Daraitan"],
      "Baras": ["Pinugay"]
    },
    "Quezon": {
      "General Nakar": ["Macaingalan"]
    }
  },
  "Davao Region (Region XI)": {
    "Davao del Sur": {
      "Davao City": ["Marilog"]
    },
    "Davao Occidental": {
      "Malita": ["Buhangin"]
    },
    "Davao de Oro": {
      "New Bataan": ["Camanlangan"]
    },
    "Davao del Norte": {
      "Island Garden City of Samal": ["Adecor"]
    }
  },
  "National Capital Region (NCR)": {
    "Metro Manila": {
      "Quezon City": ["Diliman", "Cubao", "Project 4"],
      "Manila": ["Tondo", "Ermita", "Sampaloc"],
      "Makati": ["Poblacion", "Bel-Air"]
    }
  }
};

export const philippineRegions: string[] = [
    'National Capital Region (NCR)',
    'Cordillera Administrative Region (CAR)',
    'Ilocos Region (Region I)',
    'Cagayan Valley (Region II)',
    'Central Luzon (Region III)',
    'CALABARZON (Region IV-A)',
    'MIMAROPA (Region IV-B)',
    'Bicol Region (Region V)',
    'Western Visayas (Region VI)',
    'Central Visayas (Region VII)',
    'Zamboanga Peninsula (Region IX)',
    'Northern Mindanao (Region X)',
    'Davao Region (Region XI)',
    'SOCCSKSARGEN (Region XII)',
    'Caraga (Region XIII)',
    'Negros Island Region (NIR)',
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


export const navigationLinks: NavLink[] = [
    { name: 'Homepage', href: '/' },
    { name: 'Dashboards', href: '/dashboards' },
    { name: 'Subprojects', href: '/subprojects' },
    { name: 'Trainings', href: '/trainings' },
    { name: 'Other Activities', href: '/other-activities' },
    { name: 'Indigenous Peoples Organization', href: '/ipo' },
];