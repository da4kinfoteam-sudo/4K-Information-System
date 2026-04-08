// Author: 4K 
import React, { useMemo, useState } from 'react';
import { Subproject, Training, OtherActivity, OfficeRequirement, StaffingRequirement, OtherProgramExpense } from '../../constants';
import { formatCurrency, getObjectTypeByCode, XLSX } from './ReportUtils';

interface BPFormsReportProps {
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

const formatCurrencyWhole = (amount: number) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.ceil(amount));
};

const ActivityRow: React.FC<{
    activity: any;
    mooeCodes: string[];
    coCodes: string[];
    indentLevel: number;
    dataCellClass: string;
    indentClasses: string[];
    isExpanded?: boolean;
    toggleRow?: (key: string) => void;
    rowKey?: string;
}> = ({ activity, mooeCodes, coCodes, indentLevel, dataCellClass, indentClasses, isExpanded, toggleRow, rowKey }) => {
    const hasParticulars = activity.particulars && activity.particulars.length > 0;
    
    return (
        <tr 
            onClick={() => hasParticulars && toggleRow && rowKey && toggleRow(rowKey)} 
            className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${hasParticulars ? 'cursor-pointer font-semibold bg-gray-50/50 dark:bg-gray-800/50' : ''}`}
        >
            <td className={`${dataCellClass} text-left ${indentClasses[indentLevel]} sticky left-0 bg-inherit z-10 border-r-2 border-r-gray-300 dark:border-r-gray-600`}>
                {hasParticulars && toggleRow && <span className="inline-block w-5 text-center text-gray-500">{isExpanded ? '−' : '+'}</span>}
                {!hasParticulars && <span className="inline-block w-5"></span>}
                {activity.name}
            </td>
            
            {/* MOOE Columns */}
            {mooeCodes.map((code: string) => (
                <td key={`mooe-${code}`} className={`${dataCellClass} text-right whitespace-nowrap`}>{activity.uacsValues[code] > 0 ? formatCurrencyWhole(activity.uacsValues[code]) : ''}</td>
            ))}
            <td className={`${dataCellClass} font-bold text-right whitespace-nowrap bg-blue-50 dark:bg-blue-900/20`}>{activity.totalMOOE > 0 ? formatCurrencyWhole(activity.totalMOOE) : ''}</td>
            
            {/* CO Columns */}
            {coCodes.map((code: string) => (
                <td key={`co-${code}`} className={`${dataCellClass} text-right whitespace-nowrap`}>{activity.uacsValues[code] > 0 ? formatCurrencyWhole(activity.uacsValues[code]) : ''}</td>
            ))}
            <td className={`${dataCellClass} font-bold text-right whitespace-nowrap bg-orange-50 dark:bg-orange-900/20`}>{activity.totalCO > 0 ? formatCurrencyWhole(activity.totalCO) : ''}</td>
            
            {/* Grand Total */}
            <td className={`${dataCellClass} font-bold bg-green-50 dark:bg-green-900/20 text-right whitespace-nowrap`}>{(activity.totalMOOE + activity.totalCO) > 0 ? formatCurrencyWhole(activity.totalMOOE + activity.totalCO) : ''}</td>
        </tr>
    );
};

const ParticularRow: React.FC<{
    particular: any;
    mooeCodes: string[];
    coCodes: string[];
    indentLevel: number;
    dataCellClass: string;
    indentClasses: string[];
}> = ({ particular, mooeCodes, coCodes, indentLevel, dataCellClass, indentClasses }) => {
    return (
        <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/30 text-[11px] italic text-gray-600 dark:text-gray-400">
            <td className={`${dataCellClass} text-left ${indentClasses[indentLevel]} sticky left-0 bg-white dark:bg-gray-800 z-10 border-r-2 border-r-gray-300 dark:border-r-gray-600`}>
                <span className="inline-block w-5"></span> {particular.name}
            </td>
            
            {/* MOOE Columns */}
            {mooeCodes.map((code: string) => (
                <td key={`mooe-${code}`} className={`${dataCellClass} text-right whitespace-nowrap`}>
                    {particular.uacsCode === code && particular.amount > 0 ? formatCurrencyWhole(particular.amount) : ''}
                </td>
            ))}
            <td className={`${dataCellClass} text-right whitespace-nowrap bg-blue-50/30 dark:bg-blue-900/10`}>
                {particular.objectType !== 'CO' ? formatCurrencyWhole(particular.amount) : ''}
            </td>
            
            {/* CO Columns */}
            {coCodes.map((code: string) => (
                <td key={`co-${code}`} className={`${dataCellClass} text-right whitespace-nowrap`}>
                    {particular.uacsCode === code && particular.amount > 0 ? formatCurrencyWhole(particular.amount) : ''}
                </td>
            ))}
            <td className={`${dataCellClass} text-right whitespace-nowrap bg-orange-50/30 dark:bg-orange-900/10`}>
                {particular.objectType === 'CO' ? formatCurrencyWhole(particular.amount) : ''}
            </td>
            
            {/* Grand Total */}
            <td className={`${dataCellClass} bg-green-50/30 dark:bg-green-900/10 text-right whitespace-nowrap`}>{formatCurrencyWhole(particular.amount)}</td>
        </tr>
    );
};

const SummaryRow: React.FC<{
    items: any[];
    label: string;
    rowKey: string;
    isExpanded: boolean;
    indentLevel: number;
    mooeCodes: string[];
    coCodes: string[];
    toggleRow: (key: string) => void;
    dataCellClass: string;
    indentClasses: string[];
}> = ({ items, label, rowKey, isExpanded, indentLevel, mooeCodes, coCodes, toggleRow, dataCellClass, indentClasses }) => {
    const totalCols = mooeCodes.length + coCodes.length + 3; // + MOOE Total, CO Total, Grand Total

    if (!items || items.length === 0) {
        return (
             <tr className="font-bold bg-gray-100 dark:bg-gray-700/50">
                <td className={`${dataCellClass} text-left ${indentClasses[indentLevel]} sticky left-0 bg-gray-100 dark:bg-gray-700 z-10 border-r-2 border-r-gray-300 dark:border-r-gray-600`}>
                     <span className="inline-block w-5 text-center"></span> {label}
                </td>
                <td colSpan={totalCols} className={`${dataCellClass} text-center italic text-gray-500 dark:text-gray-400`}>No activities for this item.</td>
            </tr>
        );
    }

    const summary = useMemo(() => items.reduce((acc, item) => {
        acc.totalMOOE += item.totalMOOE;
        acc.totalCO += item.totalCO;
        [...mooeCodes, ...coCodes].forEach((code: string) => {
            acc.uacsValues[code] = (acc.uacsValues[code] || 0) + (item.uacsValues[code] || 0);
        });
        return acc;
    }, { totalMOOE: 0, totalCO: 0, uacsValues: [...mooeCodes, ...coCodes].reduce((acc: any, code: string) => ({...acc, [code]: 0}), {}) }), [items, mooeCodes, coCodes]);
    
    const numberCellClass = `${dataCellClass} text-right whitespace-nowrap`;

    return (
        <tr onClick={() => toggleRow(rowKey)} className="font-bold bg-gray-100 dark:bg-gray-700/50 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700">
            <td className={`${dataCellClass} text-left ${indentClasses[indentLevel]} sticky left-0 bg-gray-100 dark:bg-gray-700 z-10 border-r-2 border-r-gray-300 dark:border-r-gray-600`}>
                <span className="inline-block w-5 text-center text-gray-500 dark:text-gray-400">{isExpanded ? '−' : '+'}</span> {label}
            </td>
            
            {/* MOOE Summary */}
            {mooeCodes.map((code: string) => (
                <td key={`mooe-${code}`} className={numberCellClass}>{summary.uacsValues[code] > 0 ? formatCurrencyWhole(summary.uacsValues[code]) : ''}</td>
            ))}
            <td className={`${numberCellClass} bg-blue-100 dark:bg-blue-900/30`}>{summary.totalMOOE > 0 ? formatCurrencyWhole(summary.totalMOOE) : ''}</td>

            {/* CO Summary */}
            {coCodes.map((code: string) => (
                <td key={`co-${code}`} className={numberCellClass}>{summary.uacsValues[code] > 0 ? formatCurrencyWhole(summary.uacsValues[code]) : ''}</td>
            ))}
            <td className={`${numberCellClass} bg-orange-100 dark:bg-orange-900/30`}>{summary.totalCO > 0 ? formatCurrencyWhole(summary.totalCO) : ''}</td>

            {/* Grand Total Summary */}
            <td className={`${numberCellClass} bg-green-100 dark:bg-green-900/30`}>{(summary.totalMOOE + summary.totalCO) > 0 ? formatCurrencyWhole(summary.totalMOOE + summary.totalCO) : ''}</td>
        </tr>
    );
};

const BPFormsReport: React.FC<BPFormsReportProps> = ({ data, uacsCodes, selectedYear, selectedOu }) => {
    const [expandedRows, setExpandedRows] = useState(new Set<string>());

    const bpFormsProcessedData = useMemo(() => {
        const headers: { [objectType: string]: { [particular: string]: string[] } } = { MOOE: {}, CO: {} };
        const seenCodes = new Set<string>();
        
        // Helper to ensure code exists in headers (dynamic discovery)
        const ensureHeader = (objType: string, particular: string, code: string, amount: number) => {
            if (!code || amount <= 0) return;
            // Normalize object type
            const typeKey = (objType === 'CO') ? 'CO' : 'MOOE';
            
            if (!headers[typeKey]) headers[typeKey] = {};
            // Attempt to look up the "official" particular name from reference if possible, 
            // otherwise use the one stored in the record.
            let officialParticular = particular || 'Other Expenses';
            if (uacsCodes[typeKey]) {
                for (const part in uacsCodes[typeKey]) {
                    if (uacsCodes[typeKey][part][code]) {
                        officialParticular = part;
                        break;
                    }
                }
            }

            const partKey = officialParticular;
            
            if (!headers[typeKey][partKey]) headers[typeKey][partKey] = [];
            
            if (!headers[typeKey][partKey].includes(code)) {
                headers[typeKey][partKey].push(code);
            }
            seenCodes.add(code);
        };

        const lineItems: any[] = [];
        
        data.subprojects.forEach(sp => {
            sp.details.forEach(d => {
                ensureHeader(d.objectType, d.expenseParticular, d.uacsCode, d.pricePerUnit * d.numberOfUnits);
                lineItems.push({
                    component: 'Production and Livelihood', packageType: sp.packageType, activityName: sp.name,
                    objectType: d.objectType, uacsCode: d.uacsCode, amount: d.pricePerUnit * d.numberOfUnits,
                    particularName: d.expenseParticular,
                    itemParticular: d.particulars
                });
            });
        });
        
        data.trainings.forEach(t => {
            if (t.component === 'Program Management') return; // Skip Program Management Trainings

            t.expenses.forEach(e => {
                ensureHeader(e.objectType, e.expenseParticular, e.uacsCode, e.amount);
                lineItems.push({
                    component: t.component, packageType: undefined, activityName: t.name,
                    objectType: e.objectType, uacsCode: e.uacsCode, amount: e.amount,
                    isTraining: true, particularName: e.expenseParticular
                });
            });
        });
        
        data.otherActivities.forEach(oa => {
            oa.expenses.forEach(e => {
                ensureHeader(e.objectType, e.expenseParticular, e.uacsCode, e.amount);
                const packageType = oa.component === 'Program Management' ? 'Activities' : undefined;
                lineItems.push({
                    component: oa.component, packageType, activityName: oa.name,
                    objectType: e.objectType, uacsCode: e.uacsCode, amount: e.amount,
                    particularName: e.expenseParticular
                });
            });
        });
        
        data.staffingReqs.forEach(sr => {
            const objType = getObjectTypeByCode(sr.uacsCode, uacsCodes);
            ensureHeader(objType, 'Salaries & Wages', sr.uacsCode, sr.annualSalary);
            lineItems.push({
                component: 'Program Management', packageType: 'Staff Requirements', activityName: sr.personnelPosition,
                objectType: objType, uacsCode: sr.uacsCode, amount: sr.annualSalary
            });
        });
        
        data.officeReqs.forEach(or => {
            const objType = getObjectTypeByCode(or.uacsCode, uacsCodes);
            ensureHeader(objType, 'Office Equipment', or.uacsCode, or.pricePerUnit * or.numberOfUnits);
            lineItems.push({
                component: 'Program Management', packageType: 'Office Requirements', activityName: or.equipment,
                objectType: objType, uacsCode: or.uacsCode, amount: or.pricePerUnit * or.numberOfUnits
            });
        });
        
        data.otherProgramExpenses.forEach(ope => {
            const objType = getObjectTypeByCode(ope.uacsCode, uacsCodes);
            ensureHeader(objType, 'Other Expenses', ope.uacsCode, ope.amount);
            lineItems.push({
                component: 'Program Management', packageType: 'Office Requirements', activityName: ope.particulars,
                objectType: objType, uacsCode: ope.uacsCode, amount: ope.amount
            });
        });

        // Derive flat lists of codes for rendering columns, sorting them in ascending order
        const mooeCodes: string[] = [];
        Object.keys(headers.MOOE).forEach(part => {
            headers.MOOE[part].forEach(c => { if (!mooeCodes.includes(c)) mooeCodes.push(c); });
        });
        mooeCodes.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        const coCodes: string[] = [];
        Object.keys(headers.CO).forEach(part => {
            headers.CO[part].forEach(c => { if (!coCodes.includes(c)) coCodes.push(c); });
        });
        coCodes.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        const initialUacsValues = [...mooeCodes, ...coCodes].reduce((acc, code) => ({ ...acc, [code]: 0 }), {});
        
        const groupedData: { [key: string]: any } = {
            'Social Preparation': { isNestedExpandable: true, packages: {} },
            'Production and Livelihood': { isNestedExpandable: true, packages: {} },
            'Marketing and Enterprise': { isNestedExpandable: true, packages: {} },
            'Program Management': { 
                isNestedExpandable: true, 
                packages: {
                    'Staff Requirements': { items: [] },
                    'Office Requirements': { items: [] },
                    'Activities': { items: [] }
                } 
            }
        };
        
        lineItems.forEach(item => {
            if (item.amount <= 0) return;

            let targetList;
            const packageKey = item.packageType || (item.isTraining ? 'Trainings' : 'Activities');
            
            if (groupedData[item.component]) {
                if (!groupedData[item.component].packages[packageKey]) {
                    groupedData[item.component].packages[packageKey] = { items: [] };
                }
                targetList = groupedData[item.component].packages[packageKey].items;
            } else {
                return; 
            }

            let activity = targetList.find((a: any) => a.name === item.activityName);
            if (!activity) {
                activity = { 
                    name: item.activityName, 
                    uacsValues: { ...initialUacsValues }, 
                    totalMOOE: 0, 
                    totalCO: 0,
                    particulars: []
                };
                targetList.push(activity);
            }
            
            if(item.uacsCode) {
                activity.uacsValues[item.uacsCode] = (activity.uacsValues[item.uacsCode] || 0) + item.amount;
                
                // Only add particulars if it's a subproject in Production and Livelihood under Package 1-7
                const isPL = item.component === 'Production and Livelihood';
                const isPackage1to7 = item.packageType && /^Package [1-7](\s|$)/i.test(item.packageType);
                
                if (isPL && isPackage1to7) {
                    activity.particulars.push({
                        name: item.itemParticular || item.particularName || item.uacsCode,
                        uacsCode: item.uacsCode,
                        amount: item.amount,
                        objectType: item.objectType
                    });
                }
            }

            // Determine if MOOE or CO for Total calc
            // Use the determined header grouping to check where it belongs
            const isCO = coCodes.includes(item.uacsCode) || item.objectType === 'CO';
            
            if (isCO) {
                activity.totalCO += item.amount;
            } else {
                activity.totalMOOE += item.amount;
            }
        });
        
        const plPackageKeys = Object.keys(groupedData['Production and Livelihood'].packages);
        plPackageKeys.sort((a, b) => {
            if (a === 'Trainings') return -1;
            if (b === 'Trainings') return 1;
            return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        });
        const plSortedPackages: { [key: string]: any } = {};
        for (const key of plPackageKeys) { plSortedPackages[key] = groupedData['Production and Livelihood'].packages[key]; }
        groupedData['Production and Livelihood'].packages = plSortedPackages;

        return { headers, rows: groupedData, mooeCodes, coCodes };
    }, [data, uacsCodes]);

    const { headers, rows, mooeCodes, coCodes } = bpFormsProcessedData;

    const toggleRow = (key: string) => {
        setExpandedRows(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) newSet.delete(key);
            else newSet.add(key);
            return newSet;
        });
    };

    const grandTotals = useMemo(() => {
        const allActivities: any[] = [];
        Object.values(rows).forEach((componentData: any) => {
            if (Array.isArray(componentData)) {
                allActivities.push(...componentData);
            } else if (componentData.isNestedExpandable) {
                Object.values(componentData.packages).forEach((pkg: any) => {
                    allActivities.push(...pkg.items);
                });
            }
        });

        return allActivities.reduce((acc, item) => {
            acc.totalMOOE += item.totalMOOE;
            acc.totalCO += item.totalCO;
            [...mooeCodes, ...coCodes].forEach((code: string) => {
                acc.uacsValues[code] = (acc.uacsValues[code] || 0) + (item.uacsValues[code] || 0);
            });
            return acc;
        }, {
            totalMOOE: 0,
            totalCO: 0,
            uacsValues: [...mooeCodes, ...coCodes].reduce((acc: any, code: string) => ({...acc, [code]: 0}), {})
        });
    }, [rows, mooeCodes, coCodes]);

    const getDescription = (objType: string, particular: string, code: string) => {
        if (uacsCodes[objType] && uacsCodes[objType][particular] && uacsCodes[objType][particular][code]) {
            return uacsCodes[objType][particular][code];
        }
        // Fallback search
        if (uacsCodes[objType]) {
            for (const p in uacsCodes[objType]) {
                if (uacsCodes[objType][p][code]) return uacsCodes[objType][p][code];
            }
        }
        return '';
    };

    const handlePrint = () => {
        window.print();
    };

    const handleDownloadBpFormsXlsx = () => {
        // Construct grouped headers for XLSX
        const mooeCodesSorted = [...mooeCodes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const coCodesSorted = [...coCodes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        const mooeSpan = mooeCodesSorted.length;
        const coSpan = coCodesSorted.length;
        
        // Row 1: Object Types
        const row1: (string | null)[] = ["Program/Activity/Project"];
        if (mooeSpan > 0) {
            row1.push("MOOE");
            for(let i=1; i<mooeSpan; i++) row1.push(null);
        }
        row1.push("Total MOOE");
        if (coSpan > 0) {
            row1.push("CO");
            for(let i=1; i<coSpan; i++) row1.push(null);
        }
        row1.push("Total CO");
        row1.push("Grand Total");

        // Row 2: Particulars (Merged cells will handle the grouping visually)
        const row2: (string | null)[] = [null];
        mooeCodesSorted.forEach(code => {
            // Find which particular this code belongs to
            let partName = "Other Expenses";
            for (const p in headers.MOOE) {
                if (headers.MOOE[p].includes(code)) {
                    partName = p;
                    break;
                }
            }
            row2.push(partName);
        });
        row2.push(null); // Under Total MOOE
        coCodesSorted.forEach(code => {
            let partName = "Other Expenses";
            for (const p in headers.CO) {
                if (headers.CO[p].includes(code)) {
                    partName = p;
                    break;
                }
            }
            row2.push(partName);
        });
        row2.push(null); // Under Total CO
        row2.push(null); // Under Grand Total

        // Row 3: Descriptions
        const row3: (string | null)[] = [null];
        mooeCodesSorted.forEach(code => {
            let partName = "Other Expenses";
            for (const p in headers.MOOE) {
                if (headers.MOOE[p].includes(code)) {
                    partName = p;
                    break;
                }
            }
            row3.push(getDescription('MOOE', partName, code));
        });
        row3.push(null); // Under Total MOOE
        coCodesSorted.forEach(code => {
            let partName = "Other Expenses";
            for (const p in headers.CO) {
                if (headers.CO[p].includes(code)) {
                    partName = p;
                    break;
                }
            }
            row3.push(getDescription('CO', partName, code));
        });
        row3.push(null); // Under Total CO
        row3.push(null); // Under Grand Total

        // Row 4: UACS Codes
        const row4: (string | null)[] = [null];
        mooeCodesSorted.forEach(code => row4.push(code));
        row4.push(null); // Under Total MOOE
        coCodesSorted.forEach(code => row4.push(code));
        row4.push(null); // Under Total CO
        row4.push(null); // Under Grand Total

        // Flatten Data
        const flatDataRows: any[][] = [];
        const allCodesOrdered = [...mooeCodesSorted, ...coCodesSorted];

        const calculateSummary = (items: any[]) => {
            return items.reduce((acc, item) => {
                acc.totalMOOE += item.totalMOOE;
                acc.totalCO += item.totalCO;
                allCodesOrdered.forEach((code: string) => {
                    acc.uacsValues[code] = (acc.uacsValues[code] || 0) + (item.uacsValues[code] || 0);
                });
                return acc;
            }, { totalMOOE: 0, totalCO: 0, uacsValues: allCodesOrdered.reduce((acc: any, code: string) => ({...acc, [code]: 0}), {}) });
        };

        const addSummaryRow = (label: string, items: any[], prefix: string) => {
            const summary = calculateSummary(items);
            const row: (string | number | null)[] = [`${prefix}${label}`];
            allCodesOrdered.forEach(code => {
                row.push(summary.uacsValues[code] > 0 ? Math.ceil(summary.uacsValues[code]) : null);
            });
            row.push(summary.totalMOOE > 0 ? Math.ceil(summary.totalMOOE) : null);
            row.push(summary.totalCO > 0 ? Math.ceil(summary.totalCO) : null);
            row.push((summary.totalMOOE + summary.totalCO) > 0 ? Math.ceil(summary.totalMOOE + summary.totalCO) : null);
            flatDataRows.push(row);
        };

        const addActivityRows = (pkgName: string, items: any[], prefix: string) => {
            items.forEach((activity: any, i: number) => {
                const actKey = `${pkgName}-${activity.name}-${i}`;
                const isActExpanded = expandedRows.has(actKey);
                
                const row: (string | number | null)[] = [`${prefix}${activity.name}`];
                allCodesOrdered.forEach(code => {
                    row.push(activity.uacsValues[code] > 0 ? Math.ceil(activity.uacsValues[code]) : null);
                });
                row.push(activity.totalMOOE > 0 ? Math.ceil(activity.totalMOOE) : null);
                row.push(activity.totalCO > 0 ? Math.ceil(activity.totalCO) : null);
                row.push((activity.totalMOOE + activity.totalCO) > 0 ? Math.ceil(activity.totalMOOE + activity.totalCO) : null);
                flatDataRows.push(row);

                if (isActExpanded && activity.particulars) {
                    activity.particulars.forEach((part: any) => {
                        const pRow: (string | number | null)[] = [`${prefix}  ${part.name}`];
                        allCodesOrdered.forEach(code => {
                            pRow.push(part.uacsCode === code && part.amount > 0 ? Math.ceil(part.amount) : null);
                        });
                        pRow.push(part.objectType !== 'CO' ? Math.ceil(part.amount) : null);
                        pRow.push(part.objectType === 'CO' ? Math.ceil(part.amount) : null);
                        pRow.push(Math.ceil(part.amount));
                        flatDataRows.push(pRow);
                    });
                }
            });
        };

        Object.entries(rows).forEach(([componentName, componentData]) => {
            const isComponentExpanded = expandedRows.has(componentName);
            if ((componentData as any).isNestedExpandable) {
                const allPackageItems = Object.values((componentData as any).packages).flatMap((pkg: any) => pkg.items);
                addSummaryRow(componentName, allPackageItems, "");
                
                if (isComponentExpanded) {
                    Object.entries((componentData as any).packages).forEach(([pkgName, pkgData]: [string, any]) => {
                        const isPkgExpanded = expandedRows.has(pkgName);
                        addSummaryRow(pkgName, pkgData.items, "  ");
                        if (isPkgExpanded) {
                            addActivityRows(pkgName, pkgData.items, "    ");
                        }
                    });
                }
            }
        });

        // Add Grand Total Row
        const totalRow: (string | number | null)[] = ["GRAND TOTAL"];
        allCodesOrdered.forEach(code => totalRow.push(grandTotals.uacsValues[code] > 0 ? Math.ceil(grandTotals.uacsValues[code]) : null));
        totalRow.push(Math.ceil(grandTotals.totalMOOE), Math.ceil(grandTotals.totalCO), Math.ceil(grandTotals.totalMOOE + grandTotals.totalCO));
        flatDataRows.push(totalRow);

        // Combine all
        const aoa = [row1, row2, row3, row4, ...flatDataRows];
        const ws: any = XLSX.utils.aoa_to_sheet(aoa);

        // Setup Merges
        if(!ws['!merges']) ws['!merges'] = [];
        
        // PAP Vertical Merge (Rows 0 to 3)
        ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 3, c: 0 } });

        let colIdx = 1; 
        // MOOE Group Merge
        if(mooeSpan > 0) {
            ws['!merges'].push({ s: { r: 0, c: colIdx }, e: { r: 0, c: colIdx + mooeSpan - 1 } });
            
            // MOOE Particulars Merges (Group consecutive same particulars)
            let startCol = colIdx;
            for (let i = 0; i < mooeCodesSorted.length; i++) {
                const currentPart = row2[startCol];
                let endCol = startCol;
                while (endCol + 1 < colIdx + mooeCodesSorted.length && row2[endCol + 1] === currentPart) {
                    endCol++;
                }
                if (endCol > startCol) {
                    ws['!merges'].push({ s: { r: 1, c: startCol }, e: { r: 1, c: endCol } });
                }
                i += (endCol - startCol);
                startCol = endCol + 1;
            }
            colIdx += mooeSpan;
        }
        
        // Total MOOE Vertical Merge
        ws['!merges'].push({ s: { r: 0, c: colIdx }, e: { r: 3, c: colIdx } });
        colIdx++;

        // CO Group Merge
        if(coSpan > 0) {
            ws['!merges'].push({ s: { r: 0, c: colIdx }, e: { r: 0, c: colIdx + coSpan - 1 } });
            
            // CO Particulars Merges (Group consecutive same particulars)
            let startCol = colIdx;
            for (let i = 0; i < coCodesSorted.length; i++) {
                const currentPart = row2[startCol];
                let endCol = startCol;
                while (endCol + 1 < colIdx + coCodesSorted.length && row2[endCol + 1] === currentPart) {
                    endCol++;
                }
                if (endCol > startCol) {
                    ws['!merges'].push({ s: { r: 1, c: startCol }, e: { r: 1, c: endCol } });
                }
                i += (endCol - startCol);
                startCol = endCol + 1;
            }
            colIdx += coSpan;
        }
        
        // Total CO Vertical Merge
        ws['!merges'].push({ s: { r: 0, c: colIdx }, e: { r: 3, c: colIdx } });
        colIdx++;
        
        // Grand Total Vertical Merge
        ws['!merges'].push({ s: { r: 0, c: colIdx }, e: { r: 3, c: colIdx } });

        // Set column widths and alignment
        const range = XLSX.utils.decode_range(ws['!ref']);
        const colWidths = [];
        for (let C = range.s.c; C <= range.e.c; ++C) {
            if (C === 0) {
                colWidths.push({ wch: 50 }); // PAP column width
            } else {
                colWidths.push({ wch: 15 }); // Data columns width
            }
        }
        ws['!cols'] = colWidths;

        // Apply alignment and wrapping
        for (let R = range.s.r; R <= range.e.r; ++R) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cell_address = { c: C, r: R };
                const cell_ref = XLSX.utils.encode_cell(cell_address);
                if (!ws[cell_ref]) continue;
                if (!ws[cell_ref].s) ws[cell_ref].s = {};
                
                // Header alignment
                if (R <= 3) {
                    ws[cell_ref].s.alignment = { horizontal: "center", vertical: "center", wrapText: true };
                } else {
                    // Data alignment
                    if (C === 0) {
                        ws[cell_ref].s.alignment = { horizontal: "left", vertical: "center", wrapText: true };
                    } else {
                        ws[cell_ref].s.alignment = { horizontal: "right", vertical: "center" };
                        if (typeof ws[cell_ref].v === 'number') {
                            ws[cell_ref].z = '#,##0';
                        }
                    }
                }
            }
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "BP Forms");
        XLSX.writeFile(wb, `BP_Forms_Report_${selectedYear}_${selectedOu}.xlsx`);
    };

    const mooeParticulars = Object.keys(headers.MOOE).sort();
    const coParticulars = Object.keys(headers.CO).sort();
    
    // Ensure all MOOE cols + 1 for Total MOOE
    const mooeSpan = mooeCodes.length; 
    // Ensure all CO cols + 1 for Total CO
    const coSpan = coCodes.length;

    const indentClasses = ['pl-2', 'pl-6', 'pl-10', 'pl-14'];
    const borderClass = "border border-gray-300 dark:border-gray-600";
    const headerCellClass = `p-1 ${borderClass} text-center align-middle`;
    const dataCellClass = `p-1 ${borderClass}`;

    return (
        <div id="bp-forms-container" className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            <style>{`
                @media print {
                    @page { size: landscape; }
                    #bp-forms-table {
                        overflow: visible !important;
                        display: block !important;
                    }
                    #bp-forms-table table {
                        width: 100% !important;
                        table-layout: auto !important;
                    }
                    /* Ensure full width and no clipping */
                    body, #root, #bp-forms-container {
                        width: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: visible !important;
                    }
                }
            `}</style>
            <div className="flex justify-between items-center mb-4 print-hidden">
                <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Budget Proposal (BP) Forms</h3>
                <div className="flex gap-2">
                    <button onClick={handlePrint} className="px-4 py-2 bg-gray-500 text-white rounded-md font-semibold hover:bg-gray-600">Print Report</button>
                    <button onClick={handleDownloadBpFormsXlsx} className="px-4 py-2 bg-emerald-600 text-white rounded-md font-semibold hover:bg-emerald-700">Download XLSX</button>
                </div>
            </div>
            <div id="bp-forms-table" className="overflow-x-auto overflow-y-auto max-h-[75vh] relative custom-scrollbar">
                <table className="min-w-full border-collapse text-xs text-gray-900 dark:text-gray-200">
                    <thead className="sticky top-0 z-20 shadow-sm">
                        <tr className="bg-gray-200 dark:bg-gray-800">
                            {/* PAP Column: Frozen */}
                            <th rowSpan={4} className={`${headerCellClass} min-w-[300px] sticky left-0 bg-gray-200 dark:bg-gray-800 z-30 border-r-2 border-r-gray-400 dark:border-r-gray-500`}>Program/Activity/Project</th>
                            
                            {/* MOOE Group */}
                            {mooeCodes.length > 0 && <th colSpan={mooeCodes.length} className={`${headerCellClass}`}>MOOE</th>}
                            <th rowSpan={4} className={`${headerCellClass} bg-blue-100 dark:bg-blue-900/40 font-bold min-w-[100px]`}>Total MOOE</th>
                            
                            {/* CO Group */}
                            {coCodes.length > 0 && <th colSpan={coCodes.length} className={`${headerCellClass}`}>CO</th>}
                            <th rowSpan={4} className={`${headerCellClass} bg-orange-100 dark:bg-orange-900/40 font-bold min-w-[100px]`}>Total CO</th>
                            
                            {/* Grand Total */}
                            <th rowSpan={4} className={`${headerCellClass} bg-green-100 dark:bg-green-900/40 min-w-[100px]`}>Grand Total</th>
                        </tr>
                        <tr className="bg-gray-100 dark:bg-gray-700/80">
                            {/* MOOE Particulars (Dynamic grouping) */}
                            {mooeCodes.map((code, idx) => {
                                // Find particular for this code
                                let partName = "Other Expenses";
                                for (const p in headers.MOOE) {
                                    if (headers.MOOE[p].includes(code)) {
                                        partName = p;
                                        break;
                                    }
                                }
                                
                                // Check if this is the start of a group
                                const prevCode = idx > 0 ? mooeCodes[idx-1] : null;
                                let prevPart = null;
                                if (prevCode) {
                                    for (const p in headers.MOOE) {
                                        if (headers.MOOE[p].includes(prevCode)) {
                                            prevPart = p;
                                            break;
                                        }
                                    }
                                }
                                
                                if (partName === prevPart) return null;
                                
                                // Calculate span
                                let span = 1;
                                for (let i = idx + 1; i < mooeCodes.length; i++) {
                                    let nextPart = null;
                                    for (const p in headers.MOOE) {
                                        if (headers.MOOE[p].includes(mooeCodes[i])) {
                                            nextPart = p;
                                            break;
                                        }
                                    }
                                    if (nextPart === partName) span++;
                                    else break;
                                }
                                
                                return <th key={`p-mooe-${code}`} colSpan={span} className={`${headerCellClass}`}>{partName}</th>;
                            })}
                            
                            {/* CO Particulars (Dynamic grouping) */}
                            {coCodes.map((code, idx) => {
                                let partName = "Other Expenses";
                                for (const p in headers.CO) {
                                    if (headers.CO[p].includes(code)) {
                                        partName = p;
                                        break;
                                    }
                                }
                                
                                const prevCode = idx > 0 ? coCodes[idx-1] : null;
                                let prevPart = null;
                                if (prevCode) {
                                    for (const p in headers.CO) {
                                        if (headers.CO[p].includes(prevCode)) {
                                            prevPart = p;
                                            break;
                                        }
                                    }
                                }
                                
                                if (partName === prevPart) return null;
                                
                                let span = 1;
                                for (let i = idx + 1; i < coCodes.length; i++) {
                                    let nextPart = null;
                                    for (const p in headers.CO) {
                                        if (headers.CO[p].includes(coCodes[i])) {
                                            nextPart = p;
                                            break;
                                        }
                                    }
                                    if (nextPart === partName) span++;
                                    else break;
                                }
                                
                                return <th key={`p-co-${code}`} colSpan={span} className={`${headerCellClass}`}>{partName}</th>;
                            })}
                        </tr>
                        <tr className="bg-gray-100 dark:bg-gray-700/60">
                            {/* MOOE Descriptions */}
                            {mooeCodes.map(code => {
                                let partName = "Other Expenses";
                                for (const p in headers.MOOE) {
                                    if (headers.MOOE[p].includes(code)) {
                                        partName = p;
                                        break;
                                    }
                                }
                                return (
                                    <th key={`desc-mooe-${code}`} className={`${headerCellClass} text-[10px] italic font-normal max-w-[150px] whitespace-normal`}>
                                        {getDescription('MOOE', partName, code)}
                                    </th>
                                );
                            })}
                            {/* CO Descriptions */}
                            {coCodes.map(code => {
                                let partName = "Other Expenses";
                                for (const p in headers.CO) {
                                    if (headers.CO[p].includes(code)) {
                                        partName = p;
                                        break;
                                    }
                                }
                                return (
                                    <th key={`desc-co-${code}`} className={`${headerCellClass} text-[10px] italic font-normal max-w-[150px] whitespace-normal`}>
                                        {getDescription('CO', partName, code)}
                                    </th>
                                );
                            })}
                        </tr>
                        <tr className="bg-gray-100 dark:bg-gray-700/50">
                            {/* MOOE Codes */}
                            {mooeCodes.map(code => <th key={code} className={`${headerCellClass} font-mono whitespace-nowrap`}>{code}</th>)}
                            {/* CO Codes */}
                            {coCodes.map(code => <th key={code} className={`${headerCellClass} font-mono whitespace-nowrap`}>{code}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(rows).map(([componentName, componentData]) => {
                            const isComponentExpanded = expandedRows.has(componentName);
                            if ((componentData as any).isNestedExpandable) {
                                 const allPackageItems = Object.values((componentData as any).packages).flatMap((pkg: any) => pkg.items);
                                 return (
                                    <React.Fragment key={componentName}>
                                        <SummaryRow 
                                            items={allPackageItems}
                                            label={componentName}
                                            rowKey={componentName}
                                            isExpanded={isComponentExpanded}
                                            indentLevel={0}
                                            mooeCodes={mooeCodes}
                                            coCodes={coCodes}
                                            toggleRow={toggleRow}
                                            dataCellClass={dataCellClass}
                                            indentClasses={indentClasses}
                                        />
                                        {isComponentExpanded && Object.entries((componentData as any).packages).map(([pkgName, pkgData]: [string, any]) => {
                                            const isPkgExpanded = expandedRows.has(pkgName);
                                            return (
                                                <React.Fragment key={pkgName}>
                                                    <SummaryRow 
                                                        items={pkgData.items}
                                                        label={pkgName}
                                                        rowKey={pkgName}
                                                        isExpanded={isPkgExpanded}
                                                        indentLevel={1}
                                                        mooeCodes={mooeCodes}
                                                        coCodes={coCodes}
                                                        toggleRow={toggleRow}
                                                        dataCellClass={dataCellClass}
                                                        indentClasses={indentClasses}
                                                    />
                                                    {isPkgExpanded && pkgData.items.map((act: any, i: number) => {
                                                        const actKey = `${pkgName}-${act.name}-${i}`;
                                                        const isActExpanded = expandedRows.has(actKey);
                                                        return (
                                                            <React.Fragment key={actKey}>
                                                                <ActivityRow 
                                                                    activity={act}
                                                                    mooeCodes={mooeCodes}
                                                                    coCodes={coCodes}
                                                                    indentLevel={2}
                                                                    dataCellClass={dataCellClass}
                                                                    indentClasses={indentClasses}
                                                                    isExpanded={isActExpanded}
                                                                    toggleRow={toggleRow}
                                                                    rowKey={actKey}
                                                                />
                                                                {isActExpanded && act.particulars.map((part: any, pi: number) => (
                                                                    <ParticularRow 
                                                                        key={`${actKey}-part-${pi}`}
                                                                        particular={part}
                                                                        mooeCodes={mooeCodes}
                                                                        coCodes={coCodes}
                                                                        indentLevel={3}
                                                                        dataCellClass={dataCellClass}
                                                                        indentClasses={indentClasses}
                                                                    />
                                                                ))}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </React.Fragment>
                                            );
                                        })}
                                    </React.Fragment>
                                 );
                            }
                            return null;
                        })}
                    </tbody>
                    <tfoot>
                        <tr className="font-bold bg-gray-200 dark:bg-gray-700">
                            <td className={`${dataCellClass} text-left sticky left-0 bg-gray-200 dark:bg-gray-700 z-10 border-r-2 border-r-gray-400 dark:border-r-gray-500`}>GRAND TOTAL</td>
                            
                            {/* MOOE Totals */}
                            {mooeCodes.map((code: string) => (
                                <td key={`total-mooe-${code}`} className={`${dataCellClass} text-right whitespace-nowrap`}>
                                    {grandTotals.uacsValues[code] > 0 ? formatCurrencyWhole(grandTotals.uacsValues[code]) : ''}
                                </td>
                            ))}
                            <td className={`${dataCellClass} text-right whitespace-nowrap bg-blue-100 dark:bg-blue-900/40`}>{grandTotals.totalMOOE > 0 ? formatCurrencyWhole(grandTotals.totalMOOE) : ''}</td>

                            {/* CO Totals */}
                            {coCodes.map((code: string) => (
                                <td key={`total-co-${code}`} className={`${dataCellClass} text-right whitespace-nowrap`}>
                                    {grandTotals.uacsValues[code] > 0 ? formatCurrencyWhole(grandTotals.uacsValues[code]) : ''}
                                </td>
                            ))}
                            <td className={`${dataCellClass} text-right whitespace-nowrap bg-orange-100 dark:bg-orange-900/40`}>{grandTotals.totalCO > 0 ? formatCurrencyWhole(grandTotals.totalCO) : ''}</td>

                            {/* Grand Total */}
                            <td className={`${dataCellClass} text-right whitespace-nowrap bg-green-100 dark:bg-green-900/40`}>{(grandTotals.totalMOOE + grandTotals.totalCO) > 0 ? formatCurrencyWhole(grandTotals.totalMOOE + grandTotals.totalCO) : ''}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

export default BPFormsReport;