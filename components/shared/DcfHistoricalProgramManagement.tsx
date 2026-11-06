import React from 'react';
import { ChevronDown } from 'lucide-react';
import type { DcfRevisionSnapshot } from '../../lib/dcfRevisionHistory';
import {
    historicalCurrency as money,
    historicalDate as date,
    historicalFundSource,
    historicalMonthlyTotal,
    historicalNumber,
    historicalRecord,
    historicalRows,
    historicalSum,
    historicalText as text,
    historicalTitle,
    type HistoricalRecord,
} from '../../lib/dcfHistoricalPresentation';
import {
    HistoricalField,
    HistoricalFields as Fields,
    HistoricalFinancialMetrics,
    HistoricalMonthlyGrid,
    HistoricalStatus,
} from './DcfHistoricalPrimitives';

const Field: React.FC<React.ComponentProps<typeof HistoricalField>> = (props) => (
    <HistoricalField {...props} emphasis />
);

function RequirementFields({
    snapshot,
    record,
}: {
    snapshot: DcfRevisionSnapshot;
    record: HistoricalRecord;
}) {
    const uacs = record.uacsCode == null || record.uacsCode === '' ? text(record.uacsCode) : `${text(record.uacsCode)} - ${text(undefined)}`;
    const funding = `${text(record.fundType)} ${record.fundYear === undefined ? text(undefined) : String(record.fundYear ?? '')} - ${text(record.tier)}`;
    const common = (
        <>
            <Field label="Fund Source" value={text(historicalFundSource(snapshot))} />
            <Field label="Funding" value={funding} />
        </>
    );
    if (snapshot.entityType === 'office_requirements')
        return (
            <Fields>
                <Field label="Equipment" value={text(record.equipment)} />
                <Field label="Status" value={<HistoricalStatus value={record.status} />} />
                <Field label="Units" value={text(record.numberOfUnits)} />
                <Field label="Specs" value={text(record.specs)} wide />
                <Field label="Purpose" value={text(record.purpose)} wide />
                <Field label="Price Per Unit" value={money(record.pricePerUnit)} />
                <Field
                    label="Total Amount"
                    value={money(
                        historicalNumber(record.pricePerUnit) !== undefined &&
                            historicalNumber(record.numberOfUnits) !== undefined
                            ? Number(record.pricePerUnit) * Number(record.numberOfUnits)
                            : undefined,
                    )}
                />
                {common}
                <Field label="UACS Code" value={uacs} wide />
                <Field label="Physical Delivery" value={date(record.physicalDeliveryDate, true)} />
                <Field label="Target Obligation" value={date(record.obligationDate, true)} />
                <Field label="Target Disbursement" value={date(record.disbursementDate, true)} />
                <Field label="Encoded By" value={text(record.encodedBy)} />
            </Fields>
        );
    if (snapshot.entityType === 'staffing_requirements')
        return (
            <Fields>
                <Field label="Position" value={text(record.personnelPosition)} />
                <Field label="Component" value={text(record.component)} />
                <Field label="Status" value={<HistoricalStatus value={record.hiringStatus} />} />
                <Field label="Employment" value={text(record.status)} />
                <Field
                    label="Salary Grade"
                    value={
                        record.salaryGrade == null
                            ? text(record.salaryGrade)
                            : `SG-${text(record.salaryGrade)}`
                    }
                />
                <Field label="Type" value={text(record.personnelType)} />
                {common}
                <Field label="Total Annual Requirement" value={money(record.annualSalary)} />
                <Field label="Encoded By" value={text(record.encodedBy)} />
            </Fields>
        );
    return (
        <Fields>
            <Field label="Particulars" value={text(record.particulars)} wide />
            <Field label="Status" value={<HistoricalStatus value={record.status} />} />
            {common}
            <Field label="UACS Code" value={uacs} wide />
            <Field label="Target Obligation Date" value={text(record.obligationDate)} />
            <Field label="Target Allocation Amount" value={money(record.amount)} />
            <Field label="Target Obligated Amount" value={money(record.obligatedAmount)} />
            <Field label="Target Disbursement Amount" value={money(historicalMonthlyTotal(record))} />
            <Field label="Encoded By" value={text(record.encodedBy)} />
        </Fields>
    );
}

