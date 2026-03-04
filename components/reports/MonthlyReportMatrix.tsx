
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
    financialData: {
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

const formatCurrencyWhole = (amount: number) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.ceil(amount));
};

const MonthlyReportMatrix: React.FC<MonthlyReportMatrixProps> = ({ data, financialData, selectedYear, selectedOu }) => {
    const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
    const [expandedRows, setExpandedRows] = useState(new Set<string>());

    const toggleRow = (key: string) => {
        setExpandedRows(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) newSet.delete(key); else newSet.add(key);
            return newSet;
        });
    };

    const targetYearInt = parseInt(selectedYear);
    const isYearSelected = selectedYear !== 'All';

    // --- TABLE 1: Physical Accomplishment ---
    const physicalData = useMemo(() => {
        const reportDate = new Date(targetYearInt, selectedMonth + 1, 0); // End of selected month

        // Logic for Cumulative (Up to selected Month)
        const isTargetDueCumulative = (dateStr?: string) => {
            if (!dateStr || !isYearSelected) return false; 
            const d = new Date(dateStr);
            return d.getFullYear() === targetYearInt && d.getMonth() <= selectedMonth;
        };

        // Logic for Specific Month
        const isTargetDueMonthly = (dateStr?: string) => {
            if (!dateStr || !isYearSelected) return false;
            const d = new Date(dateStr);
            return d.getFullYear() === targetYearInt && d.getMonth() === selectedMonth;
        };

        const createRow = (indicator: string, unit: string, tMonth: number, aMonth: number, tCum: number, aCum: number) => {
            const vMonth = tMonth - aMonth;
            const pMonth = tMonth > 0 ? (aMonth / tMonth) * 100 : 0;
            
            const vCum = tCum - aCum;
            const pCum = tCum > 0 ? (aCum / tCum) * 100 : 0;

            return { 
                indicator, unit, 
                targetMonth: tMonth, actualMonth: aMonth, varianceMonth: vMonth, percentageMonth: pMonth,
                targetCum: tCum, actualCum: aCum, varianceCum: vCum, percentageCum: pCum
            };
        };

        const structure: { [key: string]: any } = {
            'Social Preparation': { items: [], cost: 0 },
            'Production and Livelihood': { isNested: true, packages: {}, cost: 0 },
            'Marketing and Enterprise': { items: [], cost: 0 },
            'Program Management': { isNested: true, packages: { 'Staffing': [], 'Office': [], 'Activities': [] }, cost: 0 }
        };

        const addItem = (list: any[], item: any) => {
            const existing = list.find((i: any) => i.indicator === item.indicator);
            if (existing) {
                // Aggregate Monthly
                existing.targetMonth += item.targetMonth;
                existing.actualMonth += item.actualMonth;
                existing.varianceMonth = existing.targetMonth - existing.actualMonth;
                existing.percentageMonth = existing.targetMonth > 0 ? (existing.actualMonth / existing.targetMonth) * 100 : 0;

                // Aggregate Cumulative
                existing.targetCum += item.targetCum;
                existing.actualCum += item.actualCum;
                existing.varianceCum = existing.targetCum - existing.actualCum;
                existing.percentageCum = existing.targetCum > 0 ? (existing.actualCum / existing.targetCum) * 100 : 0;
            } else {
                list.push(item);
            }
        };

        // --- 1. Subprojects Logic ---
        const packages: Record<string, Subproject[]> = {};
        const ipoAdMap = new Map<string, string>();
        data.ipos.forEach(i => ipoAdMap.set(i.name, i.ancestralDomainNo));

        data.subprojects.forEach(sp => {
            const pkg = sp.packageType || 'Other';
            if (!packages[pkg]) packages[pkg] = [];
            packages[pkg].push(sp);
            
            // Cost Aggregation
            const cost = sp.details.reduce((sum, d) => sum + (d.pricePerUnit * d.numberOfUnits), 0);
            structure['Production and Livelihood'].cost += cost;
        });

        if (!structure['Production and Livelihood'].packages['Subproject Provisions']) {
            structure['Production and Livelihood'].packages['Subproject Provisions'] = [];
        }
        const spProvisions = structure['Production and Livelihood'].packages['Subproject Provisions'];

        const targetIpoSetCum = new Set<string>();
        const actualIpoSetCum = new Set<string>();
        const targetAdSetCum = new Set<string>();
        const actualAdSetCum = new Set<string>();
        
        const targetIpoSetMonth = new Set<string>();
        const actualIpoSetMonth = new Set<string>();
        const targetAdSetMonth = new Set<string>();
        const actualAdSetMonth = new Set<string>();

        Object.keys(packages).sort().forEach(pkg => {
            const subList = packages[pkg];
            
            // Counts
            const targetCountMonth = subList.filter(sp => isTargetDueMonthly(sp.estimatedCompletionDate)).length;
            const targetCountCum = subList.filter(sp => isTargetDueCumulative(sp.estimatedCompletionDate)).length;
            
            const actualCountMonth = subList.filter(sp => sp.status === 'Completed' && isTargetDueMonthly(sp.actualCompletionDate)).length;
            const actualCountCum = subList.filter(sp => sp.status === 'Completed' && isTargetDueCumulative(sp.actualCompletionDate)).length;

            subList.forEach(sp => {
                const ad = ipoAdMap.get(sp.indigenousPeopleOrganization);
                
                // Cumulative Sets
                if (isTargetDueCumulative(sp.estimatedCompletionDate)) {
                    targetIpoSetCum.add(sp.indigenousPeopleOrganization);
                    if (ad) targetAdSetCum.add(ad);
                }
                if (sp.status === 'Completed' && isTargetDueCumulative(sp.actualCompletionDate)) {
                    actualIpoSetCum.add(sp.indigenousPeopleOrganization);
                    if (ad) actualAdSetCum.add(ad);
                }

                // Monthly Sets
                if (isTargetDueMonthly(sp.estimatedCompletionDate)) {
                    targetIpoSetMonth.add(sp.indigenousPeopleOrganization);
                    if (ad) targetAdSetMonth.add(ad);
                }
                if (sp.status === 'Completed' && isTargetDueMonthly(sp.actualCompletionDate)) {
                    actualIpoSetMonth.add(sp.indigenousPeopleOrganization);
                    if (ad) actualAdSetMonth.add(ad);
                }
            });

            spProvisions.push(createRow(pkg, "Project", targetCountMonth, actualCountMonth, targetCountCum, actualCountCum));
        });

        // Add Aggregate Rows for Subprojects
        spProvisions.unshift(createRow("Number of IPOs", "Number", targetIpoSetMonth.size, actualIpoSetMonth.size, targetIpoSetCum.size, actualIpoSetCum.size));
        spProvisions.unshift(createRow("Number of Ancestral Domains", "Number", targetAdSetMonth.size, actualAdSetMonth.size, targetAdSetCum.size, actualAdSetCum.size));

        // --- 2. Trainings/Activities ---
        const processActivity = (act: any) => {
            const tMonth = isTargetDueMonthly(act.date) ? 1 : 0;
            const tCum = isTargetDueCumulative(act.date) ? 1 : 0;
            const aMonth = (act.actualDate && isTargetDueMonthly(act.actualDate)) ? 1 : 0;
            const aCum = (act.actualDate && isTargetDueCumulative(act.actualDate)) ? 1 : 0;
            
            const item = createRow(act.name, 'Number', tMonth, aMonth, tCum, aCum);
            
            // Cost Aggregation
            const cost = act.expenses.reduce((sum: number, e: any) => sum + e.amount, 0);

            if (act.component === 'Production and Livelihood') {
                if (!structure['Production and Livelihood'].packages['Trainings']) structure['Production and Livelihood'].packages['Trainings'] = [];
                addItem(structure['Production and Livelihood'].packages['Trainings'], item);
                structure['Production and Livelihood'].cost += cost;
            } else if (act.component === 'Program Management') {
                addItem(structure['Program Management'].packages['Activities'], item);
                structure['Program Management'].cost += cost;
            } else if (structure[act.component]) {
                addItem(structure[act.component].items || structure[act.component], item); // Handle generic list
                structure[act.component].cost += cost;
            }
        };
        data.trainings.forEach(processActivity);
        data.otherActivities.forEach(processActivity);

        // --- 3. PM Items ---
        const processPM = (items: any[], typeKey: string, isStaff = false) => {
            items.forEach(pm => {
                const targetQty = isStaff ? 1 : (pm.numberOfUnits || 1);
                const tMonth = isTargetDueMonthly(pm.obligationDate) ? targetQty : 0;
                const tCum = isTargetDueCumulative(pm.obligationDate) ? targetQty : 0;
                
                const actDate = pm.actualDate || pm.actualObligationDate;
                const aMonth = (actDate && isTargetDueMonthly(actDate)) ? targetQty : 0;
                const aCum = (actDate && isTargetDueCumulative(actDate)) ? targetQty : 0;
                
                const indicator = isStaff ? pm.personnelPosition : (pm.equipment || pm.particulars);
                const unit = isStaff ? 'Pax' : 'Unit';
                const item = createRow(indicator, unit, tMonth, aMonth, tCum, aCum);
                
                addItem(structure['Program Management'].packages[typeKey], item);

                // Cost
                const cost = isStaff ? pm.annualSalary : (pm.amount || (pm.pricePerUnit * pm.numberOfUnits));
                structure['Program Management'].cost += cost;
            });
        };
        processPM(data.staffingReqs, 'Staffing', true);
        processPM(data.officeReqs, 'Office');
        // Other Expenses - Add to cost but maybe not physical count unless defined
        data.otherProgramExpenses.forEach(ope => {
             structure['Program Management'].cost += ope.amount;
        });

        return structure;
    }, [data, selectedYear, selectedMonth]);


    // --- TABLE 2: Financial History (unchanged logic) ---
    const financialHistoryData = useMemo(() => {
        if (!isYearSelected) return [];

        const reportDateLimit = new Date(targetYearInt, selectedMonth + 1, 0);

        interface RowData {
            label: string;
            sortOrder: number;
            alloc: number;
            obli: number;
            disb: number;
        }
        
        const rowMap = new Map<string, RowData>();
        const prevYear = targetYearInt - 1;

        // Initialize Template Rows to ensure they appear
        rowMap.set('current', {
            label: `Current Year (${targetYearInt})`,
            sortOrder: targetYearInt,
            alloc: 0, obli: 0, disb: 0
        });

        rowMap.set('prev_continuing', {
            label: `Continuing (${prevYear})`,
            sortOrder: prevYear + 0.5,
            alloc: 0, obli: 0, disb: 0
        });

        rowMap.set('prev_other', {
            label: `${prevYear}`,
            sortOrder: prevYear,
            alloc: 0, obli: 0, disb: 0
        });

        const getRowInfo = (year: number, fundType: string): { key: string, label: string, sortOrder: number } | null => {
            if (year > targetYearInt) return null; 
            if (year === targetYearInt) {
                if (fundType === 'Current') {
                    return { key: 'current', label: `Current Year (${year})`, sortOrder: year };
                }
                return null; 
            } 
            if (year === prevYear) {
                if (fundType === 'Continuing') {
                    return { key: 'prev_continuing', label: `Continuing (${year})`, sortOrder: year + 0.5 };
                } else {
                    return { key: 'prev_other', label: `${year}`, sortOrder: year };
                }
            } 
            if (year < prevYear) {
                return { key: `hist_${year}`, label: `${year}`, sortOrder: year };
            }
            return null;
        };

        const isDateInReportWindow = (dateStr?: string) => {
            if (!dateStr) return false;
            const d = new Date(dateStr);
            return d <= reportDateLimit;
        };

        const aggregate = (year: number, fundType: string, alloc: number, obli: number, disb: number) => {
            if (!year) return;
            const info = getRowInfo(year, fundType || 'Current');
            if (!info) return;

            if (!rowMap.has(info.key)) {
                rowMap.set(info.key, {
                    label: info.label,
                    sortOrder: info.sortOrder,
                    alloc: 0,
                    obli: 0,
                    disb: 0
                });
            }
            const entry = rowMap.get(info.key)!;
            entry.alloc += alloc;
            entry.obli += obli;
            entry.disb += disb;
        };

        financialData.subprojects.forEach(sp => {
            const y = sp.fundingYear || 0;
            const ft = sp.fundType || 'Current';
            const alloc = sp.details.reduce((s, d) => s + (d.pricePerUnit * d.numberOfUnits), 0);
            const obli = sp.details.reduce((s, d) => s + (isDateInReportWindow(d.actualObligationDate) ? (d.actualObligationAmount || 0) : 0), 0);
            const disb = sp.details.reduce((s, d) => s + (isDateInReportWindow(d.actualDisbursementDate) ? (d.actualDisbursementAmount || d.actualAmount || 0) : 0), 0);
            aggregate(y, ft, alloc, obli, disb);
        });

        const processAct = (act: any) => {
            const y = act.fundingYear || 0;
            const ft = act.fundType || 'Current';
            const alloc = act.expenses.reduce((s:number, e:any) => s + e.amount, 0);
            const obli = act.expenses.reduce((s:number, e:any) => s + (isDateInReportWindow(e.actualObligationDate) ? (e.actualObligationAmount || 0) : 0), 0);
            const disb = act.expenses.reduce((s:number, e:any) => s + (isDateInReportWindow(e.actualDisbursementDate) ? (e.actualDisbursementAmount || 0) : 0), 0);
            aggregate(y, ft, alloc, obli, disb);
        };
        financialData.trainings.forEach(processAct);
        financialData.otherActivities.forEach(processAct);

        const processPM = (item: any, isStaff = false) => {
            const y = item.fundYear || 0;
            const ft = item.fundType || 'Current';
            const alloc = isStaff ? item.annualSalary : (item.amount || (item.pricePerUnit * item.numberOfUnits));
            const obli = isDateInReportWindow(item.actualObligationDate) ? (item.actualObligationAmount || 0) : 0;
            let disb = 0;
            if (isStaff || item.particulars) {
                 if (y === targetYearInt) {
                     const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                     months.forEach((m, idx) => {
                         if (idx <= selectedMonth) disb += (Number(item[`actualDisbursement${m}`]) || 0);
                     });
                 } else if (y < targetYearInt) {
                     disb = item.actualDisbursementAmount || 0;
                 }
            } else {
                disb = isDateInReportWindow(item.actualDisbursementDate) ? (item.actualDisbursementAmount || 0) : 0;
            }
            aggregate(y, ft, alloc, obli, disb);
        };
        
        financialData.staffingReqs.forEach(s => processPM(s, true));
        financialData.officeReqs.forEach(s => processPM(s));
        financialData.otherProgramExpenses.forEach(s => processPM(s));

        const rows = Array.from(rowMap.entries()).map(([key, row]) => {
            const alloc = Math.ceil(row.alloc);
            const obli = Math.ceil(row.obli);
            const disb = Math.ceil(row.disb);
            const unutilized = alloc - obli;
            const unpaid = obli - disb;
            const obliRate = alloc > 0 ? (obli / alloc) * 100 : 0;
            const disbRate = obli > 0 ? (disb / obli) * 100 : 0;

            return {
                key,
                ...row,
                alloc, obli, disb, unutilized, unpaid, obliRate, disbRate
            };
        });

        return rows.sort((a, b) => a.sortOrder - b.sortOrder);
    }, [financialData, selectedYear, selectedMonth, targetYearInt]);

    const financialGrandTotal = useMemo(() => {
        return financialHistoryData.reduce((acc, row) => ({
            alloc: acc.alloc + row.alloc,
            obli: acc.obli + row.obli,
            disb: acc.disb + row.disb,
            unutilized: acc.unutilized + row.unutilized,
            unpaid: acc.unpaid + row.unpaid
        }), { alloc: 0, obli: 0, disb: 0, unutilized: 0, unpaid: 0 });
    }, [financialHistoryData]);

    const handlePrint = () => window.print();

    const handleDownload = () => {
        const wb = XLSX.utils.book_new();

        // 1. Physical Sheet
        const physRows: any[][] = [
            [`Monthly Report - Physical Accomplishment (CY ${selectedYear} - ${MONTHS[selectedMonth].label})`],
            [],
            ["Component / Indicator", "Cost", "Unit", 
             "For the Month", "", "", "", 
             "Cumulative (Year-to-Date)", "", "", ""],
            ["", "", "", "Target", "Actual", "Var", "%", "Target", "Actual", "Var", "%"]
        ];
        
        const processPhysItems = (items: any[], indent: string) => {
            items.forEach(item => {
                physRows.push([
                    indent + item.indicator, 
                    null, // No cost for items, only components
                    item.unit, 
                    item.targetMonth, item.actualMonth, item.varianceMonth, item.percentageMonth/100,
                    item.targetCum, item.actualCum, item.varianceCum, item.percentageCum/100
                ]);
            });
        };

        Object.entries(physicalData).forEach(([key, val]: [string, any]) => {
            // Add Component Row with Cost
            physRows.push([key, val.cost, null, null, null, null, null, null, null, null, null]);
            
            if (Array.isArray(val)) {
                 // Should be array of items if not nested
                 processPhysItems(val, "  ");
            } else if (val.isNested) {
                Object.entries(val.packages).forEach(([pkg, items]: [string, any]) => {
                    if (items.length > 0) {
                        physRows.push([`  ${pkg}`, null, null, null, null, null, null, null, null, null, null]);
                        processPhysItems(items, "    ");
                    }
                });
            } else if (val.items) {
                 processPhysItems(val.items, "  ");
            }
        });
        
        const wsPhys = XLSX.utils.aoa_to_sheet(physRows);

        // Merges for Physical Sheet
        wsPhys['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } }, // Title
            { s: { r: 2, c: 0 }, e: { r: 3, c: 0 } }, // Component / Indicator
            { s: { r: 2, c: 1 }, e: { r: 3, c: 1 } }, // Cost
            { s: { r: 2, c: 2 }, e: { r: 3, c: 2 } }, // Unit
            { s: { r: 2, c: 3 }, e: { r: 2, c: 6 } }, // For the Month
            { s: { r: 2, c: 7 }, e: { r: 2, c: 10 } }, // Cumulative
        ];

        // Column Widths
        wsPhys['!cols'] = [
            { wch: 40 }, // Component / Indicator
            { wch: 15 }, // Cost
            { wch: 10 }, // Unit
            { wch: 10 }, // Target
            { wch: 10 }, // Actual
            { wch: 10 }, // Var
            { wch: 10 }, // %
            { wch: 10 }, // Target
            { wch: 10 }, // Actual
            { wch: 10 }, // Var
            { wch: 10 }  // %
        ];

        // Format Cells
        const rangePhys = XLSX.utils.decode_range(wsPhys['!ref'] || "A1:K1");
        for (let R = 4; R <= rangePhys.e.r; ++R) {
            const costCell = wsPhys[XLSX.utils.encode_cell({ r: R, c: 1 })];
            if (costCell && typeof costCell.v === 'number') costCell.z = '"₱"#,##0.00';

            const pctMonthCell = wsPhys[XLSX.utils.encode_cell({ r: R, c: 6 })];
            if (pctMonthCell && typeof pctMonthCell.v === 'number') pctMonthCell.z = '0%';

            const pctCumCell = wsPhys[XLSX.utils.encode_cell({ r: R, c: 10 })];
            if (pctCumCell && typeof pctCumCell.v === 'number') pctCumCell.z = '0%';
        }

        XLSX.utils.book_append_sheet(wb, wsPhys, "Physical");

        // 2. Financial Sheet
        const finRows: any[][] = [
            [`Monthly Report - Financial Accomplishment (Absolute Value) (CY ${selectedYear} - ${MONTHS[selectedMonth].label})`],
            [],
            ["Fund Source", "Allocation", "Obligation", "Disbursement", "Obligation Rate", "Disbursement Rate", "Unutilized", "Unpaid"]
        ];
        financialHistoryData.forEach(row => {
            finRows.push([
                row.label, row.alloc, row.obli, row.disb, row.obliRate/100, row.disbRate/100, row.unutilized, row.unpaid
            ]);
        });

        if (financialHistoryData.length > 0) {
            const obliRateTotal = financialGrandTotal.alloc > 0 ? (financialGrandTotal.obli / financialGrandTotal.alloc) : 0;
            const disbRateTotal = financialGrandTotal.obli > 0 ? (financialGrandTotal.disb / financialGrandTotal.obli) : 0;
            finRows.push([
                "Grand Total", financialGrandTotal.alloc, financialGrandTotal.obli, financialGrandTotal.disb, 
                obliRateTotal, disbRateTotal, financialGrandTotal.unutilized, financialGrandTotal.unpaid
            ]);
        }

        const wsFin = XLSX.utils.aoa_to_sheet(finRows);

        // Merges for Financial Sheet
        wsFin['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } } // Title
        ];

        // Column Widths
        wsFin['!cols'] = [
            { wch: 30 }, // Fund Source
            { wch: 15 }, // Allocation
            { wch: 15 }, // Obligation
            { wch: 15 }, // Disbursement
            { wch: 15 }, // Obligation Rate
            { wch: 15 }, // Disbursement Rate
            { wch: 15 }, // Unutilized
            { wch: 15 }  // Unpaid
        ];

        // Format Cells
        const rangeFin = XLSX.utils.decode_range(wsFin['!ref'] || "A1:H1");
        for (let R = 3; R <= rangeFin.e.r; ++R) {
            for (let C of [1, 2, 3, 6, 7]) { // Currency columns
                const cell = wsFin[XLSX.utils.encode_cell({ r: R, c: C })];
                if (cell && typeof cell.v === 'number') cell.z = '"₱"#,##0.00';
            }
            for (let C of [4, 5]) { // Percentage columns
                const cell = wsFin[XLSX.utils.encode_cell({ r: R, c: C })];
                if (cell && typeof cell.v === 'number') cell.z = '0.0%';
            }
        }

        XLSX.utils.book_append_sheet(wb, wsFin, "Financial");

        XLSX.writeFile(wb, `Monthly_Report_${selectedYear}_${MONTHS[selectedMonth].label}.xlsx`);
    };

    const renderPhysRow = (item: any, idx: string, level: number) => {
        const indent = level === 0 ? '' : level === 1 ? 'pl-6' : 'pl-10';
        return (
            <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <td className={`${textCellClass} ${indent} font-medium`}>{item.indicator}</td>
                <td className={`${dataCellClass} text-center`}></td>
                <td className={`${dataCellClass} text-center`}>{item.unit}</td>
                
                {/* Monthly */}
                <td className={`${dataCellClass} text-center bg-blue-50 dark:bg-blue-900/10`}>{item.targetMonth}</td>
                <td className={`${dataCellClass} text-center bg-blue-50 dark:bg-blue-900/10`}>{item.actualMonth}</td>
                <td className={`${dataCellClass} text-center bg-blue-50 dark:bg-blue-900/10 ${item.varianceMonth > 0 ? 'text-red-500' : 'text-green-500'}`}>{item.varianceMonth}</td>
                <td className={`${dataCellClass} text-center bg-blue-50 dark:bg-blue-900/10`}>{item.percentageMonth.toFixed(0)}%</td>

                {/* Cumulative */}
                <td className={`${dataCellClass} text-center`}>{item.targetCum}</td>
                <td className={`${dataCellClass} text-center`}>{item.actualCum}</td>
                <td className={`${dataCellClass} text-center ${item.varianceCum > 0 ? 'text-red-500' : 'text-green-500'}`}>{item.varianceCum}</td>
                <td className={`${dataCellClass} text-center`}>{item.percentageCum.toFixed(0)}%</td>
            </tr>
        );
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md space-y-8">
            <div className="flex flex-wrap justify-between items-center mb-6 print-hidden">
                <h3 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    Monthly Report
                    {selectedYear === 'All' && <span className="text-xs font-normal text-red-500 bg-red-100 px-2 py-0.5 rounded ml-2">Select a Year</span>}
                </h3>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Month:</label>
                        <select 
                            value={selectedMonth} 
                            onChange={(e) => setSelectedMonth(Number(e.target.value))} 
                            className="p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm bg-white dark:bg-gray-700 dark:text-white"
                        >
                            {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                    </div>
                    <button onClick={handlePrint} className="px-4 py-2 bg-gray-500 text-white rounded-md text-sm">Print</button>
                    <button onClick={handleDownload} className="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm">Download</button>
                </div>
            </div>

            {/* Table 1: Physical */}
            <div>
                <h4 className="text-lg font-bold text-emerald-800 dark:text-emerald-400 mb-2 border-b border-emerald-200 dark:border-emerald-800 pb-2">
                    Table 1: Physical Accomplishment (CY {selectedYear})
                </h4>
                <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse">
                        <thead className="bg-emerald-100 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100 text-xs font-bold uppercase">
                            <tr>
                                <th rowSpan={2} className="p-2 border border-emerald-200 dark:border-emerald-700 text-left w-1/4">Component / Indicator</th>
                                <th rowSpan={2} className="p-2 border border-emerald-200 dark:border-emerald-700 text-center">Cost</th>
                                <th rowSpan={2} className="p-2 border border-emerald-200 dark:border-emerald-700 text-center">Unit</th>
                                <th colSpan={4} className="p-2 border border-emerald-200 dark:border-emerald-700 text-center bg-blue-100 dark:bg-blue-900/40">For the Month</th>
                                <th colSpan={4} className="p-2 border border-emerald-200 dark:border-emerald-700 text-center">Cumulative (Year-to-Date)</th>
                            </tr>
                            <tr>
                                {/* For the Month */}
                                <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-center bg-blue-50 dark:bg-blue-900/20">Target</th>
                                <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-center bg-blue-50 dark:bg-blue-900/20">Actual</th>
                                <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-center bg-blue-50 dark:bg-blue-900/20">Var</th>
                                <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-center bg-blue-50 dark:bg-blue-900/20">%</th>
                                {/* Cumulative */}
                                <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-center">Target</th>
                                <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-center">Actual</th>
                                <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-center">Var</th>
                                <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-center">%</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm">
                            {Object.entries(physicalData).map(([key, val]: [string, any]) => {
                                 const isExpanded = expandedRows.has(key);
                                 return (
                                    <React.Fragment key={key}>
                                         <tr onClick={() => toggleRow(key)} className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer font-bold">
                                             <td className="p-2 border border-gray-300 dark:border-gray-600 flex items-center gap-2">
                                                <span className="inline-block w-5 text-center text-gray-500 dark:text-gray-400">{isExpanded ? '−' : '+'}</span>
                                                {key}
                                             </td>
                                             <td className="p-2 border border-gray-300 dark:border-gray-600 text-right">{formatCurrencyWhole(val.cost)}</td>
                                             <td colSpan={9} className="border border-gray-300 dark:border-gray-600"></td>
                                         </tr>
                                         {isExpanded && Array.isArray(val) && val.map((item, idx) => renderPhysRow(item, `${key}-${idx}`, 1))}
                                         {isExpanded && val.isNested && Object.entries(val.packages).map(([pkg, pkgItems]: [string, any]) => (
                                             <React.Fragment key={`${key}-${pkg}`}>
                                                 {pkgItems.length > 0 && (
                                                     <>
                                                        <tr className="bg-gray-50 dark:bg-gray-800 font-semibold">
                                                            <td className="p-2 pl-6 border border-gray-300 dark:border-gray-600">{pkg}</td>
                                                            <td colSpan={10} className="border border-gray-300 dark:border-gray-600"></td>
                                                        </tr>
                                                        {pkgItems.map((item: any, idx: number) => renderPhysRow(item, `${key}-${pkg}-${idx}`, 2))}
                                                     </>
                                                 )}
                                             </React.Fragment>
                                         ))}
                                         {isExpanded && val.items && val.items.map((item: any, idx: number) => renderPhysRow(item, `${key}-${idx}`, 1))}
                                    </React.Fragment>
                                 )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Table 2: Financial */}
            <div>
                <h4 className="text-lg font-bold text-blue-800 dark:text-blue-400 mb-2 border-b border-blue-200 dark:border-blue-800 pb-2">
                    Table 2: Financial Accomplishment (Absolute Value)
                </h4>
                <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse">
                        <thead className="bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 text-xs font-bold uppercase">
                            <tr>
                                <th className="p-2 border border-blue-200 dark:border-blue-700 text-left">Fund Source</th>
                                <th className="p-2 border border-blue-200 dark:border-blue-700 text-right">Allocation</th>
                                <th className="p-2 border border-blue-200 dark:border-blue-700 text-right">Obligation</th>
                                <th className="p-2 border border-blue-200 dark:border-blue-700 text-right">Disbursement</th>
                                <th className="p-2 border border-blue-200 dark:border-blue-700 text-center">Obligation Rate</th>
                                <th className="p-2 border border-blue-200 dark:border-blue-700 text-center">Disbursement Rate</th>
                                <th className="p-2 border border-blue-200 dark:border-blue-700 text-right">Unutilized</th>
                                <th className="p-2 border border-blue-200 dark:border-blue-700 text-right">Unpaid</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm">
                            {financialHistoryData.map((row) => (
                                <tr key={row.key} className="hover:bg-blue-50 dark:hover:bg-blue-900/10">
                                    <td className="p-2 border border-gray-300 dark:border-gray-600 font-bold">{row.label}</td>
                                    <td className={dataCellClass}>{formatCurrencyWhole(row.alloc)}</td>
                                    <td className={dataCellClass}>{formatCurrencyWhole(row.obli)}</td>
                                    <td className={dataCellClass}>{formatCurrencyWhole(row.disb)}</td>
                                    <td className={`${dataCellClass} text-center`}>{row.obliRate.toFixed(1)}%</td>
                                    <td className={`${dataCellClass} text-center`}>{row.disbRate.toFixed(1)}%</td>
                                    <td className={dataCellClass}>{formatCurrencyWhole(row.unutilized)}</td>
                                    <td className={dataCellClass}>{formatCurrencyWhole(row.unpaid)}</td>
                                </tr>
                            ))}
                            {financialHistoryData.length > 0 && (
                                <tr className="bg-blue-100 dark:bg-blue-900/30 font-bold border-t-2 border-blue-300">
                                    <td className="p-2 border border-gray-300 dark:border-gray-600">Grand Total</td>
                                    <td className={dataCellClass}>{formatCurrencyWhole(financialGrandTotal.alloc)}</td>
                                    <td className={dataCellClass}>{formatCurrencyWhole(financialGrandTotal.obli)}</td>
                                    <td className={dataCellClass}>{formatCurrencyWhole(financialGrandTotal.disb)}</td>
                                    <td className={`${dataCellClass} text-center`}>
                                        {(financialGrandTotal.alloc > 0 ? (financialGrandTotal.obli / financialGrandTotal.alloc * 100) : 0).toFixed(1)}%
                                    </td>
                                    <td className={`${dataCellClass} text-center`}>
                                        {(financialGrandTotal.obli > 0 ? (financialGrandTotal.disb / financialGrandTotal.obli * 100) : 0).toFixed(1)}%
                                    </td>
                                    <td className={dataCellClass}>{formatCurrencyWhole(financialGrandTotal.unutilized)}</td>
                                    <td className={dataCellClass}>{formatCurrencyWhole(financialGrandTotal.unpaid)}</td>
                                </tr>
                            )}
                            {financialHistoryData.length === 0 && (
                                <tr><td colSpan={8} className="p-4 text-center text-gray-500 italic">No financial data available.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            
             <div className="mt-4 text-xs text-gray-500 italic">
                * Physical Actuals are based on items completed on or before the selected month of the selected year. <br/>
                * Financial Actuals (Obligation/Disbursement) are sums of transactions recorded on or before the selected month for the specific Fund Year rows.
            </div>
        </div>
    );
};

export default MonthlyReportMatrix;
