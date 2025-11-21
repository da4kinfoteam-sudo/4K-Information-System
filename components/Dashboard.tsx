// Author: AI
// OS support: Any
// Description: Dashboard component for visualizing data

import React, { useState, useMemo, useEffect, useRef } from 'react';
import StatCard from './StatCard';
import { TrainingIcon, IpoIcon, ProjectsIcon, ActivitiesIcon, SubprojectDetail, tiers, fundTypes, operatingUnits, ouToRegionMap } from '../constants';
import { Subproject, IPO, Training, OtherActivity } from '../constants';
import GanttChart from './GanttChart';

// Since Leaflet is loaded from a script tag, we need to declare it for TypeScript
declare const L: any;

interface MapDisplayProps {
    ipos: IPO[];
    subprojects: Subproject[];
    trainings: Training[];
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

            ipos.forEach(ipo => {
                if (ipo.lat && ipo.lng) {
                     const marker = L.marker([ipo.lat, ipo.lng], { icon: redIcon })
                        .addTo(mapRef.current)
                        .bindPopup(`<b>${ipo.name}</b><br>Type: IPO<br>Location: ${ipo.location}`);
                    markersRef.current.push(marker);
                }
            });

            subprojects.forEach(project => {
                const marker = L.marker([project.lat, project.lng], { icon: blueIcon })
                    .addTo(mapRef.current)
                    .bindPopup(`<b>${project.name}</b><br>Type: Subproject<br>Status: ${project.status}`);
                markersRef.current.push(marker);
            });
            
