import React, { useMemo, useState } from 'react';
import { AlertTriangle, Download, Printer, Search } from 'lucide-react';
import { Activity, OfficeRequirement, OtherProgramExpense, StaffingRequirement, Subproject } from '../../constants';
import { buildFinancialAudit, FinancialAuditIssue, FinancialAuditSeverity } from '../../lib/financialAudit';
import { FinancialAggregationFilters } from '../../lib/financialAggregation';
import { ReportExcelRequest, ReportPrintRequest } from './ReportUtils';

interface FinancialAuditReportProps {
    data: {
        subprojects: Subproject[];
        trainings: Activity[];
        otherActivities: Activity[];
        officeReqs: OfficeRequirement[];
        staffingReqs: StaffingRequirement[];
        otherProgramExpenses: OtherProgramExpense[];
    };
    budgetCeilings: Array<{ operating_unit: string; year: number; amount: number }>;
    selectedYear: string;
    selectedOu: string;
    selectedTier: string;
    selectedFundType: string;
    onSelectSubproject: (subproject: Subproject) => void;
    onSelectActivity: (activity: Activity) => void;
    onSelectOfficeReq: (req: OfficeRequirement) => void;
    onSelectStaffingReq: (req: StaffingRequirement) => void;
    onSelectOtherExpense: (req: OtherProgramExpense) => void;
    onPrintReport: (request: ReportPrintRequest) => void;
    onExportReport: (request: ReportExcelRequest) => void;
}

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

const formatCurrencyWhole = (amount: number) =>
    new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(Math.ceil(amount || 0));

const severityClass = (severity: FinancialAuditSeverity) => {
    switch (severity) {
        case 'High': return 'status-badge status-badge--compact status-badge--rejected';
        case 'Warning': return 'status-badge status-badge--compact status-badge--pending';
        default: return 'status-badge status-badge--compact status-badge--info';
    }
};

const includesText = (issue: FinancialAuditIssue, text: string) => {
    if (!text.trim()) return true;
    const needle = text.toLowerCase();
    return [
        issue.source,
        issue.recordName,
        issue.lineItem,
        issue.operatingUnit,
        issue.year,
        issue.fundType,
        issue.tier,
        issue.issueType,
        issue.affectedReports.join(' '),
        issue.suggestedAction,
    ].some(value => value.toLowerCase().includes(needle));
};

const uniqueSorted = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort();

