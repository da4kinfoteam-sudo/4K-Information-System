import React from 'react';
import { File, Image } from 'lucide-react';
import {
    historicalCurrency as money,
    historicalDate as date,
    historicalMissing,
    historicalMonths,
    historicalNumber,
    historicalText as text,
    type HistoricalRecord,
} from '../../lib/dcfHistoricalPresentation';
import { BudgetTargetSummary } from '../ui/BudgetTargetPlanEditor';
import type { TargetPlanOwner } from '../../lib/budgetTargetSchedules';
import { getBudgetLineTag } from '../../lib/budgetLineAdjustments';
import { formatFileSize, formatUploadedAt } from '../../lib/driveFilePresentation';
import {
    formatRecordMetricCurrency,
    formatRecordMetricNumber,
    RecordKpiCard,
} from '../ui/RecordDetailLayout';

export function HistoricalBudgetStatus({
    line,
    parentStatus,
}: {
    line: HistoricalRecord;
    parentStatus?: string;
}) {
    const tag = getBudgetLineTag(line, parentStatus);
    return tag ? (
        <span className={`budget-line-badge budget-line-badge--${tag.toLowerCase()}`}>{tag}</span>
    ) : (
        <span>-</span>
    );
}

export const HistoricalKpi: React.FC<{
    label: string;
    value: unknown;
    currency?: boolean;
    icon?: React.ReactNode;
    note?: React.ReactNode;
}> = ({ label, value, currency = false, icon, note }) => {
    const number = historicalNumber(value);
    return (
        <RecordKpiCard
            label={label}
            value={
                number === undefined ? (
                    <span className="record-detail-kpi__empty" title={historicalMissing}>
                        Not Recorded
                    </span>
                ) : currency ? (
                    formatRecordMetricCurrency(number)
                ) : (
                    formatRecordMetricNumber(number)
                )
            }
            title={number === undefined ? historicalMissing : currency ? money(number) : text(number)}
            icon={icon}
            note={note}
        />
    );
};

