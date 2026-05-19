
// Author: 4K 
import React, { useMemo, useState, useEffect } from 'react';
import { Subproject, Training, OtherActivity, IPO, OfficeRequirement, StaffingRequirement, OtherProgramExpense, Deadline, tiers, fundTypes, operatingUnits, ouToRegionMap, filterYears } from '../constants';
import WFPReport from './reports/WFPReport';
import BPFormsReport from './reports/BPFormsReport';
import BEDSReport from './reports/BEDSReport';
import PICSReport from './reports/PICSReport';
import BAR1Report from './reports/BAR1Report';
import BudgetUtilizationReport from './reports/BudgetUtilizationReport';
import MonthlyReportMatrix from './reports/MonthlyReportMatrix'; // Import
import { useAuth } from '../contexts/AuthContext';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';

interface ReportsProps {
    ipos: IPO[];
    subprojects: Subproject[];
    trainings: Training[];
    otherActivities: OtherActivity[];
    officeReqs: OfficeRequirement[];
    staffingReqs: StaffingRequirement[];
    otherProgramExpenses: OtherProgramExpense[];
    deadlines: Deadline[];
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
}

type ReportTab = 'WFP' | 'BP Forms' | 'BEDS' | 'PICS' | 'BAR1' | 'Budget Utilization Report' | 'Monthly Matrix';