export function DcfHistoricalProgramManagement({ snapshot }: { snapshot: DcfRevisionSnapshot }) {
    const record = historicalRecord(snapshot),
        staffing = snapshot.entityType === 'staffing_requirements',
        other = snapshot.entityType === 'other_program_expenses';
    const recordedExpenses = historicalRows(record.expenses);
    const expenses =
        staffing && !recordedExpenses.length && (Number(record.annualSalary) > 0 || record.uacsCode)
            ? [{ ...record, expenseParticular: 'Salaries & Wages', amount: record.annualSalary }]
            : recordedExpenses;
    const total = (key: string) =>
        staffing && Array.isArray(record.expenses) && expenses.length
            ? historicalSum(expenses.map((line) => line[key]))
            : record[key];
    return (
        <div className="detail-page dcf-historical-detail dcf-historical-program">
            <header className="detail-header">
                <div>
                    <h1 className="detail-title">{historicalTitle(snapshot)}</h1>
                    <p className="detail-subtitle">
                        {text(record.operatingUnit)} | {text(record.uid)}
                    </p>
                </div>
            </header>
            <div className="detail-grid">
                <section className="detail-card">
                    <h3 className="detail-card-title">Requirement Details</h3>
                    <RequirementFields snapshot={snapshot} record={record} />
                    {staffing && (expenses.length > 0 || !Array.isArray(record.expenses)) && (
                        <div className="detail-subsection detail-subsection--separated">
                            <h4 className="detail-section-title">Cost Breakdown</h4>
                            {!expenses.length && !Array.isArray(record.expenses) ? (
                                <p className="detail-empty">{text(undefined)}</p>
                            ) : (
                                <ul className="program-expense-list">
                                    {expenses.map((line, index) => (
                                        <li key={index} className="program-expense-card">
                                            <details>
                                                <summary className="program-expense-card__trigger">
                                                    <div className="program-expense-card__summary">
                                                        <span className="program-expense-card__title">
                                                            {text(line.expenseParticular)}
                                                        </span>
                                                        <span className="program-expense-card__meta">
                                                            {text(line.uacsCode)}
                                                        </span>
                                                    </div>
                                                    <div className="program-expense-card__aside">
                                                        <span className="program-expense-card__amount">
                                                            {money(line.amount)}
                                                        </span>
                                                        <ChevronDown
                                                            className="program-expense-card__chevron"
                                                            aria-hidden="true"
                                                        />
                                                    </div>
                                                </summary>
                                                <div className="program-expense-card__details">
                                                    <div className="program-expense-card__date">
                                                        <div>
                                                            <span className="detail-kicker">
                                                                Target Obligation Date
                                                            </span>
                                                            <span className="program-expense-card__date-value">
                                                                {date(line.obligationDate, false, 'short')}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <p className="detail-kicker">
                                                        Target Monthly Disbursement
                                                    </p>
                                                    <HistoricalMonthlyGrid record={line} />
                                                </div>
                                            </details>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                    {other && (
                        <div className="detail-subsection detail-subsection--separated">
                            <h4 className="detail-section-title detail-section-title--ruled">
                                Target Monthly Disbursement
                            </h4>
                            <HistoricalMonthlyGrid record={record} />
                        </div>
                    )}
                </section>
                <section className="detail-card">
                    <h3 className="detail-card-title">Accomplishment Report</h3>
                    <div className="detail-stack">
                        {staffing ? (
                            <>
                                <div>
                                    <h4 className="detail-section-title detail-section-title--ruled">
                                        Financial Performance Summary
                                    </h4>
                                    <div className="detail-metric-grid">
                                        <div className="detail-subsection">
                                            <p className="detail-kicker">Total Obligation</p>
                                            <Field
                                                label="Amount"
                                                value={money(total('actualObligationAmount'))}
                                            />
                                        </div>
                                        <div className="detail-subsection">
                                            <p className="detail-kicker">Total Disbursement</p>
                                            <Field
                                                label="Amount"
                                                value={money(total('actualDisbursementAmount'))}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <h4 className="detail-section-title detail-section-title--ruled">
                                        Employment Details
                                    </h4>
                                    <div className="detail-metric-grid">
                                        <Field
                                            label="Date Hired"
                                            value={date(record.actualObligationDate, false, 'short')}
                                        />
                                    </div>
                                </div>
                                {(expenses.length > 0 || !Array.isArray(record.expenses)) && (
                                    <div className="detail-subsection">
                                        <h4 className="detail-section-title detail-section-title--ruled">
                                            Per Item Actuals
                                        </h4>
                                        {!expenses.length && !Array.isArray(record.expenses) ? (
                                            <p className="detail-empty">{text(undefined)}</p>
                                        ) : (
                                            <div className="program-actual-list">
                                                {expenses.map((line, index) => (
                                                    <div key={index} className="program-actual-card">
                                                        <div className="program-actual-card__header">
                                                            <span className="program-actual-card__title">
                                                                {text(line.expenseParticular)}
                                                            </span>
                                                            <div className="program-actual-card__summary">
                                                                <div>
                                                                    Date:{' '}
                                                                    <span>
                                                                        {date(
                                                                            line.actualObligationDate,
                                                                            false,
                                                                            'short',
                                                                        )}
                                                                    </span>
                                                                </div>
                                                                <div>
                                                                    Act. Obli:{' '}
                                                                    <span>
                                                                        {money(line.actualObligationAmount)}
                                                                    </span>
                                                                </div>
                                                                <div className="program-actual-card__disbursement">
                                                                    Act. Disb:{' '}
                                                                    <span>
                                                                        {money(
                                                                            line.actualDisbursementAmount ??
                                                                                historicalMonthlyTotal(
                                                                                    line,
                                                                                    true,
                                                                                ),
                                                                        )}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <HistoricalMonthlyGrid record={line} actual nonzero />
                                                        {line.actualDisbursementAmount === 0 && (
                                                            <p className="detail-empty detail-empty--compact">
                                                                No Disbursement Recorded
                                                            </p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                {!other && (
                                    <div className="detail-metric-grid">
                                        <Field
                                            label="Actual Delivery Date"
                                            value={date(record.actualDate, false, 'numeric')}
                                        />
                                        <Field
                                            label="Actual Amount (Misc)"
                                            value={money(record.actualAmount)}
                                        />
                                    </div>
                                )}
                                <div>
                                    <h4
                                        className={`detail-section-title${other ? ' detail-section-title--ruled' : ''}`}
                                    >
                                        Financial Performance
                                    </h4>
                                    <HistoricalFinancialMetrics record={record} other={other} />
                                </div>
                                {other && (
                                    <div className="detail-subsection">
                                        <h4 className="detail-section-title detail-section-title--ruled">
                                            Actual Monthly Disbursement
                                        </h4>
                                        <HistoricalMonthlyGrid record={record} actual />
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
