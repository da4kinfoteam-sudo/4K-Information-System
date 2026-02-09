// Author: 4K 
import React, { useMemo, useState } from 'react';
import { Subproject, Training, OtherActivity, OfficeRequirement, StaffingRequirement, OtherProgramExpense, IPO } from '../../constants';
import { formatCurrency, XLSX } from './ReportUtils';

interface MonthlyReportMatrixProps {
    data: {
        subprojects: Subproject[];
        trainings: Training[];
        otherActivities: OtherActivity[];
        officeReqs: OfficeRequirement[];
        staffingReqs: StaffingRequirement[];
        otherProgramExpenses: OtherProgramExpense[];
        ipos: IPO[];
    };
    selectedYear: string;
    selectedOu: string;
}

const MONTHS = [
    { value: 0, label: 'January' }, { value: 1, label: 'February' }, { value: 2, label: 'March' },
    { value: 3, label: 'April' }, { value: 4, label: 'May' }, { value: 5, label: 'June' },
    { value: 6, label: 'July' }, { value: 7, label: 'August' }, { value: 8, label: 'September' },
    { value: 9, label: 'October' }, { value: 10, label: 'November' }, { value: 11, label: 'December' }
];

const dataCellClass = "p-2 border border-gray-300 dark:border-gray-600 text-right whitespace-nowrap text-xs";
const textCellClass = "p-2 border border-gray-300 dark:border-gray-600 text-left text-xs";

