
// Author: 4K 
import React, { useState, useMemo, useEffect } from 'react';
import { Subproject, IPO, Training, OtherActivity, tiers, fundTypes, operatingUnits, ouToRegionMap, OfficeRequirement, StaffingRequirement, OtherProgramExpense } from '../constants';
import PhysicalDashboard from './dashboards/PhysicalDashboard';
import FinancialDashboard from './dashboards/FinancialDashboard';
import GADDashboard from './dashboards/GADDashboard';
import IPOLevelDashboard from './dashboards/IPOLevelDashboard';
import NutritionDashboard from './dashboards/NutritionDashboard';
import FarmProductivityDashboard from './dashboards/FarmProductivityDashboard';
import SCADDashboard from './dashboards/SCADDashboard';
import AgriculturalInterventionsDashboard from './dashboards/AgriculturalInterventionsDashboard';
import { ModalItem } from './dashboards/DashboardComponents';
import { useAuth } from '../contexts/AuthContext';

export interface DashboardsPageProps {
    subprojects: Subproject[];
    ipos: IPO[];
    trainings: Training[];
    otherActivities: OtherActivity[];
    officeReqs: OfficeRequirement[];
    staffingReqs: StaffingRequirement[];
    otherProgramExpenses: OtherProgramExpense[];
}

type DashboardTab = 'Physical' | 'Financial' | 'GAD' | 'IPO Level of Development' | 'Nutrition' | 'Farm Productivity and Income' | 'SCAD' | 'Agricultural Interventions';

