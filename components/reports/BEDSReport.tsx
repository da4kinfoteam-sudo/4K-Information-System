
// Author: 4K 
import React, { useMemo, useState, useRef } from 'react';
import { Subproject, Training, OtherActivity, OfficeRequirement, StaffingRequirement, OtherProgramExpense } from '../../constants';
import { formatCurrency, getObjectTypeByCode, XLSX } from './ReportUtils';

interface BEDSReportProps {
    data: {
        subprojects: Subproject[];
        trainings: Training[];
        otherActivities: OtherActivity[];
        officeReqs: OfficeRequirement[];
        staffingReqs: StaffingRequirement[];
        otherProgramExpenses: OtherProgramExpense[];
    };
    uacsCodes: any;
    selectedYear: string;
    selectedOu: string;
    selectedFundType: string;
    selectedTier: string;
}

// Helper to round UP to whole number and format
const formatCurrencyWhole = (amount: number) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.ceil(amount));
};

// Helper for physical counts (just formatting, but ensuring whole numbers)
const formatNumberWhole = (num: number) => {
    return Math.ceil(num).toLocaleString('en-US');
};

const BEDSReport: React.FC<BEDSReportProps> = ({ data, uacsCodes, selectedYear, selectedOu, selectedFundType, selectedTier }) => {
    const [expandedRows, setExpandedRows] = useState(new Set<string>());
    const [printTarget, setPrintTarget] = useState<string | null>(null);
    
    const toggleRow = (key: string) => {
        setExpandedRows(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) newSet.delete(key); else newSet.add(key);
            return newSet;
        });
    };

    const indentClasses: { [key: number]: string } = { 0: '', 1: 'pl-6', 2: 'pl-10', 3: 'pl-14' };
    const dataCellClass = "p-1 border border-gray-300 dark:border-gray-600";

    const isYearSelected = selectedYear !== 'All';
    const targetYear = parseInt(selectedYear);

    // --- Helpers ---
    const checkYear = (dateStr?: string) => {
        if (!dateStr || !isYearSelected) return false;
        const d = new Date(dateStr + 'T00:00:00Z');
        return d.getFullYear() === targetYear;
    };

    const getMonthIndex = (dateStr?: string): number => {
        if (!dateStr || !isYearSelected) return -1;
        const d = new Date(dateStr + 'T00:00:00Z');
        if (d.getFullYear() !== targetYear) return -1;
        return d.getUTCMonth(); // 0-11
    };

    // --- BED 1 Data Processing (Financial Plans - Obligation) ---
    const bed1Data = useMemo(() => {
        const prevYear = targetYear - 1;

        const checkDateRange = (dateStr: string | undefined, year: number, startMonth: number, endMonth: number) => {
            if (!dateStr || !isYearSelected) return false;
            const d = new Date(dateStr + 'T00:00:00Z');
            return d.getFullYear() === year && d.getUTCMonth() >= startMonth && d.getUTCMonth() <= endMonth;
        };

        const getQuarter = (dateStr: string | undefined): number => {
            if (!dateStr || !isYearSelected) return 0;
            const d = new Date(dateStr + 'T00:00:00Z');
            if (d.getFullYear() !== targetYear) return 0;
            const month = d.getUTCMonth();
            return Math.floor(month / 3) + 1;
        };

        const finalData: { [key: string]: any } = {
            'Social Preparation': [],
            'Production and Livelihood': { isNestedExpandable: true, packages: {} },
            'Marketing and Enterprise': [], 
            'Program Management': { isNestedExpandable: true, packages: { 'Staff Requirements': { items: [] }, 'Office Requirements': { items: [] }, 'Activities': { items: [] } } }
        };

        // Aggregation Helper for BED 1
        const addItem = (targetList: any[], newItem: any) => {
            const existing = targetList.find(i => i.indicator === newItem.indicator);
            if (existing) {
                existing.janSeptActual += newItem.janSeptActual;
                existing.octDecEstimate += newItem.octDecEstimate;
                existing.prevTotal += newItem.prevTotal;
                existing.currTotal += newItem.currTotal;
                existing.compQ1 += newItem.compQ1;
                existing.compQ2 += newItem.compQ2;
                existing.compQ3 += newItem.compQ3;
                existing.compQ4 += newItem.compQ4;
                existing.compSubtotal += newItem.compSubtotal;
                existing.laterQ1 += newItem.laterQ1;
                existing.laterQ2 += newItem.laterQ2;
                existing.laterQ3 += newItem.laterQ3;
                existing.laterQ4 += newItem.laterQ4;
                existing.laterSubtotal += newItem.laterSubtotal;
            } else {
                targetList.push(newItem);
            }
        };

        const getCompReleaseValues = (details: any[], dateField: string, amountField: string) => {
            const result = { q1: 0, q2: 0, q3: 0, q4: 0, subtotal: 0 };
            if (!isYearSelected) return result;

            details.forEach(d => {
                const date = d[dateField];
                // Handle various amount fields logic
                let amount = 0;
                if (d[amountField]) amount = d[amountField];
                else if (d.pricePerUnit && d.numberOfUnits) amount = d.pricePerUnit * d.numberOfUnits;
                
                const q = getQuarter(date);
                if (q === 1) result.q1 += amount;
                else if (q === 2) result.q2 += amount;
                else if (q === 3) result.q3 += amount;
                else if (q === 4) result.q4 += amount;
            });
            result.subtotal = result.q1 + result.q2 + result.q3 + result.q4;
            return result;
        };

        const createItem = (indicator: string, rowItem: any, details: any[], dateField: string, amountField: string) => {
            // Filter details for aggregation? No, the rowItem is already filtered in parent loop
            const compRelease = getCompReleaseValues(details, dateField, amountField);
            const laterRelease = { q1: 0, q2: 0, q3: 0, q4: 0, subtotal: 0 }; // Placeholder
            
            return {
                indicator,
                janSeptActual: 0, // Placeholder
                octDecEstimate: 0, // Placeholder
                prevTotal: 0,
                currTotal: compRelease.subtotal + laterRelease.subtotal,
                compQ1: compRelease.q1, compQ2: compRelease.q2, compQ3: compRelease.q3, compQ4: compRelease.q4, compSubtotal: compRelease.subtotal,
                laterQ1: laterRelease.q1, laterQ2: laterRelease.q2, laterQ3: laterRelease.q3, laterQ4: laterRelease.q4, laterSubtotal: laterRelease.subtotal,
            };
        };

        // Filter and Process
        const filterItem = (item: any) => {
            if (!isYearSelected) return false;
            const year = item.fundingYear || item.fundYear;
            if (year !== targetYear) return false;
            if (selectedOu !== 'All' && item.operatingUnit !== selectedOu) return false;
            if (selectedFundType !== 'All' && item.fundType !== selectedFundType) return false;
            if (selectedTier !== 'All' && item.tier !== selectedTier) return false;
            return true;
        };

        data.subprojects.filter(filterItem).forEach(sp => {
            const item = createItem(sp.name, sp, sp.details, 'obligationMonth', ''); // details calculation inside helper handles unit*price
            const pkg = sp.packageType;
            if (!finalData['Production and Livelihood'].packages[pkg]) finalData['Production and Livelihood'].packages[pkg] = { items: [] };
            addItem(finalData['Production and Livelihood'].packages[pkg].items, item);
        });

        data.trainings.filter(filterItem).forEach(t => {
            const item = createItem(t.name, t, t.expenses, 'obligationMonth', 'amount');
            if (t.component === 'Production and Livelihood') {
                 if (!finalData['Production and Livelihood'].packages['Trainings']) finalData['Production and Livelihood'].packages['Trainings'] = { items: [] };
                 addItem(finalData['Production and Livelihood'].packages['Trainings'].items, item);
            } else if (t.component === 'Program Management') {
                 // Removed Trainings from Program Management as per request
            } else if (finalData[t.component]) {
                addItem(finalData[t.component], item);
            }
        });

        data.otherActivities.filter(filterItem).forEach(oa => {
            const item = createItem(oa.name, oa, oa.expenses, 'obligationMonth', 'amount');
            if (oa.component === 'Program Management') addItem(finalData['Program Management'].packages['Activities'].items, item);
            else if (finalData[oa.component]) addItem(finalData[oa.component], item);
        });

        const processPm = (items: any[], pkgKey: string) => {
            items.filter(filterItem).forEach(pm => {
                const indicator = pm.personnelPosition || pm.equipment || pm.particulars;
                // Treat PM item as its own detail for calculation
                const amount = pm.annualSalary || pm.amount || (pm.pricePerUnit * pm.numberOfUnits);
                const detailLike = { ...pm, amount }; 
                const item = createItem(indicator, pm, [detailLike], 'obligationDate', 'amount');
                addItem(finalData['Program Management'].packages[pkgKey].items, item);
            });
        }
        processPm(data.staffingReqs, 'Staff Requirements');
        processPm(data.officeReqs, 'Office Requirements');
        processPm(data.otherProgramExpenses, 'Office Requirements');

        return finalData;
    }, [data, selectedYear, selectedOu, selectedFundType, selectedTier, isYearSelected, targetYear]);


    // --- BED 2 & 3 Data Processing (Monthly) ---
    const getMonthlyData = (type: 'Physical' | 'Disbursement') => {
        const finalData: { [key: string]: any } = {
            'Social Preparation': [],
            'Production and Livelihood': { isNestedExpandable: true, packages: {} },
            'Marketing and Enterprise': [], 
            'Program Management': { isNestedExpandable: true, packages: { 'Staff Requirements': { items: [] }, 'Office Requirements': { items: [] }, 'Activities': { items: [] } } }
        };

        const initializeMonths = () => ({
            m1: 0, m2: 0, m3: 0, q1: 0,
            m4: 0, m5: 0, m6: 0, q2: 0,
            m7: 0, m8: 0, m9: 0, q3: 0,
            m10: 0, m11: 0, m12: 0, q4: 0,
            total: 0
        });

        // Aggregation Helper for BED 2/3
        const addMonthlyItem = (targetList: any[], newItem: any) => {
            const existing = targetList.find(i => i.indicator === newItem.indicator);
            if (existing) {
                for (let i = 1; i <= 12; i++) {
                    existing[`m${i}`] += newItem[`m${i}`];
                }
                existing.q1 += newItem.q1;
                existing.q2 += newItem.q2;
                existing.q3 += newItem.q3;
                existing.q4 += newItem.q4;
                existing.total += newItem.total;
            } else {
                targetList.push(newItem);
            }
        };

        const addToMonths = (target: any, dateStr: string | undefined, amount: number) => {
            const idx = getMonthIndex(dateStr);
            if (idx !== -1) {
                target[`m${idx + 1}`] += amount;
                if (idx < 3) target.q1 += amount;
                else if (idx < 6) target.q2 += amount;
                else if (idx < 9) target.q3 += amount;
                else target.q4 += amount;
                target.total += amount;
            }
        };

        const filterItem = (item: any) => {
            if (!isYearSelected) return false;
            const year = item.fundingYear || item.fundYear;
            if (year !== targetYear) return false;
            if (selectedOu !== 'All' && item.operatingUnit !== selectedOu) return false;
            if (selectedFundType !== 'All' && item.fundType !== selectedFundType) return false;
            if (selectedTier !== 'All' && item.tier !== selectedTier) return false;
            return true;
        };

        // Subprojects
        data.subprojects.filter(filterItem).forEach(sp => {
            const vals = initializeMonths();
            if (type === 'Physical') {
                addToMonths(vals, sp.estimatedCompletionDate, 1);
            } else {
                sp.details.forEach(d => {
                    const amount = d.pricePerUnit * d.numberOfUnits;
                    addToMonths(vals, d.disbursementMonth, amount);
                });
            }
            const item = { indicator: sp.name, ...vals };
            const pkg = sp.packageType;
            if (!finalData['Production and Livelihood'].packages[pkg]) finalData['Production and Livelihood'].packages[pkg] = { items: [] };
            addMonthlyItem(finalData['Production and Livelihood'].packages[pkg].items, item);
        });

        // Trainings
        data.trainings.filter(filterItem).forEach(t => {
            const vals = initializeMonths();
            if (type === 'Physical') {
                addToMonths(vals, t.date, 1);
            } else {
                t.expenses.forEach(e => {
                    addToMonths(vals, e.disbursementMonth, e.amount);
                });
            }
            const item = { indicator: t.name, ...vals };
            if (t.component === 'Production and Livelihood') {
                 if (!finalData['Production and Livelihood'].packages['Trainings']) finalData['Production and Livelihood'].packages['Trainings'] = { items: [] };
                 addMonthlyItem(finalData['Production and Livelihood'].packages['Trainings'].items, item);
            } else if (t.component === 'Program Management') {
                 // Removed Trainings from Program Management as per request
            } else if (finalData[t.component]) {
                addMonthlyItem(finalData[t.component], item);
            }
        });

        // Activities
        data.otherActivities.filter(filterItem).forEach(oa => {
            const vals = initializeMonths();
            if (type === 'Physical') {
                addToMonths(vals, oa.date, 1);
            } else {
                oa.expenses.forEach(e => {
                    addToMonths(vals, e.disbursementMonth, e.amount);
                });
            }
            const item = { indicator: oa.name, ...vals };
            if (oa.component === 'Program Management') addMonthlyItem(finalData['Program Management'].packages['Activities'].items, item);
            else if (finalData[oa.component]) addMonthlyItem(finalData[oa.component], item);
        });

        // PM Items
        const processPm = (items: any[], pkgKey: string, isStaff = false, isOtherExpense = false) => {
            items.filter(filterItem).forEach(pm => {
                // If generating Physical report (BED 2) and item is Other Expense, skip it.
                if (type === 'Physical' && isOtherExpense) return;

                const vals = initializeMonths();
                const indicator = isStaff ? pm.personnelPosition : (pm.equipment || pm.particulars);

                if (type === 'Disbursement' && (isStaff || isOtherExpense)) {
                    // Use Monthly Breakdown for Staffing and Other Expenses in BED 3
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    months.forEach((m, index) => {
                        const amount = Number(pm[`disbursement${m}`]) || 0;
                        if (amount > 0) {
                            const idx = index + 1;
                            vals[`m${idx}`] += amount;
                            
                            if (idx <= 3) vals.q1 += amount;
                            else if (idx <= 6) vals.q2 += amount;
                            else if (idx <= 9) vals.q3 += amount;
                            else vals.q4 += amount;
                            
                            vals.total += amount;
                        }
                    });
                } else {
                    // Standard logic for Physical Targets or Office Equipment (Non-staggered disbursement assumption or missing breakdown)
                    const date = type === 'Physical' ? pm.obligationDate : pm.disbursementDate; 
                    let amount = 0;
                    if (type === 'Physical') {
                        amount = isStaff ? 1 : (pm.numberOfUnits || 1);
                    } else {
                        amount = isStaff ? pm.annualSalary : (pm.amount || (pm.pricePerUnit * pm.numberOfUnits));
                    }
                    addToMonths(vals, date, amount);
                }
                
                addMonthlyItem(finalData['Program Management'].packages[pkgKey].items, { indicator, ...vals });
            });
        };
        processPm(data.staffingReqs, 'Staff Requirements', true);
        processPm(data.officeReqs, 'Office Requirements');
        processPm(data.otherProgramExpenses, 'Office Requirements', false, true);

        return finalData;
    };

    const bed2Data = useMemo(() => getMonthlyData('Physical'), [data, selectedYear, selectedOu, selectedFundType, selectedTier, isYearSelected, targetYear]);
    const bed3Data = useMemo(() => getMonthlyData('Disbursement'), [data, selectedYear, selectedOu, selectedFundType, selectedTier, isYearSelected, targetYear]);

    // --- Render Logic ---

    // BED 1 Render Logic
    const renderBed1Totals = (items: any[], label: string) => {
        const totals = items.reduce((acc, item) => ({
            currTotal: acc.currTotal + (item.currTotal || 0),
            compQ1: acc.compQ1 + (item.compQ1 || 0),
            compQ2: acc.compQ2 + (item.compQ2 || 0),
            compQ3: acc.compQ3 + (item.compQ3 || 0),
            compQ4: acc.compQ4 + (item.compQ4 || 0),
            compSubtotal: acc.compSubtotal + (item.compSubtotal || 0),
            // ... prev/later fields if needed
        }), { currTotal: 0, compQ1: 0, compQ2: 0, compQ3: 0, compQ4: 0, compSubtotal: 0 });

        return (
            <tr className="font-bold bg-gray-200 dark:bg-gray-700 text-xs">
                <td className={`${dataCellClass} sticky left-0 bg-gray-200 dark:bg-gray-700 z-10`}>{label}</td>
                <td className={`${dataCellClass} text-center`}></td>
                <td className={`${dataCellClass} text-right`}></td>
                <td className={`${dataCellClass} text-right`}></td>
                <td className={`${dataCellClass} text-right`}></td>
                <td className={`${dataCellClass} text-right bg-emerald-50 dark:bg-emerald-900/20`}>{totals.currTotal > 0 ? formatCurrencyWhole(totals.currTotal) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.compQ1 > 0 ? formatCurrencyWhole(totals.compQ1) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.compQ2 > 0 ? formatCurrencyWhole(totals.compQ2) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.compQ3 > 0 ? formatCurrencyWhole(totals.compQ3) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.compQ4 > 0 ? formatCurrencyWhole(totals.compQ4) : ''}</td>
                <td className={`${dataCellClass} text-right font-semibold`}>{totals.compSubtotal > 0 ? formatCurrencyWhole(totals.compSubtotal) : ''}</td>
                <td colSpan={5} className={`${dataCellClass}`}></td>
            </tr>
        );
    };

    // BED 2 & 3 Monthly Render Logic
    const renderMonthlyTotals = (items: any[], label: string, bedType: 'BED2' | 'BED3') => {
        const totals = items.reduce((acc, item) => {
            for(let i=1; i<=12; i++) acc[`m${i}`] += (item[`m${i}`] || 0);
            acc.q1 += (item.q1 || 0); acc.q2 += (item.q2 || 0); acc.q3 += (item.q3 || 0); acc.q4 += (item.q4 || 0);
            acc.total += (item.total || 0);
            return acc;
        }, { m1:0, m2:0, m3:0, q1:0, m4:0, m5:0, m6:0, q2:0, m7:0, m8:0, m9:0, q3:0, m10:0, m11:0, m12:0, q4:0, total:0 });

        const fmt = (val: number) => bedType === 'BED2' ? (val > 0 ? formatNumberWhole(val) : '') : (val > 0 ? formatCurrencyWhole(val) : '');

        return (
            <tr className="font-bold bg-gray-200 dark:bg-gray-700 text-xs">
                <td className={`${dataCellClass} sticky left-0 bg-gray-200 dark:bg-gray-700 z-10`}>{label}</td>
                <td className={`${dataCellClass} text-right`}>{fmt(totals.m1)}</td>
                <td className={`${dataCellClass} text-right`}>{fmt(totals.m2)}</td>
                <td className={`${dataCellClass} text-right`}>{fmt(totals.m3)}</td>
                <td className={`${dataCellClass} text-right bg-gray-300 dark:bg-gray-600`}>{fmt(totals.q1)}</td>
                <td className={`${dataCellClass} text-right`}>{fmt(totals.m4)}</td>
                <td className={`${dataCellClass} text-right`}>{fmt(totals.m5)}</td>
                <td className={`${dataCellClass} text-right`}>{fmt(totals.m6)}</td>
                <td className={`${dataCellClass} text-right bg-gray-300 dark:bg-gray-600`}>{fmt(totals.q2)}</td>
                <td className={`${dataCellClass} text-right`}>{fmt(totals.m7)}</td>
                <td className={`${dataCellClass} text-right`}>{fmt(totals.m8)}</td>
                <td className={`${dataCellClass} text-right`}>{fmt(totals.m9)}</td>
                <td className={`${dataCellClass} text-right bg-gray-300 dark:bg-gray-600`}>{fmt(totals.q3)}</td>
                <td className={`${dataCellClass} text-right`}>{fmt(totals.m10)}</td>
                <td className={`${dataCellClass} text-right`}>{fmt(totals.m11)}</td>
                <td className={`${dataCellClass} text-right`}>{fmt(totals.m12)}</td>
                <td className={`${dataCellClass} text-right bg-gray-300 dark:bg-gray-600`}>{fmt(totals.q4)}</td>
                <td className={`${dataCellClass} text-right bg-emerald-100 dark:bg-emerald-900`}>{fmt(totals.total)}</td>
            </tr>
        );
    };

    const renderData = (rowsData: any, bedType: 'BED1' | 'BED2' | 'BED3') => {
        const renderRow = bedType === 'BED1' ? (item: any, key: string, level: number) => (
            <tr key={key}>
                <td className={`${dataCellClass} ${indentClasses[level]} sticky left-0 bg-white dark:bg-gray-800 z-10`}>{item.indicator}</td>
                <td className={`${dataCellClass} text-center`}></td>
                <td colSpan={3} className={dataCellClass}></td>
                <td className={`${dataCellClass} text-right bg-emerald-50 dark:bg-emerald-900/20`}>{item.currTotal > 0 ? formatCurrencyWhole(item.currTotal) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{item.compQ1 > 0 ? formatCurrencyWhole(item.compQ1) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{item.compQ2 > 0 ? formatCurrencyWhole(item.compQ2) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{item.compQ3 > 0 ? formatCurrencyWhole(item.compQ3) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{item.compQ4 > 0 ? formatCurrencyWhole(item.compQ4) : ''}</td>
                <td className={`${dataCellClass} text-right font-semibold`}>{item.compSubtotal > 0 ? formatCurrencyWhole(item.compSubtotal) : ''}</td>
                <td colSpan={5} className={dataCellClass}></td>
            </tr>
        ) : (item: any, key: string, level: number) => {
            const fmt = (val: number) => bedType === 'BED2' ? (val > 0 ? formatNumberWhole(val) : '') : (val > 0 ? formatCurrencyWhole(val) : '');
            return (
                <tr key={key}>
                    <td className={`${dataCellClass} ${indentClasses[level]} sticky left-0 bg-white dark:bg-gray-800 z-10`}>{item.indicator}</td>
                    <td className={`${dataCellClass} text-right`}>{fmt(item.m1)}</td>
                    <td className={`${dataCellClass} text-right`}>{fmt(item.m2)}</td>
                    <td className={`${dataCellClass} text-right`}>{fmt(item.m3)}</td>
                    <td className={`${dataCellClass} text-right bg-gray-50 dark:bg-gray-700/50`}>{fmt(item.q1)}</td>
                    <td className={`${dataCellClass} text-right`}>{fmt(item.m4)}</td>
                    <td className={`${dataCellClass} text-right`}>{fmt(item.m5)}</td>
                    <td className={`${dataCellClass} text-right`}>{fmt(item.m6)}</td>
                    <td className={`${dataCellClass} text-right bg-gray-50 dark:bg-gray-700/50`}>{fmt(item.q2)}</td>
                    <td className={`${dataCellClass} text-right`}>{fmt(item.m7)}</td>
                    <td className={`${dataCellClass} text-right`}>{fmt(item.m8)}</td>
                    <td className={`${dataCellClass} text-right`}>{fmt(item.m9)}</td>
                    <td className={`${dataCellClass} text-right bg-gray-50 dark:bg-gray-700/50`}>{fmt(item.q3)}</td>
                    <td className={`${dataCellClass} text-right`}>{fmt(item.m10)}</td>
                    <td className={`${dataCellClass} text-right`}>{fmt(item.m11)}</td>
                    <td className={`${dataCellClass} text-right`}>{fmt(item.m12)}</td>
                    <td className={`${dataCellClass} text-right bg-gray-50 dark:bg-gray-700/50`}>{fmt(item.q4)}</td>
                    <td className={`${dataCellClass} text-right font-semibold`}>{fmt(item.total)}</td>
                </tr>
            );
        };

        const renderSummary = (items: any[], label: string, rowKey: string, level: number) => {
            if (bedType === 'BED1') {
                // Reuse total logic for summary row but formatted
                const totals = items.reduce((acc, item) => ({
                    currTotal: acc.currTotal + (item.currTotal || 0),
                    compQ1: acc.compQ1 + (item.compQ1 || 0),
                    compQ2: acc.compQ2 + (item.compQ2 || 0),
                    compQ3: acc.compQ3 + (item.compQ3 || 0),
                    compQ4: acc.compQ4 + (item.compQ4 || 0),
                    compSubtotal: acc.compSubtotal + (item.compSubtotal || 0),
                }), { currTotal: 0, compQ1: 0, compQ2: 0, compQ3: 0, compQ4: 0, compSubtotal: 0 });
                
                const isExpanded = expandedRows.has(rowKey);
                
                return (
                    <tr onClick={() => toggleRow(rowKey)} className="font-bold bg-gray-100 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer text-xs">
                        <td className={`${dataCellClass} ${indentClasses[level]} sticky left-0 bg-gray-100 dark:bg-gray-700 z-10`}>
                            <span className="inline-block w-5 text-center text-gray-500 dark:text-gray-400">{isExpanded ? '−' : '+'}</span> {label}
                        </td>
                        <td className={`${dataCellClass}`}></td>
                        <td colSpan={3} className={dataCellClass}></td>
                        <td className={`${dataCellClass} text-right bg-emerald-50 dark:bg-emerald-900/20`}>{totals.currTotal > 0 ? formatCurrencyWhole(totals.currTotal) : ''}</td>
                        <td className={`${dataCellClass} text-right`}>{totals.compQ1 > 0 ? formatCurrencyWhole(totals.compQ1) : ''}</td>
                        <td className={`${dataCellClass} text-right`}>{totals.compQ2 > 0 ? formatCurrencyWhole(totals.compQ2) : ''}</td>
                        <td className={`${dataCellClass} text-right`}>{totals.compQ3 > 0 ? formatCurrencyWhole(totals.compQ3) : ''}</td>
                        <td className={`${dataCellClass} text-right`}>{totals.compQ4 > 0 ? formatCurrencyWhole(totals.compQ4) : ''}</td>
                        <td className={`${dataCellClass} text-right`}>{totals.compSubtotal > 0 ? formatCurrencyWhole(totals.compSubtotal) : ''}</td>
                        <td colSpan={5} className={dataCellClass}></td>
                    </tr>
                )
            } else {
                const totals = items.reduce((acc, item) => {
                    for(let i=1; i<=12; i++) acc[`m${i}`] += (item[`m${i}`] || 0);
                    acc.q1 += (item.q1 || 0); acc.q2 += (item.q2 || 0); acc.q3 += (item.q3 || 0); acc.q4 += (item.q4 || 0);
                    acc.total += (item.total || 0);
                    return acc;
                }, { m1:0, m2:0, m3:0, q1:0, m4:0, m5:0, m6:0, q2:0, m7:0, m8:0, m9:0, q3:0, m10:0, m11:0, m12:0, q4:0, total:0 });
                const isExpanded = expandedRows.has(rowKey);
                const fmt = (val: number) => bedType === 'BED2' ? (val > 0 ? formatNumberWhole(val) : '') : (val > 0 ? formatCurrencyWhole(val) : '');

                return (
                    <tr onClick={() => toggleRow(rowKey)} className="font-bold bg-gray-100 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer text-xs">
                        <td className={`${dataCellClass} ${indentClasses[level]} sticky left-0 bg-gray-100 dark:bg-gray-700 z-10`}>
                            <span className="inline-block w-5 text-center text-gray-500 dark:text-gray-400">{isExpanded ? '−' : '+'}</span> {label}
                        </td>
                        <td className={`${dataCellClass} text-right`}>{fmt(totals.m1)}</td>
                        <td className={`${dataCellClass} text-right`}>{fmt(totals.m2)}</td>
                        <td className={`${dataCellClass} text-right`}>{fmt(totals.m3)}</td>
                        <td className={`${dataCellClass} text-right bg-gray-200 dark:bg-gray-700`}>{fmt(totals.q1)}</td>
                        <td className={`${dataCellClass} text-right`}>{fmt(totals.m4)}</td>
                        <td className={`${dataCellClass} text-right`}>{fmt(totals.m5)}</td>
                        <td className={`${dataCellClass} text-right`}>{fmt(totals.m6)}</td>
                        <td className={`${dataCellClass} text-right bg-gray-200 dark:bg-gray-700`}>{fmt(totals.q2)}</td>
                        <td className={`${dataCellClass} text-right`}>{fmt(totals.m7)}</td>
                        <td className={`${dataCellClass} text-right`}>{fmt(totals.m8)}</td>
                        <td className={`${dataCellClass} text-right`}>{fmt(totals.m9)}</td>
                        <td className={`${dataCellClass} text-right bg-gray-200 dark:bg-gray-700`}>{fmt(totals.q3)}</td>
                        <td className={`${dataCellClass} text-right`}>{fmt(totals.m10)}</td>
                        <td className={`${dataCellClass} text-right`}>{fmt(totals.m11)}</td>
                        <td className={`${dataCellClass} text-right`}>{fmt(totals.m12)}</td>
                        <td className={`${dataCellClass} text-right bg-gray-200 dark:bg-gray-700`}>{fmt(totals.q4)}</td>
                        <td className={`${dataCellClass} text-right font-semibold`}>{fmt(totals.total)}</td>
                    </tr>
                );
            }
        }

        return Object.entries(rowsData).map(([key, cd]) => {
            const componentData = cd as any;
            if (Array.isArray(componentData)) {
                return (
                    <React.Fragment key={key}>
                        {renderSummary(componentData, key, key, 0)}
                        {expandedRows.has(key) && componentData.map((item: any, index: number) => renderRow(item, `${key}-${index}`, 1))}
                    </React.Fragment>
                );
            }
            if (componentData.isNestedExpandable) {
                const allPackageItems = Object.values(componentData.packages).flatMap((pkg: any) => pkg.items);
                return (
                    <React.Fragment key={key}>
                        {renderSummary(allPackageItems, key, key, 0)}
                        {expandedRows.has(key) && Object.entries(componentData.packages).map(([packageName, packageData]: [string, any]) => (
                            <React.Fragment key={packageName}>
                                {renderSummary(packageData.items, packageName, packageName, 1)}
                                {expandedRows.has(packageName) && packageData.items.map((item: any, index: number) => renderRow(item, `${packageName}-${index}`, 2))}
                            </React.Fragment>
                        ))}
                    </React.Fragment>
                );
            }
            return null;
        });
    };

    // Generic grand total calculator
    const getGrandTotals = (dataSet: any) => {
        return Object.values(dataSet).flatMap((component: any) => {
            if (Array.isArray(component)) return component;
            if (component.isExpandable) return component.items;
            if (component.isNestedExpandable) return (Object.values(component.packages) as any[]).flatMap((pkg: any) => pkg.items);
            return [];
        });
    }

    const handlePrintSpecificTable = (id: string) => {
        // Trigger style injection for this specific table
        setPrintTarget(id);
        
        // Timeout to allow state update and DOM to render the style block, then print
        setTimeout(() => {
            window.print();
            // Reset after print dialog closes (or immediately, as print pauses execution in most browsers)
            // Note: In Chrome/Safari, execution pauses. In Firefox, it might not.
            // A small delay or checking `onafterprint` is safer, but basic reset works for now.
        }, 100);
    };

    // Listen for print completion to clear state
    React.useEffect(() => {
        const handleAfterPrint = () => {
            setPrintTarget(null);
        };
        window.addEventListener('afterprint', handleAfterPrint);
        return () => window.removeEventListener('afterprint', handleAfterPrint);
    }, []);

    const handleDownloadBEDSXlsx = () => {
        const wb = XLSX.utils.book_new();

        // --- BED 1 Sheet ---
        const bed1Header1 = [
            "Program/Activity/Project", 
            "Performance Indicator", 
            "Current Year Obligation", null, null,
            "Comprehensive Release", null, null, null, null,
            "For Later Release", null, null, null, null
        ];
        const bed1Header2 = [
            null, null,
            "Actual (Jan-Sept)", "Estimate (Oct-Dec)", "Total Target",
            "Q1", "Q2", "Q3", "Q4", "Subtotal",
            "Q1", "Q2", "Q3", "Q4", "Subtotal"
        ];

        const bed1Rows: any[][] = [bed1Header1, bed1Header2];

        const processBed1Items = (items: any[], indent: string) => {
            items.forEach(item => {
                bed1Rows.push([
                    indent + item.indicator,
                    "", // Indicator column usually empty for P/A/P or reused
                    Math.ceil(item.janSeptActual || 0),
                    Math.ceil(item.octDecEstimate || 0),
                    Math.ceil(item.currTotal || 0),
                    Math.ceil(item.compQ1 || 0), Math.ceil(item.compQ2 || 0), Math.ceil(item.compQ3 || 0), Math.ceil(item.compQ4 || 0), Math.ceil(item.compSubtotal || 0),
                    Math.ceil(item.laterQ1 || 0), Math.ceil(item.laterQ2 || 0), Math.ceil(item.laterQ3 || 0), Math.ceil(item.laterQ4 || 0), Math.ceil(item.laterSubtotal || 0)
                ]);
            });
        };

        const addBed1SummaryRow = (label: string, items: any[]) => {
             const totals = items.reduce((acc, item) => ({
                currTotal: acc.currTotal + (item.currTotal || 0),
                compQ1: acc.compQ1 + (item.compQ1 || 0),
                compQ2: acc.compQ2 + (item.compQ2 || 0),
                compQ3: acc.compQ3 + (item.compQ3 || 0),
                compQ4: acc.compQ4 + (item.compQ4 || 0),
                compSubtotal: acc.compSubtotal + (item.compSubtotal || 0),
                laterQ1: acc.laterQ1 + (item.laterQ1 || 0),
                laterQ2: acc.laterQ2 + (item.laterQ2 || 0),
                laterQ3: acc.laterQ3 + (item.laterQ3 || 0),
                laterQ4: acc.laterQ4 + (item.laterQ4 || 0),
                laterSubtotal: acc.laterSubtotal + (item.laterSubtotal || 0),
                janSeptActual: acc.janSeptActual + (item.janSeptActual || 0),
                octDecEstimate: acc.octDecEstimate + (item.octDecEstimate || 0)
            }), { currTotal: 0, compQ1: 0, compQ2: 0, compQ3: 0, compQ4: 0, compSubtotal: 0, laterQ1:0, laterQ2:0, laterQ3:0, laterQ4:0, laterSubtotal:0, janSeptActual:0, octDecEstimate:0 });

            bed1Rows.push([
                label, "Total",
                Math.ceil(totals.janSeptActual), Math.ceil(totals.octDecEstimate), Math.ceil(totals.currTotal),
                Math.ceil(totals.compQ1), Math.ceil(totals.compQ2), Math.ceil(totals.compQ3), Math.ceil(totals.compQ4), Math.ceil(totals.compSubtotal),
                Math.ceil(totals.laterQ1), Math.ceil(totals.laterQ2), Math.ceil(totals.laterQ3), Math.ceil(totals.laterQ4), Math.ceil(totals.laterSubtotal)
            ]);
        }

        Object.entries(bed1Data).forEach(([key, val]: [string, any]) => {
            if (Array.isArray(val)) {
                if (val.length > 0) {
                    addBed1SummaryRow(key, val);
                    processBed1Items(val, "  ");
                } else {
                    bed1Rows.push([key, "No items"]);
                }
            } else if (val.isNestedExpandable) {
                const allItems = Object.values(val.packages).flatMap((p: any) => p.items);
                if (allItems.length > 0) {
                    addBed1SummaryRow(key, allItems);
                    Object.entries(val.packages).forEach(([pkgName, pkgData]: [string, any]) => {
                        if (pkgData.items.length > 0) {
                            addBed1SummaryRow(`  ${pkgName}`, pkgData.items);
                            processBed1Items(pkgData.items, "    ");
                        }
                    });
                } else {
                    bed1Rows.push([key, "No items"]);
                }
            }
        });

        // Grand Total BED 1
        const grandTotals1 = getGrandTotals(bed1Data);
        addBed1SummaryRow("GRAND TOTAL", grandTotals1);

        const ws1 = XLSX.utils.aoa_to_sheet(bed1Rows);
        // Merges for BED 1 Header
        if(!ws1['!merges']) ws1['!merges'] = [];
        ws1['!merges'].push({ s: {r:0, c:0}, e: {r:1, c:0} }); // PAP
        ws1['!merges'].push({ s: {r:0, c:1}, e: {r:1, c:1} }); // Indicator
        ws1['!merges'].push({ s: {r:0, c:2}, e: {r:0, c:4} }); // CY Obligation
        ws1['!merges'].push({ s: {r:0, c:5}, e: {r:0, c:9} }); // Comp Release
        ws1['!merges'].push({ s: {r:0, c:10}, e: {r:0, c:14} }); // Later Release

        XLSX.utils.book_append_sheet(wb, ws1, "BED 1");


        // --- Helper for BED 2 & 3 ---
        const generateMonthlySheet = (dataMap: any, sheetName: string) => {
            const header1 = [
                "Program/Activity/Project",
                "Quarter 1", null, null, null,
                "Quarter 2", null, null, null, null,
                "Quarter 3", null, null, null, null,
                "Quarter 4", null, null, null, null,
                "Grand Total"
            ];
            const header2 = [
                null,
                "Jan", "Feb", "Mar", "Total",
                "Apr", "May", "Jun", "Total",
                "Jul", "Aug", "Sep", "Total",
                "Oct", "Nov", "Dec", "Total",
                null
            ];
            
            const rows: any[][] = [header1, header2];

            const processItems = (items: any[], indent: string) => {
                items.forEach(item => {
                    rows.push([
                        indent + item.indicator,
                        Math.ceil(item.m1), Math.ceil(item.m2), Math.ceil(item.m3), Math.ceil(item.q1),
                        Math.ceil(item.m4), Math.ceil(item.m5), Math.ceil(item.m6), Math.ceil(item.q2),
                        Math.ceil(item.m7), Math.ceil(item.m8), Math.ceil(item.m9), Math.ceil(item.q3),
                        Math.ceil(item.m10), Math.ceil(item.m11), Math.ceil(item.m12), Math.ceil(item.q4),
                        Math.ceil(item.total)
                    ]);
                });
            };

            const addSummaryRow = (label: string, items: any[]) => {
                const t = items.reduce((acc, item) => {
                    for(let i=1; i<=12; i++) acc[`m${i}`] += (item[`m${i}`] || 0);
                    acc.q1 += (item.q1 || 0); acc.q2 += (item.q2 || 0); acc.q3 += (item.q3 || 0); acc.q4 += (item.q4 || 0);
                    acc.total += (item.total || 0);
                    return acc;
                }, { m1:0, m2:0, m3:0, q1:0, m4:0, m5:0, m6:0, q2:0, m7:0, m8:0, m9:0, q3:0, m10:0, m11:0, m12:0, q4:0, total:0 });

                rows.push([
                    label,
                    Math.ceil(t.m1), Math.ceil(t.m2), Math.ceil(t.m3), Math.ceil(t.q1),
                    Math.ceil(t.m4), Math.ceil(t.m5), Math.ceil(t.m6), Math.ceil(t.q2),
                    Math.ceil(t.m7), Math.ceil(t.m8), Math.ceil(t.m9), Math.ceil(t.q3),
                    Math.ceil(t.m10), Math.ceil(t.m11), Math.ceil(t.m12), Math.ceil(t.q4),
                    Math.ceil(t.total)
                ]);
            };

            Object.entries(dataMap).forEach(([key, val]: [string, any]) => {
                if (Array.isArray(val)) {
                    if (val.length > 0) {
                        addSummaryRow(key, val);
                        processItems(val, "  ");
                    } else {
                        rows.push([key, "No items"]);
                    }
                } else if (val.isNestedExpandable) {
                    const allItems = Object.values(val.packages).flatMap((p: any) => p.items);
                    if (allItems.length > 0) {
                        addSummaryRow(key, allItems);
                        Object.entries(val.packages).forEach(([pkgName, pkgData]: [string, any]) => {
                            if (pkgData.items.length > 0) {
                                addSummaryRow(`  ${pkgName}`, pkgData.items);
                                processItems(pkgData.items, "    ");
                            }
                        });
                    } else {
                        rows.push([key, "No items"]);
                    }
                }
            });

            // Grand Total
            const grandTotalItems = getGrandTotals(dataMap);
            addSummaryRow("GRAND TOTAL", grandTotalItems);

            const ws = XLSX.utils.aoa_to_sheet(rows);
            if(!ws['!merges']) ws['!merges'] = [];
            ws['!merges'].push({ s: {r:0, c:0}, e: {r:1, c:0} }); // PAP
            ws['!merges'].push({ s: {r:0, c:1}, e: {r:0, c:4} }); // Q1
            ws['!merges'].push({ s: {r:0, c:5}, e: {r:0, c:8} }); // Q2
            ws['!merges'].push({ s: {r:0, c:9}, e: {r:0, c:12} }); // Q3
            ws['!merges'].push({ s: {r:0, c:13}, e: {r:0, c:16} }); // Q4
            ws['!merges'].push({ s: {r:0, c:17}, e: {r:1, c:17} }); // Total

            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        };

        generateMonthlySheet(bed2Data, "BED 2");
        generateMonthlySheet(bed3Data, "BED 3");

        XLSX.writeFile(wb, `BEDS_Report_${selectedYear}_${selectedOu}.xlsx`);
    };

    const SectionHeaderTarget = ({ bgColor }: { bgColor: string }) => (
        <>
            <th colSpan={4} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>1st Quarter</th>
            <th colSpan={4} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>2nd Quarter</th>
            <th colSpan={4} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>3rd Quarter</th>
            <th colSpan={4} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>4th Quarter</th>
            <th rowSpan={2} className={`p-2 border border-gray-300 dark:border-gray-600 text-center align-middle font-bold ${bgColor} opacity-90`}>Grand Total</th>
        </>
    );

    const SectionHeaderActual = ({ bgColor }: { bgColor: string }) => (
        <>
            <th colSpan={5} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>1st Quarter</th>
            <th colSpan={5} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>2nd Quarter</th>
            <th colSpan={2} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>Semestral Total</th>
            <th colSpan={5} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>3rd Quarter</th>
            <th colSpan={2} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>As of September</th>
            <th colSpan={5} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>4th Quarter</th>
            <th colSpan={2} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>Year End (As of Nov)</th>
            <th colSpan={2} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>Grand Total</th>
        </>
    );

    const SubHeadersTarget = () => (
        <>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Jan</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Feb</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Mar</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Apr</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">May</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Jun</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Jul</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Aug</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Sep</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Oct</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Nov</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Dec</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
        </>
    );

    const SubHeadersActual = () => (
        <>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Jan</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Feb</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Mar</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[40px] italic text-[9px]">%</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Apr</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">May</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Jun</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[40px] italic text-[9px]">%</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[40px] italic text-[9px]">%</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Jul</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Aug</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Sep</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[40px] italic text-[9px]">%</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[40px] italic text-[9px]">%</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Oct</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Nov</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Dec</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[40px] italic text-[9px]">%</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[40px] italic text-[9px]">%</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[40px] italic text-[9px]">%</th>
        </>
    );

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            {/* Print Styles Injection */}
            {printTarget && (
                <style>{`
                    @media print {
                        body * {
                            visibility: hidden;
                        }
                        #${printTarget}, #${printTarget} * {
                            visibility: visible;
                        }
                        #${printTarget} {
                            position: absolute;
                            left: 0;
                            top: 0;
                            width: 100%;
                            padding: 0;
                            margin: 0;
                        }
                        @page {
                            size: landscape;
                            margin: 0.5cm;
                        }
                        button {
                            display: none !important;
                        }
                        /* Ensure text colors are dark for print */
                        .text-gray-500, .text-gray-400, .dark .text-gray-400 {
                            color: #333 !important;
                        }
                    }
                `}</style>
            )}

            <div className="flex justify-between items-center mb-4 print-hidden">
                <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Budget Execution Documents (BEDS)</h3>
                <div className="flex gap-2">
                    <button onClick={handleDownloadBEDSXlsx} className="px-4 py-2 bg-emerald-600 text-white rounded-md font-semibold hover:brightness-95 transition-all">Download XLSX</button>
                </div>
            </div>
            
            <div id="beds-report" className="space-y-8">
                {!isYearSelected && (
                    <div className="p-4 text-center text-red-500 bg-red-50 dark:bg-red-900/20 mb-2">
                        Please select a specific Year to view BED 2 and BED 3 data properly.
                    </div>
                )}
                
                {/* BED 1 Section */}
                <div id="bed1-table-container" className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                    <div className="p-4 bg-teal-50 dark:bg-teal-900/30 border-b border-gray-200 dark:border-gray-600 flex justify-between items-center">
                        <h4 className="font-bold text-lg text-teal-800 dark:text-teal-100">BED 1: Financial Plan (Obligation)</h4>
                        <button onClick={() => handlePrintSpecificTable('bed1-table-container')} className="px-3 py-1 bg-teal-600 text-white text-xs rounded hover:bg-teal-700">Print Table</button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse text-xs text-gray-900 dark:text-gray-200 whitespace-nowrap">
                            <thead className="bg-teal-200 dark:bg-teal-900 sticky top-0 z-10">
                                <tr>
                                    <th rowSpan={2} className="p-2 border border-gray-300 dark:border-gray-600 align-bottom min-w-[250px] sticky left-0 bg-teal-200 dark:bg-teal-900 z-20 text-left text-teal-900 dark:text-white">Program/Activity/Project</th>
                                    <th rowSpan={2} className="p-2 border border-gray-300 dark:border-gray-600 text-center align-middle min-w-[150px] text-teal-900 dark:text-white">Performance Indicator</th>
                                    <th colSpan={3} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold bg-teal-300 dark:bg-teal-800 text-teal-900 dark:text-white">Current Year Obligation</th>
                                    <th rowSpan={2} className="p-2 border border-gray-300 dark:border-gray-600 text-center align-middle bg-emerald-100 dark:bg-emerald-900/40 font-bold min-w-[100px] text-emerald-900 dark:text-emerald-100">Total Target</th>
                                    <th colSpan={5} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold text-teal-900 dark:text-white">Comprehensive Release</th>
                                    <th colSpan={5} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold text-teal-900 dark:text-white">For Later Release</th>
                                </tr>
                                <tr>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[100px]">Actual (Jan-Sept)</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[100px]">Estimate (Oct-Dec)</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[100px]">Total</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[80px]">Q1</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[80px]">Q2</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[80px]">Q3</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[80px]">Q4</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[100px]">Subtotal</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[80px]">Q1</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[80px]">Q2</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[80px]">Q3</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[80px]">Q4</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[100px]">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {renderData(bed1Data, 'BED1')}
                            </tbody>
                            <tfoot>
                                {renderBed1Totals(getGrandTotals(bed1Data), "GRAND TOTAL")}
                            </tfoot>
                        </table>
                    </div>
                </div>

                {/* BED 2 Section */}
                <div id="bed2-table-container" className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                    <div className="p-4 bg-teal-50 dark:bg-teal-900/30 border-b border-gray-200 dark:border-gray-600 flex justify-between items-center">
                        <h4 className="font-bold text-lg text-teal-800 dark:text-teal-100">BED 2: Physical Plan</h4>
                        <button onClick={() => handlePrintSpecificTable('bed2-table-container')} className="px-3 py-1 bg-teal-600 text-white text-xs rounded hover:bg-teal-700">Print Table</button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse text-xs text-gray-900 dark:text-gray-200 whitespace-nowrap">
                            <thead className="bg-teal-200 dark:bg-teal-900 sticky top-0 z-10">
                                <tr>
                                    <th rowSpan={2} className="p-2 border border-gray-300 dark:border-gray-600 align-bottom min-w-[250px] sticky left-0 bg-teal-200 dark:bg-teal-900 z-20 text-left text-teal-900 dark:text-white">Program/Activity/Project</th>
                                    <th colSpan={4} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold text-teal-900 dark:text-white">Quarter 1</th>
                                    <th colSpan={4} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold text-teal-900 dark:text-white">Quarter 2</th>
                                    <th colSpan={4} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold text-teal-900 dark:text-white">Quarter 3</th>
                                    <th colSpan={4} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold text-teal-900 dark:text-white">Quarter 4</th>
                                    <th rowSpan={2} className="p-2 border border-gray-300 dark:border-gray-600 text-center align-middle font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-100">Grand Total</th>
                                </tr>
                                <tr>
                                    {/* Q1 */}
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Jan</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Feb</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Mar</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold bg-teal-300 dark:bg-teal-800">Total</th>
                                    {/* Q2 */}
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Apr</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">May</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Jun</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold bg-teal-300 dark:bg-teal-800">Total</th>
                                    {/* Q3 */}
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Jul</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Aug</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Sep</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold bg-teal-300 dark:bg-teal-800">Total</th>
                                    {/* Q4 */}
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Oct</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Nov</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Dec</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold bg-teal-300 dark:bg-teal-800">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {renderData(bed2Data, 'BED2')}
                            </tbody>
                            <tfoot>
                                {renderMonthlyTotals(getGrandTotals(bed2Data), "GRAND TOTAL", 'BED2')}
                            </tfoot>
                        </table>
                    </div>
                </div>

                {/* BED 3 Section */}
                <div id="bed3-table-container" className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                    <div className="p-4 bg-teal-50 dark:bg-teal-900/30 border-b border-gray-200 dark:border-gray-600 flex justify-between items-center">
                        <h4 className="font-bold text-lg text-teal-800 dark:text-teal-100">BED 3: Monthly Disbursement Program</h4>
                        <button onClick={() => handlePrintSpecificTable('bed3-table-container')} className="px-3 py-1 bg-teal-600 text-white text-xs rounded hover:bg-teal-700">Print Table</button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse text-xs text-gray-900 dark:text-gray-200 whitespace-nowrap">
                            <thead className="bg-teal-200 dark:bg-teal-900 sticky top-0 z-10">
                                <tr>
                                    <th rowSpan={2} className="p-2 border border-gray-300 dark:border-gray-600 align-bottom min-w-[250px] sticky left-0 bg-teal-200 dark:bg-teal-900 z-20 text-left text-teal-900 dark:text-white">Program/Activity/Project</th>
                                    <th colSpan={4} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold text-teal-900 dark:text-white">Quarter 1</th>
                                    <th colSpan={4} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold text-teal-900 dark:text-white">Quarter 2</th>
                                    <th colSpan={4} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold text-teal-900 dark:text-white">Quarter 3</th>
                                    <th colSpan={4} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold text-teal-900 dark:text-white">Quarter 4</th>
                                    <th rowSpan={2} className="p-2 border border-gray-300 dark:border-gray-600 text-center align-middle font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-100">Grand Total</th>
                                </tr>
                                <tr>
                                    {/* Q1 */}
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Jan</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Feb</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Mar</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold bg-teal-300 dark:bg-teal-800">Total</th>
                                    {/* Q2 */}
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Apr</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">May</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Jun</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold bg-teal-300 dark:bg-teal-800">Total</th>
                                    {/* Q3 */}
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Jul</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Aug</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Sep</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold bg-teal-300 dark:bg-teal-800">Total</th>
                                    {/* Q4 */}
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Oct</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Nov</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Dec</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold bg-teal-300 dark:bg-teal-800">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {renderData(bed3Data, 'BED3')}
                            </tbody>
                            <tfoot>
                                {renderMonthlyTotals(getGrandTotals(bed3Data), "GRAND TOTAL", 'BED3')}
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default BEDSReport;
