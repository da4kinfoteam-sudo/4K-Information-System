
// Author: 4K 
import React, { useState, useMemo, useEffect, useRef } from 'react';
import StatCard from './StatCard';
import { TrainingIcon, IpoIcon, ProjectsIcon, ActivitiesIcon, SubprojectDetail, tiers, fundTypes, operatingUnits, ouToRegionMap, SystemSettings } from '../constants';
import { Subproject, IPO, Activity, OfficeRequirement, StaffingRequirement, OtherProgramExpense } from '../constants';
import GanttChart from './GanttChart';
import { useAuth } from '../contexts/AuthContext';
import { parseLocation } from './LocationPicker';

// Since Leaflet is loaded from a script tag, we need to declare it for TypeScript
declare const L: any;

// Coordinate Lookup Table
const PROVINCE_COORDINATES: {[key: string]: [number, number]} = {
    // Regions
    'National Capital Region (NCR)': [14.5995, 120.9842],
    'Cordillera Administrative Region (CAR)': [17.3513, 121.1719],
    'Region I (Ilocos Region)': [16.6159, 120.3209],
    'Region II (Cagayan Valley)': [17.6131, 121.7270],
    'Region III (Central Luzon)': [15.4828, 120.7120],
    'Region IV-A (CALABARZON)': [14.1008, 121.0794],
    'MIMAROPA Region': [13.1119, 121.0794], 
    'Region V (Bicol Region)': [13.4210, 123.4137],
    'Region VI (Western Visayas)': [11.0050, 122.5373],
    'Region VII (Central Visayas)': [10.3157, 123.8854],
    'Region VIII (Eastern Visayas)': [11.2433, 125.0086],
    'Region IX (Zamboanga Peninsula)': [7.8352, 122.3995],
    'Region X (Northern Mindanao)': [8.2280, 124.2452],
    'Region XI (Davao Region)': [7.1907, 125.4553],
    'Region XII (SOCCSKSARGEN)': [6.5073, 124.8390],
    'Region XIII (Caraga)': [8.8097, 125.5406],
    'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)': [7.2104, 124.2452],
    
    // Key Provinces
    'Abra': [17.5750, 120.7397], 'Agusan del Norte': [9.0270, 125.4833], 'Agusan del Sur': [8.5270, 125.7833],
    'Aklan': [11.6933, 122.3556], 'Albay': [13.1706, 123.6339], 'Antique': [11.0167, 122.0333], 'Apayao': [18.0833, 121.2167],
    'Aurora': [16.0000, 121.5833], 'Basilan': [6.5667, 122.0833], 'Bataan': [14.6667, 120.4167], 'Batanes': [20.4485, 121.9708],
    'Batangas': [13.9167, 121.0000], 'Benguet': [16.5667, 120.6667], 'Bohol': [9.8833, 124.2167], 'Bukidnon': [7.9167, 125.0000],
    'Bulacan': [14.9667, 121.0333], 'Cagayan': [18.0000, 121.8333], 'Camarines Norte': [14.1667, 122.7500], 'Camarines Sur': [13.5000, 123.3333],
    'Camiguin': [9.1833, 124.7167], 'Capiz': [11.4167, 122.7500], 'Catanduanes': [13.7500, 124.2500], 'Cavite': [14.2833, 120.9167],
    'Cebu': [10.3167, 123.8833], 'Cotabato': [7.2104, 124.2452], 'Davao de Oro': [7.6333, 126.0000], 'Davao del Norte': [7.5000, 125.6667],
    'Davao del Sur': [6.6667, 125.4167], 'Davao Occidental': [6.0833, 125.5000], 'Davao Oriental': [7.0000, 126.3333], 'Dinagat Islands': [10.1333, 125.6000],
    'Eastern Samar': [11.5000, 125.5000], 'Guimaras': [10.5667, 122.5833], 'Ifugao': [16.8333, 121.1667], 'Ilocos Norte': [18.1667, 120.7500],
    'Ilocos Sur': [17.2500, 120.5000], 'Iloilo': [11.0000, 122.6667], 'Isabela': [17.0000, 122.0000], 'Kalinga': [17.4167, 121.1667],
    'La Union': [16.5000, 120.4167], 'Laguna': [14.2833, 121.4167], 'Lanao del Norte': [8.0000, 124.0000], 'Lanao del Sur': [7.8333, 124.2500],
    'Leyte': [10.8333, 124.8333], 'Maguindanao': [7.0000, 124.5000], 'Marinduque': [13.4167, 121.9167], 'Masbate': [12.1667, 123.5000],
    'Misamis Occidental': [8.4167, 123.7500], 'Misamis Oriental': [8.6667, 124.7500], 'Mountain Province': [17.0833, 121.0000], 'Negros Occidental': [10.3333, 123.0000],
    'Negros Oriental': [9.5833, 123.1667], 'Northern Samar': [12.3333, 124.6667], 'Nueva Ecija': [15.5833, 121.0000], 'Nueva Vizcaya': [16.3333, 121.1667],
    'Occidental Mindoro': [13.0000, 120.9167], 'Oriental Mindoro': [13.0000, 121.4167], 'Palawan': [9.8333, 118.7500], 'Pampanga': [15.0667, 120.7000],
    'Pangasinan': [15.9167, 120.3333], 'Quezon': [14.0000, 121.9167], 'Quirino': [16.2500, 121.6667], 'Rizal': [14.5833, 121.2500],
    'Romblon': [12.5000, 122.2833], 'Samar': [11.8333, 125.0000], 'Sarangani': [6.0000, 125.1667], 'Siquijor': [9.2000, 123.5167],
    'Sorsogon': [12.8333, 124.0000], 'South Cotabato': [6.1667, 124.9167], 'Southern Leyte': [10.2500, 125.0000], 'Sultan Kudarat': [6.5500, 124.5000],
    'Sulu': [6.0000, 121.0000], 'Surigao del Norte': [9.6667, 125.5833], 'Surigao del Sur': [8.7500, 126.0000], 'Tarlac': [15.5000, 120.5000],
    'Tawi-Tawi': [5.1667, 119.9167], 'Zambales': [15.3333, 120.1667], 'Zamboanga del Norte': [8.0000, 122.6667], 'Zamboanga del Sur': [7.8333, 123.3333],
    'Zamboanga Sibugay': [7.7500, 122.7500], 'Metro Manila': [14.5995, 120.9842]
};

