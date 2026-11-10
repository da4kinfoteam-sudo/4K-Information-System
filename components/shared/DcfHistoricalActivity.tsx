import React from 'react';
import { Banknote, CalendarDays, Landmark, MapPin, UserCheck, Users, Wallet } from 'lucide-react';
import type { Activity, ActivityExpense, IPO } from '../../constants';
import type { DcfRevisionSnapshot } from '../../lib/dcfRevisionHistory';
import {
    getActivityBudgetSummary,
    getActivityExpenseFundingLabel,
    isActivityExpenseActualEligible,
    isSupplementalExpense,
} from '../../lib/activitySupplementalBudget';
import { groupActivityExpenses } from '../../lib/activityBudgetSchedules';
import { getActivityIpoSelection } from '../../lib/activityIpoLinks';
import {
    historicalBudgetAmount as amount,
    historicalCurrency as money,
    historicalDate as date,
    historicalFundSource,
    historicalNumber,
    historicalObject,
    historicalRecord,
    historicalRows,
    historicalSum,
    historicalText as text,
    historicalTitle,
    historicalYear,
    type HistoricalRecord,
} from '../../lib/dcfHistoricalPresentation';
import {
    RecordDetailAside,
    RecordDetailGrid,
    RecordDetailMain,
    RecordDetailPage,
    RecordHeader,
    RecordKpiGrid,
    RecordPanel,
} from '../ui/RecordDetailLayout';
import {
    HistoricalEmptyRow,
    HistoricalBudgetStatus,
    HistoricalField as Field,
    HistoricalFields as Fields,
    HistoricalKpi,
    HistoricalMedia,
    HistoricalSchedule,
    HistoricalStatus,
    HistoricalTable,
} from './DcfHistoricalPrimitives';