const FinancialAuditReport: React.FC<FinancialAuditReportProps> = ({
    data,
    budgetCeilings,
    selectedYear,
    selectedOu,
    selectedTier,
    selectedFundType,
    onSelectSubproject,
    onSelectActivity,
    onSelectOfficeReq,
    onSelectStaffingReq,
    onSelectOtherExpense,
    onPrintReport,
    onExportReport,
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [severityFilter, setSeverityFilter] = useState('All');
    const [reportFilter, setReportFilter] = useState('All');
    const [sourceFilter, setSourceFilter] = useState('All');
    const [issueTypeFilter, setIssueTypeFilter] = useState('All');
    const [auditAsOfMonth, setAuditAsOfMonth] = useState(new Date().getMonth());

    const audit = useMemo(() => {
        const filters: FinancialAggregationFilters = {
            year: selectedYear,
            operatingUnit: selectedOu,
            tier: selectedTier,
            fundType: selectedFundType,
        };

        return buildFinancialAudit({
            subprojects: data.subprojects,
            activities: [...data.trainings, ...data.otherActivities],
            officeReqs: data.officeReqs,
            staffingReqs: data.staffingReqs,
            otherProgramExpenses: data.otherProgramExpenses,
        }, filters, { auditAsOfMonth, budgetCeilings });
    }, [data, budgetCeilings, selectedYear, selectedOu, selectedTier, selectedFundType, auditAsOfMonth]);

    const filterOptions = useMemo(() => ({
        reports: uniqueSorted(audit.issues.flatMap(issue => issue.affectedReports)),
        sources: uniqueSorted(audit.issues.map(issue => issue.source)),
        issueTypes: uniqueSorted(audit.issues.map(issue => issue.issueType)),
    }), [audit.issues]);

    const filteredIssues = useMemo(() => {
        return audit.issues.filter(issue => {
            if (!includesText(issue, searchTerm)) return false;
            if (severityFilter !== 'All' && issue.severity !== severityFilter) return false;
            if (reportFilter !== 'All' && !issue.affectedReports.includes(reportFilter)) return false;
            if (sourceFilter !== 'All' && issue.source !== sourceFilter) return false;
            if (issueTypeFilter !== 'All' && issue.issueType !== issueTypeFilter) return false;
            return true;
        });
    }, [audit.issues, searchTerm, severityFilter, reportFilter, sourceFilter, issueTypeFilter]);

    const handleDownload = () => {
        const headers = [
            'Severity', 'Source', 'Record Name', 'Budget Item', 'OU', 'Year', 'Fund Type', 'Tier',
            'Target Allocation', 'Target Obligation Due', 'Target Disbursement Due', 'Actual Obligation',
            'Actual Disbursement', 'Budget Ceiling', 'Ceiling Variance', 'Excluded Tagged Amount',
            'Issue', 'Affected Amount', 'Affected Reports', 'Suggested Action',
        ];
        const rows = filteredIssues.map(issue => ([
            issue.severity,
            issue.source,
            issue.recordName,
            issue.lineItem,
            issue.operatingUnit,
            issue.year,
            issue.fundType,
            issue.tier,
            Math.ceil(issue.targetAllocation),
            Math.ceil(issue.targetObligationDue),
            Math.ceil(issue.targetDisbursementDue),
            Math.ceil(issue.actualObligation),
            Math.ceil(issue.actualDisbursement),
            Math.ceil(issue.budgetCeiling),
            Math.ceil(issue.ceilingVariance),
            Math.ceil(issue.excludedTaggedAmount),
            issue.issueType,
            Math.ceil(issue.affectedAmount),
            issue.affectedReports.join('; '),
            issue.suggestedAction,
        ]));

        onExportReport({
            reportName: 'Financial Audit',
            ouName: selectedOu === 'All' ? 'All OUs' : selectedOu,
            fileName: `Financial_Audit_${selectedYear}_${selectedOu}.xlsx`,
            sheets: [{
                sheetName: 'Financial Audit',
                rows: [headers, ...rows],
                headerRowCount: 1,
                columnWidths: [12, 18, 32, 28, 14, 10, 14, 10, 18, 20, 22, 18, 18, 18, 18, 22, 34, 16, 34, 48],
                columnFormats: {
                    8: 'money',
                    9: 'money',
                    10: 'money',
                    11: 'money',
                    12: 'money',
                    13: 'money',
                    14: 'money',
                    15: 'money',
                    17: 'money',
                },
            }],
        });
    };

    const topIssueAmounts = (Object.entries(audit.summary.affectedAmountByIssue) as Array<[string, number]>)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

    const findById = <T extends { id?: number | string }>(items: T[], id: number | string) =>
        items.find(item => item.id?.toString() === id.toString());

    const getNavigationHandler = (issue: FinancialAuditIssue) => {
        const target = issue.navigationTarget;
        if (!target) return null;

        switch (target.type) {
            case 'subproject': {
                const record = findById(data.subprojects, target.recordId);
                return record ? () => onSelectSubproject(record) : null;
            }
            case 'activity': {
                const record = findById([...data.trainings, ...data.otherActivities], target.recordId);
                return record ? () => onSelectActivity(record) : null;
            }
            case 'officeRequirement': {
                const record = findById(data.officeReqs, target.recordId);
                return record ? () => onSelectOfficeReq(record) : null;
            }
            case 'staffingRequirement': {
                const record = findById(data.staffingReqs, target.recordId);
                return record ? () => onSelectStaffingReq(record) : null;
            }
            case 'otherProgramExpense': {
                const record = findById(data.otherProgramExpenses, target.recordId);
                return record ? () => onSelectOtherExpense(record) : null;
            }
            default:
                return null;
        }
    };

    return (
        <div className="report-card financial-audit-report-card">
            <div className="report-card__header print-hidden">
                <h3 className="report-card__title">Financial Audit</h3>
                <div className="report-card__actions">
                    <button
                        type="button"
                        className="btn btn-secondary btn-responsive"
                        onClick={() => onPrintReport({
                            reportName: 'Financial Audit',
                            ouName: selectedOu === 'All' ? 'All OUs' : selectedOu,
                            tableElementId: 'financial-audit-report-table',
                        })}
                    >
                        <Printer className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Print Report</span>
                    </button>
                    <button type="button" className="btn btn-primary btn-responsive" onClick={handleDownload}>
                        <Download className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Export XLSX</span>
                    </button>
                </div>
            </div>

            <section className="financial-audit-summary-grid" aria-label="Financial audit summary">
                <div className="financial-audit-summary-card">
                    <span>Budget Ceiling</span>
                    <strong>{formatCurrencyWhole(audit.summary.totalBudgetCeiling)}</strong>
                    <small>Configured OU/year ceiling</small>
                </div>
                <div className="financial-audit-summary-card">
                    <span>Net Target Allocation</span>
                    <strong>{formatCurrencyWhole(audit.summary.totalTargetAllocation)}</strong>
                    <small>{audit.lineItemCount.toLocaleString()} financial line items</small>
                </div>
                <div className="financial-audit-summary-card">
                    <span>Excluded Tagged Amount</span>
                    <strong>{formatCurrencyWhole(audit.summary.totalExcludedTaggedAmount)}</strong>
                    <small>Savings and realignments excluded</small>
                </div>
                <div className="financial-audit-summary-card">
                    <span>Target Obligation Due</span>
                    <strong>{formatCurrencyWhole(audit.summary.totalTargetObligationDue)}</strong>
                    <small>Due through {MONTHS[auditAsOfMonth]}</small>
                </div>
                <div className="financial-audit-summary-card">
                    <span>Target Disbursement Due</span>
                    <strong>{formatCurrencyWhole(audit.summary.totalTargetDisbursementDue)}</strong>
                    <small>Due through {MONTHS[auditAsOfMonth]}</small>
                </div>
                <div className={`financial-audit-summary-card${audit.summary.severityCounts.High > 0 ? ' financial-audit-summary-card--high' : ''}`}>
                    <span>Discrepancy / Overage Due</span>
                    <strong>{formatCurrencyWhole(audit.summary.totalDiscrepancyDue)}</strong>
                    <small>{audit.summary.totalIssues.toLocaleString()} issues, {filteredIssues.length.toLocaleString()} shown</small>
                </div>
            </section>

            <section className="financial-audit-panel print-hidden" aria-label="Financial audit filters">
                <div className="financial-audit-search">
                    <Search aria-hidden="true" />
                    <input
                        type="search"
                        className="form-control"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Search record, item, issue, OU, or report..."
                    />
                </div>
                <div className="financial-audit-filter-grid">
                    <div>
                        <label className="form-label">Severity</label>
                        <select className="form-control" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
                            <option value="All">All Severities</option>
                            <option value="High">High</option>
                            <option value="Warning">Warning</option>
                            <option value="Info">Info</option>
                        </select>
                    </div>
                    <div>
                        <label className="form-label">Affected Report</label>
                        <select className="form-control" value={reportFilter} onChange={(event) => setReportFilter(event.target.value)}>
                            <option value="All">All Reports</option>
                            {filterOptions.reports.map(report => <option key={report} value={report}>{report}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="form-label">Source</label>
                        <select className="form-control" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                            <option value="All">All Sources</option>
                            {filterOptions.sources.map(source => <option key={source} value={source}>{source}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="form-label">Issue Type</label>
                        <select className="form-control" value={issueTypeFilter} onChange={(event) => setIssueTypeFilter(event.target.value)}>
                            <option value="All">All Issue Types</option>
                            {filterOptions.issueTypes.map(issueType => <option key={issueType} value={issueType}>{issueType}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="form-label">Audit As Of</label>
                        <select className="form-control" value={auditAsOfMonth} onChange={(event) => setAuditAsOfMonth(Number(event.target.value))}>
                            {MONTHS.map((month, index) => <option key={month} value={index}>{month}</option>)}
                        </select>
                    </div>
                </div>
            </section>

            {topIssueAmounts.length > 0 && (
                <section className="financial-audit-breakdown" aria-label="Top affected amounts by issue">
                    <div className="financial-audit-breakdown__header">
                        <AlertTriangle aria-hidden="true" />
                        <span>Largest affected amounts by issue type</span>
                    </div>
                    <div className="financial-audit-breakdown__list">
                        {topIssueAmounts.map(([issueType, amount]) => (
                            <div key={issueType} className="financial-audit-breakdown__row">
                                <span>{issueType}</span>
                                <strong>{formatCurrencyWhole(amount)}</strong>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <div id="financial-audit-report-table" className="report-table-scroll financial-audit-table-scroll">
                <table className="report-table financial-audit-table">
                    <thead>
                        <tr>
                            <th>Severity</th>
                            <th>Source</th>
                            <th>Record</th>
                            <th>Budget Item</th>
                            <th>OU</th>
                            <th>Year</th>
                            <th>Fund</th>
                            <th>Tier</th>
                            <th className="text-right">Target Allocation</th>
                            <th className="text-right">Target Obligation Due</th>
                            <th className="text-right">Target Disbursement Due</th>
                            <th className="text-right">Actual Obligation</th>
                            <th className="text-right">Actual Disbursement</th>
                            <th className="text-right">Budget Ceiling</th>
                            <th className="text-right">Ceiling Variance</th>
                            <th className="text-right">Excluded Tagged</th>
                            <th>Issue</th>
                            <th className="text-right">Affected Amount</th>
                            <th>Affected Reports</th>
                            <th>Suggested Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredIssues.map(issue => (
                            <tr key={issue.id}>
                                <td><span className={severityClass(issue.severity)}>{issue.severity}</span></td>
                                <td>{issue.source}</td>
                                <td>
                                    {(() => {
                                        const onOpen = getNavigationHandler(issue);
                                        return onOpen ? (
                                            <button type="button" className="table-link financial-audit-record-link" onClick={onOpen}>
                                                {issue.recordName}
                                            </button>
                                        ) : issue.recordName;
                                    })()}
                                </td>
                                <td>{issue.lineItem}</td>
                                <td>{issue.operatingUnit}</td>
                                <td>{issue.year}</td>
                                <td>{issue.fundType}</td>
                                <td>{issue.tier}</td>
                                <td className="text-right">{formatCurrencyWhole(issue.targetAllocation)}</td>
                                <td className="text-right">{formatCurrencyWhole(issue.targetObligationDue)}</td>
                                <td className="text-right">{formatCurrencyWhole(issue.targetDisbursementDue)}</td>
                                <td className="text-right">{formatCurrencyWhole(issue.actualObligation)}</td>
                                <td className="text-right">{formatCurrencyWhole(issue.actualDisbursement)}</td>
                                <td className="text-right">{issue.budgetCeiling > 0 ? formatCurrencyWhole(issue.budgetCeiling) : '-'}</td>
                                <td className="text-right">{issue.ceilingVariance ? formatCurrencyWhole(issue.ceilingVariance) : '-'}</td>
                                <td className="text-right">{issue.excludedTaggedAmount > 0 ? formatCurrencyWhole(issue.excludedTaggedAmount) : '-'}</td>
                                <td>{issue.issueType}</td>
                                <td className="text-right">{formatCurrencyWhole(issue.affectedAmount)}</td>
                                <td>{issue.affectedReports.join('; ')}</td>
                                <td>{issue.suggestedAction}</td>
                            </tr>
                        ))}
                        {filteredIssues.length === 0 && (
                            <tr>
                                <td colSpan={20} className="financial-audit-empty">
                                    No financial audit issues found for the selected filters.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default FinancialAuditReport;