// Helper to resolve coordinates
const resolveCoordinates = (locationStr: string, operatingUnit?: string): [number, number] | null => {
    if (!locationStr && !operatingUnit) return null;

    // 1. Try to parse Location String
    if (locationStr && locationStr !== "Online") {
        const { province, region } = parseLocation(locationStr);
        
        // Try Province exact match
        if (province && PROVINCE_COORDINATES[province]) {
            return PROVINCE_COORDINATES[province];
        }
        
        // Try Region if explicitly in location
        if (region && PROVINCE_COORDINATES[region]) {
            return PROVINCE_COORDINATES[region];
        }

        // Try raw string match (e.g. "Rizal" entered directly)
        const parts = locationStr.split(',').map(p => p.trim());
        for (const part of parts) {
            if (PROVINCE_COORDINATES[part]) return PROVINCE_COORDINATES[part];
        }
    }

    // 2. Fallback to Operating Unit
    if (operatingUnit) {
        const regionName = ouToRegionMap[operatingUnit];
        if (regionName && PROVINCE_COORDINATES[regionName]) {
            return PROVINCE_COORDINATES[regionName];
        }
    }

    return null;
};

interface MapDisplayProps {
    ipos: IPO[];
    subprojects: Subproject[];
    trainings: Activity[];
}

