
// Author: 4K 
import React, { useMemo, useState, useEffect } from 'react';
import { Subproject, Training, OtherActivity, IPO, OfficeRequirement, StaffingRequirement, OtherProgramExpense, Deadline, type RefFundSource } from '../constants';
import WFPReport from './reports/WFPReport';
import BPFormsReport from './reports/BPFormsReport';
import BEDSReport from './reports/BEDSReport';
import PICSReport from './reports/PICSReport';
import BAR1Report from './reports/BAR1Report';
import BudgetUtilizationReport from './reports/BudgetUtilizationReport';
import MonthlyReportMatrix from './reports/MonthlyReportMatrix'; // Import
import DetailedAccomplishmentDataReport from './reports/DetailedAccomplishmentDataReport';
import FinancialAuditReport from './reports/FinancialAuditReport';
import { useAuth } from '../contexts/AuthContext';
import { Printer, X } from 'lucide-react';
import type { DataScope } from '../lib/scopedDataFetch';
import { exportReportWorkbook } from '../lib/reportExcelExport';
import type { ReportExcelRequest, ReportPrintRequest } from './reports/ReportUtils';
import { ReportsScopeFilterPanel, useReportsScopeFilters } from './ui/ReportsScopeFilters';
import { filterReportData, reportHistoryScope, reportCalculationScope, reportOutputName, reportScopeSummary, type ReportScope } from '../lib/reportScope';
import { dashboardScopeKey, dashboardScopeLabels } from '../lib/dashboardScope';

export type ReportTab = 'WFP' | 'BP Forms' | 'BEDS' | 'PICS' | 'BAR1' | 'Budget Utilization Report' | 'Monthly Matrix' | 'Detailed Accomplishment Data' | 'Financial Audit';

export interface ReportsPageState {
    fundingScope?: ReportScope;
    filterOwnerId?: string;
    reportingYearExplicit?: boolean;
    activeTab: ReportTab;
    selectedYear: string;
    selectedReportingYear: string;
    selectedOu: string;
    selectedOus: string[];
    selectedTier: string;
    selectedFundType: string;
    bar1SelectedAsOfDate: string;
    monthlySelectedMonth: number;
    detailedSelectedQuarter: 'All' | 'Q1' | 'Q2' | 'Q3' | 'Q4';
    financialAuditSearchTerm: string;
    financialAuditSeverityFilter: string;
    financialAuditReportFilter: string;
    financialAuditSourceFilter: string;
    financialAuditIssueTypeFilter: string;
    financialAuditAsOfMonth: number;
}

interface ReportsProps {
    fundSources: RefFundSource[];
    dataLoading?: boolean;
    dataError?: string | null;
    ipos: IPO[];
    subprojects: Subproject[];
    trainings: Training[];
    otherActivities: OtherActivity[];
    officeReqs: OfficeRequirement[];
    staffingReqs: StaffingRequirement[];
    otherProgramExpenses: OtherProgramExpense[];
    deadlines: Deadline[];
    budgetCeilings: Array<{ operating_unit: string; year: number; amount: number }>;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    onSelectSubproject: (subproject: Subproject) => void;
    onSelectActivity: (activity: Training | OtherActivity) => void;
    onSelectIpo: (ipo: IPO) => void;
    onSelectOfficeReq: (req: OfficeRequirement) => void;
    onSelectStaffingReq: (req: StaffingRequirement) => void;
    onSelectOtherExpense: (req: OtherProgramExpense) => void;
    onOpenIpoListForAncestralDomain: (adNo: string) => void;
    onDataScopeChange?: (scope: Partial<DataScope>, force?: boolean) => unknown;
    reportState: ReportsPageState;
    onReportStateChange: React.Dispatch<React.SetStateAction<ReportsPageState>>;
}

interface PreparedPrintJob extends ReportPrintRequest {
    tableHtml: string;
    preparedBy: string;
    approvedBy: string;
}

const REPORT_PRINT_NAMES_KEY = '4kis-report-print-signatories';

