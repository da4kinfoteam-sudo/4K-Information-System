

import React from 'react';
import { Subproject, IPO, Training, OtherActivity, philippineRegions } from '../constants';
import { useState, useMemo } from 'react';

// --- Reusable UI Components for the Physical Dashboard ---

const TargetCard: React.FC<{ label: string; value: number; }> = ({ label, value }) => (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md border-l-4 border-gray-300 dark:border-gray-600">
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-2xl font-bold text-gray-800 dark:text-white">{value.toLocaleString()}</p>
    </div>
);

const AccomplishmentCard: React.FC<{ label: string; value: number; }> = ({ label, value }) => (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md text-center">
        <p className="text-3xl font-bold text-accent dark:text-green-400">{value.toLocaleString()}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{label}</p>
    </div>
);

const BarChart: React.FC<{ data: Record<string, number>, total: number, colors: Record<string, string> }> = ({ data, total, colors }) => {
    if (total === 0) return <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No data available.</p>;

    const sortedData = Object.entries(data).sort(([, a], [, b]) => b - a);

    return (
        <div className="space-y-2">
            {sortedData.map(([label, value]) => (
                <div key={label} className="flex items-center gap-2 text-sm">
                    <div className="w-24 text-gray-500 dark:text-gray-400 truncate" title={label}>{label}</div>
                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-4">
                        <div 
                            className={`${colors[label] || 'bg-gray-400'} h-4 rounded-full transition-all duration-500`} 
                            style={{ width: `${(value / total) * 100}%` }}
                        ></div>
                    </div>
                    <div className="w-12 text-right font-semibold text-gray-800 dark:text-white">{value}</div>
                </div>
            ))}
        </div>
    );
};