const DashboardsPage: React.FC<DashboardsPageProps> = (props) => {
    const { currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState<DashboardTab>('Physical');
    const [modalData, setModalData] = useState<{ title: string; items: ModalItem[] } | null>(null);
    const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
    const [selectedOu, setSelectedOu] = useState<string>('All');
    const [selectedTier, setSelectedTier] = useState<string>('Tier 1');
    const [selectedFundType, setSelectedFundType] = useState<string>('Current');

    // Enforce User OU restriction on mount/change
    useEffect(() => {
        if (currentUser && currentUser.role === 'User') {
            setSelectedOu(currentUser.operatingUnit);
        }
    }, [currentUser]);

    const availableYears = useMemo(() => {
        const years = new Set<string>();
        props.subprojects.forEach(p => p.fundingYear && years.add(p.fundingYear.toString()));
        props.trainings.forEach(t => t.fundingYear && years.add(t.fundingYear.toString()));
        props.ipos.forEach(i => years.add(new Date(i.registrationDate).getFullYear().toString()));
        props.otherActivities.forEach(a => years.add(new Date(a.date).getFullYear().toString()));
        
        // Add PM years
        props.officeReqs.forEach(i => years.add(i.fundYear.toString()));
        props.staffingReqs.forEach(i => years.add(i.fundYear.toString()));
        props.otherProgramExpenses.forEach(i => years.add(i.fundYear.toString()));

        return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
    }, [props]);

    const filteredData = useMemo(() => {
        let data = {
            subprojects: [...props.subprojects],
            ipos: [...props.ipos],
            trainings: [...props.trainings],
            otherActivities: [...props.otherActivities],
            officeReqs: [...props.officeReqs],
            staffingReqs: [...props.staffingReqs],
            otherProgramExpenses: [...props.otherProgramExpenses]
        };

        // Filter by Year
        if (selectedYear !== 'All') {
            data.subprojects = data.subprojects.filter(p => p.fundingYear?.toString() === selectedYear);
            // Note: We DO NOT filter IPOs by registration date here anymore. 
            // Dashboards like GAD and Physical need the full IPO registry to check for engagement status in the selected year.
            data.trainings = data.trainings.filter(t => t.fundingYear?.toString() === selectedYear);
            data.otherActivities = data.otherActivities.filter(a => new Date(a.date).getFullYear().toString() === selectedYear);
            data.officeReqs = data.officeReqs.filter(i => i.fundYear.toString() === selectedYear);
            data.staffingReqs = data.staffingReqs.filter(i => i.fundYear.toString() === selectedYear);
            data.otherProgramExpenses = data.otherProgramExpenses.filter(i => i.fundYear.toString() === selectedYear);
        }

        // Filter by Tier
        if (selectedTier !== 'All') {
            data.subprojects = data.subprojects.filter(p => p.tier === selectedTier);
            data.trainings = data.trainings.filter(t => t.tier === selectedTier);
            data.otherActivities = data.otherActivities.filter(a => a.tier === selectedTier);
            data.officeReqs = data.officeReqs.filter(i => i.tier === selectedTier);
            data.staffingReqs = data.staffingReqs.filter(i => i.tier === selectedTier);
            data.otherProgramExpenses = data.otherProgramExpenses.filter(i => i.tier === selectedTier);
        }

        // Filter by Fund Type
        if (selectedFundType !== 'All') {
            data.subprojects = data.subprojects.filter(p => p.fundType === selectedFundType);
            data.trainings = data.trainings.filter(t => t.fundType === selectedFundType);
            data.otherActivities = data.otherActivities.filter(a => a.fundType === selectedFundType);
            data.officeReqs = data.officeReqs.filter(i => i.fundType === selectedFundType);
            data.staffingReqs = data.staffingReqs.filter(i => i.fundType === selectedFundType);
            data.otherProgramExpenses = data.otherProgramExpenses.filter(i => i.fundType === selectedFundType);
        }

        // Filter by OU
        if (selectedOu !== 'All') {
            const targetRegion = ouToRegionMap[selectedOu];
            data.subprojects = data.subprojects.filter(p => p.operatingUnit === selectedOu);
            data.trainings = data.trainings.filter(t => t.operatingUnit === selectedOu);
            data.otherActivities = data.otherActivities.filter(a => a.operatingUnit === selectedOu);
            data.ipos = data.ipos.filter(i => i.region === targetRegion);
            data.officeReqs = data.officeReqs.filter(i => i.operatingUnit === selectedOu);
            data.staffingReqs = data.staffingReqs.filter(i => i.operatingUnit === selectedOu);
            data.otherProgramExpenses = data.otherProgramExpenses.filter(i => i.operatingUnit === selectedOu);
        }

        return data;
    }, [selectedYear, selectedOu, selectedTier, selectedFundType, props]);

    const TabButton: React.FC<{ tabName: DashboardTab; label: string }> = ({ tabName, label }) => {
        const isActive = activeTab === tabName;
        return (
            <button
                type="button"
                onClick={() => setActiveTab(tabName)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-200 whitespace-nowrap
                    ${isActive
                        ? 'border-accent text-accent dark:text-green-400 dark:border-green-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
            >
                {label}
            </button>
        );
    };

    return (
        <div className="relative">
            <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Strategic Dashboard</h2>
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

            {/* Tabs Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md mb-6">
                <div className="border-b border-gray-200 dark:border-gray-700">
                    <nav className="-mb-px flex space-x-4 px-4 overflow-x-auto" aria-label="Tabs">
                        <TabButton tabName="Physical" label="Physical" />
                        <TabButton tabName="Financial" label="Financial" />
                        <TabButton tabName="SCAD" label="SCAD" />
                        <TabButton tabName="Agricultural Interventions" label="Agricultural Interventions" />
                        <TabButton tabName="GAD" label="GAD" />
                        <TabButton tabName="IPO Level of Development" label="IPO Level of Development" />
                        <TabButton tabName="Nutrition" label="Nutrition" />
                        <TabButton tabName="Farm Productivity and Income" label="Farm Productivity and Income" />
                    </nav>
                </div>
            </div>

            {/* Tab Content */}
            <div className="mt-4">
                {activeTab === 'Physical' && <PhysicalDashboard data={filteredData} setModalData={setModalData} />}
                {activeTab === 'Financial' && <FinancialDashboard data={filteredData} />}
                {activeTab === 'SCAD' && <SCADDashboard ipos={filteredData.ipos} />}
                {activeTab === 'Agricultural Interventions' && <AgriculturalInterventionsDashboard subprojects={filteredData.subprojects} />}
                {activeTab === 'GAD' && <GADDashboard trainings={filteredData.trainings} otherActivities={filteredData.otherActivities} ipos={filteredData.ipos} subprojects={filteredData.subprojects} />}
                {activeTab === 'IPO Level of Development' && <IPOLevelDashboard ipos={filteredData.ipos} />}
                {activeTab === 'Nutrition' && <NutritionDashboard />}
                {activeTab === 'Farm Productivity and Income' && <FarmProductivityDashboard />}
            </div>
            
            {modalData && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setModalData(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white">{modalData.title}</h3>
                            <button onClick={() => setModalData(null)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto custom-scrollbar">
                            {modalData.items.length > 0 ? (
                                <ul className="space-y-3">
                                    {modalData.items.map((item, index) => (
                                        <li key={index} className="border-b border-gray-100 dark:border-gray-700 last:border-0 pb-2 last:pb-0">
                                            <p className="font-semibold text-sm text-gray-800 dark:text-gray-200">{item.name}</p>
                                            {item.details && <p className="text-xs text-gray-500 dark:text-gray-400">{item.details}</p>}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-gray-500 text-center">No items found.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DashboardsPage;