const Reports: React.FC<ReportsProps> = ({
    fundSources,
    dataLoading = false,
    dataError,
    ipos,
    subprojects,
    trainings,
    otherActivities,
    officeReqs,
    staffingReqs,
    otherProgramExpenses,
    deadlines,
    budgetCeilings,
    uacsCodes,
    onSelectSubproject,
    onSelectActivity,
    onSelectIpo,
    onSelectOfficeReq,
    onSelectStaffingReq,
    onSelectOtherExpense,
    onOpenIpoListForAncestralDomain,
    onDataScopeChange,
    reportState,
    onReportStateChange,
}) => {
    const { currentUser } = useAuth();
    const isSuperAdmin = currentUser?.role === 'Super Admin';
    const { activeTab } = reportState;
    const updateReportState = React.useCallback((patch: Partial<ReportsPageState>) => {
        onReportStateChange(prev => ({ ...prev, ...patch }));
    }, [onReportStateChange]);
    const [pendingPrintRequest, setPendingPrintRequest] = useState<ReportPrintRequest | null>(null);
    const [pendingExcelRequest, setPendingExcelRequest] = useState<ReportExcelRequest | null>(null);
    const [preparedBy, setPreparedBy] = useState('');
    const [approvedBy, setApprovedBy] = useState('');
    const [preparedPrintJob, setPreparedPrintJob] = useState<PreparedPrintJob | null>(null);
    const [printError, setPrintError] = useState('');
    const [isExportingExcel, setIsExportingExcel] = useState(false);
    const [outputScopeKey, setOutputScopeKey] = useState('');
    const records = useMemo(() => [...subprojects, ...trainings, ...otherActivities, ...officeReqs, ...staffingReqs, ...otherProgramExpenses], [subprojects, trainings, otherActivities, officeReqs, staffingReqs, otherProgramExpenses]);
    const filters = useReportsScopeFilters({ state: reportState, setState: onReportStateChange, references: fundSources, records, onDataScopeChange });
    const scope = filters.applied.scope;
    const scopeKey = dashboardScopeKey(scope);
    const { year: selectedYear, operatingUnit: selectedOuForCalculations, tier: selectedTier, fundType: selectedFundType } = reportCalculationScope(scope);
    const selectedReportingYear = filters.applied.reportingYear;
    const scopeLabel = reportScopeSummary(scope, selectedReportingYear, fundSources, records);
    const historyLabel = reportScopeSummary(reportHistoryScope(scope), selectedReportingYear, fundSources, records);
    const selectedOuLabel = dashboardScopeLabels(scope, fundSources, records).operatingUnits;
    const outputLabel = activeTab === 'Monthly Matrix' ? `${scopeLabel}; Financial history: ${historyLabel}`
        : activeTab === 'Financial Audit' && scope.fundSources.mode === 'values' ? `${scopeLabel}; whole OU/year ceiling references; selected cohort only` : scopeLabel;
    const needsReportingYear = activeTab === 'Monthly Matrix' && selectedReportingYear === 'All';
    const isDataReady = filters.ready && !dataLoading && !dataError && !needsReportingYear;

    useEffect(() => {
        try {
            const saved = localStorage.getItem(REPORT_PRINT_NAMES_KEY);
            if (!saved) return;
            const parsed = JSON.parse(saved);
            setPreparedBy(parsed.preparedBy || '');
            setApprovedBy(parsed.approvedBy || '');
        } catch {
            // Ignore malformed local preference data.
        }
    }, []);

    useEffect(() => {
        if (!isSuperAdmin && activeTab === 'Financial Audit') {
            updateReportState({ activeTab: 'WFP' });
        }
    }, [activeTab, isSuperAdmin, updateReportState]);

    useEffect(() => {
        const handleAfterPrint = () => {
            document.body.classList.remove('report-print-active');
            setPreparedPrintJob(null);
        };
        window.addEventListener('afterprint', handleAfterPrint);
        return () => window.removeEventListener('afterprint', handleAfterPrint);
    }, []);

    const sourceData = useMemo(() => ({ subprojects, ipos, trainings, otherActivities, officeReqs, staffingReqs, otherProgramExpenses }), [subprojects, ipos, trainings, otherActivities, officeReqs, staffingReqs, otherProgramExpenses]);
    const filteredData = useMemo(() => filterReportData(sourceData, scope, fundSources), [sourceData, scopeKey, fundSources]);
    const financialFilteredData = useMemo(() => filterReportData(sourceData, reportHistoryScope(scope), fundSources), [sourceData, scopeKey, fundSources]);

    const reportTabs: { tabName: ReportTab; label: string }[] = [
        { tabName: 'WFP', label: 'WFP' },
        { tabName: 'BP Forms', label: 'BP Forms' },
        { tabName: 'BEDS', label: 'BEDS' },
        { tabName: 'PICS', label: 'PICS' },
        { tabName: 'BAR1', label: 'BAR1' },
        { tabName: 'Budget Utilization Report', label: 'Budget Utilization' },
        { tabName: 'Monthly Matrix', label: 'Monthly Matrix' },
        { tabName: 'Detailed Accomplishment Data', label: 'Detailed Accomplishment Data' },
        ...(isSuperAdmin ? [{ tabName: 'Financial Audit' as ReportTab, label: 'Financial Audit' }] : []),
    ];

    const TabButton: React.FC<{ tabName: ReportTab; label: string; }> = ({ tabName, label }) => {
        const isActive = activeTab === tabName;
        return (
            <button
                type="button"
                onClick={() => updateReportState({ activeTab: tabName })}
                className={`data-tab ${isActive ? 'is-active' : ''}`}
            >
                {label}
            </button>
        );
    }

    const cloneReportTable = (tableElementId: string) => {
        const source = document.getElementById(tableElementId);
        if (!source) return '';
        const clone = source.cloneNode(true) as HTMLElement;
        clone.removeAttribute('id');
        clone.querySelectorAll('.print-hidden, button, [aria-hidden="true"].btn-symbol').forEach(element => element.remove());
        clone.querySelectorAll('[style]').forEach(element => {
            const htmlElement = element as HTMLElement;
            htmlElement.style.position = '';
            htmlElement.style.left = '';
            htmlElement.style.top = '';
            htmlElement.style.transform = '';
            htmlElement.style.maxHeight = '';
            htmlElement.style.overflow = '';
        });
        return clone.outerHTML;
    };

    const handleRequestPrint = (request: ReportPrintRequest) => {
        if (!isDataReady) return;
        setPrintError('');
        setOutputScopeKey(`${filters.key}|${activeTab}`);
        setPendingPrintRequest({
            ...request,
            reportName: reportOutputName(request.reportName),
            scopeLabel: outputLabel,
            ouName: selectedOuLabel,
        });
    };

    const handleRequestExport = (request: ReportExcelRequest) => {
        if (!isDataReady) return;
        setPrintError('');
        setOutputScopeKey(`${filters.key}|${activeTab}`);
        const token = scopeLabel.replace(/[^a-zA-Z0-9-]+/g, '_').slice(0, 170);
        const baseName = request.fileName.replace(/\.xlsx$/i, '').split(/_FY|_\d{4}_|_All_/)[0];
        const fileName = `${baseName}_${token}.xlsx`;
        setPendingExcelRequest({
            ...request,
            reportName: reportOutputName(request.reportName),
            scopeLabel: outputLabel,
            ouName: selectedOuLabel,
            fileName,
        });
    };

    const closeOutputModal = () => {
        setPendingPrintRequest(null);
        setPendingExcelRequest(null);
        setPrintError('');
    };

    const handleConfirmOutput = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!pendingPrintRequest && !pendingExcelRequest) return;
        if (!isDataReady || outputScopeKey !== `${filters.key}|${activeTab}`) {
            setPrintError('The report scope changed or is unavailable. Close this dialog and reopen the current report output.');
            return;
        }
        const nextPreparedBy = preparedBy.trim();
        const nextApprovedBy = approvedBy.trim();
        if (!nextPreparedBy || !nextApprovedBy) {
            setPrintError('Prepared By and Approved By are required before printing.');
            return;
        }

        try {
            localStorage.setItem(REPORT_PRINT_NAMES_KEY, JSON.stringify({
                preparedBy: nextPreparedBy,
                approvedBy: nextApprovedBy,
            }));
        } catch {
            // Printing should still continue if local preference storage is unavailable.
        }

        if (pendingExcelRequest) {
            setIsExportingExcel(true);
            try {
                await exportReportWorkbook(pendingExcelRequest, {
                    preparedBy: nextPreparedBy,
                    approvedBy: nextApprovedBy,
                });
                closeOutputModal();
            } catch (error) {
                console.error('Failed to export report workbook:', error);
                setPrintError('Unable to generate the Excel report. Please try again.');
            } finally {
                setIsExportingExcel(false);
            }
            return;
        }

        if (pendingPrintRequest) {
            const tableHtml = cloneReportTable(pendingPrintRequest.tableElementId);
            if (!tableHtml) {
                setPrintError('Unable to find the selected report table for printing.');
                return;
            }

            const printJob: PreparedPrintJob = {
                ...pendingPrintRequest,
                tableHtml,
                preparedBy: nextPreparedBy,
                approvedBy: nextApprovedBy,
            };
            setPendingPrintRequest(null);
            setPreparedPrintJob(printJob);
            document.body.classList.add('report-print-active');
            window.setTimeout(() => window.print(), 100);
        }
    };

    const renderTabContent = () => {
        switch (activeTab) {
            case 'WFP':
                return <WFPReport data={filteredData} uacsCodes={uacsCodes} selectedYear={selectedYear} selectedReportingYear={selectedReportingYear} selectedOu={selectedOuForCalculations} onPrintReport={handleRequestPrint} onExportReport={handleRequestExport} />;
            case 'BP Forms':
                return <BPFormsReport data={filteredData} uacsCodes={uacsCodes} selectedYear={selectedYear} selectedReportingYear={selectedReportingYear} selectedOu={selectedOuForCalculations} onPrintReport={handleRequestPrint} onExportReport={handleRequestExport} />;
            case 'BEDS':
                return (
                    <BEDSReport
                        hasSelectedFundYears={scope.years.mode === 'values'}
                        data={filteredData}
                        selectedYear={selectedYear}
                        selectedReportingYear={selectedReportingYear}
                        selectedOu={selectedOuForCalculations}
                        selectedFundType={selectedFundType}
                        selectedTier={selectedTier}
                        onSelectSubproject={onSelectSubproject}
                        onSelectActivity={onSelectActivity}
                        onSelectOfficeReq={onSelectOfficeReq}
                        onSelectStaffingReq={onSelectStaffingReq}
                        onSelectOtherExpense={onSelectOtherExpense}
                        onPrintReport={handleRequestPrint}
                        onExportReport={handleRequestExport}
                    />
                );
            case 'PICS':
                return (
                    <PICSReport
                        data={filteredData}
                        selectedYear={selectedYear}
                        selectedReportingYear={selectedReportingYear}
                        selectedOu={selectedOuForCalculations}
                        onSelectSubproject={onSelectSubproject}
                        onSelectActivity={onSelectActivity}
                        onOpenIpoListForAncestralDomain={onOpenIpoListForAncestralDomain}
                        selectedAsOfDate={reportState.bar1SelectedAsOfDate}
                        onSelectedAsOfDateChange={(bar1SelectedAsOfDate) => updateReportState({ bar1SelectedAsOfDate })}
                        onPrintReport={handleRequestPrint}
                        onExportReport={handleRequestExport}
                    />
                );
            case 'BAR1':
                return (
                    <BAR1Report
                        data={filteredData}
                        uacsCodes={uacsCodes}
                        selectedYear={selectedYear}
                        selectedReportingYear={selectedReportingYear}
                        selectedOu={selectedOuForCalculations}
                        selectedTier={selectedTier}
                        selectedFundType={selectedFundType}
                        deadlines={deadlines}
                        onSelectSubproject={onSelectSubproject}
                        onSelectActivity={onSelectActivity}
                        onSelectIpo={onSelectIpo}
                        onSelectOfficeReq={onSelectOfficeReq}
                        onSelectStaffingReq={onSelectStaffingReq}
                        onOpenIpoListForAncestralDomain={onOpenIpoListForAncestralDomain}
                        onPrintReport={handleRequestPrint}
                        onExportReport={handleRequestExport}
                    />
                );
            case 'Budget Utilization Report':
                return <BudgetUtilizationReport data={filteredData} uacsCodes={uacsCodes} selectedYear={selectedYear} selectedReportingYear={selectedReportingYear} selectedOu={selectedOuForCalculations} selectedTier={selectedTier} selectedFundType={selectedFundType} onPrintReport={handleRequestPrint} onExportReport={handleRequestExport} />;
            case 'Monthly Matrix':
                // Pass filteredData for Physical (Year specific) and financialFilteredData for Financial (History/Breakdown)
                return <MonthlyReportMatrix data={filteredData} financialData={financialFilteredData} selectedYear={selectedYear} selectedReportingYear={selectedReportingYear} selectedOu={selectedOuForCalculations} selectedMonth={reportState.monthlySelectedMonth} onSelectedMonthChange={(monthlySelectedMonth) => updateReportState({ monthlySelectedMonth })} onPrintReport={handleRequestPrint} onExportReport={handleRequestExport} />;
            case 'Detailed Accomplishment Data':
                return (
                    <DetailedAccomplishmentDataReport
                        data={filteredData}
                        selectedYear={selectedYear}
                        selectedReportingYear={selectedReportingYear}
                        selectedOu={selectedOuForCalculations}
                        selectedTier={selectedTier}
                        selectedFundType={selectedFundType}
                        selectedQuarter={reportState.detailedSelectedQuarter}
                        onSelectedQuarterChange={(detailedSelectedQuarter) => updateReportState({ detailedSelectedQuarter })}
                        onSelectSubproject={onSelectSubproject}
                        onSelectActivity={onSelectActivity}
                        onPrintReport={handleRequestPrint}
                        onExportReport={handleRequestExport}
                    />
                );
            case 'Financial Audit':
                if (!isSuperAdmin) return null;
                return (
                    <FinancialAuditReport
                        data={filteredData}
                        reportScope={scope}
                        budgetCeilings={budgetCeilings}
                        selectedYear={selectedYear}
                        selectedOu={selectedOuForCalculations}
                        selectedTier={selectedTier}
                        selectedFundType={selectedFundType}
                        searchTerm={reportState.financialAuditSearchTerm}
                        severityFilter={reportState.financialAuditSeverityFilter}
                        reportFilter={reportState.financialAuditReportFilter}
                        sourceFilter={reportState.financialAuditSourceFilter}
                        issueTypeFilter={reportState.financialAuditIssueTypeFilter}
                        auditAsOfMonth={reportState.financialAuditAsOfMonth}
                        onFilterChange={(patch) => updateReportState({
                            financialAuditSearchTerm: patch.searchTerm ?? reportState.financialAuditSearchTerm,
                            financialAuditSeverityFilter: patch.severityFilter ?? reportState.financialAuditSeverityFilter,
                            financialAuditReportFilter: patch.reportFilter ?? reportState.financialAuditReportFilter,
                            financialAuditSourceFilter: patch.sourceFilter ?? reportState.financialAuditSourceFilter,
                            financialAuditIssueTypeFilter: patch.issueTypeFilter ?? reportState.financialAuditIssueTypeFilter,
                            financialAuditAsOfMonth: patch.auditAsOfMonth ?? reportState.financialAuditAsOfMonth,
                        })}
                        onSelectSubproject={onSelectSubproject}
                        onSelectActivity={onSelectActivity}
                        onSelectOfficeReq={onSelectOfficeReq}
                        onSelectStaffingReq={onSelectStaffingReq}
                        onSelectOtherExpense={onSelectOtherExpense}
                        onPrintReport={handleRequestPrint}
                        onExportReport={handleRequestExport}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <div className="data-list-page reports-page">
            <div className="data-list-header print-hidden">
                <h2 className="data-list-title">Reports</h2>
            </div>

            <ReportsScopeFilterPanel filters={filters} />

            <div className="report-tabs-card print-hidden">
                <nav className="data-tabs" aria-label="Report tabs">
                    {reportTabs.map(tab => (
                        <TabButton key={tab.tabName} tabName={tab.tabName} label={tab.label} />
                    ))}
                </nav>
            </div>

            <div className="report-output">
                {isDataReady ? <>
                    {renderTabContent()}
                </> : needsReportingYear ? <div role="status" className="reports-scope-state">Select a Reporting Year.</div> : filters.error || dataError ? <div role="alert" className="reports-scope-state">
                    <p>{filters.error || dataError}</p><button type="button" className="btn btn-secondary" onClick={filters.retry}>Retry</button>
                </div> : <div role="status" className="reports-scope-state">Loading report data...</div>}
            </div>

            {(pendingPrintRequest || pendingExcelRequest) && (
                <div className="modal-backdrop print-hidden" role="presentation">
                    <form className="modal-card report-print-modal" onSubmit={handleConfirmOutput}>
                        <div className="modal-card__header">
                            <div>
                                <h3>{pendingExcelRequest ? 'Export Report' : 'Print Report'}</h3>
                                <p>{pendingPrintRequest?.sectionName || pendingPrintRequest?.reportName || pendingExcelRequest?.reportName}</p>
                                <p>{pendingPrintRequest?.scopeLabel || pendingExcelRequest?.scopeLabel}</p>
                            </div>
                            <button
                                type="button"
                                className="modal-card__close"
                                onClick={closeOutputModal}
                                aria-label="Close report output dialog"
                            >
                                <X aria-hidden="true" />
                            </button>
                        </div>
                        <div className="modal-card__body report-print-modal__body">
                            <label className="form-field">
                                <span className="form-label">Prepared By</span>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={preparedBy}
                                    onChange={(event) => setPreparedBy(event.target.value)}
                                    placeholder="Enter prepared by name"
                                    autoFocus
                                />
                            </label>
                            <label className="form-field">
                                <span className="form-label">Approved By</span>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={approvedBy}
                                    onChange={(event) => setApprovedBy(event.target.value)}
                                    placeholder="Enter approved by name"
                                />
                            </label>
                            {printError && <p className="form-error">{printError}</p>}
                        </div>
                        <div className="modal-card__footer">
                            <button type="button" className="btn btn-secondary" onClick={closeOutputModal} disabled={isExportingExcel}>
                                Cancel
                            </button>
                            <button type="submit" className="btn btn-primary" disabled={isExportingExcel}>
                                <Printer aria-hidden="true" />
                                <span>{pendingExcelRequest ? (isExportingExcel ? 'Exporting...' : 'Export XLSX') : 'Print'}</span>
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {preparedPrintJob && (
                <section className="report-print-shell" aria-hidden={!preparedPrintJob}>
                    <header className="report-print-header">
                        <img src="/assets/4klogo.png" alt="4K Program logo" />
                        <div>
                            <p>Department of Agriculture.</p>
                            <p>Kabuhayan at Kaunlaran ng Kababayang Katutubo</p>
                            <p>{preparedPrintJob.reportName} - {preparedPrintJob.ouName}</p>
                            {preparedPrintJob.scopeLabel && <p>{preparedPrintJob.scopeLabel}</p>}
                        </div>
                    </header>
                    <main className="report-print-body" dangerouslySetInnerHTML={{ __html: preparedPrintJob.tableHtml }} />
                    <footer className="report-print-signatures">
                        <div>
                            <span className="report-print-signature-line" />
                            <strong>{preparedPrintJob.preparedBy}</strong>
                            <small>Prepared By</small>
                        </div>
                        <div>
                            <span className="report-print-signature-line" />
                            <strong>{preparedPrintJob.approvedBy}</strong>
                            <small>Approved By</small>
                        </div>
                    </footer>
                </section>
            )}
        </div>
    );
};

export default Reports;
