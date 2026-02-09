
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
        // Date check helper
        const reportDate = new Date(targetYearInt, selectedMonth + 1, 0);

        const isTargetDue = (dateStr?: string) => {
            if (!dateStr || !isYearSelected) return false; 
            const d = new Date(dateStr);
            // Check if date is within the selected year AND on/before selected month
            return d.getFullYear() === targetYearInt && d.getMonth() <= selectedMonth;
        };

        const createRow = (indicator: string, unit: string, targetQty: number, actualQty: number) => {
            const variance = targetQty - actualQty;
            const percentage = targetQty > 0 ? (actualQty / targetQty) * 100 : 0;
            return { indicator, unit, target: targetQty, actual: actualQty, variance, percentage };
        };

        const structure: { [key: string]: any } = {
            'Social Preparation': [],
            'Production and Livelihood': { isNested: true, packages: {} },
            'Marketing and Enterprise': [],
            'Program Management': { isNested: true, packages: { 'Staffing': [], 'Office': [], 'Activities': [] } }
        };

        const addItem = (list: any[], item: any) => {
            const existing = list.find((i: any) => i.indicator === item.indicator);
            if (existing) {
                existing.target += item.target;
                existing.actual += item.actual;
                existing.variance = existing.target - existing.actual;
                existing.percentage = existing.target > 0 ? (existing.actual / existing.target) * 100 : 0;
            } else {
                list.push(item);
            }
        };

        // 1. Subprojects Logic
        const packages: Record<string, Subproject[]> = {};
        const ipoAdMap = new Map<string, string>();
        data.ipos.forEach(i => ipoAdMap.set(i.name, i.ancestralDomainNo));

        data.subprojects.forEach(sp => {
            const pkg = sp.packageType || 'Other';
            if (!packages[pkg]) packages[pkg] = [];
            packages[pkg].push(sp);
        });

        if (!structure['Production and Livelihood'].packages['Subproject Provisions']) {
            structure['Production and Livelihood'].packages['Subproject Provisions'] = [];
        }
        const spProvisions = structure['Production and Livelihood'].packages['Subproject Provisions'];

        const targetIpoSet = new Set<string>();
        const actualIpoSet = new Set<string>();
        const targetAdSet = new Set<string>();
        const actualAdSet = new Set<string>();

        Object.keys(packages).sort().forEach(pkg => {
            const subList = packages[pkg];
            const targetCount = subList.filter(sp => isTargetDue(sp.estimatedCompletionDate)).length;
            const actualCount = subList.filter(sp => {
                 if (sp.status !== 'Completed') return false;
                 if (!sp.actualCompletionDate) return false;
                 const d = new Date(sp.actualCompletionDate);
                 return d <= reportDate;
            }).length;

            subList.forEach(sp => {
                const ad = ipoAdMap.get(sp.indigenousPeopleOrganization);
                if (isTargetDue(sp.estimatedCompletionDate)) {
                    targetIpoSet.add(sp.indigenousPeopleOrganization);
                    if (ad) targetAdSet.add(ad);
                }
                if (sp.status === 'Completed' && sp.actualCompletionDate && new Date(sp.actualCompletionDate) <= reportDate) {
                    actualIpoSet.add(sp.indigenousPeopleOrganization);
                    if (ad) actualAdSet.add(ad);
                }
            });

            spProvisions.push(createRow(pkg, "Project", targetCount, actualCount));
        });

        spProvisions.unshift(createRow("Number of IPOs", "Number", targetIpoSet.size, actualIpoSet.size));
        spProvisions.unshift(createRow("Number of Ancestral Domains", "Number", targetAdSet.size, actualAdSet.size));

        // 2. Trainings/Activities
        const processActivity = (act: any) => {
            const targetQty = isTargetDue(act.date) ? 1 : 0;
            const actualQty = (act.actualDate && new Date(act.actualDate) <= reportDate) ? 1 : 0;
            const item = createRow(act.name, 'Number', targetQty, actualQty);
            
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

        // 3. PM Items
        const processPM = (items: any[], typeKey: string, isStaff = false) => {
            items.forEach(pm => {
                const targetQty = isTargetDue(pm.obligationDate) ? (isStaff ? 1 : pm.numberOfUnits) : 0;
                const actDate = pm.actualDate || pm.actualObligationDate;
                const actualQty = (actDate && new Date(actDate) <= reportDate) ? (isStaff ? 1 : pm.numberOfUnits) : 0;
                const indicator = isStaff ? pm.personnelPosition : (pm.equipment || pm.particulars);
                const unit = isStaff ? 'Pax' : 'Unit';
                const item = createRow(indicator, unit, targetQty, actualQty);
                addItem(structure['Program Management'].packages[typeKey], item);
            });
        };
        processPM(data.staffingReqs, 'Staffing', true);
        processPM(data.officeReqs, 'Office');

        return structure;
    }, [data, selectedYear, selectedMonth]);


    // --- TABLE 2: Financial History ---
    const financialHistoryData = useMemo(() => {
        if (!isYearSelected) return [];

        const reportDateLimit = new Date(targetYearInt, selectedMonth + 1, 0);

        // Key: "year|fundType"
        const groupingMap = new Map<string, { year: number, fundType: string, alloc: number, obli: number, disb: number }>();
        
        const isDateInReportWindow = (dateStr?: string) => {
            if (!dateStr) return false;
            const d = new Date(dateStr);
            return d <= reportDateLimit;
        };

        const addToGroup = (year: number, fundType: string, alloc: number, obli: number, disb: number) => {
            if (!year) return;
            const ft = fundType || 'Current';
            const key = `${year}|${ft}`;
            
            if (!groupingMap.has(key)) groupingMap.set(key, { year, fundType: ft, alloc: 0, obli: 0, disb: 0 });
            const entry = groupingMap.get(key)!;
            // Round Up (Ceil)
            entry.alloc += alloc;
            entry.obli += obli;
            entry.disb += disb;
        };

        // 1. Subprojects
        financialData.subprojects.forEach(sp => {
            const y = sp.fundingYear || 0;
            const ft = sp.fundType || 'Current';
            const alloc = sp.details.reduce((s, d) => s + (d.pricePerUnit * d.numberOfUnits), 0);
            const obli = sp.details.reduce((s, d) => s + (isDateInReportWindow(d.actualObligationDate) ? (d.actualObligationAmount || 0) : 0), 0);
            const disb = sp.details.reduce((s, d) => s + (isDateInReportWindow(d.actualDisbursementDate) ? (d.actualDisbursementAmount || 0) : 0), 0);
            addToGroup(y, ft, alloc, obli, disb);
        });

        // 2. Activities
        const processAct = (act: any) => {
            const y = act.fundingYear || 0;
            const ft = act.fundType || 'Current';
            const alloc = act.expenses.reduce((s:number, e:any) => s + e.amount, 0);
            const obli = act.expenses.reduce((s:number, e:any) => s + (isDateInReportWindow(e.actualObligationDate) ? (e.actualObligationAmount || 0) : 0), 0);
            const disb = act.expenses.reduce((s:number, e:any) => s + (isDateInReportWindow(e.actualDisbursementDate) ? (e.actualDisbursementAmount || 0) : 0), 0);
            addToGroup(y, ft, alloc, obli, disb);
        };
        financialData.trainings.forEach(processAct);
        financialData.otherActivities.forEach(processAct);

        // 3. PM Items
        const processPM = (item: any, isStaff = false) => {
            const y = item.fundYear || 0;
            const ft = item.fundType || 'Current';
            const alloc = isStaff ? item.annualSalary : (item.amount || (item.pricePerUnit * item.numberOfUnits));
            const obli = isDateInReportWindow(item.actualObligationDate) ? (item.actualObligationAmount || 0) : 0;
            
            let disb = 0;
            if (isStaff || item.particulars) {
                if (y < targetYearInt) {
                    disb = item.actualDisbursementAmount || 0;
                } else if (y === targetYearInt) {
                     const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                     months.forEach((m, idx) => {
                         if (idx <= selectedMonth) disb += (item[`actualDisbursement${m}`] || 0);
                     });
                }
            } else {
                disb = isDateInReportWindow(item.actualDisbursementDate) ? (item.actualDisbursementAmount || 0) : 0;
            }
            addToGroup(y, ft, alloc, obli, disb);
        };
        financialData.staffingReqs.forEach(s => processPM(s, true));
        financialData.officeReqs.forEach(s => processPM(s));
        financialData.otherProgramExpenses.forEach(s => processPM(s));

        // Transform and Label
        const rows = Array.from(groupingMap.values()).map(row => {
            // Round Up Amounts
            const alloc = Math.ceil(row.alloc);
            const obli = Math.ceil(row.obli);
            const disb = Math.ceil(row.disb);
            const unutilized = alloc - obli;
            const unpaid = obli - disb;
            const obliRate = alloc > 0 ? (obli / alloc) * 100 : 0;
            const disbRate = obli > 0 ? (disb / obli) * 100 : 0;

            let label = `${row.year}`;
            // If Year is current selected year
            if (row.year === targetYearInt) {
                if (row.fundType === 'Current') label = `Current Year (${row.year})`;
                else label = `${row.fundType} (${row.year})`;
            } 
            // If Year is previous year
            else if (row.year === targetYearInt - 1) {
                if (row.fundType === 'Continuing') label = `Continuing (${row.year})`;
                else if (row.fundType === 'Current') label = `${row.year}`; // Historical
                else label = `${row.year} (${row.fundType})`;
            }
            // Older years
            else {
                 label = `${row.year}`;
                 if (row.fundType !== 'Current') label += ` (${row.fundType})`;
            }

            return {
                ...row,
                label,
                alloc, obli, disb, unutilized, unpaid, obliRate, disbRate
            };
        });

        // Sort: Year Descending. 
        // Logic: 
        // 1. Current Year (2027)
        // 2. Continuing (2026)
        // 3. Historical Descending
        
        return rows.sort((a, b) => {
            // Primary: Year Descending
            if (b.year !== a.year) return b.year - a.year;
            
            // Secondary: If same year (e.g. 2026 has both Current and Continuing)
            // Continuing should come before Current for the previous year context if it exists
            // Or prioritize 'Continuing' generally for visibility
            if (a.fundType === 'Continuing' && b.fundType !== 'Continuing') return -1;
            if (b.fundType === 'Continuing' && a.fundType !== 'Continuing') return 1;
            
            // Prioritize Current over others if not Continuing
            if (a.fundType === 'Current' && b.fundType !== 'Current') return -1;
            if (b.fundType === 'Current' && a.fundType !== 'Current') return 1;
            
            return 0;
        });

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
        const physRows: any[][] = [["Indicator", "Unit", "Target (Cumulative)", "Actual (Cumulative)", "Variance", "Percentage"]];
        const processPhysItems = (items: any[], indent: string) => {
            items.forEach(item => {
                physRows.push([
                    indent + item.indicator, item.unit, item.target, item.actual, item.variance, item.percentage/100
                ]);
            });
        };
        Object.entries(physicalData).forEach(([key, val]: [string, any]) => {
            physRows.push([key, null, null, null, null, null]);
            if (Array.isArray(val)) {
                processPhysItems(val, "  ");
            } else if (val.isNested) {
                Object.entries(val.packages).forEach(([pkg, items]: [string, any]) => {
                    if (items.length > 0) {
                        physRows.push([`  ${pkg}`, null, null, null, null, null]);
                        processPhysItems(items, "    ");
                    }
                });
            }
        });
        const wsPhys = XLSX.utils.aoa_to_sheet(physRows);
        XLSX.utils.book_append_sheet(wb, wsPhys, "Physical");

        // 2. Financial Sheet
        const finRows: any[][] = [["Fund Source", "Allocation", "Obligation", "Disbursement", "Obligation Rate", "Disbursement Rate", "Unutilized", "Unpaid"]];
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
        XLSX.utils.book_append_sheet(wb, wsFin, "Financial");

        XLSX.writeFile(wb, `Monthly_Report_${selectedYear}_${MONTHS[selectedMonth].label}.xlsx`);
    };

    const renderPhysRow = (item: any, idx: string, level: number) => {
        const indent = level === 0 ? '' : level === 1 ? 'pl-6' : 'pl-10';
        return (
            <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <td className={`${textCellClass} ${indent} font-medium`}>{item.indicator}</td>
                <td className={`${dataCellClass} text-center`}>{item.unit}</td>
                <td className={`${dataCellClass} text-center`}>{item.target}</td>
                <td className={`${dataCellClass} text-center`}>{item.actual}</td>
                <td className={`${dataCellClass} text-center ${item.variance > 0 ? 'text-red-500' : 'text-green-500'}`}>{item.variance}</td>
                <td className={`${dataCellClass} text-center`}>{item.percentage.toFixed(1)}%</td>
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
                                <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-left w-1/3">Component / Indicator</th>
                                <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-center">Unit</th>
                                <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-center">Target (Cumulative)</th>
                                <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-center">Actual (Cumulative)</th>
                                <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-center">Variance</th>
                                <th className="p-2 border border-emerald-200 dark:border-emerald-700 text-center">Percentage</th>
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
                                             <td colSpan={5} className="border border-gray-300 dark:border-gray-600"></td>
                                         </tr>
                                         {isExpanded && Array.isArray(val) && val.map((item, idx) => renderPhysRow(item, `${key}-${idx}`, 1))}
                                         {isExpanded && val.isNested && Object.entries(val.packages).map(([pkg, pkgItems]: [string, any]) => (
                                             <React.Fragment key={`${key}-${pkg}`}>
                                                 {pkgItems.length > 0 && (
                                                     <>
                                                        <tr className="bg-gray-50 dark:bg-gray-800 font-semibold">
                                                            <td className="p-2 pl-6 border border-gray-300 dark:border-gray-600" colSpan={6}>{pkg}</td>
                                                        </tr>
                                                        {pkgItems.map((item: any, idx: number) => renderPhysRow(item, `${key}-${pkg}-${idx}`, 2))}
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
                                <tr key={`${row.year}-${row.fundType}`} className="hover:bg-blue-50 dark:hover:bg-blue-900/10">
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
