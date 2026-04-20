
// Author: 4K 
import React, { useMemo, useState, useEffect } from 'react';
import { Subproject, Training, OtherActivity, IPO, OfficeRequirement, StaffingRequirement, OtherProgramExpense, tiers, fundTypes, operatingUnits, ouToRegionMap, filterYears } from '../constants';
import WFPReport from './reports/WFPReport';
import BPFormsReport from './reports/BPFormsReport';
import BEDSReport from './reports/BEDSReport';
import PICSReport from './reports/PICSReport';
import BAR1Report from './reports/BAR1Report';
import BudgetUtilizationReport from './reports/BudgetUtilizationReport';
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

type ReportTab = 'WFP' | 'BP Forms' | 'BEDS' | 'PICS' | 'BAR1' | 'Budget Utilization Report' | 'Monthly Matrix';

import { generateBar1Snapshots } from '../services/snapshotService';

const Reports: React.FC<ReportsProps> = ({ ipos, subprojects, trainings, otherActivities, officeReqs, staffingReqs, otherProgramExpenses, uacsCodes }) => {
    const { currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState<ReportTab>('WFP');
    // Default to current year
    const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
    const [selectedOu, setSelectedOu] = useState<string>('All');
    const [selectedTier, setSelectedTier] = useState<string>('Tier 1');
    const [selectedFundType, setSelectedFundType] = useState<string>('Current');
    
    // Snapshot Management
    const [isGeneratingSnapshots, setIsGeneratingSnapshots] = useState(false);
    const [snapshotStatus, setSnapshotStatus] = useState<{success?: boolean, error?: string, count?: number} | null>(null);

    const handleGenerateSnapshots = async () => {
        setIsGeneratingSnapshots(true);
        setSnapshotStatus(null);
        const result = await generateBar1Snapshots();
        setSnapshotStatus(result);
        setIsGeneratingSnapshots(false);
    };

    // Auto-capture logic: Run once a day if Admin is viewing reports
    useEffect(() => {
        const lastCapture = localStorage.getItem('last_bar1_snapshot_capture');
        const today = new Date().toISOString().split('T')[0];
        
        if (currentUser?.role === 'Administrator' && lastCapture !== today && activeTab === 'BAR1') {
            handleGenerateSnapshots().then(() => {
                localStorage.setItem('last_bar1_snapshot_capture', today);
            });
        }
    }, [currentUser, activeTab]);

    // Enforce User OU restriction on mount/change
    useEffect(() => {
        if (currentUser && currentUser.role === 'User') {
            setSelectedOu(currentUser.operatingUnit);
        }
    }, [currentUser]);

    const availableYears = useMemo(() => {
        return [...filterYears].sort((a, b) => parseInt(b) - parseInt(a));
    }, []);

    // Helper functions for filtering
    const sanitizeDetails = (items: any[] | undefined) => (items || []).filter(i => i);
    const sanitizeExpenses = (items: any[] | undefined) => (items || []).filter(i => i);

    const filterByOu = (list: any[]) => {
        if (selectedOu === 'All') return list;
        return list.filter(item => item.operatingUnit === selectedOu);
    };

    const targetRegion = selectedOu !== 'All' ? ouToRegionMap[selectedOu] : null;
    const filterIpoByRegion = (list: IPO[]) => {
        if (selectedOu === 'All' || !targetRegion) return list;
        return list.filter(i => i.region === targetRegion);
    };

    const baseFilter = (item: any) => {
        if (selectedTier !== 'All' && item.tier !== selectedTier) return false;
        if (selectedFundType !== 'All' && item.fundType !== selectedFundType) return false;
        return true;
    };

    // Filter logic for Financial History Table (Ignores Year AND Fund Type filter)
    // This allows Table 2 in MonthlyReportMatrix to show Current vs Continuing breakdown
    const financialBaseFilter = (item: any) => {
        if (selectedTier !== 'All' && item.tier !== selectedTier) return false;
        // NOTE: fundType filter is INTENTIONALLY skipped here to allow aggregation of Current vs Continuing
        return true;
    };

    // Data filtered by Year (For Physical Reports)
    const filteredData = useMemo(() => {
        let filtered = {
            subprojects: subprojects.filter(baseFilter),
            ipos: ipos,
            trainings: trainings.filter(baseFilter),
            otherActivities: otherActivities.filter(baseFilter),
            officeReqs: officeReqs.filter(baseFilter),
            staffingReqs: staffingReqs.filter(baseFilter),
            otherProgramExpenses: otherProgramExpenses.filter(baseFilter)
        };

        if (selectedYear !== 'All') {
            filtered = {
                ...filtered,
                subprojects: filtered.subprojects.filter(p => p.fundingYear?.toString() === selectedYear),
                trainings: filtered.trainings.filter(t => t.fundingYear?.toString() === selectedYear),
                otherActivities: filtered.otherActivities.filter(a => a.fundingYear?.toString() === selectedYear),
                officeReqs: filtered.officeReqs.filter(i => i.fundYear?.toString() === selectedYear),
                staffingReqs: filtered.staffingReqs.filter(i => i.fundYear?.toString() === selectedYear),
                otherProgramExpenses: filtered.otherProgramExpenses.filter(i => i.fundYear?.toString() === selectedYear),
            };
        }

        return {
            subprojects: filterByOu(filtered.subprojects).map(p => ({ ...p, details: sanitizeDetails(p.details) })),
            ipos: filterIpoByRegion(filtered.ipos),
            trainings: filterByOu(filtered.trainings).map(t => ({ ...t, expenses: sanitizeExpenses(t.expenses) })),
            otherActivities: filterByOu(filtered.otherActivities).map(a => ({ ...a, expenses: sanitizeExpenses(a.expenses) })),
            officeReqs: filterByOu(filtered.officeReqs),
            staffingReqs: filterByOu(filtered.staffingReqs).map(s => ({ ...s, expenses: sanitizeExpenses(s.expenses) })),
            otherProgramExpenses: filterByOu(filtered.otherProgramExpenses),
        };
    }, [selectedYear, selectedOu, selectedTier, selectedFundType, subprojects, ipos, trainings, otherActivities, officeReqs, staffingReqs, otherProgramExpenses]);

    // Data IGNORING Year and FundType Filter (For Financial History Table)
    const financialFilteredData = useMemo(() => {
        // Apply OU and Tier filters only
        let filtered = {
            subprojects: subprojects.filter(financialBaseFilter),
            ipos: ipos,
            trainings: trainings.filter(financialBaseFilter),
            otherActivities: otherActivities.filter(financialBaseFilter),
            officeReqs: officeReqs.filter(financialBaseFilter),
            staffingReqs: staffingReqs.filter(financialBaseFilter),
            otherProgramExpenses: otherProgramExpenses.filter(financialBaseFilter)
        };

        return {
            subprojects: filterByOu(filtered.subprojects).map(p => ({ ...p, details: sanitizeDetails(p.details) })),
            ipos: filterIpoByRegion(filtered.ipos),
            trainings: filterByOu(filtered.trainings).map(t => ({ ...t, expenses: sanitizeExpenses(t.expenses) })),
            otherActivities: filterByOu(filtered.otherActivities).map(a => ({ ...a, expenses: sanitizeExpenses(a.expenses) })),
            officeReqs: filterByOu(filtered.officeReqs),
            staffingReqs: filterByOu(filtered.staffingReqs).map(s => ({ ...s, expenses: sanitizeExpenses(s.expenses) })),
            otherProgramExpenses: filterByOu(filtered.otherProgramExpenses),
        };
    }, [selectedOu, selectedTier, subprojects, ipos, trainings, otherActivities, officeReqs, staffingReqs, otherProgramExpenses]);

    const TabButton: React.FC<{ tabName: ReportTab; label: string; }> = ({ tabName, label }) => {
        const isActive = activeTab === tabName;
        return (
            <button
                type="button"
                onClick={() => setActiveTab(tabName)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-200
                    ${isActive
                        ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 dark:border-emerald-400'
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
                return <BAR1Report data={filteredData} uacsCodes={uacsCodes} selectedYear={selectedYear} selectedOu={selectedOu} selectedTier={selectedTier} selectedFundType={selectedFundType} />;
            case 'Budget Utilization Report':
                return <BudgetUtilizationReport data={filteredData} uacsCodes={uacsCodes} selectedYear={selectedYear} selectedOu={selectedOu} />;
            case 'Monthly Matrix':
                // Pass filteredData for Physical (Year specific) and financialFilteredData for Financial (History/Breakdown)
                return <MonthlyReportMatrix data={filteredData} financialData={financialFilteredData} selectedYear={selectedYear} selectedOu={selectedOu} />;
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

            {currentUser?.role === 'Administrator' && activeTab === 'BAR1' && (
                <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800 p-4 rounded-lg flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-full text-emerald-600 dark:text-emerald-400">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Historical Snapshots</p>
                            <p className="text-xs text-emerald-700 dark:text-emerald-400">Daily snapshots allow you to review previous report data. The system captures these automatically once a day.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {snapshotStatus && (
                            <span className={`text-xs font-medium px-2 py-1 rounded-full ${snapshotStatus.success ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                {snapshotStatus.success ? `Success: ${snapshotStatus.count} snapshots saved` : `Error: ${snapshotStatus.error}`}
                            </span>
                        )}
                        <button
                            onClick={handleGenerateSnapshots}
                            disabled={isGeneratingSnapshots}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            {isGeneratingSnapshots ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Capturing...
                                </>
                            ) : 'Capture Daily Snapshot Now'}
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md print-hidden">
                <div className="border-b border-gray-200 dark:border-gray-700">
                    <nav className="-mb-px flex space-x-4 px-4 overflow-x-auto" aria-label="Tabs">
                        <TabButton tabName="WFP" label="WFP" />
                        <TabButton tabName="BP Forms" label="BP Forms" />
                        <TabButton tabName="BEDS" label="BEDS" />
                        <TabButton tabName="PICS" label="PICS" />
                        <TabButton tabName="BAR1" label="BAR1" />
                        <TabButton tabName="Budget Utilization Report" label="Budget Utilization Report" />
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