const MonthlyReportMatrix: React.FC<MonthlyReportMatrixProps> = ({ data, selectedYear, selectedOu }) => {
    const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
    const [expandedRows, setExpandedRows] = useState(new Set<string>());

    const toggleRow = (key: string) => {
        setExpandedRows(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) newSet.delete(key); else newSet.add(key);
            return newSet;
        });
    };

    const matrixData = useMemo(() => {
        const year = parseInt(selectedYear);
        const reportDate = new Date(year, selectedMonth + 1, 0); // Last day of selected month

        // Helper: Check if a target date falls within Jan 1 to Selected Month End of selected year
        const isTargetDue = (dateStr?: string) => {
            if (!dateStr || selectedYear === 'All') return false; 
            const d = new Date(dateStr);
            return d.getFullYear() === year && d.getMonth() <= selectedMonth;
        };

        // Helper: Check if actuals were INPUTTED by user on or before selected month
        const wasInputtedByMonth = (item: any) => {
            if (selectedYear === 'All') return false;
            
            const createdAt = new Date(item.created_at || new Date().toISOString());
            if (createdAt.getFullYear() === year && createdAt.getMonth() > selectedMonth) return false;
            if (createdAt.getFullYear() > year) return false;

            if (item.history && item.history.length > 0) {
                const hasHistoryInWindow = item.history.some((h: any) => {
                    const hDate = new Date(h.date);
                    return hDate.getFullYear() < year || (hDate.getFullYear() === year && hDate.getMonth() <= selectedMonth);
                });
                return hasHistoryInWindow;
            }

            return true;
        };

        // Helper: Check Financial Actuals (based on date of obligation/disbursement)
        const isFinancialActualInWindow = (dateStr?: string) => {
             if (!dateStr || selectedYear === 'All') return false;
             const d = new Date(dateStr);
             return d.getFullYear() === year && d.getMonth() <= selectedMonth;
        };

        const createRow = (indicator: string, unit: string, cost: number, targetQty: number, actualQty: number, obli: number, disb: number) => {
            const variance = targetQty - actualQty;
            const percentage = targetQty > 0 ? (actualQty / targetQty) * 100 : 0;
            const obliRate = cost > 0 ? (obli / cost) * 100 : 0;
            const disbRate = obli > 0 ? (disb / obli) * 100 : 0;
            const unutilized = cost - obli;
            const unpaid = obli - disb;

            return {
                indicator, unit, cost, target: targetQty, actual: actualQty,
                variance, percentage, obligation: obli, disbursement: disb,
                obliRate, disbRate, unutilized, unpaid
            };
        };

        const structure: { [key: string]: any } = {
            'Social Preparation': [],
            'Production and Livelihood': { isNested: true, packages: {} },
            'Marketing and Enterprise': [],
            'Program Management': { isNested: true, packages: { 'Staffing': [], 'Office': [], 'Activities': [] } }
        };

        const addItem = (list: any[], item: any) => {
            // Aggregate if same indicator
            const existing = list.find(i => i.indicator === item.indicator);
            if (existing) {
                existing.cost += item.cost;
                existing.target += item.target;
                existing.actual += item.actual;
                existing.obligation += item.obligation;
                existing.disbursement += item.disbursement;
                // Re-calc calculated fields
                existing.variance = existing.target - existing.actual;
                existing.percentage = existing.target > 0 ? (existing.actual / existing.target) * 100 : 0;
                existing.obliRate = existing.cost > 0 ? (existing.obligation / existing.cost) * 100 : 0;
                existing.disbRate = existing.obligation > 0 ? (existing.disbursement / existing.obligation) * 100 : 0;
                existing.unutilized = existing.cost - existing.obligation;
                existing.unpaid = existing.obligation - existing.disbursement;
            } else {
                list.push(item);
            }
        };

        // --- 1. Subprojects Logic (Aggregated) ---
        const subprojectStats: Record<string, { cost: number, target: number, actual: number, obli: number, disb: number }> = {};
        
        // Trackers for ADs and IPOs
        // We track Target if the SP is due by selected month
        // We track Actual if the SP is completed and input by selected month
        const targetIpoSet = new Set<string>();
        const actualIpoSet = new Set<string>();
        const targetAdSet = new Set<string>();
        const actualAdSet = new Set<string>();

        // IPO Map for AD lookup
        const ipoMap = new Map<string, string>();
        data.ipos.forEach(i => ipoMap.set(i.name, i.ancestralDomainNo));

        data.subprojects.forEach(sp => {
            const pkg = sp.packageType || 'Other';
            if (!subprojectStats[pkg]) subprojectStats[pkg] = { cost: 0, target: 0, actual: 0, obli: 0, disb: 0 };
            
            const cost = sp.details.reduce((acc, d) => acc + (d.pricePerUnit * d.numberOfUnits), 0);
            
            // Target
            // A project is a target if any of its components are due, or based on completion date
            // Usually simpler to check estimatedCompletionDate for the whole project
            const isTarget = isTargetDue(sp.estimatedCompletionDate);
            
            // Actual
            const isActual = wasInputtedByMonth(sp) && sp.status === 'Completed';

            const obli = sp.details.reduce((acc, d) => acc + (isFinancialActualInWindow(d.actualObligationDate) ? (d.actualObligationAmount || 0) : 0), 0);
            const disb = sp.details.reduce((acc, d) => acc + (isFinancialActualInWindow(d.actualDisbursementDate) ? (d.actualDisbursementAmount || 0) : 0), 0);

            // Aggregate Package Stats
            subprojectStats[pkg].cost += cost;
            if (isTarget) subprojectStats[pkg].target += 1;
            if (isActual) subprojectStats[pkg].actual += 1;
            subprojectStats[pkg].obli += obli;
            subprojectStats[pkg].disb += disb;

            // Track Indicators
            if (isTarget) {
                targetIpoSet.add(sp.indigenousPeopleOrganization);
                const ad = ipoMap.get(sp.indigenousPeopleOrganization);
                if (ad) targetAdSet.add(ad);
            }
            if (isActual) {
                actualIpoSet.add(sp.indigenousPeopleOrganization);
                const ad = ipoMap.get(sp.indigenousPeopleOrganization);
                if (ad) actualAdSet.add(ad);
            }
        });

        // Add "Subproject Provisions" group
        if (!structure['Production and Livelihood'].packages['Subproject Provisions']) {
            structure['Production and Livelihood'].packages['Subproject Provisions'] = [];
        }
        const spProvisions = structure['Production and Livelihood'].packages['Subproject Provisions'];

        // Add Indicator Rows
        spProvisions.push(createRow("Number of Ancestral Domains", "Number", 0, targetAdSet.size, actualAdSet.size, 0, 0));
        spProvisions.push(createRow("Number of IPOs", "Number", 0, targetIpoSet.size, actualIpoSet.size, 0, 0));

        // Add Package Rows (Sorted)
        Object.keys(subprojectStats).sort().forEach(pkg => {
            const s = subprojectStats[pkg];
            spProvisions.push(createRow(pkg, "Project", s.cost, s.target, s.actual, s.obli, s.disb));
        });


        // --- 2. Trainings/Activities ---
        const processActivity = (act: any) => {
            const cost = act.expenses.reduce((acc: number, e: any) => acc + e.amount, 0);
            const targetQty = isTargetDue(act.date) ? 1 : 0;
            const actualQty = (wasInputtedByMonth(act) && act.actualDate) ? 1 : 0;
            
            const obli = act.expenses.reduce((acc: number, e: any) => acc + (isFinancialActualInWindow(e.actualObligationDate) ? (e.actualObligationAmount || 0) : 0), 0);
            const disb = act.expenses.reduce((acc: number, e: any) => acc + (isFinancialActualInWindow(e.actualDisbursementDate) ? (e.actualDisbursementAmount || 0) : 0), 0);

            const item = createRow(act.name, 'Number', cost, targetQty, actualQty, obli, disb);
            
            if (act.component === 'Production and Livelihood') {
                if (!structure['Production and Livelihood'].packages['Trainings']) structure['Production and Livelihood'].packages['Trainings'] = [];
                addItem(structure['Production and Livelihood'].packages['Trainings'], item);
            } else if (act.component === 'Program Management') {
                addItem(structure['Program Management'].packages['Activities'], item);
            } else if (structure[act.component]) {
                addItem(structure[act.component], item);
            }
        };
        data.trainings.forEach(processActivity);
        data.otherActivities.forEach(processActivity);

        // --- 3. PM Items ---
        const processPM = (items: any[], typeKey: string, isStaff = false) => {
            items.forEach(pm => {
                const cost = isStaff ? pm.annualSalary : (pm.amount || (pm.pricePerUnit * pm.numberOfUnits));
                const targetQty = isTargetDue(pm.obligationDate) ? (isStaff ? 1 : pm.numberOfUnits) : 0;
                
                const hasActual = pm.actualDate || pm.actualObligationDate;
                const actualQty = (wasInputtedByMonth(pm) && hasActual) ? (isStaff ? 1 : pm.numberOfUnits) : 0;

                const obli = isFinancialActualInWindow(pm.actualObligationDate) ? (pm.actualObligationAmount || 0) : 0;
                
                let disb = 0;
                if (isStaff || typeKey === 'Other') {
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    months.forEach((m, idx) => {
                        if (idx <= selectedMonth) {
                             disb += (pm[`actualDisbursement${m}`] || 0);
                        }
                    });
                } else {
                     disb = isFinancialActualInWindow(pm.actualDisbursementDate) ? (pm.actualDisbursementAmount || 0) : 0;
                }

                const indicator = isStaff ? pm.personnelPosition : (pm.equipment || pm.particulars);
                const unit = isStaff ? 'Pax' : 'Unit';
                const item = createRow(indicator, unit, cost, targetQty, actualQty, obli, disb);
                
                addItem(structure['Program Management'].packages[typeKey], item);
            });
        };
        processPM(data.staffingReqs, 'Staffing', true);
        processPM(data.officeReqs, 'Office');
        processPM(data.otherProgramExpenses, 'Office'); // Grouped with Office/Other

        return structure;

    }, [data, selectedYear, selectedMonth, selectedOu]);

    const handlePrint = () => {
        window.print();
    };

    const handleDownload = () => {
        const rows: any[][] = [
            ["Indicator", "Cost (Allocation)", "Unit", "Target (Cumulative)", "Actual (Cumulative)", "Variance", "Percentage", "Obligation", "Disbursement", "Obligation Rate", "Disbursement Rate", "Unutilized", "Unpaid Obligation"]
        ];

        const processItems = (items: any[], indent: string) => {
            items.forEach(item => {
                rows.push([
                    indent + item.indicator, item.cost, item.unit, item.target, item.actual, item.variance, item.percentage/100, item.obligation, item.disbursement, item.obliRate/100, item.disbRate/100, item.unutilized, item.unpaid
                ]);
            });
        };

        Object.entries(matrixData).forEach(([key, val]: [string, any]) => {
            rows.push([key, null, null, null, null, null, null, null, null, null, null, null, null]);
            if (Array.isArray(val)) {
                processItems(val, "  ");
            } else if (val.isNested) {
                Object.entries(val.packages).forEach(([pkg, items]: [string, any]) => {
                    if (items.length > 0) {
                        rows.push([`  ${pkg}`, null, null, null, null, null, null, null, null, null, null, null, null]);
                        processItems(items, "    ");
                    }
                });
            }
        });

        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Monthly Matrix");
        XLSX.writeFile(wb, `Monthly_Report_Matrix_${selectedYear}_${MONTHS[selectedMonth].label}.xlsx`);
    };

    const renderRow = (item: any, idx: string, level: number) => {
        const indent = level === 0 ? '' : level === 1 ? 'pl-6' : 'pl-10';
        return (
            <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <td className={`${textCellClass} ${indent} font-medium`}>{item.indicator}</td>
                <td className={dataCellClass}>{formatCurrency(item.cost)}</td>
                <td className={`${dataCellClass} text-center`}>{item.unit}</td>
                <td className={`${dataCellClass} text-center`}>{item.target}</td>
                <td className={`${dataCellClass} text-center`}>{item.actual}</td>
                <td className={`${dataCellClass} text-center ${item.variance > 0 ? 'text-red-500' : 'text-green-500'}`}>{item.variance}</td>
                <td className={`${dataCellClass} text-center`}>{item.percentage.toFixed(1)}%</td>
                <td className={dataCellClass}>{formatCurrency(item.obligation)}</td>
                <td className={dataCellClass}>{formatCurrency(item.disbursement)}</td>
                <td className={dataCellClass}>{item.obliRate.toFixed(1)}%</td>
                <td className={dataCellClass}>{item.disbRate.toFixed(1)}%</td>
                <td className={dataCellClass}>{formatCurrency(item.unutilized)}</td>
                <td className={dataCellClass}>{formatCurrency(item.unpaid)}</td>
            </tr>
        );
    };

    const renderGroupTotal = (items: any[], label: string, level: number) => {
        const total = items.reduce((acc, i) => ({
            cost: acc.cost + i.cost,
            target: acc.target + i.target,
            actual: acc.actual + i.actual,
            obligation: acc.obligation + i.obligation,
            disbursement: acc.disbursement + i.disbursement,
        }), { cost: 0, target: 0, actual: 0, obligation: 0, disbursement: 0 });
        
        // Note: Summing dissimilar units (Projects + Indicators) for Total Target/Actual can be meaningless in the "Subproject Provisions" group,
        // but typically totals are requested. 
        
        const variance = total.target - total.actual;
        const percentage = total.target > 0 ? (total.actual / total.target) * 100 : 0;
        const obliRate = total.cost > 0 ? (total.obligation / total.cost) * 100 : 0;
        const disbRate = total.obligation > 0 ? (total.disbursement / total.obligation) * 100 : 0;
        const unutilized = total.cost - total.obligation;
        const unpaid = total.obligation - total.disbursement;

        const indent = level === 0 ? '' : level === 1 ? 'pl-6' : 'pl-10';

        return (
             <tr className="bg-gray-100 dark:bg-gray-700 font-bold">
                <td className={`${textCellClass} ${indent}`}>{label} (Total)</td>
                <td className={dataCellClass}>{formatCurrency(total.cost)}</td>
                <td className={dataCellClass}>-</td>
                <td className={`${dataCellClass} text-center`}>{total.target}</td>
                <td className={`${dataCellClass} text-center`}>{total.actual}</td>
                <td className={`${dataCellClass} text-center`}>{variance}</td>
                <td className={`${dataCellClass} text-center`}>{percentage.toFixed(1)}%</td>
                <td className={dataCellClass}>{formatCurrency(total.obligation)}</td>
                <td className={dataCellClass}>{formatCurrency(total.disbursement)}</td>
                <td className={dataCellClass}>{obliRate.toFixed(1)}%</td>
                <td className={dataCellClass}>{disbRate.toFixed(1)}%</td>
                <td className={dataCellClass}>{formatCurrency(unutilized)}</td>
                <td className={dataCellClass}>{formatCurrency(unpaid)}</td>
            </tr>
        )
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            <div className="flex flex-wrap justify-between items-center mb-6 print-hidden">
                <h3 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    Monthly Report Matrix
                    {selectedYear === 'All' && <span className="text-xs font-normal text-red-500 bg-red-100 px-2 py-0.5 rounded ml-2">Select a Year</span>}
                </h3>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Month:</label>
                        <select 
                            value={selectedMonth} 
                            onChange={(e) => setSelectedMonth(Number(e.target.value))} 
                            className="p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm focus:ring-emerald-500 focus:border-emerald-500 bg-white dark:bg-gray-700 dark:text-white"
                        >
                            {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                    </div>
                    <button onClick={handlePrint} className="px-4 py-2 bg-gray-500 text-white rounded-md font-semibold hover:bg-gray-600 text-sm">Print</button>
                    <button onClick={handleDownload} className="px-4 py-2 bg-emerald-600 text-white rounded-md font-semibold hover:bg-emerald-700 text-sm">Download XLSX</button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                    <thead className="bg-emerald-100 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100 text-xs font-bold uppercase">
                        <tr>
                            <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-left w-1/4">Indicator</th>
                            <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-right">Cost (Allocation)</th>
                            <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-center">Unit</th>
                            <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-center">Target (Cumulative)</th>
                            <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-center">Actual (Cumulative)</th>
                            <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-center">Variance</th>
                            <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-center">Percentage</th>
                            <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-right">Obligation</th>
                            <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-right">Disbursement</th>
                            <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-center">Obligation Rate</th>
                            <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-center">Disbursement Rate</th>
                            <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-right">Unutilized</th>
                            <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-right">Unpaid Obligation</th>
                        </tr>
                    </thead>
                    <tbody className="text-sm">
                        {Object.entries(matrixData).map(([key, val]: [string, any]) => {
                             const isExpanded = expandedRows.has(key);
                             
                             return (
                                <React.Fragment key={key}>
                                     {/* Group Header */}
                                     <tr onClick={() => toggleRow(key)} className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer font-bold">
                                         <td className="p-2 border border-gray-300 dark:border-gray-600 flex items-center gap-2">
                                            <span className="inline-block w-5 text-center text-gray-500 dark:text-gray-400">{isExpanded ? '−' : '+'}</span>
                                            {key}
                                         </td>
                                         <td colSpan={12} className="border border-gray-300 dark:border-gray-600"></td>
                                     </tr>
                                     
                                     {isExpanded && Array.isArray(val) && (
                                         <>
                                            {val.map((item, idx) => renderRow(item, `${key}-${idx}`, 1))}
                                            {val.length > 0 && renderGroupTotal(val, key, 1)}
                                         </>
                                     )}

                                     {isExpanded && val.isNested && Object.entries(val.packages).map(([pkg, pkgItems]: [string, any]) => (
                                         <React.Fragment key={`${key}-${pkg}`}>
                                             {pkgItems.length > 0 && (
                                                 <>
                                                    <tr className="bg-gray-50 dark:bg-gray-800 font-semibold">
                                                        <td className="p-2 pl-6 border border-gray-300 dark:border-gray-600">{pkg}</td>
                                                        <td colSpan={12} className="border border-gray-300 dark:border-gray-600"></td>
                                                    </tr>
                                                    {pkgItems.map((item: any, idx: number) => renderRow(item, `${key}-${pkg}-${idx}`, 2))}
                                                    {renderGroupTotal(pkgItems, pkg, 2)}
                                                 </>
                                             )}
                                         </React.Fragment>
                                     ))}
                                </React.Fragment>
                             )
                        })}
                    </tbody>
                </table>
            </div>
            
             <div className="mt-4 text-xs text-gray-500 italic">
                * Targets are cumulative based on item target dates. <br/>
                * Actuals (Physical) are cumulative based on when the accomplishment was encoded/logged into the system (Input Timestamp Logic). <br/>
                * Financials are cumulative based on actual obligation/disbursement dates.
            </div>
        </div>
    );
};

export default MonthlyReportMatrix;