export function DcfHistoricalActivity({ snapshot }: { snapshot: DcfRevisionSnapshot }) {
    const record = historicalRecord(snapshot),
        rows = historicalRows(record.expenses),
        activity = record as unknown as Activity;
    const known = Array.isArray(record.expenses),
        amountsKnown = known && rows.every((row) => amount(row) !== undefined);
    const freeze = historicalObject(record.original_budget_snapshot);
    const rawSummary = getActivityBudgetSummary({
        ...activity,
        original_budget_snapshot: Array.isArray(freeze.expenses)
            ? activity.original_budget_snapshot
            : undefined,
        expenses: rows as unknown as ActivityExpense[],
    });
    const budget = (key: keyof typeof rawSummary) => {
        if (!amountsKnown || !('status' in record)) return undefined;
        if (
            key === 'original' &&
            Array.isArray(freeze.expenses) &&
            !historicalRows(freeze.expenses).every((line) => amount(line) !== undefined)
        )
            return undefined;
        if (
            ['current', 'savings', 'realignment', 'supplemental'].includes(key) &&
            record.budgetItemTransferId &&
            !('workflow_status' in record)
        )
            return undefined;
        return rawSummary[key];
    };
    const actualRows = rows.filter((row) => isActivityExpenseActualEligible(row));
    const actualTotal = (key: string) =>
        known &&
        historicalSum(actualRows.map((row) => row[key])) !== undefined &&
        (!record.budgetItemTransferId || 'workflow_status' in record)
            ? rawSummary[key === 'actualObligationAmount' ? 'obligated' : 'disbursed']
            : undefined;
    const actualBudgetNote = (key: string) => {
        const actual = actualTotal(key),
            current = budget('current');
        return actual === undefined || current == null
            ? undefined
            : `${current > 0 ? Math.round((actual / current) * 100) : 0}% of active budget`;
    };
    const originalRows = rows.filter(
        (row) => !isSupplementalExpense(row as unknown as ActivityExpense, activity),
    );
    const supplementalRows = rows.filter((row) =>
        isSupplementalExpense(row as unknown as ActivityExpense, activity),
    );
    const savedIpos = historicalRows(snapshot.related.ipos);
    const selections = getActivityIpoSelection(activity, savedIpos as unknown as IPO[]);
    const ipos: HistoricalRecord[] = selections.map((selection) => ({
        ...savedIpos.find((ipo) => String(ipo.id) === String(selection.ipoId)),
        id: selection.ipoId,
        name: selection.name,
        unavailable: selection.unavailable,
    }));
    const iposKnown =
        Array.isArray(snapshot.related.ipos) &&
        ('participating_ipo_ids' in record || 'participatingIpos' in record) &&
        selections.every((selection) => !selection.unavailable);
    const participants = historicalSum([record.participantsMale, record.participantsFemale]);
    const actualParticipants = historicalSum([
        record.actualParticipantsMale,
        record.actualParticipantsFemale,
    ]);
    const attendance =
        participants !== undefined && actualParticipants !== undefined
            ? participants > 0
                ? (actualParticipants / participants) * 100
                : 0
            : undefined;
    const source = text(historicalFundSource(snapshot));
    const media = historicalRows(snapshot.related.activity_drive_files).filter((row) => !row.deleted_at);
    const gallery = media.filter((row) => row.upload_section === 'gallery');
    const files = media.filter((row) => row.upload_section !== 'gallery');
    const range = (start: unknown, end: unknown) =>
        `${date(start)}${end && end !== start ? ` to ${date(end)}` : ''}`;
    const reference = historicalObject(snapshot.related.referenceActivity);
    const monitoring =
        !!record.reference_activity_id &&
        reference.activity_name === 'Subproject Monitoring' &&
        reference.component === 'Program Management' &&
        reference.type === 'Activity';
    const summaryFields = (
        <>
            <Field label="Component" value={text(record.component)} summary />
            <Field label="Fund Year" value={historicalYear(record.fundingYear)} summary />
            <Field label="Tier" value={text(record.tier)} summary />
            <Field label="Fund Source" value={source} summary />
            <Field label="Target Budget" value={money(budget('target'))} summary />
            <Field
                label="Participating IPOs"
                value={iposKnown ? text(ipos.length) : text(undefined)}
                summary
            />
        </>
    );
    return (
        <RecordDetailPage className="activity-record-detail-page dcf-historical-detail">
            <RecordHeader
                title={historicalTitle(snapshot)}
                metadata={
                    <>
                        <span className="ipo-detail-record-id">{text(record.uid)}</span>
                        <HistoricalStatus value={record.status} compact />
                        <span>
                            <MapPin aria-hidden="true" />
                            {text(record.location)}
                        </span>
                        <span>
                            <CalendarDays aria-hidden="true" />
                            {range(record.date, record.endDate)}
                        </span>
                    </>
                }
            />
            <RecordKpiGrid>
                <HistoricalKpi
                    label="Target Budget"
                    value={budget('target')}
                    currency
                    icon={<Wallet />}
                    note="Active Target Budget"
                />
                <HistoricalKpi
                    label="Supplemental Budget"
                    value={budget('supplemental')}
                    currency
                    icon={<Wallet />}
                />
                <HistoricalKpi
                    label="Obligated"
                    value={actualTotal('actualObligationAmount')}
                    note={actualBudgetNote('actualObligationAmount')}
                    currency
                    icon={<Landmark />}
                />
                <HistoricalKpi
                    label="Disbursed"
                    value={actualTotal('actualDisbursementAmount')}
                    note={actualBudgetNote('actualDisbursementAmount')}
                    currency
                    icon={<Banknote />}
                />
                <HistoricalKpi
                    label="Target Participants"
                    value={participants}
                    note={`M: ${text(record.participantsMale)} · F: ${text(record.participantsFemale)}`}
                    icon={<Users />}
                />
                <HistoricalKpi
                    label="Actual Participants"
                    value={actualParticipants}
                    note={`M: ${text(record.actualParticipantsMale)} · F: ${text(record.actualParticipantsFemale)}`}
                    icon={<UserCheck />}
                />
                <HistoricalKpi
                    label="Participating IPOs"
                    value={iposKnown ? ipos.length : undefined}
                    icon={<Users />}
                />
            </RecordKpiGrid>
            <RecordDetailGrid>
                <RecordDetailMain>
                    <RecordPanel title="Activity Details">
                        <Fields three>
                            <Field
                                label="Status"
                                value={<HistoricalStatus value={record.status} compact />}
                            />
                            <Field label="Operating Unit" value={text(record.operatingUnit)} />
                            <Field label="UID" value={text(record.uid)} />
                            <Field label="Type" value={text(record.type)} />
                            <Field label="Date" value={range(record.date, record.endDate)} />
                            <Field label="Component" value={text(record.component)} />
                            <Field label="Funding Year" value={historicalYear(record.fundingYear)} />
                            <Field label="Tier" value={text(record.tier)} />
                            <Field label="Fund Source" value={source} />
                            {record.type === 'Training' && (
                                <Field label="Facilitator" value={text(record.facilitator)} />
                            )}
                            <Field label="Description" value={text(record.description)} wide note />
                        </Fields>
                    </RecordPanel>
                    <RecordPanel title="Target Participants">
                        <div className="detail-metric-grid">
                            {[
                                ['Male', record.participantsMale],
                                ['Female', record.participantsFemale],
                                ['Total', participants],
                            ].map(([label, value]) => (
                                <div key={String(label)} className="detail-metric detail-metric--inline">
                                    <span className="detail-metric-label">{String(label)}</span>
                                    <span className="detail-metric-value">{text(value)}</span>
                                </div>
                            ))}
                        </div>
                    </RecordPanel>
                    <RecordPanel title="Participating IPOs">
                        {ipos.length ? (
                            <ul className="detail-list">
                                {ipos.map((ipo, index) => (
                                    <li key={index} className="detail-list-item">
                                        <span className="detail-list-title">{text(ipo.name)}</span>
                                        <p className="detail-list-copy">{text(ipo.region)}</p>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="detail-empty">
                                {iposKnown ? 'No Participating IPOs Selected.' : text(undefined)}
                            </p>
                        )}
                    </RecordPanel>
                    <RecordPanel title="Expenses & Budget">
                        <HistoricalTable
                            label="Expenses & Budget"
                            columns={[
                                'Particulars',
                                'Status',
                                'UACS Code',
                                'Obligation',
                                'Disbursement',
                                'Amount',
                            ]}
                            footer={
                                <tr>
                                    <td colSpan={5} className="data-table__numeric">
                                        Active Target Budget
                                    </td>
                                    <td className="data-table__numeric">{money(budget('target'))}</td>
                                </tr>
                            }
                        >
                            {groupActivityExpenses(originalRows as unknown as ActivityExpense[]).flatMap(
                                (group) =>
                                    group.rows.map((line, index) => (
                                        <tr key={line.id}>
                                            {index === 0 && (
                                                <td
                                                    rowSpan={group.rows.length}
                                                    className="data-table__primary"
                                                    title={line.expenseParticular}
                                                >
                                                    {text(line.expenseParticular)}
                                                </td>
                                            )}
                                            <td>
                                                <HistoricalBudgetStatus
                                                    line={line as unknown as HistoricalRecord}
                                                />
                                            </td>
                                            {index === 0 && (
                                                <td rowSpan={group.rows.length}>{text(line.uacsCode)}</td>
                                            )}
                                            <td>
                                                <HistoricalSchedule
                                                    line={line as unknown as HistoricalRecord}
                                                    amount={amount(line as unknown as HistoricalRecord)}
                                                    stage="obligation"
                                                />
                                            </td>
                                            <td>
                                                <HistoricalSchedule
                                                    line={line as unknown as HistoricalRecord}
                                                    amount={amount(line as unknown as HistoricalRecord)}
                                                    stage="disbursement"
                                                />
                                            </td>
                                            <td className="data-table__numeric">
                                                {money(amount(line as unknown as HistoricalRecord))}
                                            </td>
                                        </tr>
                                    )),
                            )}
                            {!originalRows.length && <HistoricalEmptyRow columns={6} known={known} />}
                        </HistoricalTable>
                    </RecordPanel>
                    <RecordPanel title="Supplemental Information" className="activity-supplemental-section">
                        <RecordKpiGrid>
                            {[
                                ['Original Allocation', budget('original')],
                                ['Savings Supplements', budget('savings')],
                                ['Realignment Supplements', budget('realignment')],
                                ['Current Active Budget', budget('current')],
                            ].map(([label, value]) => (
                                <HistoricalKpi
                                    key={String(label)}
                                    label={String(label)}
                                    value={value}
                                    currency
                                />
                            ))}
                        </RecordKpiGrid>
                        <HistoricalTable
                            label="Supplemental Information"
                            columns={[
                                'Source',
                                'Authorization Reference',
                                'Authorization Date',
                                'Expense Particular',
                                'UACS Code',
                                'Obligation',
                                'Disbursement',
                                'Amount',
                                'Approval',
                            ]}
                            footer={
                                <tr>
                                    <td colSpan={7}>Active Supplemental Budget</td>
                                    <td className="data-table__numeric">{money(budget('supplemental'))}</td>
                                    <td />
                                </tr>
                            }
                        >
                            {supplementalRows.map((line, index) => {
                                const ledger = historicalRows(snapshot.related.activity_supplements).find(
                                    (entry) => entry.uid === line.supplementUid,
                                );
                                return (
                                    <tr key={index}>
                                        <td>
                                            {getActivityExpenseFundingLabel(line as unknown as ActivityExpense, activity)}
                                        </td>
                                        <td>{text(ledger?.reference)}</td>
                                        <td>{date(ledger?.authorization_date)}</td>
                                        <td title={text(line.expenseParticular)}>
                                            {text(line.expenseParticular)}
                                        </td>
                                        <td>{text(line.uacsCode)}</td>
                                        <td>
                                            <HistoricalSchedule
                                                line={line}
                                                amount={amount(line)}
                                                stage="obligation"
                                            />
                                        </td>
                                        <td>
                                            <HistoricalSchedule
                                                line={line}
                                                amount={amount(line)}
                                                stage="disbursement"
                                            />
                                        </td>
                                        <td className="data-table__numeric">{money(amount(line))}</td>
                                        <td>
                                            {text(
                                                ledger?.pending_status
                                                    ? `${ledger.status} / Revision ${ledger.pending_status}`
                                                    : (ledger?.status ?? line.supplementStatus),
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {!supplementalRows.length && <HistoricalEmptyRow columns={9} known={known} />}
                        </HistoricalTable>
                    </RecordPanel>
                    <RecordPanel title="Accomplishment Report">
                        <div className="detail-stack">
                            <div className="detail-metric-grid">
                                <div className="detail-metric">
                                    <span className="detail-metric-label">Actual Date Conducted</span>
                                    <div className="detail-metric-value">
                                        {range(record.actualDate, record.actualEndDate)}
                                    </div>
                                </div>
                                <div className="detail-metric">
                                    <span className="detail-metric-label">Actual Participants</span>
                                    <div className="detail-metric-value">
                                        {text(actualParticipants)}{' '}
                                        <span className="detail-metric-label">
                                            (M: {text(record.actualParticipantsMale)}, F:{' '}
                                            {text(record.actualParticipantsFemale)})
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <h4 className="detail-section-title">Financial Performance (Actual)</h4>
                                <HistoricalTable
                                    label="Financial Performance (Actual)"
                                    columns={[
                                        'Item',
                                        'Actual Obligation Date',
                                        'Actual Disbursement Date',
                                        'Actual Obligated Amount',
                                        'Actual Disbursed Amount',
                                    ]}
                                >
                                    {actualRows.map((line, index) => (
                                        <tr key={index}>
                                            <td className="data-table__primary">
                                                {text(line.expenseParticular)}
                                            </td>
                                            <td>{date(line.actualObligationDate, true)}</td>
                                            <td>{date(line.actualDisbursementDate, true)}</td>
                                            <td className="data-table__numeric">
                                                {money(line.actualObligationAmount)}
                                            </td>
                                            <td className="data-table__numeric">
                                                {money(line.actualDisbursementAmount)}
                                            </td>
                                        </tr>
                                    ))}
                                    {!actualRows.length && <HistoricalEmptyRow columns={5} known={known} />}
                                </HistoricalTable>
                            </div>
                            <div>
                                <h4 className="detail-section-title">Gender And Inclusivity</h4>
                                <Fields>
                                    {[
                                        ['PWD', 'actualPWD'],
                                        ['Muslim', 'actualMuslim'],
                                        ['LGBTQ+', 'actualLGBTQ'],
                                        ['Solo Parents', 'actualSoloParent'],
                                        ['Senior', 'actualSenior'],
                                        ['Youth', 'actualYouth'],
                                    ].map(([label, key]) => (
                                        <Field key={key} label={label} value={text(record[key])} />
                                    ))}
                                </Fields>
                            </div>
                        </div>
                    </RecordPanel>
                    {monitoring && <ActivityMonitoring snapshot={snapshot} ipos={ipos} />}
                    <RecordPanel title="Gallery">
                        <HistoricalMedia
                            rows={gallery}
                            known={Array.isArray(snapshot.related.activity_drive_files)}
                            gallery
                        />
                    </RecordPanel>
                    <RecordPanel title="Activity Files">
                        <HistoricalMedia
                            rows={files}
                            known={Array.isArray(snapshot.related.activity_drive_files)}
                        />
                    </RecordPanel>
                </RecordDetailMain>
                <RecordDetailAside>
                    <RecordPanel title="Summary">
                        <dl className="ipo-summary-list">{summaryFields}</dl>
                    </RecordPanel>
                    <RecordPanel title="Attendance Snapshot">
                        <div className="ipo-membership-overview">
                            <div className="ipo-membership-stat">
                                <span>Target</span>
                                <strong>{text(participants)}</strong>
                            </div>
                            <div className="ipo-membership-stat">
                                <span>Actual</span>
                                <strong>{text(actualParticipants)}</strong>
                            </div>
                        </div>
                        <div className="ipo-membership-progress">
                            <div>
                                <span>Attendance Rate</span>
                                <strong>
                                    {attendance === undefined
                                        ? text(undefined)
                                        : `${Math.round(attendance)}%`}
                                </strong>
                            </div>
                            {attendance !== undefined && (
                                <span className="ipo-progress" aria-hidden="true">
                                    <span style={{ width: `${Math.max(0, Math.min(100, attendance))}%` }} />
                                </span>
                            )}
                        </div>
                    </RecordPanel>
                </RecordDetailAside>
            </RecordDetailGrid>
        </RecordDetailPage>
    );
}

function ActivityMonitoring({ snapshot, ipos }: { snapshot: DcfRevisionSnapshot; ipos: HistoricalRecord[] }) {
    const reports = historicalRows(snapshot.related.activity_monitoring_reports).filter(
            (row) => !row.deleted_at,
        ),
        actions = historicalRows(snapshot.related.activity_monitoring_actions).filter(
            (row) => !row.deleted_at,
        );
    return (
        <RecordPanel title="Monitoring Reports">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {ipos.map((ipo, index) => {
                    const report = reports.find((row) => String(row.ipo_id) === String(ipo.id));
                    const latest = report
                        ? actions
                              .filter((row) => row.monitoring_report_id === report.id)
                              .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
                        : undefined;
                    return (
                        <article key={index} className="detail-list-item">
                            <span className="detail-list-title">{text(ipo.name)}</span>
                            <p className="detail-list-copy">{text(ipo.region)}</p>
                            {report ? (
                                <>
                                    <HistoricalStatus value={report.status} />
                                    <div className="monitoring-report-preview">
                                        <div className="monitoring-report-preview__meta">
                                            <span>Updated {date(report.updated_at)}</span>
                                            <span>{text(report.reported_by_name)}</span>
                                        </div>
                                        <Fields>
                                            {['Findings', 'Issues', 'Recommendations'].map((label) => (
                                                <Field
                                                    key={label}
                                                    label={label}
                                                    value={text(report[label.toLowerCase()])}
                                                />
                                            ))}
                                            <Field label="Latest Action" value={text(latest?.action_taken)} />
                                        </Fields>
                                    </div>
                                </>
                            ) : (
                                <p className="detail-empty">
                                    {Array.isArray(snapshot.related.activity_monitoring_reports)
                                        ? 'No Report Recorded For This IPO.'
                                        : text(undefined)}
                                </p>
                            )}
                        </article>
                    );
                })}
            </div>
            {!ipos.length && (
                <p className="detail-empty">
                    {Array.isArray(snapshot.related.ipos) ? 'No Participating IPOs Linked.' : text(undefined)}
                </p>
            )}
        </RecordPanel>
    );
}