            trainings.forEach(training => {
                if (training.lat && training.lng) {
                     const marker = L.marker([training.lat, training.lng], { icon: greenIcon })
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


type ActivityItem = (Subproject & { type: 'Subproject'; activityDate: string }) | (Training & { type: 'Training'; activityDate: string });

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
    trainings: Training[];
    otherActivities: OtherActivity[];
}

const Dashboard: React.FC<DashboardProps> = ({ subprojects, ipos, trainings, otherActivities }) => {
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

    const handleMapFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setMapFilters(prev => ({ ...prev, [name]: checked }));
    };

    const availableYears = useMemo(() => {
        const years = new Set<string>();
        subprojects.forEach(p => p.fundingYear && years.add(p.fundingYear.toString()));
        trainings.forEach(t => t.fundingYear && years.add(t.fundingYear.toString()));
        ipos.forEach(i => years.add(new Date(i.registrationDate).getFullYear().toString()));
        otherActivities.forEach(a => years.add(new Date(a.date).getFullYear().toString()));
        return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
    }, [subprojects, ipos, trainings, otherActivities]);
    
    const filteredData = useMemo(() => {
        let dataToFilter = { subprojects, ipos, trainings, otherActivities };

        // 1. Filter by Year, Tier, Fund Type
        if (selectedYear !== 'All') {
            dataToFilter = {
                subprojects: dataToFilter.subprojects.filter(p => p.fundingYear?.toString() === selectedYear),
                ipos: dataToFilter.ipos.filter(i => new Date(i.registrationDate).getFullYear().toString() === selectedYear),
                trainings: dataToFilter.trainings.filter(t => t.fundingYear?.toString() === selectedYear),
                otherActivities: dataToFilter.otherActivities.filter(a => new Date(a.date).getFullYear().toString() === selectedYear),
            };
        }

        if (selectedTier !== 'All') {
            dataToFilter = {
                ...dataToFilter,
                subprojects: dataToFilter.subprojects.filter(p => p.tier === selectedTier),
                trainings: dataToFilter.trainings.filter(t => t.tier === selectedTier),
            };
        }
        
        if (selectedFundType !== 'All') {
            dataToFilter = {
                ...dataToFilter,
                subprojects: dataToFilter.subprojects.filter(p => p.fundType === selectedFundType),
                trainings: dataToFilter.trainings.filter(t => t.fundType === selectedFundType),
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
            trainings: dataToFilter.trainings.filter(t => t.operatingUnit === selectedOu),
            otherActivities: dataToFilter.otherActivities.filter(a => a.operatingUnit === selectedOu),
        };

    }, [selectedYear, selectedOu, selectedTier, selectedFundType, subprojects, ipos, trainings, otherActivities]);

    const allActivities = useMemo(() => {
        const combined: ActivityItem[] = [
            ...filteredData.subprojects.map(p => ({ ...p, type: 'Subproject' as const, activityDate: p.startDate })),
            ...filteredData.trainings.map(t => ({ ...t, type: 'Training' as const, activityDate: t.date })),
        ];
        return combined.sort((a, b) => new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime());
    }, [filteredData]);

    const financialStats = useMemo(() => {
        const subprojectTotal = filteredData.subprojects.reduce((sum, project) => {
            return sum + calculateTotalBudget(project.details);
        }, 0);

        const trainingTotal = filteredData.trainings.reduce((sum, training) => {
            const trainingBudget = training.expenses.reduce((s, e) => s + e.amount, 0);
            return sum + trainingBudget;
        }, 0);

        const otherActivitiesTotal = filteredData.otherActivities.reduce((sum, activity) => {
            const activityTotal = activity.expenses.reduce((expenseSum, expense) => expenseSum + expense.amount, 0);
            return sum + activityTotal;
        }, 0);

        return {
            total: subprojectTotal + trainingTotal + otherActivitiesTotal,
            subprojects: subprojectTotal,
            trainings: trainingTotal
        };
    }, [filteredData.subprojects, filteredData.trainings, filteredData.otherActivities]);

    const ipoStats = useMemo(() => {
        const iposInSubprojects = new Set(filteredData.subprojects.map(p => p.indigenousPeopleOrganization));
        const iposInTrainings = new Set(filteredData.trainings.flatMap(t => t.participatingIpos));
        const iposInOther = new Set(filteredData.otherActivities.flatMap(a => a.participatingIpos));

        const assistedNames = new Set([...iposInSubprojects, ...iposInTrainings, ...iposInOther]);
        
        // We compare against filteredData.ipos to respect the filter if applied to IPO list context
        const assistedCount = filteredData.ipos.filter(i => assistedNames.has(i.name)).length;
        const withSubprojectsCount = filteredData.ipos.filter(i => iposInSubprojects.has(i.name)).length;

        return { assisted: assistedCount, withSubprojects: withSubprojectsCount };
    }, [filteredData]);
    
    const filteredIposForMap = mapFilters.ipos ? filteredData.ipos : [];
    const filteredSubprojectsForMap = mapFilters.subprojects ? filteredData.subprojects : [];
    const filteredTrainingsForMap = mapFilters.trainings ? filteredData.trainings : [];

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
                                <span className={`inline-block px-3 py-1 text-sm font-semibold rounded-full ${modalData.type === 'Subproject' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'}`}>{modalData.type}</span>
                                <h3 className="text-2xl font-bold mt-2 text-gray-800 dark:text-white">{modalData.name}</h3>
                            </div>
                            <button onClick={() => setModalData(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">&times;</button>
                        </div>
                        
                        {modalData.type === 'Subproject' ? (
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
                                <p><strong className="text-gray-500 dark:text-gray-400">Facilitator:</strong> {modalData.facilitator}</p>
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
                        <label htmlFor="ou-filter" className="text-sm font-medium text-gray-600 dark:text-gray-300">Operating Unit:</label>
                        <select 
                            id="ou-filter"
                            value={selectedOu}
                            onChange={(e) => setSelectedOu(e.target.value)}
                            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-10 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
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
                <StatCard title="Number of Trainings" value={filteredData.trainings.length.toString()} icon={<TrainingIcon className="h-8 w-8" />} color="text-green-600" />
                <StatCard title="Number of IPOs assisted" value={ipoStats.assisted.toString()} icon={<IpoIcon className="h-8 w-8" />} color="text-yellow-500" />
                <StatCard title="Number of IPOs with Sub Projects" value={ipoStats.withSubprojects.toString()} icon={<IpoIcon className="h-8 w-8" />} color="text-teal-500" />
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
                <h3 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">Subprojects Timeline</h3>
                <GanttChart subprojects={filteredData.subprojects} />
            </div>

            <div className="mt-10">
                <h3 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">4K Activities</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {allActivities.map(activity => (
                        <div 
                            key={`${activity.type}-${activity.id}`} 
                            className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-1 transform transition-all duration-300 ease-in-out cursor-pointer"
                            onClick={() => setModalData(activity)}
                        >
                            <div className="flex justify-between items-start">
                                <span className={`text-xs font-bold uppercase ${activity.type === 'Subproject' ? 'text-blue-500' : 'text-green-500'}`}>{activity.type}</span>
                                <span className="text-xs text-gray-400">{formatDate(activity.activityDate)}</span>
                            </div>
                            <h4 className="text-lg font-bold mt-2 text-gray-800 dark:text-white">{activity.name}</h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                                {activity.type === 'Subproject' ? activity.location : activity.description}
                            </p>
                        </div>
                    ))}
                 </div>
            </div>
        </div>
    );
};

export default Dashboard;