const MapDisplay: React.FC<MapDisplayProps> = ({ ipos, subprojects, trainings }) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null); // To hold the map instance
    const markersRef = useRef<any[]>([]); // To hold the marker instances

    // Initialize map
    useEffect(() => {
        if (mapContainerRef.current && !mapRef.current) {
            mapRef.current = L.map(mapContainerRef.current).setView([12.8797, 121.7740], 6); // Centered on Philippines
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(mapRef.current);
        }
        
        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, []);

    // Update markers when data changes
    useEffect(() => {
        if (mapRef.current) {
            markersRef.current.forEach(marker => marker.remove());
            markersRef.current = [];

            const blueIcon = new L.Icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
            });

            const greenIcon = new L.Icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
            });

            const redIcon = new L.Icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
            });

            // 1. IPOs
            ipos.forEach(ipo => {
                let coords = resolveCoordinates(ipo.location);
                // Fallback to region center if specific location fails
                if (!coords && ipo.region && PROVINCE_COORDINATES[ipo.region]) {
                    coords = PROVINCE_COORDINATES[ipo.region];
                }

                if (coords) {
                    // Add small jitter to avoid exact overlap
                    const jitterLat = coords[0] + (Math.random() * 0.02 - 0.01);
                    const jitterLng = coords[1] + (Math.random() * 0.02 - 0.01);

                     const marker = L.marker([jitterLat, jitterLng], { icon: redIcon })
                        .addTo(mapRef.current)
                        .bindPopup(`<b>${ipo.name}</b><br>Type: IPO<br>Location: ${ipo.location}`);
                    markersRef.current.push(marker);
                }
            });

            // 2. Subprojects
            // Create a lookup for IPOs for faster access
            const ipoMap = new Map(ipos.map(i => [i.name, i]));

            subprojects.forEach(project => {
                // Priority: Use Linked IPO Location
                let coords: [number, number] | null = null;
                const linkedIpo = ipoMap.get(project.indigenousPeopleOrganization);
                
                if (linkedIpo) {
                    coords = resolveCoordinates(linkedIpo.location);
                    // Fallback to linked IPO Region
                    if (!coords && linkedIpo.region && PROVINCE_COORDINATES[linkedIpo.region]) {
                        coords = PROVINCE_COORDINATES[linkedIpo.region];
                    }
                }

                // Fallback to Project OU if no linked IPO location resolved
                if (!coords) {
                    coords = resolveCoordinates(project.location, project.operatingUnit);
                }

                if (coords) {
                    const jitterLat = coords[0] + (Math.random() * 0.02 - 0.01);
                    const jitterLng = coords[1] + (Math.random() * 0.02 - 0.01);

                    const marker = L.marker([jitterLat, jitterLng], { icon: blueIcon })
                        .addTo(mapRef.current)
                        .bindPopup(`<b>${project.name}</b><br>Type: Subproject<br>Status: ${project.status}<br>Linked IPO: ${project.indigenousPeopleOrganization}`);
                    markersRef.current.push(marker);
                }
            });
            
            // 3. Trainings
            trainings.forEach(training => {
                const coords = resolveCoordinates(training.location, training.operatingUnit);

                if (coords) {
                    const jitterLat = coords[0] + (Math.random() * 0.02 - 0.01);
                    const jitterLng = coords[1] + (Math.random() * 0.02 - 0.01);

                     const marker = L.marker([jitterLat, jitterLng], { icon: greenIcon })
                        .addTo(mapRef.current)
                        .bindPopup(`<b>${training.name}</b><br>Type: Training<br>Location: ${training.location}`);
                    markersRef.current.push(marker);
                }
            });

            if (markersRef.current.length > 0) {
                const group = new L.featureGroup(markersRef.current);
                mapRef.current.fitBounds(group.getBounds().pad(0.2));
            } else {
                 mapRef.current.setView([12.8797, 121.7740], 6); // Default view if no markers
            }
        }
    }, [ipos, subprojects, trainings]);

    return <div ref={mapContainerRef} className="h-96 w-full rounded-lg z-0" />;
};


type ActivityItem = (Subproject & { activityType: 'Subproject'; activityDate: string }) | (Activity & { activityType: 'Training' | 'Activity'; activityDate: string });

const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
}

const getStatusBadge = (status: Subproject['status']) => {
    const baseClasses = "px-3 py-1 text-xs font-semibold rounded-full";
    switch (status) {
        case 'Completed': return `${baseClasses} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`;
        case 'Ongoing': return `${baseClasses} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`;
        case 'Proposed': return `${baseClasses} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`;
        case 'Cancelled': return `${baseClasses} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`;
        default: return `${baseClasses} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200`;
    }
}

const calculateTotalBudget = (details: SubprojectDetail[]) => {
    return details.reduce((total, item) => total + (item.pricePerUnit * item.numberOfUnits), 0);
}

const FinancialsIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
);

interface DashboardProps {
    subprojects: Subproject[];
    ipos: IPO[];
    activities: Activity[];
    systemSettings: SystemSettings;
    officeReqs: OfficeRequirement[];
    staffingReqs: StaffingRequirement[];
    otherProgramExpenses: OtherProgramExpense[];
}

