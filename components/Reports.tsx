// Author: 4K 
import React, { useMemo, useState, useEffect } from 'react';
import { Subproject, Training, OtherActivity, IPO, OfficeRequirement, StaffingRequirement, OtherProgramExpense, tiers, fundTypes, operatingUnits, ouToRegionMap } from '../constants';
import WFPReport from './reports/WFPReport';
import BPFormsReport from './reports/BPFormsReport';
import BEDSReport from './reports/BEDSReport';
import PICSReport from './reports/PICSReport';
import BAR1Report from './reports/BAR1Report';
import MonthlyReportMatrix from './reports/MonthlyReportMatrix'; // Import
import { useAuth } from '../contexts/AuthContext';

interface ReportsProps {
    ipos: IPO[];
    subprojects: Subproject[];
    trainings: Training[];
    otherActivities: OtherActivity[];
    officeReqs: OfficeRequirement[];
    staffingReqs: StaffingRequirement[];
    otherProgramExpenses: OtherProgramExpense[];
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
}

type ReportTab = 'WFP' | 'BP Forms' | 'BEDS' | 'PICS' | 'BAR1' | 'Monthly Matrix';

const Reports: React.FC<ReportsProps> = ({ ipos, subprojects, trainings, otherActivities, officeReqs, staffingReqs, otherProgramExpenses, uacsCodes }) => {
    const { currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState<ReportTab>('WFP');
    // Default to current year
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
        subprojects.forEach(p => p.fundingYear && years.add(p.fundingYear.toString()));
        trainings.forEach(t => t.fundingYear && years.add(t.fundingYear.toString()));
        // Fixed: Use fundingYear instead of date for consistency
        otherActivities.forEach(a => a.fundingYear && years.add(a.fundingYear.toString()));
        // Fixed: Safe access to fundYear
        officeReqs.forEach(i => i.fundYear && years.add(i.fundYear.toString()));
        staffingReqs.forEach(i => i.fundYear && years.add(i.fundYear.toString()));
        otherProgramExpenses.forEach(i => i.fundYear && years.add(i.fundYear.toString()));
        // Ensure current year is always an option even if no data
        years.add(new Date().getFullYear().toString());
        return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
    }, [subprojects, trainings, otherActivities, officeReqs, staffingReqs, otherProgramExpenses]);

    const filteredData = useMemo(() => {
        let filtered = {
            subprojects: subprojects,
            ipos: ipos,
            trainings: trainings,
            otherActivities: otherActivities,
            officeReqs: officeReqs,
            staffingReqs: staffingReqs,
            otherProgramExpenses: otherProgramExpenses
        };

        if (selectedYear !== 'All') {
            filtered = {
                ...filtered,
                subprojects: filtered.subprojects.filter(p => p.fundingYear?.toString() === selectedYear),
                trainings: filtered.trainings.filter(t => t.fundingYear?.toString() === selectedYear),
                // Fixed: Filter by fundingYear instead of date
                otherActivities: filtered.otherActivities.filter(a => a.fundingYear?.toString() === selectedYear),
                // Fixed: Safe access using optional chaining to prevent crashes on null fundYear
                officeReqs: filtered.officeReqs.filter(i => i.fundYear?.toString() === selectedYear),
                staffingReqs: filtered.staffingReqs.filter(i => i.fundYear?.toString() === selectedYear),
                otherProgramExpenses: filtered.otherProgramExpenses.filter(i => i.fundYear?.toString() === selectedYear),
            };
        }

        if (selectedTier !== 'All') {
            filtered = {
                ...filtered,
                subprojects: filtered.subprojects.filter(p => p.tier === selectedTier),
                trainings: filtered.trainings.filter(t => t.tier === selectedTier),
                otherActivities: filtered.otherActivities.filter(a => a.tier === selectedTier),
                officeReqs: filtered.officeReqs.filter(i => i.tier === selectedTier),
                staffingReqs: filtered.staffingReqs.filter(i => i.tier === selectedTier),
                otherProgramExpenses: filtered.otherProgramExpenses.filter(i => i.tier === selectedTier),
            };
        }

        if (selectedFundType !== 'All') {
            filtered = {
                ...filtered,
                subprojects: filtered.subprojects.filter(p => p.fundType === selectedFundType),
                trainings: filtered.trainings.filter(t => t.fundType === selectedFundType),
                otherActivities: filtered.otherActivities.filter(a => a.fundType === selectedFundType),
                officeReqs: filtered.officeReqs.filter(i => i.fundType === selectedFundType),
                staffingReqs: filtered.staffingReqs.filter(i => i.fundType === selectedFundType),
                otherProgramExpenses: filtered.otherProgramExpenses.filter(i => i.fundType === selectedFundType),
            };
        }

        if (selectedOu === 'All') {
            return filtered;
        }

        const targetRegion = ouToRegionMap[selectedOu];

        return {
            subprojects: filtered.subprojects.filter(p => p.operatingUnit === selectedOu),
            ipos: filtered.ipos.filter(i => i.region === targetRegion),
            trainings: filtered.trainings.filter(t => t.operatingUnit === selectedOu),
            otherActivities: filtered.otherActivities.filter(a => a.operatingUnit === selectedOu),
            officeReqs: filtered.officeReqs.filter(i => i.operatingUnit === selectedOu),
            staffingReqs: filtered.staffingReqs.filter(i => i.operatingUnit === selectedOu),
            otherProgramExpenses: filtered.otherProgramExpenses.filter(i => i.operatingUnit === selectedOu),
        };
    }, [selectedYear, selectedOu, selectedTier, selectedFundType, subprojects, ipos, trainings, otherActivities, officeReqs, staffingReqs, otherProgramExpenses]);

    const TabButton: React.FC<{ tabName: ReportTab; label: string; }> = ({ tabName, label }) => {
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
            case 'WFP':
                return <WFPReport data={filteredData} uacsCodes={uacsCodes} selectedYear={selectedYear} selectedOu={selectedOu} />;
            case 'BP Forms':
                return <BPFormsReport data={filteredData} uacsCodes={uacsCodes} selectedYear={selectedYear} selectedOu={selectedOu} />;
            case 'BEDS':
                return <BEDSReport data={filteredData} uacsCodes={uacsCodes} selectedYear={selectedYear} selectedOu={selectedOu} selectedFundType={selectedFundType} selectedTier={selectedTier} />;
            case 'PICS':
                return <PICSReport data={filteredData} selectedYear={selectedYear} selectedOu={selectedOu} />;
            case 'BAR1':
                return <BAR1Report data={filteredData} uacsCodes={uacsCodes} selectedYear={selectedYear} selectedOu={selectedOu} />;
            case 'Monthly Matrix':
                return <MonthlyReportMatrix data={filteredData} selectedYear={selectedYear} selectedOu={selectedOu} />;
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-4 print-hidden">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Reports</h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                     <div className="flex items-center gap-2">
                        <label htmlFor="ou-filter" className="text-sm font-medium text-gray-600 dark:text-gray-300">OU:</label>
                        <select 
                            id="ou-filter"
                            value={selectedOu}
                            onChange={(e) => setSelectedOu(e.target.value)}
                            disabled={currentUser?.role === 'User'}
                            className="bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-10 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm disabled:opacity-70 disabled:cursor-not-allowed"
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
                            className="bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-10 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
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
                            className="bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-10 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
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
                            className="bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-10 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
                        >
                            <option value="All">All Years</option>
                            {availableYears.map(year => ( <option key={year} value={year}>{year}</option> ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md print-hidden">
                <div className="border-b border-gray-200 dark:border-gray-700">
                    <nav className="-mb-px flex space-x-4 px-4 overflow-x-auto" aria-label="Tabs">
                        <TabButton tabName="WFP" label="WFP" />
                        <TabButton tabName="BP Forms" label="BP Forms" />
                        <TabButton tabName="BEDS" label="BEDS" />
                        <TabButton tabName="PICS" label="PICS" />
                        <TabButton tabName="BAR1" label="BAR1" />
                        <TabButton tabName="Monthly Matrix" label="Monthly Matrix" />
                    </nav>
                </div>
            </div>

            <div className="mt-4">
                {renderTabContent()}
            </div>
        </div>
    );
};

export default Reports;