export const HistoricalField: React.FC<{
    label: string;
    value: React.ReactNode;
    wide?: boolean;
    emphasis?: boolean;
    summary?: boolean;
    note?: boolean;
}> = ({ label, value, wide = false, emphasis = false, summary = false, note = false }) => {
    return (
        <div className={summary ? undefined : `detail-item${wide ? ' detail-item--wide' : ''}`}>
            <dt className={summary ? undefined : 'detail-label'}>{label}</dt>
            <dd
                className={
                    summary
                        ? undefined
                        : note
                          ? 'detail-note'
                          : `detail-value${emphasis ? ' detail-value--emphasis' : ''}`
                }
            >
                {value === undefined ? historicalMissing : value}
            </dd>
        </div>
    );
};
export function HistoricalFields({
    children,
    three = false,
}: {
    children: React.ReactNode;
    three?: boolean;
}) {
    return <dl className={`detail-dl${three ? ' record-detail-dl--three' : ''}`}>{children}</dl>;
}
export function HistoricalStatus({ value, compact = false }: { value: unknown; compact?: boolean }) {
    const status = text(value);
    const classes: Record<string, string> = {
        Completed: 'completed',
        Ongoing: 'ongoing',
        Cancelled: 'cancelled',
        Proposed: 'proposed',
        Hired: 'completed',
        Vacant: 'proposed',
        Filled: 'completed',
        Unfilled: 'cancelled',
    };
    return classes[status] ? (
        <span
            className={`status-badge${compact ? ' status-badge--compact' : ''} status-badge--${classes[status]}`}
        >
            {status}
        </span>
    ) : (
        <>{status}</>
    );
}
export function HistoricalTable({
    label,
    columns,
    children,
    footer,
}: {
    label: string;
    columns: string[];
    children: React.ReactNode;
    footer?: React.ReactNode;
}) {
    return (
        <div className="data-table-scroll" tabIndex={0} role="region" aria-label={label}>
            <table className="data-table">
                <thead>
                    <tr>
                        {columns.map((column) => (
                            <th scope="col" key={column}>
                                {column}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>{children}</tbody>
                {footer && <tfoot>{footer}</tfoot>}
            </table>
        </div>
    );
}
export function HistoricalEmptyRow({ columns, known }: { columns: number; known: boolean }) {
    return (
        <tr>
            <td colSpan={columns} className="data-table__empty-cell">
                {known ? 'No Recorded Entries' : historicalMissing}
            </td>
        </tr>
    );
}
export function HistoricalSchedule({
    line,
    stage,
    amount,
}: {
    line: HistoricalRecord;
    stage: 'obligation' | 'disbursement';
    amount: number | undefined;
}) {
    if (line.targetScheduleVersion === 2) {
        const key = stage === 'obligation' ? 'targetObligationSchedules' : 'targetDisbursementSchedules';
        if (!Array.isArray(line[key])) return <>{historicalMissing}</>;
        return (
            <BudgetTargetSummary
                line={line as unknown as TargetPlanOwner}
                allocation={amount ?? 0}
                stage={stage}
            />
        );
    }
    return <>{date(line[stage === 'obligation' ? 'obligationMonth' : 'disbursementMonth'], true)}</>;
}
export function HistoricalMonthlyGrid({
    record,
    actual = false,
    nonzero = false,
}: {
    record: HistoricalRecord;
    actual?: boolean;
    nonzero?: boolean;
}) {
    return (
        <div className="program-month-grid">
            {historicalMonths.map((month) => {
                const value = record[`${actual ? 'actualDisbursement' : 'disbursement'}${month}`];
                if (nonzero && value === 0) return null;
                return (
                    <div className="program-month-cell" key={month}>
                        <span className="program-month-cell__label">{month}</span>
                        <span
                            className={`program-month-cell__value${actual ? ' program-month-cell__value--success' : ''}`}
                            title={money(value)}
                        >
                            {money(value)}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
export function HistoricalFinancialMetrics({
    record,
    other = false,
}: {
    record: HistoricalRecord;
    other?: boolean;
}) {
    return (
        <div className="detail-metric-grid">
            <div className="detail-subsection">
                <p className="detail-kicker">Obligation</p>
                <HistoricalField
                    label="Date"
                    value={
                        other ? text(record.actualObligationDate) : date(record.actualObligationDate, true)
                    }
                    emphasis
                />
                <HistoricalField label="Amount" value={money(record.actualObligationAmount)} emphasis />
            </div>
            <div className="detail-subsection">
                <p className="detail-kicker">Disbursement</p>
                {!other && (
                    <HistoricalField
                        label="Date"
                        value={date(record.actualDisbursementDate, true)}
                        emphasis
                    />
                )}
                <HistoricalField
                    label={other ? 'Total Amount' : 'Amount'}
                    value={money(record.actualDisbursementAmount)}
                    emphasis
                />
            </div>
        </div>
    );
}
export function HistoricalProgress({
    value,
    label,
    count,
}: {
    value: unknown;
    label: string;
    count?: string;
}) {
    const percentage = historicalNumber(value);
    return (
        <div className="detail-progress">
            <div className="detail-progress__header">
                <span>{label}</span>
                <strong>
                    {percentage === undefined ? historicalMissing : (count ?? `${Math.round(percentage)}%`)}
                </strong>
            </div>
            {percentage !== undefined && (
                <div
                    className="detail-progress__track"
                    role="progressbar"
                    aria-label={label}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.max(0, Math.min(100, percentage))}
                >
                    <div
                        className="detail-progress__fill"
                        style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }}
                    />
                </div>
            )}
        </div>
    );
}
export function HistoricalMedia({
    rows,
    known,
    gallery = false,
}: {
    rows: HistoricalRecord[];
    known: boolean;
    gallery?: boolean;
}) {
    if (!rows.length)
        return (
            <p className="detail-empty">
                {known ? (gallery ? 'No Gallery Images Recorded.' : 'No Files Recorded.') : historicalMissing}
            </p>
        );
    // Snapshots contain metadata, not authorized durable image bytes or download credentials.
    return (
        <ul className={`detail-list${gallery ? ' dcf-historical-gallery' : ''}`}>
            {rows.map((row, index) => (
                <li key={index} className="detail-list-item">
                    {gallery ? <Image aria-hidden="true" /> : <File aria-hidden="true" />}
                    <div>
                        <span className="detail-list-title">{text(row.display_name || row.file_name)}</span>
                        {gallery && row.caption != null && (
                            <p className="detail-list-copy">{text(row.caption)}</p>
                        )}
                        <p className="detail-list-copy">
                            {historicalNumber(row.file_size) === undefined
                                ? historicalMissing
                                : formatFileSize(historicalNumber(row.file_size))}{' '}
                            · Uploaded{' '}
                            {row.uploaded_at === undefined
                                ? historicalMissing
                                : formatUploadedAt(
                                      typeof row.uploaded_at === 'string' ? row.uploaded_at : null,
                                  )}
                        </p>
                        <p className="detail-list-copy">
                            {gallery ? 'Historical Image Unavailable' : 'Historical File Unavailable'}
                        </p>
                    </div>
                </li>
            ))}
        </ul>
    );
}
