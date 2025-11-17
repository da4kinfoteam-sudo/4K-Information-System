

import React, { useState, useMemo } from 'react';
import { Subproject, IPO, Training, OtherActivity, philippineRegions } from '../constants';

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
        // Pass filteredData to each specific dashboard component in the future
        switch (activeTab) {
            case 'Physical':
                return <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md"><h3 className="text-xl font-semibold">Physical Dashboard</h3><p className="mt-2 text-gray-600 dark:text-gray-400">Content for physical targets and accomplishments will be displayed here.</p></div>;
            case 'Financial':
                return <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md"><h3 className="text-xl font-semibold">Financial Dashboard</h3><p className="mt-2 text-gray-600 dark:text-gray-400">Content for financial data will be displayed here.</p></div>;
            case 'Level of Development':
                return <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md"><h3 className="text-xl font-semibold">Level of Development Dashboard</h3><p className="mt-2 text-gray-600 dark:text-gray-400">Content for IPO level of development will be displayed here.</p></div>;
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
                    <nav className="-mb-px flex space-x-4 px-4" aria-label="Tabs">
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