const DoughnutChart: React.FC<{ data: Record<string, number>, colors: string[] }> = ({ data, colors }) => {
    const total = Object.values(data).reduce((sum, value) => sum + value, 0);
    if (total === 0) return <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No data available.</p>;

    let cumulativePercentage = 0;
    const gradientStops = Object.entries(data)
      .sort(([, a], [, b]) => b - a)
      .map(([_, value], index) => {
        const percentage = (value / total) * 100;
        const start = cumulativePercentage;
        const end = cumulativePercentage + percentage;
        cumulativePercentage = end;
        return `${colors[index % colors.length]} ${start}% ${end}%`;
    });
    const conicGradient = `conic-gradient(${gradientStops.join(', ')})`;

    return (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 p-4">
            <div className="relative w-32 h-32 rounded-full" style={{ background: conicGradient }}>
                <div className="absolute inset-2 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center">
                    <span className="font-bold text-2xl text-gray-800 dark:text-white">{total}</span>
                </div>
            </div>
            <div className="flex-shrink-0">
                <ul className="space-y-1 text-sm">
                    {Object.entries(data).sort(([, a], [, b]) => b - a).map(([label, value], index) => (
                        <li key={label} className="flex items-center">
                            <span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: colors[index % colors.length] }}></span>
                            <span className="text-gray-600 dark:text-gray-300">{label}:</span>
                            <span className="font-semibold ml-1 text-gray-800 dark:text-white">{value}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};


// --- Physical Dashboard Tab Content ---
const PhysicalDashboard: React.FC<{ data: DashboardsPageProps, allIpos: IPO[] }> = ({ data, allIpos }) => {
    const physicalStats = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // --- TARGETS ---
        const allIposWithSubprojects = new Set(data.subprojects.map(p => p.indigenousPeopleOrganization));
        const allIposWithTrainings = new Set(data.trainings.flatMap(t => t.participatingIpos));
        const allAssistedIpos = new Set([...allIposWithSubprojects, ...allIposWithTrainings]);
        const allAssistedIpoDetails = allIpos.filter(ipo => allAssistedIpos.has(ipo.name));
        const allAssistedADs = new Set(allAssistedIpoDetails.map(ipo => ipo.ancestralDomainNo).filter(Boolean));
        const allParticipants = data.trainings.reduce((sum, t) => sum + t.participantsMale + t.participantsFemale, 0);

        // --- ACCOMPLISHMENTS ---
        const completedSubprojects = data.subprojects.filter(p => p.status === 'Completed');
        const pastTrainings = data.trainings.filter(t => new Date(t.date) < today);
        const accomplishedIposWithSubprojects = new Set(completedSubprojects.map(p => p.indigenousPeopleOrganization));
        const accomplishedIposWithTrainings = new Set(pastTrainings.flatMap(t => t.participatingIpos));
        const accomplishedAssistedIpos = new Set([...accomplishedIposWithSubprojects, ...accomplishedIposWithTrainings]);
        const accomplishedIpoDetails = allIpos.filter(ipo => accomplishedAssistedIpos.has(ipo.name));
        const accomplishedADs = new Set(accomplishedIpoDetails.map(ipo => ipo.ancestralDomainNo).filter(Boolean));
        const accomplishedParticipants = pastTrainings.reduce((sum, t) => sum + t.participantsMale + t.participantsFemale, 0);
        
        // --- For Bar Chart ---
        const subprojectStatusCounts = data.subprojects.reduce((acc, p) => {
            acc[p.status] = (acc[p.status] || 0) + 1;
            return acc;
        }, {} as Record<Subproject['status'], number>);
        
        return {
            targets: {
                iposTrained: allIposWithTrainings.size,
                iposWithSubprojects: allIposWithSubprojects.size,
                iposAssisted: allAssistedIpos.size,
                ancestralDomainsAssisted: allAssistedADs.size,
                subprojects: data.subprojects.length,
                trainings: data.trainings.length,
                participants: allParticipants,
            },
            accomplishments: {
                iposTrained: accomplishedIposWithTrainings.size,
                iposWithSubprojects: accomplishedIposWithSubprojects.size,
                iposAssisted: accomplishedAssistedIpos.size,
                ancestralDomainsAssisted: accomplishedADs.size,
                subprojects: completedSubprojects.length,
                trainings: pastTrainings.length,
                participants: accomplishedParticipants,
            },
            subprojectStatusCounts,
        };
    }, [data, allIpos]);
    
    const statusColors: Record<string, string> = {
        'Completed': 'bg-green-500',
        'Ongoing': 'bg-blue-500',
        'Proposed': 'bg-yellow-500',
        'Cancelled': 'bg-red-500',
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-1">
            {/* --- Targets Column --- */}
            <div className="space-y-6">
                <h3 className="text-2xl font-semibold text-gray-800 dark:text-white">Targets</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <TargetCard label="Number of IPOs to be trained" value={physicalStats.targets.iposTrained} />
                    <TargetCard label="Number of IPOs with subprojects" value={physicalStats.targets.iposWithSubprojects} />
                    <TargetCard label="Number of IPOs assisted" value={physicalStats.targets.iposAssisted} />
                    <TargetCard label="Ancestral Domains with assistance" value={physicalStats.targets.ancestralDomainsAssisted} />
                    <TargetCard label="Number of Subprojects" value={physicalStats.targets.subprojects} />
                    <TargetCard label="Number of Trainings" value={physicalStats.targets.trainings} />
                    <div className="md:col-span-2">
                        <TargetCard label="Number of Participant for Trainings" value={physicalStats.targets.participants} />
                    </div>
                </div>
            </div>
            {/* --- Accomplishments Column --- */}
            <div className="space-y-6">
                <h3 className="text-2xl font-semibold text-gray-800 dark:text-white">Accomplishments</h3>
                 <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <AccomplishmentCard label="IPOs Trained" value={physicalStats.accomplishments.iposTrained} />
                    <AccomplishmentCard label="IPOs w/ Subprojects" value={physicalStats.accomplishments.iposWithSubprojects} />
                    <AccomplishmentCard label="IPOs Assisted" value={physicalStats.accomplishments.iposAssisted} />
                    <AccomplishmentCard label="ADs with Assistance" value={physicalStats.accomplishments.ancestralDomainsAssisted} />
                    <AccomplishmentCard label="Subprojects Completed" value={physicalStats.accomplishments.subprojects} />
                    <AccomplishmentCard label="Trainings Conducted" value={physicalStats.accomplishments.trainings} />
                    <div className="col-span-2 md:col-span-3">
                         <AccomplishmentCard label="Training Participants" value={physicalStats.accomplishments.participants} />
                    </div>
                </div>
                
                 <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                    <h4 className="font-semibold text-gray-800 dark:text-white mb-4">Subprojects by Status</h4>
                    <BarChart 
                        data={physicalStats.subprojectStatusCounts} 
                        total={data.subprojects.length}
                        colors={statusColors}
                    />
                </div>
            </div>
        </div>
    );
}

