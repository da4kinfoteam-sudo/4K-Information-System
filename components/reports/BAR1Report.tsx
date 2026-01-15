
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

        const initializeCounter = () => ({
            m1: 0, m2: 0, m3: 0, q1: 0,
            m4: 0, m5: 0, m6: 0, q2: 0,
            m7: 0, m8: 0, m9: 0, q3: 0,
            m10: 0, m11: 0, m12: 0, q4: 0,
            total: 0
        });

        const incrementCounter = (counter: any, dateStr?: string, count: number = 1) => {
            const monthIdx = getMonthIndex(dateStr);
            if (monthIdx !== -1) {
                const monthKey = `m${monthIdx + 1}`;
                counter[monthKey] += count;
                
                // Update Quarter Totals
                if (monthIdx < 3) counter.q1 += count;
                else if (monthIdx < 6) counter.q2 += count;
                else if (monthIdx < 9) counter.q3 += count;
                else counter.q4 += count;
                
                counter.total += count;
            }
        };

        const createBar1Item = (indicator: string, physicalCount: number, targetDate?: string, actualDate?: string) => {
            const item: any = {
                indicator,
                target: initializeCounter(),
                actual: initializeCounter()
            };

            incrementCounter(item.target, targetDate, physicalCount);
            incrementCounter(item.actual, actualDate, physicalCount);

            return item;
        };

        // Process Subprojects
        data.subprojects.forEach(sp => {
            // Target: Estimated completion date
            // Actual: Actual completion date
            const item = createBar1Item(sp.name, 1, sp.estimatedCompletionDate, sp.actualCompletionDate);
            const packageKey = sp.packageType;
            if (!finalData['Production and Livelihood'].packages[packageKey]) {
                finalData['Production and Livelihood'].packages[packageKey] = { items: [] };
            }
            finalData['Production and Livelihood'].packages[packageKey].items.push(item);
        });

        // Process Trainings
        data.trainings.forEach(t => {
            const item = createBar1Item(t.name, 1, t.date, t.actualDate);
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
            const item = createBar1Item(oa.name, 1, oa.date, oa.actualDate);
            if (oa.component === 'Program Management') {
                 finalData['Program Management'].packages['Activities'].items.push(item);
            } else if (finalData[oa.component]) {
                finalData[oa.component].push(item);
            }
        });

        // Process PM Items
        const processPm = (items: any[], pkgKey: string, isStaff = false, isOtherExpense = false) => {
            items.forEach(pm => {
                if (isOtherExpense) return; // Other Expenses do not have physical targets for BAR 1

                const indicator = isStaff ? pm.personnelPosition : (pm.equipment || pm.particulars);
                const count = isStaff ? 1 : (pm.numberOfUnits || 1);
                // Target: Obligation Date (as a proxy for target completion if not specified)
                // Actual: Actual Date
                const item = createBar1Item(indicator, count, pm.obligationDate, pm.actualDate);
                finalData['Program Management'].packages[pkgKey].items.push(item);
            });
        }
        processPm(data.staffingReqs, 'Staff Requirements', true);
        processPm(data.officeReqs, 'Office Requirements');
        processPm(data.otherProgramExpenses, 'Office Requirements', false, true);

        const plPackageKeys = Object.keys(finalData['Production and Livelihood'].packages).sort();
        const sortedPLPackageData: { [key: string]: any } = {};
        for (const key of plPackageKeys) sortedPLPackageData[key] = finalData['Production and Livelihood'].packages[key];
        finalData['Production and Livelihood'].packages = sortedPLPackageData;

        return finalData;
    }, [data]);

    const calculateTotals = (items: any[]) => {
        const initial = {
            m1: 0, m2: 0, m3: 0, q1: 0,
            m4: 0, m5: 0, m6: 0, q2: 0,
            m7: 0, m8: 0, m9: 0, q3: 0,
            m10: 0, m11: 0, m12: 0, q4: 0,
            total: 0
        };

        const total = {
            target: { ...initial },
            actual: { ...initial }
        };

        items.forEach(item => {
            for (let i = 1; i <= 12; i++) {
                total.target[`m${i}`] += (item.target[`m${i}`] || 0);
                total.actual[`m${i}`] += (item.actual[`m${i}`] || 0);
            }
            total.target.q1 += (item.target.q1 || 0); total.actual.q1 += (item.actual.q1 || 0);
            total.target.q2 += (item.target.q2 || 0); total.actual.q2 += (item.actual.q2 || 0);
            total.target.q3 += (item.target.q3 || 0); total.actual.q3 += (item.actual.q3 || 0);
            total.target.q4 += (item.target.q4 || 0); total.actual.q4 += (item.actual.q4 || 0);
            total.target.total += (item.target.total || 0); total.actual.total += (item.actual.total || 0);
        });
        return total;
    };

    const renderDataCells = (item: any, isTotal: boolean = false) => {
        const cellClass = `${dataCellClass} text-center ${isTotal ? 'font-bold' : ''}`;
        const totalClass = `${dataCellClass} text-center font-bold bg-gray-50 dark:bg-gray-700/50`;
        const calculatedClass = `${dataCellClass} text-center font-bold bg-blue-50 dark:bg-blue-900/30`;
        const yearEndClass = `${dataCellClass} text-center font-bold bg-yellow-50 dark:bg-yellow-900/20`;
        const percentClass = `${dataCellClass} text-center text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800`;

        const getVals = (source: any) => {
             const semestralTotal = (source.q1 || 0) + (source.q2 || 0);
             const asOfSept = semestralTotal + (source.q3 || 0);
             const yearEndNov = (source.total || 0) - (source.m12 || 0);
             return { ...source, semestralTotal, asOfSept, yearEndNov };
        }

        const t = getVals(item.target);
        const a = getVals(item.actual);

        const getPct = (actual: number, target: number) => {
            if (!target) return '';
            return `${Math.round((actual / target) * 100)}%`;
        };

        const renderTargetSection = () => (
            <>
                <td className={cellClass}>{t.m1 || ''}</td>
                <td className={cellClass}>{t.m2 || ''}</td>
                <td className={cellClass}>{t.m3 || ''}</td>
                <td className={totalClass}>{t.q1 || ''}</td>

                <td className={cellClass}>{t.m4 || ''}</td>
                <td className={cellClass}>{t.m5 || ''}</td>
                <td className={cellClass}>{t.m6 || ''}</td>
                <td className={totalClass}>{t.q2 || ''}</td>

                <td className={calculatedClass}>{t.semestralTotal || ''}</td>

                <td className={cellClass}>{t.m7 || ''}</td>
                <td className={cellClass}>{t.m8 || ''}</td>
                <td className={cellClass}>{t.m9 || ''}</td>
                <td className={totalClass}>{t.q3 || ''}</td>

                <td className={calculatedClass}>{t.asOfSept || ''}</td>

                <td className={cellClass}>{t.m10 || ''}</td>
                <td className={cellClass}>{t.m11 || ''}</td>
                <td className={cellClass}>{t.m12 || ''}</td>
                <td className={totalClass}>{t.q4 || ''}</td>

                <td className={yearEndClass}>{t.yearEndNov || ''}</td>
                <td className={`${dataCellClass} text-center font-bold bg-blue-100 dark:bg-blue-900/40`}>{t.total || ''}</td>
            </>
        );

        const renderActualSection = () => (
            <>
                <td className={cellClass}>{a.m1 || ''}</td>
                <td className={cellClass}>{a.m2 || ''}</td>
                <td className={cellClass}>{a.m3 || ''}</td>
                <td className={totalClass}>{a.q1 || ''}</td>
                <td className={percentClass}>{getPct(a.q1, t.q1)}</td>

                <td className={cellClass}>{a.m4 || ''}</td>
                <td className={cellClass}>{a.m5 || ''}</td>
                <td className={cellClass}>{a.m6 || ''}</td>
                <td className={totalClass}>{a.q2 || ''}</td>
                <td className={percentClass}>{getPct(a.q2, t.q2)}</td>

                <td className={calculatedClass}>{a.semestralTotal || ''}</td>
                <td className={percentClass}>{getPct(a.semestralTotal, t.semestralTotal)}</td>

                <td className={cellClass}>{a.m7 || ''}</td>
                <td className={cellClass}>{a.m8 || ''}</td>
                <td className={cellClass}>{a.m9 || ''}</td>
                <td className={totalClass}>{a.q3 || ''}</td>
                <td className={percentClass}>{getPct(a.q3, t.q3)}</td>

                <td className={calculatedClass}>{a.asOfSept || ''}</td>
                <td className={percentClass}>{getPct(a.asOfSept, t.asOfSept)}</td>

                <td className={cellClass}>{a.m10 || ''}</td>
                <td className={cellClass}>{a.m11 || ''}</td>
                <td className={cellClass}>{a.m12 || ''}</td>
                <td className={totalClass}>{a.q4 || ''}</td>
                <td className={percentClass}>{getPct(a.q4, t.q4)}</td>

                <td className={yearEndClass}>{a.yearEndNov || ''}</td>
                <td className={percentClass}>{getPct(a.yearEndNov, t.yearEndNov)}</td>

                <td className={`${dataCellClass} text-center font-bold bg-blue-100 dark:bg-blue-900/40`}>{a.total || ''}</td>
                <td className={percentClass}>{getPct(a.total, t.total)}</td>
            </>
        );

        return (
            <>
                {renderTargetSection()}
                {/* Visual separator */}
                <td className="w-1 bg-gray-400 dark:bg-gray-500"></td> 
                {renderActualSection()}
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
                    {/* Span across targets (20) + separator (1) + actuals (28) = 49 */}
                    <td colSpan={49} className={`${dataCellClass} text-center italic text-gray-500 dark:text-gray-400`}>No activities for this component.</td>
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
        // Headers construction
        const header1 = ["Program/Activity/Project"];
        const header2 = [null]; // Placeholder for P/A/P

        const sectionHeaders1 = [
            "1st Quarter", null, null, null, 
            "2nd Quarter", null, null, null, 
            "Semestral Total",
            "3rd Quarter", null, null, null, 
            "As of September",
            "4th Quarter", null, null, null, 
            "Year End (As of Nov)",
            "Grand Total"
        ];
        
        const sectionHeadersTarget = [
            "Jan", "Feb", "Mar", "Total",
            "Apr", "May", "Jun", "Total",
            null, // Semestral
            "Jul", "Aug", "Sep", "Total",
            null, // As of Sept
            "Oct", "Nov", "Dec", "Total",
            null, // Year End
            null  // Grand Total
        ];

        const sectionHeadersActual = [
            "Jan", "Feb", "Mar", "Total", "%",
            "Apr", "May", "Jun", "Total", "%",
            "Total", "%",
            "Jul", "Aug", "Sep", "Total", "%",
            "Total", "%",
            "Oct", "Nov", "Dec", "Total", "%",
            "Total", "%",
            "Total", "%"
        ];

        const sectionHeadersActualGroups = [
            "1st Quarter", null, null, null, null,
            "2nd Quarter", null, null, null, null, 
            "Semestral Total", null,
            "3rd Quarter", null, null, null, null,
            "As of September", null,
            "4th Quarter", null, null, null, null,
            "Year End (As of Nov)", null,
            "Grand Total", null
        ];

        // Targets Header
        header1.push(...sectionHeaders1, null, ...sectionHeadersActualGroups);
        header2.push(...sectionHeadersTarget, null, ...sectionHeadersActual);

        const aoa: (string | number | null)[][] = [
            [null, "Physical Targets", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, "Physical Accomplishments", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
            header1,
            header2
        ];

        const processItems = (items: any[]) => {
            items.forEach(item => {
                const getVals = (source: any) => {
                    const semestralTotal = (source.q1 || 0) + (source.q2 || 0);
                    const asOfSept = semestralTotal + (source.q3 || 0);
                    const yearEndNov = (source.total || 0) - (source.m12 || 0);
                    return { ...source, semestralTotal, asOfSept, yearEndNov };
               }
               const t = getVals(item.target);
               const a = getVals(item.actual);

               const getPct = (act: number, tgt: number) => {
                   if (!tgt) return null;
                   return Math.round((act / tgt) * 100) + '%';
               };

                aoa.push([
                    item.indicator,
                    // Targets
                    t.m1, t.m2, t.m3, t.q1,
                    t.m4, t.m5, t.m6, t.q2,
                    t.semestralTotal,
                    t.m7, t.m8, t.m9, t.q3,
                    t.asOfSept,
                    t.m10, t.m11, t.m12, t.q4,
                    t.yearEndNov,
                    t.total,
                    null, // Separator
                    // Actuals with %
                    a.m1, a.m2, a.m3, a.q1, getPct(a.q1, t.q1),
                    a.m4, a.m5, a.m6, a.q2, getPct(a.q2, t.q2),
                    a.semestralTotal, getPct(a.semestralTotal, t.semestralTotal),
                    a.m7, a.m8, a.m9, a.q3, getPct(a.q3, t.q3),
                    a.asOfSept, getPct(a.asOfSept, t.asOfSept),
                    a.m10, a.m11, a.m12, a.q4, getPct(a.q4, t.q4),
                    a.yearEndNov, getPct(a.yearEndNov, t.yearEndNov),
                    a.total, getPct(a.total, t.total)
                ]);
            });
        };

        const addTotalsRow = (items: any[], label: string) => {
            const totals = calculateTotals(items);
            const getVals = (source: any) => {
                const semestralTotal = (source.q1 || 0) + (source.q2 || 0);
                const asOfSept = semestralTotal + (source.q3 || 0);
                const yearEndNov = (source.total || 0) - (source.m12 || 0);
                return { ...source, semestralTotal, asOfSept, yearEndNov };
           }
           const t = getVals(totals.target);
           const a = getVals(totals.actual);

           const getPct = (act: number, tgt: number) => {
               if (!tgt) return null;
               return Math.round((act / tgt) * 100) + '%';
           };

            aoa.push([
                label,
                // Targets
                t.m1, t.m2, t.m3, t.q1,
                t.m4, t.m5, t.m6, t.q2,
                t.semestralTotal,
                t.m7, t.m8, t.m9, t.q3,
                t.asOfSept,
                t.m10, t.m11, t.m12, t.q4,
                t.yearEndNov,
                t.total,
                null,
                // Actuals
                a.m1, a.m2, a.m3, a.q1, getPct(a.q1, t.q1),
                a.m4, a.m5, a.m6, a.q2, getPct(a.q2, t.q2),
                a.semestralTotal, getPct(a.semestralTotal, t.semestralTotal),
                a.m7, a.m8, a.m9, a.q3, getPct(a.q3, t.q3),
                a.asOfSept, getPct(a.asOfSept, t.asOfSept),
                a.m10, a.m11, a.m12, a.q4, getPct(a.q4, t.q4),
                a.yearEndNov, getPct(a.yearEndNov, t.yearEndNov),
                a.total, getPct(a.total, t.total)
            ]);
        };

        Object.entries(bar1Data).forEach(([component, items]) => {
            aoa.push([component, ...Array(49).fill(null)]);
            if (Array.isArray(items)) {
                if (items.length > 0) processItems(items);
            } else if ((items as any).isExpandable) {
                if ((items as any).items.length > 0) processItems((items as any).items);
            } else if ((items as any).isNestedExpandable) {
                Object.entries((items as any).packages).forEach(([packageName, packageData]: [string, any]) => {
                    aoa.push([`  ${packageName}`, ...Array(49).fill(null)]);
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
        
        // Basic Merges for Headers
        if(!ws['!merges']) ws['!merges'] = [];
        // Top Row Merges
        ws['!merges'].push({ s: { r: 0, c: 1 }, e: { r: 0, c: 20 } }); // Physical Targets
        ws['!merges'].push({ s: { r: 0, c: 22 }, e: { r: 0, c: 49 } }); // Physical Accomplishments

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "BAR1 Report");
        XLSX.writeFile(wb, `BAR1_Report_${selectedYear}_${selectedOu}.xlsx`);
    };

    const SectionHeaderTarget = ({ bgColor }: { bgColor: string }) => (
        <>
            <th colSpan={4} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>1st Quarter</th>
            <th colSpan={4} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>2nd Quarter</th>
            <th rowSpan={2} className={`p-2 border border-gray-300 dark:border-gray-600 text-center align-middle font-bold ${bgColor} opacity-90`}>Semestral Total</th>
            <th colSpan={4} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>3rd Quarter</th>
            <th rowSpan={2} className={`p-2 border border-gray-300 dark:border-gray-600 text-center align-middle font-bold ${bgColor} opacity-90`}>As of September</th>
            <th colSpan={4} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>4th Quarter</th>
            <th rowSpan={2} className={`p-2 border border-gray-300 dark:border-gray-600 text-center align-middle font-bold ${bgColor} opacity-80`}>Year End (As of Nov)</th>
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
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[40px] italic">%</th>
            
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Apr</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">May</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Jun</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[40px] italic">%</th>

            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[40px] italic">%</th>
            
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Jul</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Aug</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Sep</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[40px] italic">%</th>

            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[40px] italic">%</th>
            
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Oct</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Nov</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Dec</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[40px] italic">%</th>

            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[40px] italic">%</th>

            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[40px] italic">%</th>
        </>
    );

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
                            <th rowSpan={3} className="p-2 border border-gray-300 dark:border-gray-600 align-bottom min-w-[250px] sticky left-0 bg-gray-200 dark:bg-gray-700 z-20 text-left">Program/Activity/Project</th>
                            <th colSpan={20} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold bg-blue-200 dark:bg-blue-900">Physical Targets</th>
                            <th rowSpan={3} className="w-2 bg-gray-400 dark:bg-gray-600"></th> {/* Separator */}
                            <th colSpan={28} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold bg-green-200 dark:bg-green-900">Physical Accomplishments</th>
                        </tr>
                        <tr>
                            <SectionHeaderTarget bgColor="bg-blue-50 dark:bg-blue-900/30" />
                            <SectionHeaderActual bgColor="bg-green-50 dark:bg-green-900/30" />
                        </tr>
                        <tr>
                            <SubHeadersTarget />
                            <SubHeadersActual />
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