const Dashboard: React.FC<DashboardProps> = ({ 
    subprojects, ipos, activities, systemSettings,
    officeReqs, staffingReqs, otherProgramExpenses
}) => {
    const { currentUser } = useAuth();
    const [selectedYear, setSelectedYear] = useState<string>('All');
    const [selectedOu, setSelectedOu] = useState<string>('All');
    const [selectedTier, setSelectedTier] = useState<string>('All');
    const [selectedFundType, setSelectedFundType] = useState<string>('All');
    const [modalData, setModalData] = useState<ActivityItem | null>(null);
    const [mapFilters, setMapFilters] = useState({
        ipos: true,
        subprojects: true,
        trainings: true,
    });
    const [ganttFilter, setGanttFilter] = useState<'All' | 'Subprojects' | 'Trainings'>('All');
    
    // Activities Section State
    const [activitiesFilter, setActivitiesFilter] = useState<'All' | 'Subprojects' | 'Trainings'>('All');
    const [activitiesPage, setActivitiesPage] = useState(1);
    const itemsPerPageActivities = 9;

    // Enforce User OU restriction on mount/change
    useEffect(() => {
        if (currentUser && currentUser.role === 'User') {
            setSelectedOu(currentUser.operatingUnit);
        }
    }, [currentUser]);

    const handleMapFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setMapFilters(prev => ({ ...prev, [name]: checked }));
    };

    const availableYears = useMemo(() => {
        const years = new Set<string>();
        subprojects.forEach(p => p.fundingYear && years.add(p.fundingYear.toString()));
        activities.forEach(a => a.fundingYear && years.add(a.fundingYear.toString()));
        ipos.forEach(i => years.add(new Date(i.registrationDate).getFullYear().toString()));
        officeReqs.forEach(i => years.add(i.fundYear.toString()));
        staffingReqs.forEach(i => years.add(i.fundYear.toString()));
        otherProgramExpenses.forEach(i => years.add(i.fundYear.toString()));
        return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
    }, [subprojects, ipos, activities, officeReqs, staffingReqs, otherProgramExpenses]);
    
    const filteredData = useMemo(() => {
        let dataToFilter = { 
            subprojects, ipos, activities,
            officeReqs, staffingReqs, otherProgramExpenses
        };

        // 1. Filter by Year, Tier, Fund Type
        if (selectedYear !== 'All') {
            dataToFilter = {
                subprojects: dataToFilter.subprojects.filter(p => p.fundingYear?.toString() === selectedYear),
                ipos: dataToFilter.ipos.filter(i => new Date(i.registrationDate).getFullYear().toString() === selectedYear),
                activities: dataToFilter.activities.filter(a => a.fundingYear?.toString() === selectedYear || new Date(a.date).getFullYear().toString() === selectedYear),
                officeReqs: dataToFilter.officeReqs.filter(i => i.fundYear.toString() === selectedYear),
                staffingReqs: dataToFilter.staffingReqs.filter(i => i.fundYear.toString() === selectedYear),
                otherProgramExpenses: dataToFilter.otherProgramExpenses.filter(i => i.fundYear.toString() === selectedYear),
            };
        }

        if (selectedTier !== 'All') {
            dataToFilter = {
                ...dataToFilter,
                subprojects: dataToFilter.subprojects.filter(p => p.tier === selectedTier),
                activities: dataToFilter.activities.filter(a => a.tier === selectedTier),
                officeReqs: dataToFilter.officeReqs.filter(i => i.tier === selectedTier),
                staffingReqs: dataToFilter.staffingReqs.filter(i => i.tier === selectedTier),
                otherProgramExpenses: dataToFilter.otherProgramExpenses.filter(i => i.tier === selectedTier),
            };
        }
        
        if (selectedFundType !== 'All') {
            dataToFilter = {
                ...dataToFilter,
                subprojects: dataToFilter.subprojects.filter(p => p.fundType === selectedFundType),
                activities: dataToFilter.activities.filter(a => a.fundType === selectedFundType),
                officeReqs: dataToFilter.officeReqs.filter(i => i.fundType === selectedFundType),
                staffingReqs: dataToFilter.staffingReqs.filter(i => i.fundType === selectedFundType),
                otherProgramExpenses: dataToFilter.otherProgramExpenses.filter(i => i.fundType === selectedFundType),
            };
        }
        
        // 2. Then Filter by Operating Unit
        if (selectedOu === 'All') {
            return dataToFilter;
        }

        const targetRegion = ouToRegionMap[selectedOu];

        return {
            subprojects: dataToFilter.subprojects.filter(p => p.operatingUnit === selectedOu),
            ipos: dataToFilter.ipos.filter(i => i.region === targetRegion),
            activities: dataToFilter.activities.filter(a => a.operatingUnit === selectedOu),
            officeReqs: dataToFilter.officeReqs.filter(i => i.operatingUnit === selectedOu),
            staffingReqs: dataToFilter.staffingReqs.filter(i => i.operatingUnit === selectedOu),
            otherProgramExpenses: dataToFilter.otherProgramExpenses.filter(i => i.operatingUnit === selectedOu),
        };

    }, [selectedYear, selectedOu, selectedTier, selectedFundType, subprojects, ipos, activities, officeReqs, staffingReqs, otherProgramExpenses]);

    const allActivities = useMemo(() => {
        const combined: ActivityItem[] = [
            ...filteredData.subprojects.map(p => ({ ...p, activityType: 'Subproject' as const, activityDate: p.startDate })),
            ...filteredData.activities.map(a => ({ ...a, activityType: a.type as 'Training' | 'Activity', activityDate: a.date })),
        ];
        return combined.sort((a, b) => new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime());
    }, [filteredData]);

    // Filtered and Paginated Activities
    const displayedActivities = useMemo(() => {
        let items = allActivities;
        if (activitiesFilter === 'Subprojects') {
            items = items.filter(a => a.activityType === 'Subproject');
        } else if (activitiesFilter === 'Trainings') {
            items = items.filter(a => a.activityType === 'Training');
        }
        return items;
    }, [allActivities, activitiesFilter]);

    const paginatedActivitiesList = useMemo(() => {
        const startIndex = (activitiesPage - 1) * itemsPerPageActivities;
        return displayedActivities.slice(startIndex, startIndex + itemsPerPageActivities);
    }, [displayedActivities, activitiesPage]);

    const totalActivityPages = Math.ceil(displayedActivities.length / itemsPerPageActivities);

    // Reset activity page when filters change
    useEffect(() => {
        setActivitiesPage(1);
    }, [activitiesFilter, selectedYear, selectedOu, selectedTier, selectedFundType]);

    const ganttItems = useMemo(() => {
        let items: any[] = [];
        if (ganttFilter === 'All' || ganttFilter === 'Subprojects') {
            items = [...items, ...filteredData.subprojects.map(s => ({
                id: s.id,
                name: s.name,
                startDate: s.startDate,
                endDate: s.estimatedCompletionDate,
                actualEndDate: s.actualCompletionDate,
                type: 'Subproject',
                status: s.status
            }))];
        }
        if (ganttFilter === 'All' || ganttFilter === 'Trainings') {
            items = [...items, ...filteredData.activities.filter(a => a.type === 'Training').map(t => ({
                id: t.id,
                name: t.name,
                startDate: t.date,
                endDate: t.date, // Single day duration for visualization purposes
                type: 'Training',
                status: 'Completed'
            }))];
        }
        return items;
    }, [filteredData, ganttFilter]);

    const financialStats = useMemo(() => {
        const subprojectTotal = filteredData.subprojects.reduce((sum, project) => {
            return sum + calculateTotalBudget(project.details);
        }, 0);

        const trainingTotal = filteredData.activities
            .filter(a => a.type === 'Training')
            .reduce((sum, training) => {
                const trainingBudget = training.expenses.reduce((s, e) => s + e.amount, 0);
                return sum + trainingBudget;
            }, 0);

        const otherActivitiesTotal = filteredData.activities
            .filter(a => a.type === 'Activity')
            .reduce((sum, activity) => {
                const activityTotal = activity.expenses.reduce((expenseSum, expense) => expenseSum + expense.amount, 0);
                return sum + activityTotal;
            }, 0);

        const pmTotal = 
            filteredData.officeReqs.reduce((sum, item) => sum + (item.numberOfUnits * item.pricePerUnit), 0) +
            filteredData.staffingReqs.reduce((sum, item) => sum + item.annualSalary, 0) +
            filteredData.otherProgramExpenses.reduce((sum, item) => sum + item.amount, 0);

        return {
            total: subprojectTotal + trainingTotal + otherActivitiesTotal + pmTotal,
            subprojects: subprojectTotal,
            trainings: trainingTotal
        };
    }, [filteredData]);

    const ipoStats = useMemo(() => {
        const iposInSubprojects = new Set(filteredData.subprojects.map(p => p.indigenousPeopleOrganization));
        const iposInActivities = new Set(filteredData.activities.flatMap(a => a.participatingIpos));

        const assistedNames = new Set([...iposInSubprojects, ...iposInActivities]);
        
        // We compare against filteredData.ipos to respect the filter if applied to IPO list context
        const assistedCount = filteredData.ipos.filter(i => assistedNames.has(i.name)).length;
        const withSubprojectsCount = filteredData.ipos.filter(i => iposInSubprojects.has(i.name)).length;

        return { assisted: assistedCount, withSubprojects: withSubprojectsCount };
    }, [filteredData]);
    
    const filteredIposForMap = mapFilters.ipos ? filteredData.ipos : [];
    const filteredSubprojectsForMap = mapFilters.subprojects ? filteredData.subprojects : [];
    const filteredTrainingsForMap = mapFilters.trainings ? filteredData.activities.filter(a => a.type === 'Training') : [];

    return (
        <div>
            {modalData && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-60 z-40 flex items-center justify-center p-4"
                    onClick={() => setModalData(null)}
                >
                    <div 
                        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 md:p-8"
                        onClick={(e) => e.stopPropagation()}
                    >
                         <div className="flex justify-between items-start mb-4">
                            <div>
                                <span className={`inline-block px-3 py-1 text-sm font-semibold rounded-full ${modalData.activityType === 'Subproject' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'}`}>{modalData.activityType}</span>
                                <h3 className="text-2xl font-bold mt-2 text-gray-800 dark:text-white">{modalData.name}</h3>
                            </div>
                            <button onClick={() => setModalData(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">&times;</button>
                        </div>
                        
                        {modalData.activityType === 'Subproject' ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                    <p><strong className="text-gray-500 dark:text-gray-400">IPO:</strong> {modalData.indigenousPeopleOrganization}</p>
                                    <p><strong className="text-gray-500 dark:text-gray-400">Status:</strong> <span className={getStatusBadge(modalData.status)}>{modalData.status}</span></p>
                                    <p><strong className="text-gray-500 dark:text-gray-400">Location:</strong> {modalData.location}</p>
                                    <p><strong className="text-gray-500 dark:text-gray-400">Package:</strong> {modalData.packageType}</p>
                                    <p><strong className="text-gray-500 dark:text-gray-400">Start Date:</strong> {formatDate(modalData.startDate)}</p>
                                    <p><strong className="text-gray-500 dark:text-gray-400">Est. Completion:</strong> {formatDate(modalData.estimatedCompletionDate)}</p>
                                </div>
                                 <div>
                                    <h4 className="font-semibold text-md mt-4 mb-2 text-gray-700 dark:text-gray-200">Budget Details</h4>
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase">
                                            <tr>
                                                <th className="px-4 py-2 text-left">Particulars</th>
                                                <th className="px-4 py-2 text-right"># of Units</th>
                                                <th className="px-4 py-2 text-right">Subtotal</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {modalData.details.map(detail => (
                                                <tr key={detail.id} className="border-b border-gray-200 dark:border-gray-700">
                                                    <td className="px-4 py-2">{detail.particulars}</td>
                                                    <td className="px-4 py-2 text-right">{detail.numberOfUnits.toLocaleString()} {detail.unitOfMeasure}</td>
                                                    <td className="px-4 py-2 text-right font-medium">{formatCurrency(detail.pricePerUnit * detail.numberOfUnits)}</td>
                                                </tr>
                                            ))}
                                            <tr className="font-bold bg-gray-50 dark:bg-gray-700/50">
                                                <td colSpan={2} className="px-4 py-2 text-right">Total Budget</td>
                                                <td className="px-4 py-2 text-right">{formatCurrency(calculateTotalBudget(modalData.details))}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                {modalData.remarks && <div>
                                    <h4 className="font-semibold text-md mt-4 mb-2 text-gray-700 dark:text-gray-200">Remarks</h4>
                                    <p className="text-sm italic bg-gray-100 dark:bg-gray-900/50 p-3 rounded-md">{modalData.remarks}</p>
                                </div>}
                            </div>
                        ) : (
                             <div className="space-y-4 text-sm">
                                <p><strong className="text-gray-500 dark:text-gray-400">Date:</strong> {formatDate(modalData.date)}</p>
                                <p><strong className="text-gray-500 dark:text-gray-400">Location:</strong> {modalData.location}</p>
                                <p><strong className="text-gray-500 dark:text-gray-400">Facilitator:</strong> {(modalData as any).facilitator || 'N/A'}</p>
                                {modalData.description && <div>
                                    <h4 className="font-semibold text-md mt-4 mb-2 text-gray-700 dark:text-gray-200">Description</h4>
                                    <p>{modalData.description}</p>
                                </div>}
                                <div>
                                    <h4 className="font-semibold text-md mt-4 mb-2 text-gray-700 dark:text-gray-200">Participating IPOs</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {modalData.participatingIpos.map(ipoName => (
                                            <span key={ipoName} className="bg-gray-200 dark:bg-gray-700 rounded-full px-3 py-1 text-xs font-semibold text-gray-700 dark:text-gray-200">
                                                {ipoName}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            )}
            <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">4K Information System Overview</h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                     <div className="flex items-center gap-2">
                        <label htmlFor="ou-filter" className="text-sm font-medium text-gray-600 dark:text-gray-300">OU:</label>
                        <select 
                            id="ou-filter"
                            value={selectedOu}
                            onChange={(e) => setSelectedOu(e.target.value)}
                            disabled={currentUser?.role === 'User'}
                            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-10 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            <option value="All">All OUs</option>
                            {operatingUnits.map(ou => (
                                <option key={ou} value={ou}>{ou}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <label htmlFor="tier-filter" className="text-sm font-medium text-gray-600 dark:text-gray-300">Tier:</label>
                        <select 
                            id="tier-filter"
                            value={selectedTier}
                            onChange={(e) => setSelectedTier(e.target.value)}
                            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-10 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
                        >
                            <option value="All">All Tiers</option>
                            {tiers.map(tier => (
                                <option key={tier} value={tier}>{tier}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <label htmlFor="fund-type-filter" className="text-sm font-medium text-gray-600 dark:text-gray-300">Fund Type:</label>
                        <select 
                            id="fund-type-filter"
                            value={selectedFundType}
                            onChange={(e) => setSelectedFundType(e.target.value)}
                            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-10 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
                        >
                            <option value="All">All Fund Types</option>
                            {fundTypes.map(ft => (
                                <option key={ft} value={ft}>{ft}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <label htmlFor="year-filter" className="text-sm font-medium text-gray-600 dark:text-gray-300">Year:</label>
                        <select 
                            id="year-filter"
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(e.target.value)}
                            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-10 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
                        >
                            <option value="All">All Years</option>
                            {availableYears.map(year => (
                                <option key={year} value={year}>{year}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                <StatCard title="Total Budget" value={formatCurrency(financialStats.total)} icon={<FinancialsIcon />} color="text-purple-500" />
                <StatCard title="Total Budget for Sub Projects" value={formatCurrency(financialStats.subprojects)} icon={<FinancialsIcon />} color="text-blue-500" />
                <StatCard title="Total Budget for Trainings" value={formatCurrency(financialStats.trainings)} icon={<FinancialsIcon />} color="text-green-500" />
                <StatCard title="Number of Subprojects" value={filteredData.subprojects.length.toString()} icon={<ProjectsIcon className="h-8 w-8" />} color="text-blue-600" />
                <StatCard title="Number of Trainings" value={filteredData.activities.filter(a => a.type === 'Training').length.toString()} icon={<TrainingIcon className="h-8 w-8" />} color="text-green-600" />
                <StatCard title="Number of IPOs assisted" value={ipoStats.assisted.toString()} icon={<IpoIcon className="h-8 w-8" />} color="text-yellow-500" />
                <StatCard title="Number of IPOs with Sub Projects" value={ipoStats.withSubprojects.toString()} icon={<IpoIcon className="h-8 w-8" />} color="text-teal-500" />
            </div>

            {/* System Schedule Summary Card */}
            <div className="mt-10 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                <h3 className="text-2xl font-semibold text-gray-800 dark:text-white mb-4">System Schedule</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <h4 className="text-sm font-bold text-red-600 dark:text-red-400 uppercase mb-2 tracking-wider">Upcoming Deadlines</h4>
                        {systemSettings.deadlines.length > 0 ? (
                            <ul className="space-y-2">
                                {systemSettings.deadlines.map(d => (
                                    <li key={d.id} className="flex justify-between border-l-4 border-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded-r text-sm">
                                        <span className="font-medium text-gray-800 dark:text-gray-200">{d.name}</span>
                                        <span className="text-red-600 dark:text-red-400 font-bold">{formatDate(d.date)}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : <p className="text-sm text-gray-500 italic">No upcoming deadlines.</p>}
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase mb-2 tracking-wider">Planning Schedules</h4>
                        {systemSettings.planningSchedules.length > 0 ? (
                            <ul className="space-y-2">
                                {systemSettings.planningSchedules.map(s => (
                                    <li key={s.id} className="flex justify-between border-l-4 border-gray-500 bg-gray-100 dark:bg-gray-700/30 p-2 rounded-r text-sm">
                                        <span className="font-medium text-gray-800 dark:text-gray-200">{s.name}</span>
                                        <span className="text-gray-600 dark:text-gray-300 text-xs">{formatDate(s.startDate)} - {formatDate(s.endDate)}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : <p className="text-sm text-gray-500 italic">No active planning schedules.</p>}
                    </div>
                </div>
            </div>

            <div className="mt-10 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
                    <h3 className="text-2xl font-semibold text-gray-800 dark:text-white">4K Map</h3>
                    <div className="flex items-center gap-x-4 gap-y-2 text-sm">
                        <span className="font-medium text-gray-600 dark:text-gray-300">Show:</span>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" name="ipos" checked={mapFilters.ipos} onChange={handleMapFilterChange} className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />
                            <span className="text-red-600 dark:text-red-400 font-semibold">IPOs</span>
                        </label>
                         <label className="flex items-center gap-2">
                            <input type="checkbox" name="subprojects" checked={mapFilters.subprojects} onChange={handleMapFilterChange} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                            <span className="text-blue-600 dark:text-blue-400 font-semibold">Subprojects</span>
                        </label>
                         <label className="flex items-center gap-2">
                            <input type="checkbox" name="trainings" checked={mapFilters.trainings} onChange={handleMapFilterChange} className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500" />
                            <span className="text-green-600 dark:text-green-400 font-semibold">Trainings</span>
                        </label>
                    </div>
                </div>
                <MapDisplay ipos={filteredIposForMap} subprojects={filteredSubprojectsForMap} trainings={filteredTrainingsForMap} />
            </div>

            <div className="mt-10 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-2xl font-semibold text-gray-800 dark:text-white">4K Calendar</h3>
                    <div className="flex space-x-2">
                        <button 
                            onClick={() => setGanttFilter('All')} 
                            className={`px-3 py-1 text-sm rounded-md ${ganttFilter === 'All' ? 'bg-gray-200 dark:bg-gray-600 font-semibold' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                        >
                            All
                        </button>
                        <button 
                            onClick={() => setGanttFilter('Subprojects')} 
                            className={`px-3 py-1 text-sm rounded-md ${ganttFilter === 'Subprojects' ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                        >
                            Subprojects
                        </button>
                        <button 
                            onClick={() => setGanttFilter('Trainings')} 
                            className={`px-3 py-1 text-sm rounded-md ${ganttFilter === 'Trainings' ? 'bg-green-100 text-green-700 font-semibold' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                        >
                            Trainings
                        </button>
                    </div>
                </div>
                <GanttChart items={ganttItems} systemSettings={systemSettings} />
            </div>

            <div className="mt-10">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-2xl font-semibold text-gray-800 dark:text-white">4K Activities</h3>
                    <div className="flex space-x-2">
                        <button 
                            onClick={() => setActivitiesFilter('All')} 
                            className={`px-3 py-1 text-sm rounded-md ${activitiesFilter === 'All' ? 'bg-gray-200 dark:bg-gray-600 font-semibold' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                        >
                            All
                        </button>
                        <button 
                            onClick={() => setActivitiesFilter('Subprojects')} 
                            className={`px-3 py-1 text-sm rounded-md ${activitiesFilter === 'Subprojects' ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                        >
                            Subprojects
                        </button>
                        <button 
                            onClick={() => setActivitiesFilter('Trainings')} 
                            className={`px-3 py-1 text-sm rounded-md ${activitiesFilter === 'Trainings' ? 'bg-green-100 text-green-700 font-semibold' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                        >
                            Trainings
                        </button>
                    </div>
                </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {paginatedActivitiesList.map(activity => (
                        <div 
                            key={`${activity.activityType}-${activity.id}`} 
                            className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-1 transform transition-all duration-300 ease-in-out cursor-pointer"
                            onClick={() => setModalData(activity)}
                        >
                            <div className="flex justify-between items-start">
                                <span className={`text-xs font-bold uppercase ${activity.activityType === 'Subproject' ? 'text-blue-500' : 'text-green-500'}`}>{activity.activityType}</span>
                                <span className="text-xs text-gray-400">{formatDate(activity.activityDate)}</span>
                            </div>
                            <h4 className="text-lg font-bold mt-2 text-gray-800 dark:text-white">{activity.name}</h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                                {activity.activityType === 'Subproject' ? activity.location : activity.description}
                            </p>
                        </div>
                    ))}
                 </div>
                 
                 {/* Pagination Controls */}
                 {totalActivityPages > 1 && (
                     <div className="flex justify-center items-center mt-6 gap-4">
                         <button 
                            onClick={() => setActivitiesPage(p => Math.max(1, p - 1))}
                            disabled={activitiesPage === 1}
                            className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                         >
                             Previous
                         </button>
                         <span className="text-sm text-gray-600 dark:text-gray-400">
                             Page {activitiesPage} of {totalActivityPages}
                         </span>
                         <button 
                            onClick={() => setActivitiesPage(p => Math.min(totalActivityPages, p + 1))}
                            disabled={activitiesPage === totalActivityPages}
                            className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                         >
                             Next
                         </button>
                     </div>
                 )}
            </div>
        </div>
    );
};

export default Dashboard;
