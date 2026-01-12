
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

    const bedsData = useMemo(() => {
        const isYearSelected = selectedYear !== 'All';
        const targetYear = parseInt(selectedYear);
        const prevYear = targetYear - 1;

        const checkDate = (dateStr: string | undefined, year: number, startMonth: number, endMonth: number) => {
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

        // Helper to retrieve previous year data
        const getPrevYearValues = (indicatorName: string, type: 'Subproject' | 'Training' | 'Activity' | 'Staff' | 'Office', rowItem: any) => {
            if (!isYearSelected) return { janSeptActual: 0, octDecEstimate: 0, prevTotal: 0 };

            let sourceList: any[] = [];
            if (type === 'Subproject') sourceList = data.subprojects;
            else if (type === 'Training') sourceList = data.trainings;
            else if (type === 'Activity') sourceList = data.otherActivities;
            else if (type === 'Staff') sourceList = data.staffingReqs;
            else if (type === 'Office') sourceList = [...data.officeReqs, ...data.otherProgramExpenses];

            const matchedItems = sourceList.filter(item => {
                const year = item.fundingYear || item.fundYear;
                if (year !== prevYear) return false;
                if (item.operatingUnit !== rowItem.operatingUnit) return false;

                let nameMatches = false;
                if (type === 'Subproject' || type === 'Training' || type === 'Activity') nameMatches = item.name === indicatorName;
                else if (type === 'Staff') nameMatches = item.personnelPosition === indicatorName;
                else if (type === 'Office') nameMatches = (item.equipment || item.particulars) === indicatorName;
                if (!nameMatches) return false;

                if (selectedFundType !== 'All' && item.fundType !== selectedFundType) return false;
                if (selectedTier !== 'All' && item.tier !== selectedTier) return false;
                return true;
            });

            let janSeptActual = 0;
            let octDecEstimate = 0;

            matchedItems.forEach(item => {
                let details: any[] = [];
                if (type === 'Subproject') details = item.details;
                else if (type === 'Training' || type === 'Activity') details = item.expenses;
                else details = [item];

                details.forEach((d: any) => {
                    // Actual (Obligated)
                    if (d.actualObligationDate && d.actualAmount && checkDate(d.actualObligationDate, prevYear, 0, 8)) {
                        janSeptActual += d.actualAmount;
                    }
                    // Estimate (Planned Obligation)
                    const targetDate = d.obligationMonth || d.obligationDate;
                    const targetAmount = d.amount || (d.pricePerUnit * d.numberOfUnits) || d.annualSalary;
                    if (targetDate && checkDate(targetDate, prevYear, 9, 11)) {
                        octDecEstimate += targetAmount;
                    }
                });
            });

            return { janSeptActual, octDecEstimate, prevTotal: janSeptActual + octDecEstimate };
        };

        // Helper to calculate Comprehensive Release (Current Year Targets)
        const getCompReleaseValues = (details: any[]) => {
            const result = { q1: 0, q2: 0, q3: 0, q4: 0, subtotal: 0 };
            if (!isYearSelected) return result;

            details.forEach(d => {
                // Determine target amount
                const amount = d.amount || (d.pricePerUnit * d.numberOfUnits) || d.annualSalary;
                // Determine target date
                const date = d.obligationMonth || d.obligationDate;
                
                const q = getQuarter(date);
                if (q === 1) result.q1 += amount;
                else if (q === 2) result.q2 += amount;
                else if (q === 3) result.q3 += amount;
                else if (q === 4) result.q4 += amount;
            });
            result.subtotal = result.q1 + result.q2 + result.q3 + result.q4;
            return result;
        };

        const createItem = (indicator: string, type: 'Subproject' | 'Training' | 'Activity' | 'Staff' | 'Office', rowItem: any, details: any[]) => {
            const { janSeptActual, octDecEstimate, prevTotal } = getPrevYearValues(indicator, type, rowItem);
            const compRelease = getCompReleaseValues(details);
            const laterRelease = { q1: 0, q2: 0, q3: 0, q4: 0, subtotal: 0 }; // Placeholders
            
            return {
                indicator,
                janSeptActual,
                octDecEstimate,
                prevTotal,
                currTotal: compRelease.subtotal + laterRelease.subtotal,
                
                compQ1: compRelease.q1,
                compQ2: compRelease.q2,
                compQ3: compRelease.q3,
                compQ4: compRelease.q4,
                compSubtotal: compRelease.subtotal,

                laterQ1: laterRelease.q1,
                laterQ2: laterRelease.q2,
                laterQ3: laterRelease.q3,
                laterQ4: laterRelease.q4,
                laterSubtotal: laterRelease.subtotal,
            };
        };

        // Process Subprojects
        data.subprojects.forEach(sp => {
            const item = createItem(sp.name, 'Subproject', sp, sp.details);
            const packageKey = sp.packageType;
            if (!finalData['Production and Livelihood'].packages[packageKey]) {
                finalData['Production and Livelihood'].packages[packageKey] = { items: [] };
            }
            finalData['Production and Livelihood'].packages[packageKey].items.push(item);
        });

        // Process Trainings
        data.trainings.forEach(t => {
            const item = createItem(t.name, 'Training', t, t.expenses);
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
            const item = createItem(oa.name, 'Activity', oa, oa.expenses);
            if (oa.component === 'Program Management') {
                 finalData['Program Management'].packages['Activities'].items.push(item);
            } else if (finalData[oa.component]) {
                finalData[oa.component].push(item);
            }
        });

        // Process Program Management
        const processPm = (items: any[], pkgKey: string, type: 'Staff' | 'Office') => {
            items.forEach(pm => {
                const indicator = pm.personnelPosition || pm.equipment || pm.particulars;
                const item = createItem(indicator, type, pm, [pm]);
                finalData['Program Management'].packages[pkgKey].items.push(item);
            });
        }
        processPm(data.staffingReqs, 'Staff Requirements', 'Staff');
        processPm(data.officeReqs, 'Office Requirements', 'Office');
        processPm(data.otherProgramExpenses, 'Office Requirements', 'Office');

        const plPackageKeys = Object.keys(finalData['Production and Livelihood'].packages).sort();
        const sortedPLPackageData: { [key: string]: any } = {};
        for (const key of plPackageKeys) sortedPLPackageData[key] = finalData['Production and Livelihood'].packages[key];
        finalData['Production and Livelihood'].packages = sortedPLPackageData;

        return finalData;
    }, [data, selectedYear, selectedFundType, selectedTier]);

    const calculateTotals = (items: any[]) => {
        return items.reduce((acc, item) => {
            acc.janSeptActual += (item.janSeptActual || 0);
            acc.octDecEstimate += (item.octDecEstimate || 0);
            acc.prevTotal += (item.prevTotal || 0);
            
            acc.currTotal += (item.currTotal || 0);
            
            acc.compQ1 += (item.compQ1 || 0);
            acc.compQ2 += (item.compQ2 || 0);
            acc.compQ3 += (item.compQ3 || 0);
            acc.compQ4 += (item.compQ4 || 0);
            acc.compSubtotal += (item.compSubtotal || 0);

            acc.laterQ1 += (item.laterQ1 || 0);
            acc.laterQ2 += (item.laterQ2 || 0);
            acc.laterQ3 += (item.laterQ3 || 0);
            acc.laterQ4 += (item.laterQ4 || 0);
            acc.laterSubtotal += (item.laterSubtotal || 0);

            return acc;
        }, { 
            janSeptActual: 0, octDecEstimate: 0, prevTotal: 0,
            currTotal: 0,
            compQ1: 0, compQ2: 0, compQ3: 0, compQ4: 0, compSubtotal: 0,
            laterQ1: 0, laterQ2: 0, laterQ3: 0, laterQ4: 0, laterSubtotal: 0
        });
    };

    const renderTotalsRow = (items: any[], label: string) => {
        const totals = calculateTotals(items);
        return (
            <tr className="font-bold bg-gray-200 dark:bg-gray-700 text-xs">
                <td className={`${dataCellClass} sticky left-0 bg-gray-200 dark:bg-gray-700 z-10`}>{label}</td>
                <td className={`${dataCellClass} text-center`}></td>
                
                {/* Current Year Obligation */}
                <td className={`${dataCellClass} text-right`}>{totals.janSeptActual > 0 ? formatCurrency(totals.janSeptActual) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.octDecEstimate > 0 ? formatCurrency(totals.octDecEstimate) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.prevTotal > 0 ? formatCurrency(totals.prevTotal) : ''}</td>
                
                {/* Total Target */}
                <td className={`${dataCellClass} text-right bg-blue-50 dark:bg-blue-900/20`}>{totals.currTotal > 0 ? formatCurrency(totals.currTotal) : ''}</td>

                {/* Comprehensive Release */}
                <td className={`${dataCellClass} text-right`}>{totals.compQ1 > 0 ? formatCurrency(totals.compQ1) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.compQ2 > 0 ? formatCurrency(totals.compQ2) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.compQ3 > 0 ? formatCurrency(totals.compQ3) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.compQ4 > 0 ? formatCurrency(totals.compQ4) : ''}</td>
                <td className={`${dataCellClass} text-right font-semibold`}>{totals.compSubtotal > 0 ? formatCurrency(totals.compSubtotal) : ''}</td>

                {/* For Later Release */}
                <td className={`${dataCellClass} text-right`}>{totals.laterQ1 > 0 ? formatCurrency(totals.laterQ1) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.laterQ2 > 0 ? formatCurrency(totals.laterQ2) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.laterQ3 > 0 ? formatCurrency(totals.laterQ3) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.laterQ4 > 0 ? formatCurrency(totals.laterQ4) : ''}</td>
                <td className={`${dataCellClass} text-right font-semibold`}>{totals.laterSubtotal > 0 ? formatCurrency(totals.laterSubtotal) : ''}</td>
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
                    <td colSpan={16} className={`${dataCellClass} text-center italic text-gray-500 dark:text-gray-400`}>No activities for this component.</td>
                </tr>
            )
        }
        const totals = calculateTotals(items);
        return (
             <tr onClick={() => toggleRow(rowKey)} className="font-bold bg-gray-100 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer text-xs">
                <td className={`${dataCellClass} ${indentClasses[indentLevel]} sticky left-0 bg-gray-100 dark:bg-gray-700 z-10`}>
                    <span className="inline-block w-5 text-center text-gray-500 dark:text-gray-400">{isExpanded ? '−' : '+'}</span> {label}
                </td>
                <td className={`${dataCellClass} text-center`}></td>
                
                {/* Current Year Obligation */}
                <td className={`${dataCellClass} text-right`}>{totals.janSeptActual > 0 ? formatCurrency(totals.janSeptActual) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.octDecEstimate > 0 ? formatCurrency(totals.octDecEstimate) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.prevTotal > 0 ? formatCurrency(totals.prevTotal) : ''}</td>

                {/* Total Target */}
                <td className={`${dataCellClass} text-right bg-blue-50 dark:bg-blue-900/20`}>{totals.currTotal > 0 ? formatCurrency(totals.currTotal) : ''}</td>

                {/* Comprehensive Release */}
                <td className={`${dataCellClass} text-right`}>{totals.compQ1 > 0 ? formatCurrency(totals.compQ1) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.compQ2 > 0 ? formatCurrency(totals.compQ2) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.compQ3 > 0 ? formatCurrency(totals.compQ3) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.compQ4 > 0 ? formatCurrency(totals.compQ4) : ''}</td>
                <td className={`${dataCellClass} text-right font-semibold`}>{totals.compSubtotal > 0 ? formatCurrency(totals.compSubtotal) : ''}</td>

                {/* For Later Release */}
                <td className={`${dataCellClass} text-right`}>{totals.laterQ1 > 0 ? formatCurrency(totals.laterQ1) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.laterQ2 > 0 ? formatCurrency(totals.laterQ2) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.laterQ3 > 0 ? formatCurrency(totals.laterQ3) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{totals.laterQ4 > 0 ? formatCurrency(totals.laterQ4) : ''}</td>
                <td className={`${dataCellClass} text-right font-semibold`}>{totals.laterSubtotal > 0 ? formatCurrency(totals.laterSubtotal) : ''}</td>
            </tr>
        );
    };

    const renderDataRow = (item: any, key: string, indentLevel = 0) => {
        return (
            <tr key={key}>
                <td className={`${dataCellClass} ${indentClasses[indentLevel]} sticky left-0 bg-white dark:bg-gray-800 z-10`}>{item.indicator}</td>
                <td className={`${dataCellClass} text-center`}>number</td>
                
                {/* Current Year Obligation */}
                <td className={`${dataCellClass} text-right`}>{item.janSeptActual > 0 ? formatCurrency(item.janSeptActual) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{item.octDecEstimate > 0 ? formatCurrency(item.octDecEstimate) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{item.prevTotal > 0 ? formatCurrency(item.prevTotal) : ''}</td>

                {/* Total Target */}
                <td className={`${dataCellClass} text-right bg-blue-50 dark:bg-blue-900/20`}>{item.currTotal > 0 ? formatCurrency(item.currTotal) : ''}</td>

                {/* Comprehensive Release */}
                <td className={`${dataCellClass} text-right`}>{item.compQ1 > 0 ? formatCurrency(item.compQ1) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{item.compQ2 > 0 ? formatCurrency(item.compQ2) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{item.compQ3 > 0 ? formatCurrency(item.compQ3) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{item.compQ4 > 0 ? formatCurrency(item.compQ4) : ''}</td>
                <td className={`${dataCellClass} text-right font-semibold`}>{item.compSubtotal > 0 ? formatCurrency(item.compSubtotal) : ''}</td>

                {/* For Later Release */}
                <td className={`${dataCellClass} text-right`}>{item.laterQ1 > 0 ? formatCurrency(item.laterQ1) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{item.laterQ2 > 0 ? formatCurrency(item.laterQ2) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{item.laterQ3 > 0 ? formatCurrency(item.laterQ3) : ''}</td>
                <td className={`${dataCellClass} text-right`}>{item.laterQ4 > 0 ? formatCurrency(item.laterQ4) : ''}</td>
                <td className={`${dataCellClass} text-right font-semibold`}>{item.laterSubtotal > 0 ? formatCurrency(item.laterSubtotal) : ''}</td>
            </tr>
        )
    };

    const grandTotals = useMemo(() => Object.values(bedsData).flatMap((component: any) => {
        if (Array.isArray(component)) return component;
        if (component.isExpandable) return component.items;
        if (component.isNestedExpandable) return (Object.values(component.packages) as any[]).flatMap((pkg: any) => pkg.items);
        return [];
    }), [bedsData]);

    const handleDownloadBedsXlsx = () => {
        const aoa: (string | number | null)[][] = [
            [
                "Program/Activity/Project", 
                "Performance Indicator", 
                "Current Year Obligation", 
                null, 
                null,
                "Total Target",
                "Comprehensive Release",
                null,
                null,
                null,
                null,
                "For Later Release",
                null,
                null,
                null,
                null
            ],
            [
                null, 
                null, 
                "Actual (Jan-Sept)", 
                "Estimate (Oct-Dec)", 
                "Total",
                null,
                "Q1",
                "Q2",
                "Q3",
                "Q4",
                "Subtotal",
                "Q1",
                "Q2",
                "Q3",
                "Q4",
                "Subtotal"
            ]
        ];

        const processItems = (items: any[]) => {
            items.forEach(item => {
                aoa.push([
                    item.indicator, "number", item.janSeptActual, item.octDecEstimate, item.prevTotal,
                    item.currTotal,
                    item.compQ1, item.compQ2, item.compQ3, item.compQ4, item.compSubtotal,
                    item.laterQ1, item.laterQ2, item.laterQ3, item.laterQ4, item.laterSubtotal
                ]);
            });
        };

        const addTotalsRow = (items: any[], label: string) => {
            const totals = items.reduce((acc, item) => ({
                janSeptActual: acc.janSeptActual + (item.janSeptActual || 0),
                octDecEstimate: acc.octDecEstimate + (item.octDecEstimate || 0),
                prevTotal: acc.prevTotal + (item.prevTotal || 0),
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
            }), { 
                janSeptActual: 0, octDecEstimate: 0, prevTotal: 0, currTotal: 0,
                compQ1: 0, compQ2: 0, compQ3: 0, compQ4: 0, compSubtotal: 0,
                laterQ1: 0, laterQ2: 0, laterQ3: 0, laterQ4: 0, laterSubtotal: 0
            });

            aoa.push([
                label, "", totals.janSeptActual, totals.octDecEstimate, totals.prevTotal,
                totals.currTotal,
                totals.compQ1, totals.compQ2, totals.compQ3, totals.compQ4, totals.compSubtotal,
                totals.laterQ1, totals.laterQ2, totals.laterQ3, totals.laterQ4, totals.laterSubtotal
            ]);
        };

        Object.entries(bedsData).forEach(([component, items]) => {
            aoa.push([component, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]);
            if (Array.isArray(items)) {
                if (items.length > 0) processItems(items);
            } else if ((items as any).isExpandable) {
                if ((items as any).items.length > 0) processItems((items as any).items);
            } else if ((items as any).isNestedExpandable) {
                Object.entries((items as any).packages).forEach(([packageName, packageData]: [string, any]) => {
                    aoa.push([`  ${packageName}`, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]);
                    if ((packageData as any).items.length > 0) processItems((packageData as any).items);
                });
            }
        });

        const grandTotals = Object.values(bedsData).flatMap((component: any) => {
            if (Array.isArray(component)) return component;
            if (component.isExpandable) return component.items;
            if (component.isNestedExpandable) return (Object.values(component.packages) as any[]).flatMap((pkg: any) => pkg.items);
            return [];
        });

        addTotalsRow(grandTotals, "GRAND TOTAL");

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        
        if(!ws['!merges']) ws['!merges'] = [];
        ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } });
        ws['!merges'].push({ s: { r: 0, c: 1 }, e: { r: 1, c: 1 } });
        ws['!merges'].push({ s: { r: 0, c: 2 }, e: { r: 0, c: 4 } });
        ws['!merges'].push({ s: { r: 0, c: 5 }, e: { r: 1, c: 5 } });
        ws['!merges'].push({ s: { r: 0, c: 6 }, e: { r: 0, c: 10 } });
        ws['!merges'].push({ s: { r: 0, c: 11 }, e: { r: 0, c: 15 } });

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "BEDS Report");
        XLSX.writeFile(wb, `BEDS_Report_${selectedYear}_${selectedOu}.xlsx`);
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            <div className="flex justify-between items-center mb-4 print-hidden">
                <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Budget Execution Documents (BEDS)</h3>
                <button onClick={handleDownloadBedsXlsx} className="px-4 py-2 bg-accent text-white rounded-md font-semibold hover:brightness-95">Download XLSX</button>
            </div>
            <div id="beds-report" className="overflow-x-auto shadow-md rounded-lg">
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
                        {Object.entries(bedsData).map(([key, cd]) => {
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
}

export default BEDSReport;
