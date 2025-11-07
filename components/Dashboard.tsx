import React, { useState, useMemo, useEffect, useRef } from 'react';
import StatCard from './StatCard';
import { TrainingIcon, IpoIcon, ProjectsIcon, ActivitiesIcon, SubprojectDetail, philippineRegions } from '../constants';
import { Subproject, IPO, Training, Activity } from '../constants';
import GanttChart from './GanttChart';

// Since Leaflet is loaded from a script tag, we need to declare it for TypeScript
declare const L: any;

interface MapDisplayProps {
    subprojects: Subproject[];
    trainings: Training[];
}

const MapDisplay: React.FC<MapDisplayProps> = ({ subprojects, trainings }) => {
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
    }, [subprojects, trainings]);

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
    activities: Activity[];
}

const Dashboard: React.FC<DashboardProps> = ({ subprojects, ipos, trainings, activities }) => {
    const [selectedYear, setSelectedYear] = useState<string>('All');
    const [selectedRegion, setSelectedRegion] = useState<string>('All');
    const [modalData, setModalData] = useState<ActivityItem | null>(null);

    const availableYears = useMemo(() => {
        const years = new Set<string>();
        subprojects.forEach(p => years.add(new Date(p.startDate).getFullYear().toString()));
        ipos.forEach(i => years.add(new Date(i.registrationDate).getFullYear().toString()));
        trainings.forEach(t => years.add(new Date(t.date).getFullYear().toString()));
        activities.forEach(a => years.add(new Date(a.date).getFullYear().toString()));
        return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
    }, [subprojects, ipos, trainings, activities]);
    
    const filteredData = useMemo(() => {
        // 1. Filter by Year first
        let yearFiltered = {
            subprojects: selectedYear === 'All' ? subprojects : subprojects.filter(p => new Date(p.startDate).getFullYear() === parseInt(selectedYear)),
            ipos: selectedYear === 'All' ? ipos : ipos.filter(i => new Date(i.registrationDate).getFullYear() === parseInt(selectedYear)),
            trainings: selectedYear === 'All' ? trainings : trainings.filter(t => new Date(t.date).getFullYear() === parseInt(selectedYear)),
            activities: selectedYear === 'All' ? activities : activities.filter(a => new Date(a.date).getFullYear() === parseInt(selectedYear)),
        };

        // 2. Then Filter by Region
        if (selectedRegion === 'All') {
            return yearFiltered;
        }

        if (selectedRegion === 'Online') {
            return {
                subprojects: [],
                ipos: [],
                trainings: yearFiltered.trainings.filter(t => t.location === 'Online'),
                activities: yearFiltered.activities,
            }
        }
        
        const iposInRegionSet = new Set(ipos.filter(i => i.region === selectedRegion).map(i => i.name));

        const regionFilteredSubprojects = yearFiltered.subprojects.filter(p => iposInRegionSet.has(p.indigenousPeopleOrganization));
        const regionFilteredIpos = yearFiltered.ipos.filter(i => i.region === selectedRegion);
        const regionFilteredTrainings = yearFiltered.trainings.filter(t => t.participatingIpos.some(ipoName => iposInRegionSet.has(ipoName)));

        return {
            subprojects: regionFilteredSubprojects,
            ipos: regionFilteredIpos,
            trainings: regionFilteredTrainings,
            activities: yearFiltered.activities,
        };

    }, [selectedYear, selectedRegion, subprojects, ipos, trainings, activities]);

    const allActivities = useMemo(() => {
        const combined: ActivityItem[] = [
            ...filteredData.subprojects.map(p => ({ ...p, type: 'Subproject' as const, activityDate: p.startDate })),
            ...filteredData.trainings.map(t => ({ ...t, type: 'Training' as const, activityDate: t.date })),
        ];
        return combined.sort((a, b) => new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime());
    }, [filteredData]);

    const totalFinancials = useMemo(() => {
        const subprojectTotal = filteredData.subprojects.reduce((sum, project) => {
            return sum + calculateTotalBudget(project.details);
        }, 0);

        const trainingTotal = filteredData.trainings.reduce((sum, training) => {
            return sum + (training.trainingExpenses || 0) + (training.otherExpenses || 0);
        }, 0);

        return subprojectTotal + trainingTotal;
    }, [filteredData.subprojects, filteredData.trainings]);


    const completedProjectsCount = filteredData.subprojects.filter(p => p.status === 'Completed').length;

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
                        <label htmlFor="region-filter" className="text-sm font-medium text-gray-600 dark:text-gray-300">Region:</label>
                        <select 
                            id="region-filter"
                            value={selectedRegion}
                            onChange={(e) => setSelectedRegion(e.target.value)}
                            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-10 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
                        >
                            <option value="All">All Regions</option>
                            <option value="Online">Online</option>
                            {philippineRegions.map(region => (
                                <option key={region} value={region}>{region}</option>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <StatCard title="Total Invested" value={formatCurrency(totalFinancials)} icon={<FinancialsIcon />} color="text-purple-500" />
                <StatCard title="Subprojects" value={filteredData.subprojects.length.toString()} icon={<ProjectsIcon className="h-8 w-8" />} color="text-blue-500" />
                <StatCard title="Trainings" value={filteredData.trainings.length.toString()} icon={<TrainingIcon className="h-8 w-8" />} color="text-green-500" />
                <StatCard title="IPOs" value={filteredData.ipos.length.toString()} icon={<IpoIcon className="h-8 w-8" />} color="text-yellow-500" />
                <StatCard title="Completed Subprojects" value={completedProjectsCount.toString()} icon={<ProjectsIcon className="h-8 w-8" />} color="text-teal-500" />
                <StatCard title="Other Activities" value={filteredData.activities.length.toString()} icon={<ActivitiesIcon className="h-8 w-8" />} color="text-red-500" />
            </div>

            <div className="mt-10 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                <h3 className="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">Intervention Locations</h3>
                <MapDisplay subprojects={filteredData.subprojects} trainings={filteredData.trainings} />
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