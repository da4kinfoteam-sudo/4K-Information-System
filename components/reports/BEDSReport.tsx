// Author: 4K 
import React, { useMemo, useState } from 'react';
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

const BEDSReport: React.FC<BEDSReportProps> = ({ data, uacsCodes, selectedYear, selectedOu, selectedFundType, selectedTier }) => {
    const [expandedRows, setExpandedRows] = useState(new Set<string>());
    
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
            'Program Management': { isNestedExpandable: true, packages: { 'Trainings': { items: [] }, 'Staff Requirements': { items: [] }, 'Office Requirements': { items: [] }, 'Activities': { items: [] } } }
        };

        // Helper to retrieve previous year data
        const getPrevYearValues = (indicatorName: string, type: 'Subproject' | 'Training' | 'Activity' | 'Staff' | 'Office', rowItem: any) => {
            if (!isYearSelected) return { janSeptActual: 0, octDecEstimate: 0, prevTotal: 0 };
            // (Simplification: assuming prev year data isn't strictly filtered by selected tier/fund type for historical context, or maybe it should be. Keeping logical consistency with current year filtering.)
            return { janSeptActual: 0, octDecEstimate: 0, prevTotal: 0 }; 
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
            finalData['Production and Livelihood'].packages[pkg].items.push(item);
        });

        data.trainings.filter(filterItem).forEach(t => {
            const item = createItem(t.name, t, t.expenses, 'obligationMonth', 'amount');
            if (t.component === 'Production and Livelihood') {
                 if (!finalData['Production and Livelihood'].packages['Trainings']) finalData['Production and Livelihood'].packages['Trainings'] = { items: [] };
                 finalData['Production and Livelihood'].packages['Trainings'].items.push(item);
            } else if (t.component === 'Program Management') {
                 finalData['Program Management'].packages['Trainings'].items.push(item);
            } else if (finalData[t.component]) {
                finalData[t.component].push(item);
            }
        });

        data.otherActivities.filter(filterItem).forEach(oa => {
            const item = createItem(oa.name, oa, oa.expenses, 'obligationMonth', 'amount');
            if (oa.component === 'Program Management') finalData['Program Management'].packages['Activities'].items.push(item);
            else if (finalData[oa.component]) finalData[oa.component].push(item);
        });

        const processPm = (items: any[], pkgKey: string) => {
            items.filter(filterItem).forEach(pm => {
                const indicator = pm.personnelPosition || pm.equipment || pm.particulars;
                // Treat PM item as its own detail for calculation
                const amount = pm.annualSalary || pm.amount || (pm.pricePerUnit * pm.numberOfUnits);
                const detailLike = { ...pm, amount }; 
                const item = createItem(indicator, pm, [detailLike], 'obligationDate', 'amount');
                finalData['Program Management'].packages[pkgKey].items.push(item);
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
            'Program Management': { isNestedExpandable: true, packages: { 'Trainings': { items: [] }, 'Staff Requirements': { items: [] }, 'Office Requirements': { items: [] }, 'Activities': { items: [] } } }
        };

        const initializeMonths = () => ({
            m1: 0, m2: 0, m3: 0, q1: 0,
            m4: 0, m5: 0, m6: 0, q2: 0,
            m7: 0, m8: 0, m9: 0, q3: 0,
            m10: 0, m11: 0, m12: 0, q4: 0,
            total: 0
        });

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
            finalData['Production and Livelihood'].packages[pkg].items.push(item);
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
                 finalData['Production and Livelihood'].packages['Trainings'].items.push(item);
            } else if (t.component === 'Program Management') {
                 finalData['Program Management'].packages['Trainings'].items.push(item);
            } else if (finalData[t.component]) {
                finalData[t.component].push(item);
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
            if (oa.component === 'Program Management') finalData['Program Management'].packages['Activities'].items.push(item);
            else if (finalData[oa.component]) finalData[oa.component].push(item);
        });

        // PM Items
        const processPm = (items: any[], pkgKey: string, isStaff = false, isOtherExpense = false) => {
            items.filter(filterItem).forEach(pm => {
                // If generating Physical report (BED 2) and item is Other Expense, skip it.
                if (type === 'Physical' && isOtherExpense) return;

                const vals = initializeMonths();
                const indicator = isStaff ? pm.personnelPosition : (pm.equipment || pm.particulars);
                const date = type === 'Physical' ? pm.obligationDate : pm.disbursementDate; 
                let amount = 0;
                if (type === 'Physical') {
                    amount = isStaff ? 1 : (pm.numberOfUnits || 1);
                } else {
                    amount = isStaff ? pm.annualSalary : (pm.amount || (pm.pricePerUnit * pm.numberOfUnits));
                }
                addToMonths(vals, date, amount);
                finalData['Program Management'].packages[pkgKey].items.push({ indicator, ...vals });
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
                <td className={`${dataCellClass} text-right bg-blue-50 dark:bg-blue-900/20`}>{totals.currTotal > 0 ? formatCurrency(totals.currTotal) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.compQ1 > 0 ? formatCurrency(totals.compQ1) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.compQ2 > 0 ? formatCurrency(totals.compQ2) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.compQ3 > 0 ? formatCurrency(totals.compQ3) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.compQ4 > 0 ? formatCurrency(totals.compQ4) : ''}</td>
                <td className={`${dataCellClass} text-right font-semibold`}>{totals.compSubtotal > 0 ? formatCurrency(totals.compSubtotal) : ''}</td>
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

        const fmt = (val: number) => bedType === 'BED2' ? (val > 0 ? val : '') : (val > 0 ? formatCurrency(val) : '');

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
                <td className={`${dataCellClass} text-right bg-blue-100 dark:bg-blue-900`}>{fmt(totals.total)}</td>
            </tr>
        );
    };

    const renderData = (rowsData: any, bedType: 'BED1' | 'BED2' | 'BED3') => {
        const renderRow = bedType === 'BED1' ? (item: any, key: string, level: number) => (
            <tr key={key}>
                <td className={`${dataCellClass} ${indentClasses[level]} sticky left-0 bg-white dark:bg-gray-800 z-10`}>{item.indicator}</td>
                <td className={`${dataCellClass} text-center`}></td>
                <td colSpan={3} className={dataCellClass}></td>
                <td className={`${dataCellClass} text-right bg-blue-50 dark:bg-blue-900/20`}>{item.currTotal > 0 ? formatCurrency(item.currTotal) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{item.compQ1 > 0 ? formatCurrency(item.compQ1) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{item.compQ2 > 0 ? formatCurrency(item.compQ2) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{item.compQ3 > 0 ? formatCurrency(item.compQ3) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{item.compQ4 > 0 ? formatCurrency(item.compQ4) : ''}</td>
                <td className={`${dataCellClass} text-right font-semibold`}>{item.compSubtotal > 0 ? formatCurrency(item.compSubtotal) : ''}</td>
                <td colSpan={5} className={dataCellClass}></td>
            </tr>
        ) : (item: any, key: string, level: number) => {
            const fmt = (val: number) => bedType === 'BED2' ? (val > 0 ? val : '') : (val > 0 ? formatCurrency(val) : '');
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
                        <td className={`${dataCellClass} text-right bg-blue-50 dark:bg-blue-900/20`}>{totals.currTotal > 0 ? formatCurrency(totals.currTotal) : ''}</td>
                        <td className={`${dataCellClass} text-right`}>{totals.compQ1 > 0 ? formatCurrency(totals.compQ1) : ''}</td>
                        <td className={`${dataCellClass} text-right`}>{totals.compQ2 > 0 ? formatCurrency(totals.compQ2) : ''}</td>
                        <td className={`${dataCellClass} text-right`}>{totals.compQ3 > 0 ? formatCurrency(totals.compQ3) : ''}</td>
                        <td className={`${dataCellClass} text-right`}>{totals.compQ4 > 0 ? formatCurrency(totals.compQ4) : ''}</td>
                        <td className={`${dataCellClass} text-right`}>{totals.compSubtotal > 0 ? formatCurrency(totals.compSubtotal) : ''}</td>
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
                const fmt = (val: number) => bedType === 'BED2' ? (val > 0 ? val : '') : (val > 0 ? formatCurrency(val) : '');

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

    const handlePrint = () => {
        window.print();
    };

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
                    item.janSeptActual || 0,
                    item.octDecEstimate || 0,
                    item.currTotal || 0,
                    item.compQ1 || 0, item.compQ2 || 0, item.compQ3 || 0, item.compQ4 || 0, item.compSubtotal || 0,
                    item.laterQ1 || 0, item.laterQ2 || 0, item.laterQ3 || 0, item.laterQ4 || 0, item.laterSubtotal || 0
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
                totals.janSeptActual, totals.octDecEstimate, totals.currTotal,
                totals.compQ1, totals.compQ2, totals.compQ3, totals.compQ4, totals.compSubtotal,
                totals.laterQ1, totals.laterQ2, totals.laterQ3, totals.laterQ4, totals.laterSubtotal
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
                        item.m1, item.m2, item.m3, item.q1,
                        item.m4, item.m5, item.m6, item.q2,
                        item.m7, item.m8, item.m9, item.q3,
                        item.m10, item.m11, item.m12, item.q4,
                        item.total
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
                    t.m1, t.m2, t.m3, t.q1,
                    t.m4, t.m5, t.m6, t.q2,
                    t.m7, t.m8, t.m9, t.q3,
                    t.m10, t.m11, t.m12, t.q4,
                    t.total
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

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            <div className="flex justify-between items-center mb-4 print-hidden">
                <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Budget Execution Documents (BEDS)</h3>
                <div className="flex gap-2">
                    <button onClick={handlePrint} className="px-4 py-2 bg-gray-500 text-white rounded-md font-semibold hover:bg-gray-600">Print Report</button>
                    <button onClick={handleDownloadBEDSXlsx} className="px-4 py-2 bg-accent text-white rounded-md font-semibold hover:brightness-95">Download XLSX</button>
                </div>
            </div>
            
            <div id="beds-report" className="space-y-8">
                {!isYearSelected && (
                    <div className="p-4 text-center text-red-500 bg-red-50 dark:bg-red-900/20 mb-2">
                        Please select a specific Year to view BED 2 and BED 3 data properly.
                    </div>
                )}
                
                {/* BED 1 Section */}
                <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                    <div className="p-4 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                        <h4 className="font-bold text-lg text-gray-800 dark:text-white">BED 1: Financial Plan (Obligation)</h4>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse text-xs text-gray-900 dark:text-gray-200 whitespace-nowrap">
                            <thead className="bg-gray-200 dark:bg-gray-700 sticky top-0 z-10">
                                <tr>
                                    <th rowSpan={2} className="p-2 border border-gray-300 dark:border-gray-600 align-bottom min-w-[250px] sticky left-0 bg-gray-200 dark:bg-gray-700 z-20 text-left">Program/Activity/Project</th>
                                    <th rowSpan={2} className="p-2 border border-gray-300 dark:border-gray-600 text-center align-middle min-w-[150px]">Performance Indicator</th>
                                    <th colSpan={3} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold bg-gray-300 dark:bg-gray-600">Current Year Obligation</th>
                                    <th rowSpan={2} className="p-2 border border-gray-300 dark:border-gray-600 text-center align-middle bg-blue-100 dark:bg-blue-900/40 font-bold min-w-[100px]">Total Target</th>
                                    <th colSpan={5} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold">Comprehensive Release</th>
                                    <th colSpan={5} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold">For Later Release</th>
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
                <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                    <div className="p-4 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                        <h4 className="font-bold text-lg text-gray-800 dark:text-white">BED 2: Physical Plan</h4>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse text-xs text-gray-900 dark:text-gray-200 whitespace-nowrap">
                            <thead className="bg-gray-200 dark:bg-gray-700 sticky top-0 z-10">
                                <tr>
                                    <th rowSpan={2} className="p-2 border border-gray-300 dark:border-gray-600 align-bottom min-w-[250px] sticky left-0 bg-gray-200 dark:bg-gray-700 z-20 text-left">Program/Activity/Project</th>
                                    <th colSpan={4} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold">Quarter 1</th>
                                    <th colSpan={4} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold">Quarter 2</th>
                                    <th colSpan={4} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold">Quarter 3</th>
                                    <th colSpan={4} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold">Quarter 4</th>
                                    <th rowSpan={2} className="p-2 border border-gray-300 dark:border-gray-600 text-center align-middle font-bold bg-blue-100 dark:bg-blue-900/40">Grand Total</th>
                                </tr>
                                <tr>
                                    {/* Q1 */}
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Jan</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Feb</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Mar</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold bg-gray-300 dark:bg-gray-600">Total</th>
                                    {/* Q2 */}
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Apr</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">May</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Jun</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold bg-gray-300 dark:bg-gray-600">Total</th>
                                    {/* Q3 */}
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Jul</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Aug</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Sep</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold bg-gray-300 dark:bg-gray-600">Total</th>
                                    {/* Q4 */}
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Oct</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Nov</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Dec</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold bg-gray-300 dark:bg-gray-600">Total</th>
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
                <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                    <div className="p-4 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                        <h4 className="font-bold text-lg text-gray-800 dark:text-white">BED 3: Monthly Disbursement Program</h4>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse text-xs text-gray-900 dark:text-gray-200 whitespace-nowrap">
                            <thead className="bg-gray-200 dark:bg-gray-700 sticky top-0 z-10">
                                <tr>
                                    <th rowSpan={2} className="p-2 border border-gray-300 dark:border-gray-600 align-bottom min-w-[250px] sticky left-0 bg-gray-200 dark:bg-gray-700 z-20 text-left">Program/Activity/Project</th>
                                    <th colSpan={4} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold">Quarter 1</th>
                                    <th colSpan={4} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold">Quarter 2</th>
                                    <th colSpan={4} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold">Quarter 3</th>
                                    <th colSpan={4} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold">Quarter 4</th>
                                    <th rowSpan={2} className="p-2 border border-gray-300 dark:border-gray-600 text-center align-middle font-bold bg-blue-100 dark:bg-blue-900/40">Grand Total</th>
                                </tr>
                                <tr>
                                    {/* Q1 */}
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Jan</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Feb</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Mar</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold bg-gray-300 dark:bg-gray-600">Total</th>
                                    {/* Q2 */}
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Apr</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">May</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Jun</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold bg-gray-300 dark:bg-gray-600">Total</th>
                                    {/* Q3 */}
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Jul</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Aug</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Sep</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold bg-gray-300 dark:bg-gray-600">Total</th>
                                    {/* Q4 */}
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Oct</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Nov</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px]">Dec</th>
                                    <th className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold bg-gray-300 dark:bg-gray-600">Total</th>
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