const LevelOfDevelopmentDashboard: React.FC<{ ipos: IPO[] }> = ({ ipos }) => {
    const ipoLodCounts = useMemo(() => {
        return ipos.reduce((acc, ipo) => {
            const level = `Level ${ipo.levelOfDevelopment}`;
            acc[level] = (acc[level] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
    }, [ipos]);

    const lodColors = ['#4F46E5', '#7C3AED', '#EC4899', '#F59E0B', '#10B981'];

    return (
        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">IPOs by Level of Development</h3>
            <DoughnutChart data={ipoLodCounts} colors={lodColors} />
        </div>
    );
};

interface DashboardsPageProps {
    subprojects: Subproject[];
    ipos: IPO[];
    trainings: Training[];
    otherActivities: OtherActivity[];
}

type DashboardTab = 'Physical' | 'Financial' | 'Level of Development' | 'Gender and Development';

const DashboardsPage: React.FC<DashboardsPageProps> = ({ subprojects, ipos, trainings, otherActivities }) => {
    const [activeTab, setActiveTab] = useState<DashboardTab>('Physical');
    const [selectedYear, setSelectedYear] = useState<string>('All');
    const [selectedRegion, setSelectedRegion] = useState<string>('All');

    const availableYears = useMemo(() => {
        const years = new Set<string>();
        subprojects.forEach(p => years.add(new Date(p.startDate).getFullYear().toString()));
        ipos.forEach(i => years.add(new Date(i.registrationDate).getFullYear().toString()));
        trainings.forEach(t => years.add(new Date(t.date).getFullYear().toString()));
        otherActivities.forEach(a => years.add(new Date(a.date).getFullYear().toString()));
        return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
    }, [subprojects, ipos, trainings, otherActivities]);

    const filteredData = useMemo(() => {
        // 1. Filter by Year first
        let yearFiltered = {
            subprojects: selectedYear === 'All' ? subprojects : subprojects.filter(p => new Date(p.startDate).getFullYear() === parseInt(selectedYear)),
            ipos: selectedYear === 'All' ? ipos : ipos.filter(i => new Date(i.registrationDate).getFullYear() === parseInt(selectedYear)),
            trainings: selectedYear === 'All' ? trainings : trainings.filter(t => new Date(t.date).getFullYear() === parseInt(selectedYear)),
            otherActivities: selectedYear === 'All' ? otherActivities : otherActivities.filter(a => new Date(a.date).getFullYear() === parseInt(selectedYear)),
        };

        // 2. Then Filter by Region
        if (selectedRegion === 'All') {
            return yearFiltered;
        }

        if (selectedRegion === 'Online') {
            return {
                ...yearFiltered,
                subprojects: [],
                ipos: [],
                trainings: yearFiltered.trainings.filter(t => t.location === 'Online'),
                otherActivities: yearFiltered.otherActivities.filter(a => a.location === 'Online'),
            }
        }
        
        const iposInRegionSet = new Set(ipos.filter(i => i.region === selectedRegion).map(i => i.name));

        const regionFilteredSubprojects = yearFiltered.subprojects.filter(p => iposInRegionSet.has(p.indigenousPeopleOrganization));
        const regionFilteredIpos = yearFiltered.ipos.filter(i => i.region === selectedRegion);
        const regionFilteredTrainings = yearFiltered.trainings.filter(t => t.participatingIpos.some(ipoName => iposInRegionSet.has(ipoName)));
        const regionFilteredOtherActivities = yearFiltered.otherActivities.filter(a => a.participatingIpos.some(ipoName => iposInRegionSet.has(ipoName)));

        return {
            subprojects: regionFilteredSubprojects,
            ipos: regionFilteredIpos,
            trainings: regionFilteredTrainings,
            otherActivities: regionFilteredOtherActivities,
        };

    }, [selectedYear, selectedRegion, subprojects, ipos, trainings, otherActivities]);
    
    const TabButton: React.FC<{ tabName: DashboardTab; label: string; }> = ({ tabName, label }) => {
        const isActive = activeTab === tabName;
        return (
            <button
                type="button"
                onClick={() => setActiveTab(tabName)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-200
                    ${isActive
                        ? 'border-accent text-accent dark:text-green-400 dark:border-green-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
            >
                {label}
            </button>
        );
    }
    
    const renderTabContent = () => {
        switch (activeTab) {
            case 'Physical':
                return <PhysicalDashboard data={filteredData} allIpos={ipos} />;
            case 'Financial':
                return <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md"><h3 className="text-xl font-semibold">Financial Dashboard</h3><p className="mt-2 text-gray-600 dark:text-gray-400">Content for financial data will be displayed here.</p></div>;
            case 'Level of Development':
                return <LevelOfDevelopmentDashboard ipos={filteredData.ipos} />;
            case 'Gender and Development':
                return <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md"><h3 className="text-xl font-semibold">Gender and Development (GAD) Dashboard</h3><p className="mt-2 text-gray-600 dark:text-gray-400">Content for GAD-related data will be displayed here.</p></div>;
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-4">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Detailed Dashboards</h2>
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

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md">
                <div className="border-b border-gray-200 dark:border-gray-700">
                    <nav className="-mb-px flex space-x-4 px-4 overflow-x-auto" aria-label="Tabs">
                        <TabButton tabName="Physical" label="Physical" />
                        <TabButton tabName="Financial" label="Financial" />
                        <TabButton tabName="Level of Development" label="Level of Development" />
                        <TabButton tabName="Gender and Development" label="Gender & Development" />
                    </nav>
                </div>
            </div>

            <div className="mt-4">
                {renderTabContent()}
            </div>
        </div>
    );
};

export default DashboardsPage;
