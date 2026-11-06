import React from 'react';
import { Banknote, CalendarDays, Landmark, Layers, MapPin, PackageCheck, Sprout, Wallet } from 'lucide-react';
import type { SubprojectDetail } from '../../constants';
import type { DcfRevisionSnapshot } from '../../lib/dcfRevisionHistory';
import { resolveSubprojectCompletionRollup } from '../../lib/subprojectCompletion';
import {
    getActiveSubprojectBudget,
    getSubprojectActualDisbursement,
    getSubprojectActualObligation,
    isActiveSubprojectDetail,
} from '../../lib/subprojectItemAdjustments';
import { groupBudgetSchedules } from '../../lib/subprojectBudgetSchedules';
import {
    historicalBudgetAmount as amount,
    historicalCurrency as money,
    historicalDate as date,
    historicalFundSource,
    historicalNumber,
    historicalObject,
    historicalRecord,
    historicalRows,
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
    RecordKpiCard,
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
    HistoricalProgress,
    HistoricalSchedule,
    HistoricalStatus,
    HistoricalTable,
} from './DcfHistoricalPrimitives';

export function DcfHistoricalSubproject({ snapshot }: { snapshot: DcfRevisionSnapshot }) {
    const record = historicalRecord(snapshot),
        rows = historicalRows(record.details),
        details = rows as unknown as SubprojectDetail[];
    const known = Array.isArray(record.details),
        status = typeof record.status === 'string' ? record.status : undefined;
    const rollup = resolveSubprojectCompletionRollup(details, status);
    const physicalKnown =
        known && rows.every((row) => 'actualDeliveryDate' in row || row.isCompleted === false);
    const percent = physicalKnown
        ? rollup.activeCount > 0
            ? (rollup.completedCount / rollup.activeCount) * 100
            : 0
        : undefined;
    const total =
        known && rows.every((row) => amount(row) !== undefined)
            ? record.isTransferTargetExcluded
                ? 0
                : getActiveSubprojectBudget(details, status)
            : undefined;
    const obligation =
        known && rows.every((row) => historicalNumber(row.actualObligationAmount) !== undefined)
            ? getSubprojectActualObligation(details)
            : undefined;
    const disbursement =
        known && rows.every((row) => historicalNumber(row.actualDisbursementAmount) !== undefined)
            ? getSubprojectActualDisbursement(details)
            : undefined;
    const deliveries = physicalKnown
        ? details.filter((row) => isActiveSubprojectDetail(row, status) && !!row.actualDeliveryDate).length
        : undefined;
    const commodities = historicalRows(record.subprojectCommodities),
        commoditiesKnown = Array.isArray(record.subprojectCommodities);
    const ipos = historicalRows(snapshot.related.ipos),
        ipo =
            ipos.find((row) => String(row.id) === String(record.ipo_id)) ??
            historicalObject(snapshot.related.ipo);
    const source = text(historicalFundSource(snapshot));
    const media = historicalRows(snapshot.related.subproject_drive_files).filter((row) => !row.deleted_at);
    const unitSubtotal = (row: HistoricalRecord) =>
        historicalNumber(row.pricePerUnit) !== undefined && historicalNumber(row.numberOfUnits) !== undefined
            ? Number(row.pricePerUnit) * Number(row.numberOfUnits)
            : undefined;
    return (
        <RecordDetailPage className="subproject-record-detail-page dcf-historical-detail">
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
                            Target {date(record.estimatedCompletionDate, true)}
                        </span>
                    </>
                }
            />
            <RecordKpiGrid>
                <HistoricalKpi label="Total Budget" value={total} currency icon={<Wallet />} />
                <HistoricalKpi label="Obligated" value={obligation} currency icon={<Landmark />} />
                <HistoricalKpi label="Disbursed" value={disbursement} currency icon={<Banknote />} />
                <RecordKpiCard
                    label="Physical"
                    value={percent === undefined ? <span className="record-detail-kpi__empty">Not Recorded</span> : `${Math.round(percent)}%`}
                    icon={<PackageCheck />}
                />
                <HistoricalKpi
                    label="Commodities"
                    value={commoditiesKnown ? commodities.length : undefined}
                    icon={<Sprout />}
                />
                <HistoricalKpi label="Deliveries" value={deliveries} icon={<Layers />} />
            </RecordKpiGrid>
            <RecordDetailGrid>
                <RecordDetailMain>
                    <RecordPanel title="Project Details">
                        <Fields three>
                            <Field
                                label="Status"
                                value={<HistoricalStatus value={record.status} compact />}
                            />
                            <Field label="UID" value={text(record.uid)} />
                            <Field label="Operating Unit" value={text(record.operatingUnit)} />
                            <Field label="Package" value={text(record.packageType)} />
                            <Field label="IPO" value={text(record.indigenousPeopleOrganization)} />
                            <Field
                                label="Estimated Completion"
                                value={date(record.estimatedCompletionDate, true)}
                            />
                            <Field
                                label="Actual Completion"
                                value={date(record.actualCompletionDate, true)}
                            />
                            <Field label="Funding Year" value={historicalYear(record.fundingYear)} />
                            <Field label="Fund Type" value={text(record.fundType)} />
                            <Field label="Tier" value={text(record.tier)} />
                            <Field label="Fund Source" value={source} />
                        </Fields>
                        <HistoricalProgress label="Project Completion (Items Delivered)" value={percent} />
                    </RecordPanel>
                    <RecordPanel title="Target Commodities">
                        {commodities.length ? (
                            <HistoricalTable
                                label="Target Commodities"
                                columns={['Commodity', 'Kind', 'Coverage', 'Target Yield']}
                            >
                                {commodities.map((commodity, index) => (
                                    <tr key={index}>
                                        <td className="data-table__primary">{text(commodity.name)}</td>
                                        <td>{text(commodity.typeName)}</td>
                                        <td className="data-table__numeric">
                                            {text(commodity.area)}{' '}
                                            {commodity.typeName === 'Livestock' ? 'heads' : 'ha'}
                                        </td>
                                        <td className="data-table__numeric">
                                            {commodity.typeName === 'Livestock'
                                                ? 'N/A'
                                                : `${text(commodity.averageYield)} kg`}
                                        </td>
                                    </tr>
                                ))}
                            </HistoricalTable>
                        ) : (
                            <p className="detail-empty">
                                {commoditiesKnown ? 'No Commodities Recorded.' : text(undefined)}
                            </p>
                        )}
                    </RecordPanel>
                    <RecordPanel title="Budget Breakdown">
                        <HistoricalTable
                            label="Budget Breakdown"
                            columns={[
                                'Particulars',
                                'Status',
                                'Delivery Date',
                                'UACS Code',
                                'Obligation',
                                'Disbursement',
                                '# Of Units',
                                'Subtotal',
                                '% Comp.',
                            ]}
                            footer={
                                <tr>
                                    <td colSpan={7} className="data-table__numeric">
                                        Total Budget
                                    </td>
                                    <td className="data-table__numeric">{money(total)}</td>
                                    <td />
                                </tr>
                            }
                        >
                            {groupBudgetSchedules(details).flatMap((group) =>
                                group.rows.map((line, index) => {
                                    const row = line as unknown as HistoricalRecord;
                                    const completion =
                                        historicalNumber(row.actualNumberOfUnits) !== undefined &&
                                        historicalNumber(row.numberOfUnits) !== undefined
                                            ? (Number(row.actualNumberOfUnits) /
                                                  (Number(row.numberOfUnits) || 1)) *
                                              100
                                            : undefined;
                                    return (
                                        <tr key={line.id}>
                                            {index === 0 && (
                                                <td
                                                    className="data-table__primary subproject-budget-editor__shared"
                                                    rowSpan={group.rows.length}
                                                >
                                                    <span
                                                        className="subproject-budget-editor__text"
                                                        title={line.particulars}
                                                    >
                                                        {text(line.particulars)}
                                                    </span>
                                                </td>
                                            )}
                                            <td>
                                                <HistoricalBudgetStatus line={row} parentStatus={status} />
                                            </td>
                                            <td>{date(row.deliveryDate, true)}</td>
                                            <td>{text(row.uacsCode)}</td>
                                            <td>
                                                <HistoricalSchedule
                                                    line={row}
                                                    amount={amount(row)}
                                                    stage="obligation"
                                                />
                                            </td>
                                            <td>
                                                <HistoricalSchedule
                                                    line={row}
                                                    amount={amount(row)}
                                                    stage="disbursement"
                                                />
                                            </td>
                                            <td className="data-table__numeric">
                                                {text(row.numberOfUnits)} {text(row.unitOfMeasure)}
                                            </td>
                                            <td className="data-table__numeric">
                                                {money(unitSubtotal(row))}
                                            </td>
                                            <td>
                                                {completion === undefined
                                                    ? text(undefined)
                                                    : `${Math.min(completion, 100).toFixed(0)}%`}
                                            </td>
                                        </tr>
                                    );
                                }),
                            )}
                            {!rows.length && <HistoricalEmptyRow columns={9} known={known} />}
                        </HistoricalTable>
                    </RecordPanel>
                    <RecordPanel title="Accomplishment Report">
                        <div className="detail-stack">
                            <div>
                                <h4 className="detail-section-title">Item Delivery Status</h4>
                                {rows.some((row) => row.actualDeliveryDate) ? (
                                    <HistoricalTable
                                        label="Item Delivery Status"
                                        columns={['Item', 'Actual Delivery', 'Actual Units']}
                                    >
                                        {rows
                                            .filter((row) => row.actualDeliveryDate)
                                            .map((row, index) => (
                                                <tr key={index}>
                                                    <td className="data-table__primary">
                                                        {text(row.particulars)}
                                                    </td>
                                                    <td>{date(row.actualDeliveryDate, true)}</td>
                                                    <td className="data-table__numeric">
                                                        {text(row.actualNumberOfUnits)}
                                                    </td>
                                                </tr>
                                            ))}
                                    </HistoricalTable>
                                ) : (
                                    <p className="detail-empty">
                                        {known ? 'No Items Delivered Yet.' : text(undefined)}
                                    </p>
                                )}
                            </div>
                            <div className="detail-subsection">
                                <h4 className="detail-section-title">Financial Performance</h4>
                                <HistoricalTable
                                    label="Financial Performance"
                                    columns={[
                                        'Expense Item',
                                        'Target Budget',
                                        'Actual Obligation',
                                        'Actual Disbursement',
                                    ]}
                                >
                                    {rows.map((row, index) => (
                                        <tr key={index}>
                                            <td className="data-table__primary">{text(row.particulars)}</td>
                                            <td className="data-table__numeric">
                                                {money(unitSubtotal(row))}
                                            </td>
                                            <td className="data-table__numeric">
                                                {money(row.actualObligationAmount)}
                                            </td>
                                            <td className="data-table__numeric">
                                                {money(row.actualDisbursementAmount)}
                                            </td>
                                        </tr>
                                    ))}
                                    {!rows.length && <HistoricalEmptyRow columns={4} known={known} />}
                                </HistoricalTable>
                            </div>
                            <div>
                                <h4 className="detail-section-title">Gender And Inclusivity</h4>
                                <Fields>
                                    {[
                                        ['Male', 'actualMaleBeneficiaries'],
                                        ['Female', 'actualFemaleBeneficiaries'],
                                        ['4Ps Beneficiary', 'actualFourPsBeneficiaries'],
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
                            <div>
                                <h4 className="detail-section-title">Project Outcome</h4>
                                {commodities.some(
                                    (commodity) => commodity.actualYield || commodity.income,
                                ) ? (
                                    <div className="detail-outcome-grid">
                                        {commodities
                                            .filter((commodity) => commodity.actualYield || commodity.income)
                                            .map((commodity, index) => (
                                                <CommodityOutcome key={index} commodity={commodity} />
                                            ))}
                                    </div>
                                ) : (
                                    <p className="detail-empty">
                                        {commoditiesKnown ? 'No Outcome Data Recorded Yet.' : text(undefined)}
                                    </p>
                                )}
                            </div>
                        </div>
                    </RecordPanel>
                    <RecordPanel title="Gallery">
                        <HistoricalMedia
                            rows={media.filter((row) => row.upload_section === 'gallery')}
                            known={Array.isArray(snapshot.related.subproject_drive_files)}
                            gallery
                        />
                    </RecordPanel>
                    <RecordPanel title="Subproject Files">
                        <HistoricalMedia
                            rows={media.filter((row) => row.upload_section !== 'gallery')}
                            known={Array.isArray(snapshot.related.subproject_drive_files)}
                        />
                    </RecordPanel>
                </RecordDetailMain>
                <RecordDetailAside>
                    <RecordPanel title="Summary">
                        <dl className="ipo-summary-list">
                            <Field label="Total Budget" value={money(total)} summary />
                            <Field
                                label="Physical Completion"
                                value={percent === undefined ? text(undefined) : `${Math.round(percent)}%`}
                                summary
                            />
                            <Field
                                label="Budget Items"
                                value={known ? text(rows.length) : text(undefined)}
                                summary
                            />
                            <Field label="Fund Year" value={historicalYear(record.fundingYear)} summary />
                            <Field label="Fund Type" value={text(record.fundType)} summary />
                            <Field label="Fund Source" value={source} summary />
                        </dl>
                    </RecordPanel>
                    <RecordPanel title="Linked IPO">
                        <Fields>
                            <Field
                                label="IPO Name"
                                value={text(ipo.name ?? record.indigenousPeopleOrganization)}
                            />
                            <Field label="Region" value={text(ipo.region)} />
                            <Field label="Location" value={text(ipo.location)} />
                            <Field label="Contact Person" value={text(ipo.contactPerson)} />
                        </Fields>
                    </RecordPanel>
                    <RecordPanel title="Remarks">
                        <p className="detail-note">{text(record.remarks)}</p>
                    </RecordPanel>
                    <RecordPanel title="Accomplishment Remarks">
                        <p className="detail-note">{text(record.accomplishmentRemarks)}</p>
                    </RecordPanel>
                </RecordDetailAside>
            </RecordDetailGrid>
        </RecordDetailPage>
    );
}

const CommodityOutcome: React.FC<{ commodity: HistoricalRecord }> = ({ commodity }) => {
    const yieldAmount = historicalNumber(commodity.actualYield);
    const quantity = (key: string) =>
        yieldAmount !== undefined && historicalNumber(commodity[key]) !== undefined
            ? (yieldAmount * Number(commodity[key])) / 100
            : undefined;
    const unit = commodity.typeName === 'Livestock' ? 'Heads' : 'Kilograms';
    return (
        <div className="detail-outcome-card">
            <div className="detail-outcome-card__header">
                <p className="detail-outcome-title">{text(commodity.name)}</p>
                <span className="detail-outcome-pill">{text(commodity.typeName)}</span>
            </div>
            <div className="detail-stack detail-stack--compact">
                <div className="detail-outcome-row">
                    <span className="detail-outcome-label">Total Actual Yield</span>
                    <span className="detail-outcome-value">
                        {text(commodity.actualYield)} <span className="detail-outcome-unit">{unit}</span>
                    </span>
                </div>
                <div className="detail-stack detail-stack--compact">
                    <div className="detail-outcome-row detail-outcome-row--marketing detail-outcome-row--stack">
                        <div className="detail-outcome-row__content">
                            <span className="detail-outcome-label">
                                Marketing ({text(commodity.marketingPercentage)}%)
                            </span>
                            <span className="detail-outcome-value">
                                {text(quantity('marketingPercentage'))} {unit}
                            </span>
                        </div>
                        {!!commodity.income && (
                            <div className="detail-outcome-income">
                                <span className="detail-outcome-label">Actual Income</span>
                                <span className="detail-outcome-value">{money(commodity.income)}</span>
                            </div>
                        )}
                    </div>
                    <div className="detail-outcome-row detail-outcome-row--food">
                        <div className="detail-outcome-row__content">
                            <span className="detail-outcome-label">
                                Food Security ({text(commodity.foodSecurityPercentage)}%)
                            </span>
                            <span className="detail-outcome-value">
                                {text(quantity('foodSecurityPercentage'))} {unit}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
