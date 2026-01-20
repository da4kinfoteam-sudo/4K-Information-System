// Author: 4K 
import React, { useMemo, useState } from 'react';
import { Subproject, Training, OtherActivity, OfficeRequirement, StaffingRequirement, OtherProgramExpense } from '../../constants';
import { formatCurrency, getObjectTypeByCode, XLSX } from './ReportUtils';

interface WFPReportProps {
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
}

const WFPReport: React.FC<WFPReportProps> = ({ data, uacsCodes, selectedYear, selectedOu }) => {
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

    const wfpData = useMemo(() => {
        const getQuarter = (dateStr?: string): number => {
            if (!dateStr) return 0;
            const month = new Date(dateStr + 'T00:00:00Z').getUTCMonth();
            return Math.floor(month / 3) + 1;
        };

        const finalData: { [key: string]: any } = {
            'Social Preparation': [],
            'Production and Livelihood': { isNestedExpandable: true, packages: {} },
            'Marketing and Enterprise': [], 
            'Program Management': { 
                isNestedExpandable: true, 
                packages: {
                    'Trainings': { items: [] },
                    'Staff Requirements': { items: [] },
                    'Office Requirements': { items: [] },
                    'Activities': { items: [] }
                } 
            }
        };

        // Helper to aggregate items with same name/indicator
        const addItemToGroup = (list: any[], newItem: any) => {
            const existing = list.find(i => i.indicator === newItem.indicator);
            if (existing) {
                existing.totalPhysicalTarget += newItem.totalPhysicalTarget;
                existing.mooeCost += newItem.mooeCost;
                existing.coCost += newItem.coCost;
                existing.totalCost += newItem.totalCost;
                
                existing.q1Physical += newItem.q1Physical;
                existing.q2Physical += newItem.q2Physical;
                existing.q3Physical += newItem.q3Physical;
                existing.q4Physical += newItem.q4Physical;
                
                existing.q1Financial += newItem.q1Financial;
                existing.q2Financial += newItem.q2Financial;
                existing.q3Financial += newItem.q3Financial;
                existing.q4Financial += newItem.q4Financial;
            } else {
                list.push(newItem);
            }
        };
        
        data.subprojects.forEach(sp => {
            const mooeCost = sp.details.filter(d => d.objectType === 'MOOE').reduce((sum, d) => sum + d.pricePerUnit * d.numberOfUnits, 0);
            const coCost = sp.details.filter(d => d.objectType === 'CO').reduce((sum, d) => sum + d.pricePerUnit * d.numberOfUnits, 0);
            const totalCost = mooeCost + coCost;
            const physicalTargetQuarter = getQuarter(sp.estimatedCompletionDate);

            const quarterlyFinancial = { q1: 0, q2: 0, q3: 0, q4: 0 };
            sp.details.forEach(detail => {
                const financialQuarter = getQuarter(detail.obligationMonth);
                if (financialQuarter >= 1 && financialQuarter <= 4) {
                    quarterlyFinancial[`q${financialQuarter}`] += detail.pricePerUnit * detail.numberOfUnits;
                }
            });

            const item = {
                indicator: sp.name, totalPhysicalTarget: 1, mooeCost, coCost, totalCost,
                q1Physical: physicalTargetQuarter === 1 ? 1 : 0, q2Physical: physicalTargetQuarter === 2 ? 1 : 0, q3Physical: physicalTargetQuarter === 3 ? 1 : 0, q4Physical: physicalTargetQuarter === 4 ? 1 : 0,
                q1Financial: quarterlyFinancial.q1, q2Financial: quarterlyFinancial.q2,
                q3Financial: quarterlyFinancial.q3, q4Financial: quarterlyFinancial.q4,
            };
            
            const packageKey = sp.packageType;
            if (!finalData['Production and Livelihood'].packages[packageKey]) {
                finalData['Production and Livelihood'].packages[packageKey] = { items: [] };
            }
            addItemToGroup(finalData['Production and Livelihood'].packages[packageKey].items, item);
        });

        data.trainings.forEach(t => {
            const mooeCost = t.expenses.filter(e => e.objectType === 'MOOE').reduce((sum, e) => sum + e.amount, 0);
            const coCost = t.expenses.filter(e => e.objectType === 'CO').reduce((sum, e) => sum + e.amount, 0);
            const totalCost = mooeCost + coCost;
            const physicalTargetQuarter = getQuarter(t.date);

            const quarterlyFinancial = { q1: 0, q2: 0, q3: 0, q4: 0 };
            t.expenses.forEach(expense => {
                const financialQuarter = getQuarter(expense.obligationMonth);
                if (financialQuarter >= 1 && financialQuarter <= 4) {
                    quarterlyFinancial[`q${financialQuarter}`] += expense.amount;
                }
            });

            const item = {
                indicator: t.name, totalPhysicalTarget: 1, mooeCost, coCost, totalCost,
                q1Physical: physicalTargetQuarter === 1 ? 1 : 0, q2Physical: physicalTargetQuarter === 2 ? 1 : 0, q3Physical: physicalTargetQuarter === 3 ? 1 : 0, q4Physical: physicalTargetQuarter === 4 ? 1 : 0,
                q1Financial: quarterlyFinancial.q1, q2Financial: quarterlyFinancial.q2,
                q3Financial: quarterlyFinancial.q3, q4Financial: quarterlyFinancial.q4,
            };

            if (t.component === 'Production and Livelihood') {
                 const packageKey = 'Trainings';
                 if (!finalData['Production and Livelihood'].packages[packageKey]) {
                    finalData['Production and Livelihood'].packages[packageKey] = { items: [] };
                 }
                 addItemToGroup(finalData['Production and Livelihood'].packages[packageKey].items, item);
            } else if (t.component === 'Program Management') {
                 addItemToGroup(finalData['Program Management'].packages['Trainings'].items, item);
            } else if (finalData[t.component]) {
                addItemToGroup(finalData[t.component], item);
            }
        });

        data.otherActivities.forEach(oa => {
            const mooeCost = oa.expenses.filter(e => e.objectType === 'MOOE').reduce((sum, e) => sum + e.amount, 0);
            const coCost = oa.expenses.filter(e => e.objectType === 'CO').reduce((sum, e) => sum + e.amount, 0);
            const totalCost = mooeCost + coCost;
            const physicalTargetQuarter = getQuarter(oa.date);

            const quarterlyFinancial = { q1: 0, q2: 0, q3: 0, q4: 0 };
            oa.expenses.forEach(expense => {
                const financialQuarter = getQuarter(expense.obligationMonth);
                if (financialQuarter >= 1 && financialQuarter <= 4) {
                    quarterlyFinancial[`q${financialQuarter}`] += expense.amount;
                }
            });

            const item = {
                indicator: oa.name, totalPhysicalTarget: 1, mooeCost, coCost, totalCost,
                q1Physical: physicalTargetQuarter === 1 ? 1 : 0, q2Physical: physicalTargetQuarter === 2 ? 1 : 0, q3Physical: physicalTargetQuarter === 3 ? 1 : 0, q4Physical: physicalTargetQuarter === 4 ? 1 : 0,
                q1Financial: quarterlyFinancial.q1, q2Financial: quarterlyFinancial.q2,
                q3Financial: quarterlyFinancial.q3, q4Financial: quarterlyFinancial.q4,
            };
            
            if (oa.component === 'Program Management') {
                 addItemToGroup(finalData['Program Management'].packages['Activities'].items, item);
            } else if (finalData[oa.component]) {
                addItemToGroup(finalData[oa.component], item);
            }
        });

        const processPmItem = (items: any[], packageKey: string, isStaff = false, isOtherExpense = false) => {
            items.forEach(pm => {
                const objType = getObjectTypeByCode(pm.uacsCode, uacsCodes);
                const amount = isStaff ? pm.annualSalary : (pm.amount || (pm.pricePerUnit * pm.numberOfUnits));
                
                const financialQuarter = getQuarter(pm.obligationDate);
                const physicalQuarter = getQuarter(pm.obligationDate);

                const physicalCount = isOtherExpense ? 0 : (isStaff ? 1 : (pm.numberOfUnits || 1));

                const item = {
                    indicator: isStaff ? pm.personnelPosition : (pm.equipment || pm.particulars),
                    totalPhysicalTarget: physicalCount,
                    mooeCost: objType === 'MOOE' ? amount : 0,
                    coCost: objType === 'CO' ? amount : 0,
                    totalCost: amount,
                    q1Physical: physicalQuarter === 1 ? physicalCount : 0,
                    q2Physical: physicalQuarter === 2 ? physicalCount : 0,
                    q3Physical: physicalQuarter === 3 ? physicalCount : 0,
                    q4Physical: physicalQuarter === 4 ? physicalCount : 0,
                    q1Financial: financialQuarter === 1 ? amount : 0,
                    q2Financial: financialQuarter === 2 ? amount : 0,
                    q3Financial: financialQuarter === 3 ? amount : 0,
                    q4Financial: financialQuarter === 4 ? amount : 0,
                };
                addItemToGroup(finalData['Program Management'].packages[packageKey].items, item);
            });
        }

        processPmItem(data.staffingReqs, 'Staff Requirements', true);
        processPmItem(data.officeReqs, 'Office Requirements');
        processPmItem(data.otherProgramExpenses, 'Office Requirements', false, true);

        const plPackageKeys = Object.keys(finalData['Production and Livelihood'].packages).sort();
        const sortedPLPackageData: { [key: string]: any } = {};
        for (const key of plPackageKeys) sortedPLPackageData[key] = finalData['Production and Livelihood'].packages[key];
        finalData['Production and Livelihood'].packages = sortedPLPackageData;

        return finalData;
    }, [data, uacsCodes]);

    const handleDownloadXLSX = () => {
        const aoa: (string | number | null)[][] = [
            [
                "Indicator", "Total Physical Target", "MOOE (PHP)", "CO (PHP)", "Total Cost (PHP)", 
                "Q1 Physical Target", "Q2 Physical Target", "Q3 Physical Target", "Q4 Physical Target", "Total Quarterly Physical", 
                "Q1 Financial Target", "Q2 Financial Target", "Q3 Financial Target", "Q4 Financial Target", "Total Quarterly Financial"
            ]
        ];

        const processItems = (items: any[]) => {
            items.forEach(item => {
                const totalQuarterlyPhysical = item.q1Physical + item.q2Physical + item.q3Physical + item.q4Physical;
                const totalQuarterlyFinancial = item.q1Financial + item.q2Financial + item.q3Financial + item.q4Financial;
                aoa.push([
                    item.indicator, item.totalPhysicalTarget, item.mooeCost, item.coCost, item.totalCost,
                    item.q1Physical, item.q2Physical, item.q3Physical, item.q4Physical, totalQuarterlyPhysical,
                    item.q1Financial, item.q2Financial, item.q3Financial, item.q4Financial, totalQuarterlyFinancial
                ]);
            });
        };

        const addTotalsRow = (items: any[], label: string) => {
            const totals = items.reduce((acc, item) => ({
                totalPhysicalTarget: acc.totalPhysicalTarget + (item.totalPhysicalTarget || 0),
                mooeCost: acc.mooeCost + (item.mooeCost || 0),
                coCost: acc.coCost + (item.coCost || 0),
                totalCost: acc.totalCost + (item.totalCost || 0),
                q1Physical: acc.q1Physical + (item.q1Physical || 0),
                q2Physical: acc.q2Physical + (item.q2Physical || 0),
                q3Physical: acc.q3Physical + (item.q3Physical || 0),
                q4Physical: acc.q4Physical + (item.q4Physical || 0),
                q1Financial: acc.q1Financial + (item.q1Financial || 0),
                q2Financial: acc.q2Financial + (item.q2Financial || 0),
                q3Financial: acc.q3Financial + (item.q3Financial || 0),
                q4Financial: acc.q4Financial + (item.q4Financial || 0),
            }), { 
                totalPhysicalTarget: 0, mooeCost: 0, coCost: 0, totalCost: 0, 
                q1Physical: 0, q2Physical: 0, q3Physical: 0, q4Physical: 0, 
                q1Financial: 0, q2Financial: 0, q3Financial: 0, q4Financial: 0 
            });
            
            const totalQuarterlyPhysical = totals.q1Physical + totals.q2Physical + totals.q3Physical + totals.q4Physical;
            const totalQuarterlyFinancial = totals.q1Financial + totals.q2Financial + totals.q3Financial + totals.q4Financial;

            aoa.push([
                label, totals.totalPhysicalTarget, totals.mooeCost, totals.coCost, totals.totalCost,
                totals.q1Physical, totals.q2Physical, totals.q3Physical, totals.q4Physical, totalQuarterlyPhysical,
                totals.q1Financial, totals.q2Financial, totals.q3Financial, totals.q4Financial, totalQuarterlyFinancial
            ]);
        };

        Object.entries(wfpData).forEach(([component, items]) => {
            aoa.push([component, null, null, null, null, null, null, null, null, null, null, null, null, null, null]);
            if (Array.isArray(items)) {
                if (items.length > 0) processItems(items);
            } else if ((items as any).isExpandable) {
                if((items as any).items.length > 0) processItems((items as any).items);
            } else if ((items as any).isNestedExpandable) {
                Object.entries((items as any).packages).forEach(([packageName, packageData] : [string, any]) => {
                    aoa.push([`  ${packageName}`, null, null, null, null, null, null, null, null, null, null, null, null, null, null]);
                    if((packageData as any).items.length > 0) processItems((packageData as any).items);
                });
            }
        });

        const grandTotals = Object.values(wfpData).flatMap((component: any) => {
            if (Array.isArray(component)) return component;
            if (component.isExpandable) return component.items;
            if (component.isNestedExpandable) return (Object.values(component.packages) as any[]).flatMap((pkg: any) => pkg.items);
            return [];
        });

        addTotalsRow(grandTotals, "GRAND TOTAL");
        
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "WFP Report");
        XLSX.writeFile(wb, `WFP_Report_${selectedYear}_${selectedOu}.xlsx`);
    };

    const handlePrint = () => {
        window.print();
    };

    const renderTotalsRow = (items: any[], label: string) => {
        const totals = items.reduce((acc, item) => {
            acc.totalPhysicalTarget += item.totalPhysicalTarget;
            acc.mooeCost += item.mooeCost;
            acc.coCost += item.coCost;
            acc.totalCost += item.totalCost;
            acc.q1Physical += item.q1Physical;
            acc.q2Physical += item.q2Physical;
            acc.q3Physical += item.q3Physical;
            acc.q4Physical += item.q4Physical;
            acc.q1Financial += item.q1Financial;
            acc.q2Financial += item.q2Financial;
            acc.q3Financial += item.q3Financial;
            acc.q4Financial += item.q4Financial;
            return acc;
        }, { 
            totalPhysicalTarget: 0, mooeCost: 0, coCost: 0, totalCost: 0, 
            q1Physical: 0, q2Physical: 0, q3Physical: 0, q4Physical: 0, 
            q1Financial: 0, q2Financial: 0, q3Financial: 0, q4Financial: 0 
        });

        const totalQuarterlyPhysical = totals.q1Physical + totals.q2Physical + totals.q3Physical + totals.q4Physical;
        const totalQuarterlyFinancial = totals.q1Financial + totals.q2Financial + totals.q3Financial + totals.q4Financial;

        return (
            <tr className="font-bold bg-gray-200 dark:bg-gray-700">
                <td className={`${dataCellClass}`}>{label}</td>
                <td className={`${dataCellClass} text-center`}>{totals.totalPhysicalTarget}</td>
                <td className={`${dataCellClass} text-right`}>{formatCurrency(totals.mooeCost)}</td>
                <td className={`${dataCellClass} text-right`}>{formatCurrency(totals.coCost)}</td>
                <td className={`${dataCellClass} text-right`}>{formatCurrency(totals.totalCost)}</td>
                {[totals.q1Physical, totals.q2Physical, totals.q3Physical, totals.q4Physical].map((q, i) => <td key={i} className={`${dataCellClass} text-center`}>{q || ''}</td>)}
                <td className={`${dataCellClass} text-center`}>{totalQuarterlyPhysical || ''}</td>
                {[totals.q1Financial, totals.q2Financial, totals.q3Financial, totals.q4Financial].map((q, i) => <td key={i} className={`${dataCellClass} text-right`}>{q ? formatCurrency(q) : ''}</td>)}
                 <td className={`${dataCellClass} text-right`}>{totalQuarterlyFinancial ? formatCurrency(totalQuarterlyFinancial) : ''}</td>
            </tr>
        );
    };
    
    const renderSummaryRow = (items: any[], label: string, rowKey: string, isExpanded: boolean, indentLevel = 0) => {
        if (items.length === 0) {
            return (
                <tr className="font-bold bg-gray-100 dark:bg-gray-700/50">
                     <td className={`${dataCellClass} ${indentClasses[indentLevel]}`}>
                        <span className="inline-block w-5"></span> {label}
                    </td>
                    <td colSpan={14} className={`${dataCellClass} text-center italic text-gray-500 dark:text-gray-400`}>No activities for this component.</td>
                </tr>
            )
        }
        
        const totals = items.reduce((acc, item) => {
            acc.totalPhysicalTarget += item.totalPhysicalTarget;
            acc.mooeCost += item.mooeCost;
            acc.coCost += item.coCost;
            acc.totalCost += item.totalCost;
            acc.q1Physical += item.q1Physical;
            acc.q2Physical += item.q2Physical;
            acc.q3Physical += item.q3Physical;
            acc.q4Physical += item.q4Physical;
            acc.q1Financial += item.q1Financial;
            acc.q2Financial += item.q2Financial;
            acc.q3Financial += item.q3Financial;
            acc.q4Financial += item.q4Financial;
            return acc;
        }, { 
            totalPhysicalTarget: 0, mooeCost: 0, coCost: 0, totalCost: 0, 
            q1Physical: 0, q2Physical: 0, q3Physical: 0, q4Physical: 0, 
            q1Financial: 0, q2Financial: 0, q3Financial: 0, q4Financial: 0 
        });

        const totalQuarterlyPhysical = totals.q1Physical + totals.q2Physical + totals.q3Physical + totals.q4Physical;
        const totalQuarterlyFinancial = totals.q1Financial + totals.q2Financial + totals.q3Financial + totals.q4Financial;
        
        return (
             <tr onClick={() => toggleRow(rowKey)} className="font-bold bg-gray-100 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer">
                <td className={`${dataCellClass} ${indentClasses[indentLevel]}`}>
                    <span className="inline-block w-5 text-center text-gray-500 dark:text-gray-400">{isExpanded ? '−' : '+'}</span> {label}
                </td>
                <td className={`${dataCellClass} text-center`}>{totals.totalPhysicalTarget}</td>
                <td className={`${dataCellClass} text-right`}>{formatCurrency(totals.mooeCost)}</td>
                <td className={`${dataCellClass} text-right`}>{formatCurrency(totals.coCost)}</td>
                <td className={`${dataCellClass} text-right`}>{formatCurrency(totals.totalCost)}</td>
                {[totals.q1Physical, totals.q2Physical, totals.q3Physical, totals.q4Physical].map((q, i) => <td key={i} className={`${dataCellClass} text-center`}>{q || ''}</td>)}
                <td className={`${dataCellClass} text-center`}>{totalQuarterlyPhysical || ''}</td>
                {[totals.q1Financial, totals.q2Financial, totals.q3Financial, totals.q4Financial].map((q, i) => <td key={i} className={`${dataCellClass} text-right`}>{q ? formatCurrency(q) : ''}</td>)}
                <td className={`${dataCellClass} text-right`}>{totalQuarterlyFinancial ? formatCurrency(totalQuarterlyFinancial) : ''}</td>
            </tr>
        );
    };
    
    const renderDataRow = (item: any, key: string, indentLevel = 0) => {
        const totalQuarterlyPhysical = item.q1Physical + item.q2Physical + item.q3Physical + item.q4Physical;
        const totalQuarterlyFinancial = item.q1Financial + item.q2Financial + item.q3Financial + item.q4Financial;
        return (
            <tr key={key}>
                <td className={`${dataCellClass} ${indentClasses[indentLevel]}`}>{item.indicator}</td>
                <td className={`${dataCellClass} text-center`}>{item.totalPhysicalTarget}</td>
                <td className={`${dataCellClass} text-right`}>{formatCurrency(item.mooeCost)}</td>
                <td className={`${dataCellClass} text-right`}>{formatCurrency(item.coCost)}</td>
                <td className={`${dataCellClass} text-right`}>{formatCurrency(item.totalCost)}</td>
                {[item.q1Physical, item.q2Physical, item.q3Physical, item.q4Physical].map((q, i) => <td key={i} className={`${dataCellClass} text-center`}>{q || ''}</td>)}
                <td className={`${dataCellClass} text-center`}>{totalQuarterlyPhysical || ''}</td>
                {[item.q1Financial, item.q2Financial, item.q3Financial, item.q4Financial].map((q, i) => <td key={i} className={`${dataCellClass} text-right`}>{q ? formatCurrency(q) : ''}</td>)}
                <td className={`${dataCellClass} text-right`}>{totalQuarterlyFinancial ? formatCurrency(totalQuarterlyFinancial) : ''}</td>
            </tr>
        )
    };

    const grandTotals = Object.values(wfpData).flatMap((component: any) => {
        if (Array.isArray(component)) return component;
        if (component.isExpandable) return component.items;
        if (component.isNestedExpandable) return (Object.values(component.packages) as any[]).flatMap((pkg: any) => pkg.items);
        return [];
    });

    return (
        <div id="wfp-container-for-print" className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            <div className="flex justify-between items-center mb-4 print-hidden">
                <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Work and Financial Plan (WFP)</h3>
                <div className="flex items-center gap-4">
                    <button onClick={handlePrint} className="px-4 py-2 bg-gray-500 text-white rounded-md font-semibold hover:bg-gray-600">Print Report</button>
                    <button onClick={handleDownloadXLSX} className="px-4 py-2 bg-accent text-white rounded-md font-semibold hover:brightness-95">Download XLSX</button>
                </div>
            </div>
            <div id="wfp-report" className="overflow-x-auto">
                <table className="min-w-full border-collapse text-xs text-gray-900 dark:text-gray-200">
                    <thead className="bg-gray-200 dark:bg-gray-700">
                        <tr>
                            <th rowSpan={2} className="p-1 border border-gray-300 dark:border-gray-600 align-bottom">Program/Activity/Project</th>
                            <th colSpan={4} className="p-1 border border-gray-300 dark:border-gray-600 text-center">Total Target</th>
                            <th colSpan={5} className="p-1 border border-gray-300 dark:border-gray-600 text-center">Quarterly Physical Target</th>
                            <th colSpan={5} className="p-1 border border-gray-300 dark:border-gray-600 text-center">Quarterly Financial Target (PHP)</th>
                        </tr>
                        <tr>
                            <th className="p-1 border border-gray-300 dark:border-gray-600 text-center">Physical</th>
                            <th className="p-1 border border-gray-300 dark:border-gray-600 text-center">MOOE (PHP)</th>
                            <th className="p-1 border border-gray-300 dark:border-gray-600 text-center">CO (PHP)</th>
                            <th className="p-1 border border-gray-300 dark:border-gray-600 text-center">Total (PHP)</th>
                            <th className="p-1 border border-gray-300 dark:border-gray-600 text-center">Q1</th>
                            <th className="p-1 border border-gray-300 dark:border-gray-600 text-center">Q2</th>
                            <th className="p-1 border border-gray-300 dark:border-gray-600 text-center">Q3</th>
                            <th className="p-1 border border-gray-300 dark:border-gray-600 text-center">Q4</th>
                            <th className="p-1 border border-gray-300 dark:border-gray-600 text-center">Total</th>
                            <th className="p-1 border border-gray-300 dark:border-gray-600 text-center">Q1</th>
                            <th className="p-1 border border-gray-300 dark:border-gray-600 text-center">Q2</th>
                            <th className="p-1 border border-gray-300 dark:border-gray-600 text-center">Q3</th>
                            <th className="p-1 border border-gray-300 dark:border-gray-600 text-center">Q4</th>
                            <th className="p-1 border border-gray-300 dark:border-gray-600 text-center">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(wfpData).map(([key, cd]) => {
                            const componentData = cd as any;
                            if (Array.isArray(componentData)) {
                                const isComponentExpanded = expandedRows.has(key);
                                return (
                                    <React.Fragment key={key}>
                                        {renderSummaryRow(componentData, key, key, isComponentExpanded, 0)}
                                        {isComponentExpanded &&
                                            componentData.map((item: any, index: number) => renderDataRow(item, `${key}-${index}`, 1))
                                        }
                                    </React.Fragment>
                                );
                            }
                            if (componentData.isExpandable) {
                                const isComponentExpanded = expandedRows.has(key);
                                return (
                                    <React.Fragment key={key}>
                                        {renderSummaryRow(componentData.items, key, key, isComponentExpanded, 0)}
                                        {isComponentExpanded && componentData.items.map((item: any, index: number) => renderDataRow(item, `${key}-${index}`, 1))}
                                    </React.Fragment>
                                );
                            }
                            if (componentData.isNestedExpandable) {
                                const isComponentExpanded = expandedRows.has(key);
                                const allPackageItems = Object.values(componentData.packages).flatMap((pkg: any) => pkg.items);
                                return (
                                    <React.Fragment key={key}>
                                        {renderSummaryRow(allPackageItems, key, key, isComponentExpanded, 0)}
                                        {isComponentExpanded && Object.entries(componentData.packages).map(([packageName, packageData]: [string, any]) => (
                                            <React.Fragment key={packageName}>
                                                {renderSummaryRow(packageData.items, packageName, packageName, expandedRows.has(packageName), 1)}
                                                {expandedRows.has(packageName) && packageData.items.map((item: any, index: number) => renderDataRow(item, `${packageName}-${index}`, 2))}
                                            </React.Fragment>
                                        ))}
                                    </React.Fragment>
                                );
                            }
                            return null;
                        })}
                    </tbody>
                    <tfoot>
                        {renderTotalsRow(grandTotals, "GRAND TOTAL")}
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

export default WFPReport;