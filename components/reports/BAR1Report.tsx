
import React, { useMemo, useState } from 'react';
import { Subproject, Training, OtherActivity, OfficeRequirement, StaffingRequirement, OtherProgramExpense } from '../../constants';
import { getObjectTypeByCode, XLSX } from './ReportUtils';

interface BAR1ReportProps {
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

const BAR1Report: React.FC<BAR1ReportProps> = ({ data, uacsCodes, selectedYear, selectedOu }) => {
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

    const bar1Data = useMemo(() => {
        const getMonthIndex = (dateStr?: string): number => {
            if (!dateStr) return -1;
            const d = new Date(dateStr + 'T00:00:00Z');
            return d.getUTCMonth(); // 0-11
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

        const createBar1Item = (indicator: string, physicalCount: number, targetDate?: string) => {
            const item: any = {
                indicator,
                m1: 0, m2: 0, m3: 0, q1: 0,
                m4: 0, m5: 0, m6: 0, q2: 0,
                m7: 0, m8: 0, m9: 0, q3: 0,
                m10: 0, m11: 0, m12: 0, q4: 0,
                total: 0
            };

            const monthIdx = getMonthIndex(targetDate);
            if (monthIdx !== -1) {
                const monthKey = `m${monthIdx + 1}`;
                item[monthKey] = physicalCount;
                
                // Update Quarter Totals
                if (monthIdx < 3) item.q1 += physicalCount;
                else if (monthIdx < 6) item.q2 += physicalCount;
                else if (monthIdx < 9) item.q3 += physicalCount;
                else item.q4 += physicalCount;
                
                item.total += physicalCount;
            }
            return item;
        };

        // Process Subprojects
        data.subprojects.forEach(sp => {
            // Using estimated completion date as the physical target realization point
            const item = createBar1Item(sp.name, 1, sp.estimatedCompletionDate);
            const packageKey = sp.packageType;
            if (!finalData['Production and Livelihood'].packages[packageKey]) {
                finalData['Production and Livelihood'].packages[packageKey] = { items: [] };
            }
            finalData['Production and Livelihood'].packages[packageKey].items.push(item);
        });

        // Process Trainings
        data.trainings.forEach(t => {
            const item = createBar1Item(t.name, 1, t.date);
            if (t.component === 'Production and Livelihood') {
                 const packageKey = 'Trainings';
                 if (!finalData['Production and Livelihood'].packages[packageKey]) {
                    finalData['Production and Livelihood'].packages[packageKey] = { items: [] };
                 }
                 finalData['Production and Livelihood'].packages[packageKey].items.push(item);
            } else if (t.component === 'Program Management') {
                 finalData['Program Management'].packages['Trainings'].items.push(item);
            } else if (finalData[t.component]) {
                finalData[t.component].push(item);
            }
        });

        // Process Other Activities
        data.otherActivities.forEach(oa => {
            const item = createBar1Item(oa.name, 1, oa.date);
            if (oa.component === 'Program Management') {
                 finalData['Program Management'].packages['Activities'].items.push(item);
            } else if (finalData[oa.component]) {
                finalData[oa.component].push(item);
            }
        });

        // Process PM Items
        const processPm = (items: any[], pkgKey: string, isStaff = false) => {
            items.forEach(pm => {
                const indicator = isStaff ? pm.personnelPosition : (pm.equipment || pm.particulars);
                const count = isStaff ? 1 : (pm.numberOfUnits || 1);
                // Using obligation date as target date for procurement/hiring
                const item = createBar1Item(indicator, count, pm.obligationDate);
                finalData['Program Management'].packages[pkgKey].items.push(item);
            });
        }
        processPm(data.staffingReqs, 'Staff Requirements', true);
        processPm(data.officeReqs, 'Office Requirements');
        processPm(data.otherProgramExpenses, 'Office Requirements');

        const plPackageKeys = Object.keys(finalData['Production and Livelihood'].packages).sort();
        const sortedPLPackageData: { [key: string]: any } = {};
        for (const key of plPackageKeys) sortedPLPackageData[key] = finalData['Production and Livelihood'].packages[key];
        finalData['Production and Livelihood'].packages = sortedPLPackageData;

        return finalData;
    }, [data]);

    const calculateTotals = (items: any[]) => {
        return items.reduce((acc, item) => {
            for (let i = 1; i <= 12; i++) {
                acc[`m${i}`] += (item[`m${i}`] || 0);
            }
            acc.q1 += (item.q1 || 0);
            acc.q2 += (item.q2 || 0);
            acc.q3 += (item.q3 || 0);
            acc.q4 += (item.q4 || 0);
            acc.total += (item.total || 0);
            return acc;
        }, { 
            m1: 0, m2: 0, m3: 0, q1: 0,
            m4: 0, m5: 0, m6: 0, q2: 0,
            m7: 0, m8: 0, m9: 0, q3: 0,
            m10: 0, m11: 0, m12: 0, q4: 0,
            total: 0
        });
    };

    const renderDataCells = (data: any, isTotal: boolean = false) => {
        const cellClass = `${dataCellClass} text-center ${isTotal ? 'font-bold' : ''}`;
        const totalClass = `${dataCellClass} text-center font-bold bg-gray-50 dark:bg-gray-700/50`;
        const calculatedClass = `${dataCellClass} text-center font-bold bg-blue-50 dark:bg-blue-900/30`;
        const yearEndClass = `${dataCellClass} text-center font-bold bg-yellow-50 dark:bg-yellow-900/20`;

        const semestralTotal = (data.q1 || 0) + (data.q2 || 0);
        const asOfSept = semestralTotal + (data.q3 || 0);
        const yearEndNov = (data.total || 0) - (data.m12 || 0);
        
        return (
            <>
                <td className={cellClass}>{data.m1 || ''}</td>
                <td className={cellClass}>{data.m2 || ''}</td>
                <td className={cellClass}>{data.m3 || ''}</td>
                <td className={totalClass}>{data.q1 || ''}</td>

                <td className={cellClass}>{data.m4 || ''}</td>
                <td className={cellClass}>{data.m5 || ''}</td>
                <td className={cellClass}>{data.m6 || ''}</td>
                <td className={totalClass}>{data.q2 || ''}</td>

                <td className={calculatedClass}>{semestralTotal || ''}</td>

                <td className={cellClass}>{data.m7 || ''}</td>
                <td className={cellClass}>{data.m8 || ''}</td>
                <td className={cellClass}>{data.m9 || ''}</td>
                <td className={totalClass}>{data.q3 || ''}</td>

                <td className={calculatedClass}>{asOfSept || ''}</td>

                <td className={cellClass}>{data.m10 || ''}</td>
                <td className={cellClass}>{data.m11 || ''}</td>
                <td className={cellClass}>{data.m12 || ''}</td>
                <td className={totalClass}>{data.q4 || ''}</td>

                <td className={yearEndClass}>{yearEndNov || ''}</td>
                <td className={`${dataCellClass} text-center font-bold bg-blue-100 dark:bg-blue-900/40`}>{data.total || ''}</td>
            </>
        );
    };

    const renderTotalsRow = (items: any[], label: string) => {
        const totals = calculateTotals(items);
        return (
            <tr className="font-bold bg-gray-200 dark:bg-gray-700 text-xs">
                <td className={`${dataCellClass} sticky left-0 bg-gray-200 dark:bg-gray-700 z-10`}>{label}</td>
                {renderDataCells(totals, true)}
            </tr>
        );
    };

    const renderSummaryRow = (items: any[], label: string, rowKey: string, isExpanded: boolean, indentLevel = 0) => {
        if (items.length === 0) {
            return (
                <tr className="font-bold bg-gray-100 dark:bg-gray-700/50 text-xs">
                     <td className={`${dataCellClass} ${indentClasses[indentLevel]} sticky left-0 bg-gray-100 dark:bg-gray-700 z-10`}>
                        <span className="inline-block w-5"></span> {label}
                    </td>
                    <td colSpan={20} className={`${dataCellClass} text-center italic text-gray-500 dark:text-gray-400`}>No activities for this component.</td>
                </tr>
            )
        }
        const totals = calculateTotals(items);
        return (
             <tr onClick={() => toggleRow(rowKey)} className="font-bold bg-gray-100 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer text-xs">
                <td className={`${dataCellClass} ${indentClasses[indentLevel]} sticky left-0 bg-gray-100 dark:bg-gray-700 z-10`}>
                    <span className="inline-block w-5 text-center text-gray-500 dark:text-gray-400">{isExpanded ? '−' : '+'}</span> {label}
                </td>
                {renderDataCells(totals, true)}
            </tr>
        );
    };

    const renderDataRow = (item: any, key: string, indentLevel = 0) => {
        return (
            <tr key={key}>
                <td className={`${dataCellClass} ${indentClasses[indentLevel]} sticky left-0 bg-white dark:bg-gray-800 z-10`}>{item.indicator}</td>
                {renderDataCells(item)}
            </tr>
        )
    };

    const grandTotals = Object.values(bar1Data).flatMap((component: any) => {
        if (Array.isArray(component)) return component;
        if (component.isExpandable) return component.items;
        if (component.isNestedExpandable) return Object.values(component.packages).flatMap((pkg: any) => pkg.items);
        return [];
    });

    const handleDownloadBar1Xlsx = () => {
        const aoa: (string | number | null)[][] = [
            [
                "Program/Activity/Project", 
                "1st Quarter", null, null, null, 
                "2nd Quarter", null, null, null, 
                "Semestral Total",
                "3rd Quarter", null, null, null, 
                "As of September",
                "4th Quarter", null, null, null, 
                "Year End (As of Nov)",
                "Grand Total"
            ],
            [
                null,
                "Jan", "Feb", "Mar", "Total",
                "Apr", "May", "Jun", "Total",
                null,
                "Jul", "Aug", "Sep", "Total",
                null,
                "Oct", "Nov", "Dec", "Total",
                null,
                null
            ]
        ];

        const processItems = (items: any[]) => {
            items.forEach(item => {
                const semestralTotal = (item.q1 || 0) + (item.q2 || 0);
                const asOfSept = semestralTotal + (item.q3 || 0);
                const yearEndNov = (item.total || 0) - (item.m12 || 0);

                aoa.push([
                    item.indicator,
                    item.m1, item.m2, item.m3, item.q1,
                    item.m4, item.m5, item.m6, item.q2,
                    semestralTotal,
                    item.m7, item.m8, item.m9, item.q3,
                    asOfSept,
                    item.m10, item.m11, item.m12, item.q4,
                    yearEndNov,
                    item.total
                ]);
            });
        };

        const addTotalsRow = (items: any[], label: string) => {
            const totals = items.reduce((acc, item) => {
                for (let i = 1; i <= 12; i++) acc[`m${i}`] = (acc[`m${i}`] || 0) + (item[`m${i}`] || 0);
                acc.q1 = (acc.q1 || 0) + (item.q1 || 0);
                acc.q2 = (acc.q2 || 0) + (item.q2 || 0);
                acc.q3 = (acc.q3 || 0) + (item.q3 || 0);
                acc.q4 = (acc.q4 || 0) + (item.q4 || 0);
                acc.total = (acc.total || 0) + (item.total || 0);
                return acc;
            }, {});

            const semestralTotal = totals.q1 + totals.q2;
            const asOfSept = semestralTotal + totals.q3;
            const yearEndNov = totals.total - (totals.m12 || 0);

            aoa.push([
                label,
                totals.m1, totals.m2, totals.m3, totals.q1,
                totals.m4, totals.m5, totals.m6, totals.q2,
                semestralTotal,
                totals.m7, totals.m8, totals.m9, totals.q3,
                asOfSept,
                totals.m10, totals.m11, totals.m12, totals.q4,
                yearEndNov,
                totals.total
            ]);
        };

        Object.entries(bar1Data).forEach(([component, items]) => {
            aoa.push([component, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]);
            if (Array.isArray(items)) {
                if (items.length > 0) processItems(items);
            } else if ((items as any).isExpandable) {
                if ((items as any).items.length > 0) processItems((items as any).items);
            } else if ((items as any).isNestedExpandable) {
                Object.entries((items as any).packages).forEach(([packageName, packageData]: [string, any]) => {
                    aoa.push([`  ${packageName}`, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]);
                    if ((packageData as any).items.length > 0) processItems((packageData as any).items);
                });
            }
        });

        const grandTotals = Object.values(bar1Data).flatMap((component: any) => {
            if (Array.isArray(component)) return component;
            if (component.isExpandable) return component.items;
            if (component.isNestedExpandable) return (Object.values(component.packages) as any[]).flatMap((pkg: any) => pkg.items);
            return [];
        });

        addTotalsRow(grandTotals, "GRAND TOTAL");

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        
        // Merges
        if(!ws['!merges']) ws['!merges'] = [];
        ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }); // P/A/P
        ws['!merges'].push({ s: { r: 0, c: 1 }, e: { r: 0, c: 4 } }); // Q1
        ws['!merges'].push({ s: { r: 0, c: 5 }, e: { r: 0, c: 8 } }); // Q2
        ws['!merges'].push({ s: { r: 0, c: 9 }, e: { r: 1, c: 9 } }); // Semestral
        ws['!merges'].push({ s: { r: 0, c: 10 }, e: { r: 0, c: 13 } }); // Q3
        ws['!merges'].push({ s: { r: 0, c: 14 }, e: { r: 1, c: 14 } }); // As of Sept
        ws['!merges'].push({ s: { r: 0, c: 15 }, e: { r: 0, c: 18 } }); // Q4
        ws['!merges'].push({ s: { r: 0, c: 19 }, e: { r: 1, c: 19 } }); // Year End Nov
        ws['!merges'].push({ s: { r: 0, c: 20 }, e: { r: 1, c: 20 } }); // Grand Total

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "BAR1 Report");
        XLSX.writeFile(wb, `BAR1_Report_${selectedYear}_${selectedOu}.xlsx`);
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            <div className="flex justify-between items-center mb-4 print-hidden">
                <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Physical Report of Operations (BAR No. 1)</h3>
                <button onClick={handleDownloadBar1Xlsx} className="px-4 py-2 bg-accent text-white rounded-md font-semibold hover:brightness-95">Download XLSX</button>
            </div>
            <div id="bar1-report" className="overflow-x-auto shadow-md rounded-lg">
                <table className="min-w-full border-collapse text-xs text-gray-900 dark:text-gray-200 whitespace-nowrap">
                    <thead className="bg-gray-200 dark:bg-gray-700 sticky top-0 z-10">
                        <tr>
                            <th rowSpan={2} className="p-2 border border-gray-300 dark:border-gray-600 align-bottom min-w-[250px] sticky left-0 bg-gray-200 dark:bg-gray-700 z-20 text-left">Program/Activity/Project</th>
                            <th colSpan={4} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold">1st Quarter</th>
                            <th colSpan={4} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold">2nd Quarter</th>
                            <th rowSpan={2} className="p-2 border border-gray-300 dark:border-gray-600 text-center align-middle font-bold bg-blue-50 dark:bg-blue-900/30">Semestral Total</th>
                            <th colSpan={4} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold">3rd Quarter</th>
                            <th rowSpan={2} className="p-2 border border-gray-300 dark:border-gray-600 text-center align-middle font-bold bg-blue-50 dark:bg-blue-900/30">As of September</th>
                            <th colSpan={4} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold">4th Quarter</th>
                            <th rowSpan={2} className="p-2 border border-gray-300 dark:border-gray-600 text-center align-middle font-bold bg-yellow-50 dark:bg-yellow-900/20">Year End (As of Nov)</th>
                            <th rowSpan={2} className="p-2 border border-gray-300 dark:border-gray-600 text-center align-middle font-bold bg-blue-100 dark:bg-blue-900/40">Grand Total</th>
                        </tr>
                        <tr>
                            {/* Q1 */}
                            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Jan</th>
                            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Feb</th>
                            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Mar</th>
                            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
                            {/* Q2 */}
                            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Apr</th>
                            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">May</th>
                            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Jun</th>
                            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
                            {/* Q3 */}
                            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Jul</th>
                            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Aug</th>
                            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Sep</th>
                            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
                            {/* Q4 */}
                            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Oct</th>
                            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Nov</th>
                            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Dec</th>
                            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(bar1Data).map(([key, cd]) => {
                            const componentData = cd as any;
                            if (Array.isArray(componentData)) {
                                 const isComponentExpanded = expandedRows.has(key);
                                 return (
                                    <React.Fragment key={key}>
                                        {renderSummaryRow(componentData, key, key, isComponentExpanded, 0)}
                                        {isComponentExpanded && componentData.map((item: any, index: number) => renderDataRow(item, `${key}-${index}`, 1))}
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

export default BAR1Report;