const Reports: React.FC<ReportsProps> = ({ ipos, subprojects, trainings, otherActivities, officeReqs, staffingReqs, otherProgramExpenses, deadlines, uacsCodes }) => {
    const { currentUser, getVisibilityScope } = useAuth();
    const visibilityScope = getVisibilityScope('Reports');
    const isLockedToOwnOu = visibilityScope === 'Own OU';

    const [activeTab, setActiveTab] = useState<ReportTab>('WFP');
    // Default to current year
    const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
    const [selectedOu, setSelectedOu] = useState<string>(isLockedToOwnOu ? (currentUser?.operatingUnit || 'All') : 'All');
    const [selectedTier, setSelectedTier] = useState<string>('Tier 1');
    const [selectedFundType, setSelectedFundType] = useState<string>('Current');
    const [filtersOpen, setFiltersOpen] = useState(false);

    useEffect(() => {
        if (isLockedToOwnOu && currentUser) {
            setSelectedOu(currentUser.operatingUnit);
        }
    }, [currentUser, isLockedToOwnOu]);
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
        const approvedList = list.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED');
        if (selectedOu === 'All' || !targetRegion) return approvedList;
        return approvedList.filter(i => i.region === targetRegion);
    };

    const baseFilter = (item: any) => {
        if (item.workflow_status && item.workflow_status !== 'APPROVED') return false;
        if (selectedTier !== 'All' && item.tier !== selectedTier) return false;
        if (selectedFundType !== 'All' && item.fundType !== selectedFundType) return false;
        return true;
    };

    // Filter logic for Financial History Table (Ignores Year AND Fund Type filter)
    // This allows Table 2 in MonthlyReportMatrix to show Current vs Continuing breakdown
    const financialBaseFilter = (item: any) => {
        if (item.workflow_status && item.workflow_status !== 'APPROVED') return false;
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

    const reportTabs: { tabName: ReportTab; label: string }[] = [
        { tabName: 'WFP', label: 'WFP' },
        { tabName: 'BP Forms', label: 'BP Forms' },
        { tabName: 'BEDS', label: 'BEDS' },
        { tabName: 'PICS', label: 'PICS' },
        { tabName: 'BAR1', label: 'BAR1' },
        { tabName: 'Budget Utilization Report', label: 'Budget Utilization' },
        { tabName: 'Monthly Matrix', label: 'Monthly Matrix' },
    ];

    const TabButton: React.FC<{ tabName: ReportTab; label: string; }> = ({ tabName, label }) => {
        const isActive = activeTab === tabName;
        return (
            <button
                type="button"
                onClick={() => setActiveTab(tabName)}
                className={`data-tab ${isActive ? 'is-active' : ''}`}
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
                return <BAR1Report data={filteredData} uacsCodes={uacsCodes} selectedYear={selectedYear} selectedOu={selectedOu} selectedTier={selectedTier} selectedFundType={selectedFundType} deadlines={deadlines} />;
            case 'Budget Utilization Report':
                return <BudgetUtilizationReport data={financialFilteredData} uacsCodes={uacsCodes} selectedYear={selectedYear} selectedOu={selectedOu} selectedTier={selectedTier} selectedFundType={selectedFundType} />;
            case 'Monthly Matrix':
                // Pass filteredData for Physical (Year specific) and financialFilteredData for Financial (History/Breakdown)
                return <MonthlyReportMatrix data={filteredData} financialData={financialFilteredData} selectedYear={selectedYear} selectedOu={selectedOu} />;
            default:
                return null;
        }
    };

    return (
        <div className="data-list-page reports-page">
            <div className="data-list-header print-hidden">
                <h2 className="data-list-title">Reports</h2>
                <div className="page-filter-toggle">
                    <span className="page-filter-summary">
                        {[selectedOu === 'All' ? 'All OUs' : selectedOu, selectedTier, selectedFundType, selectedYear].join(' / ')}
                    </span>
                    <button
                        type="button"
                        className={`btn btn-secondary page-filter-button ${filtersOpen ? 'is-open' : ''}`}
                        onClick={() => setFiltersOpen(prev => !prev)}
                        aria-expanded={filtersOpen}
                        aria-controls="reports-filter-panel"
                    >
                        <SlidersHorizontal aria-hidden="true" />
                        <span>Filters</span>
                        <ChevronDown aria-hidden="true" className="page-filter-button__chevron" />
                    </button>
                </div>
            </div>

            <div id="reports-filter-panel" className={`report-filter-panel page-filter-panel print-hidden ${filtersOpen ? 'is-open' : ''}`} hidden={!filtersOpen}>
                <div className="report-filter-grid">
                    <div className="report-filter">
                        <label htmlFor="ou-filter" className="form-label">OU</label>
                        <select 
                            id="ou-filter"
                            value={selectedOu}
                            onChange={(e) => setSelectedOu(e.target.value)}
                            disabled={isLockedToOwnOu}
                            className="form-control"
                        >
                            <option value="All">All OUs</option>
                            {operatingUnits.map(ou => (
                                <option key={ou} value={ou}>{ou}</option>
                            ))}
                        </select>
                    </div>
                    <div className="report-filter">
                        <label htmlFor="tier-filter" className="form-label">Tier</label>
                        <select 
                            id="tier-filter"
                            value={selectedTier}
                            onChange={(e) => setSelectedTier(e.target.value)}
                            className="form-control"
                        >
                            <option value="All">All Tiers</option>
                            {tiers.map(tier => (
                                <option key={tier} value={tier}>{tier}</option>
                            ))}
                        </select>
                    </div>
                    <div className="report-filter">
                        <label htmlFor="fund-type-filter" className="form-label">Fund Type</label>
                        <select 
                            id="fund-type-filter"
                            value={selectedFundType}
                            onChange={(e) => setSelectedFundType(e.target.value)}
                            className="form-control"
                        >
                            <option value="All">All Fund Types</option>
                            {fundTypes.map(ft => (
                                <option key={ft} value={ft}>{ft}</option>
                            ))}
                        </select>
                    </div>
                    <div className="report-filter">
                        <label htmlFor="year-filter" className="form-label">Year</label>
                        <select 
                            id="year-filter"
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(e.target.value)}
                            className="form-control"
                        >
                            <option value="All">All Years</option>
                            {availableYears.map(year => ( <option key={year} value={year}>{year}</option> ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="report-tabs-card print-hidden">
                <nav className="data-tabs" aria-label="Report tabs">
                    {reportTabs.map(tab => (
                        <TabButton key={tab.tabName} tabName={tab.tabName} label={tab.label} />
                    ))}
                </nav>
            </div>

            <div className="report-output">
                {renderTabContent()}
            </div>
        </div>
    );
};

export default Reports;
