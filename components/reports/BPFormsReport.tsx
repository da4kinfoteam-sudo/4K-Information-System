
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

const ActivityRow: React.FC<{
    activity: any;
    mooeCodes: string[];
    coCodes: string[];
    indentLevel: number;
    dataCellClass: string;
    indentClasses: string[];
}> = ({ activity, mooeCodes, coCodes, indentLevel, dataCellClass, indentClasses }) => {
    return (
        <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
            <td className={`${dataCellClass} text-left ${indentClasses[indentLevel]} sticky left-0 bg-white dark:bg-gray-800 z-10 border-r-2 border-r-gray-300 dark:border-r-gray-600`}>{activity.name}</td>
            
            {/* MOOE Columns */}
            {mooeCodes.map((code: string) => (
                <td key={`mooe-${code}`} className={`${dataCellClass} text-right whitespace-nowrap`}>{activity.uacsValues[code] > 0 ? formatCurrency(activity.uacsValues[code]) : ''}</td>
            ))}
            <td className={`${dataCellClass} font-bold text-right whitespace-nowrap bg-blue-50 dark:bg-blue-900/20`}>{activity.totalMOOE > 0 ? formatCurrency(activity.totalMOOE) : ''}</td>
            
            {/* CO Columns */}
            {coCodes.map((code: string) => (
                <td key={`co-${code}`} className={`${dataCellClass} text-right whitespace-nowrap`}>{activity.uacsValues[code] > 0 ? formatCurrency(activity.uacsValues[code]) : ''}</td>
            ))}
            <td className={`${dataCellClass} font-bold text-right whitespace-nowrap bg-orange-50 dark:bg-orange-900/20`}>{activity.totalCO > 0 ? formatCurrency(activity.totalCO) : ''}</td>
            
            {/* Grand Total */}
            <td className={`${dataCellClass} font-bold bg-green-50 dark:bg-green-900/20 text-right whitespace-nowrap`}>{(activity.totalMOOE + activity.totalCO) > 0 ? formatCurrency(activity.totalMOOE + activity.totalCO) : ''}</td>
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
                <td key={`mooe-${code}`} className={numberCellClass}>{summary.uacsValues[code] > 0 ? formatCurrency(summary.uacsValues[code]) : ''}</td>
            ))}
            <td className={`${numberCellClass} bg-blue-100 dark:bg-blue-900/30`}>{summary.totalMOOE > 0 ? formatCurrency(summary.totalMOOE) : ''}</td>

            {/* CO Summary */}
            {coCodes.map((code: string) => (
                <td key={`co-${code}`} className={numberCellClass}>{summary.uacsValues[code] > 0 ? formatCurrency(summary.uacsValues[code]) : ''}</td>
            ))}
            <td className={`${numberCellClass} bg-orange-100 dark:bg-orange-900/30`}>{summary.totalCO > 0 ? formatCurrency(summary.totalCO) : ''}</td>

            {/* Grand Total Summary */}
            <td className={`${numberCellClass} bg-green-100 dark:bg-green-900/30`}>{(summary.totalMOOE + summary.totalCO) > 0 ? formatCurrency(summary.totalMOOE + summary.totalCO) : ''}</td>
        </tr>
    );
};

const BPFormsReport: React.FC<BPFormsReportProps> = ({ data, uacsCodes, selectedYear, selectedOu }) => {
    const [expandedRows, setExpandedRows] = useState(new Set<string>());

    const bpFormsProcessedData = useMemo(() => {
        const headers: { [objectType: string]: { [particular: string]: string[] } } = { MOOE: {}, CO: {} };
        const seenCodes = new Set<string>();
        
        // 1. Populate headers from Reference List
        for (const objectType of Object.keys(uacsCodes)) {
            // @ts-ignore
            if (!uacsCodes[objectType]) continue;
            // @ts-ignore
            for (const particular of Object.keys(uacsCodes[objectType])) {
                // @ts-ignore
                const codes = Object.keys(uacsCodes[objectType][particular]);
                const typeKey = (objectType === 'CO') ? 'CO' : 'MOOE';
                
                if(!headers[typeKey][particular]) headers[typeKey][particular] = [];
                
                codes.forEach(c => {
                    if (!headers[typeKey][particular].includes(c)) headers[typeKey][particular].push(c);
                    seenCodes.add(c);
                });
            }
        }

        // Helper to ensure code exists in headers (dynamic discovery)
        const ensureHeader = (objType: string, particular: string, code: string) => {
            if (!code) return;
            // Normalize object type
            const typeKey = (objType === 'CO') ? 'CO' : 'MOOE';
            
            if (!headers[typeKey]) headers[typeKey] = {};
            const partKey = particular || 'Other Expenses';
            
            if (!headers[typeKey][partKey]) headers[typeKey][partKey] = [];
            
            if (!headers[typeKey][partKey].includes(code)) {
                headers[typeKey][partKey].push(code);
            }
            seenCodes.add(code);
        };

        const lineItems: any[] = [];
        
        data.subprojects.forEach(sp => {
            sp.details.forEach(d => {
                ensureHeader(d.objectType, d.expenseParticular, d.uacsCode);
                lineItems.push({
                    component: 'Production and Livelihood', packageType: sp.packageType, activityName: sp.name,
                    objectType: d.objectType, uacsCode: d.uacsCode, amount: d.pricePerUnit * d.numberOfUnits
                });
            });
        });
        
        data.trainings.forEach(t => {
            t.expenses.forEach(e => {
                ensureHeader(e.objectType, e.expenseParticular, e.uacsCode);
                const packageType = t.component === 'Program Management' ? 'Trainings' : undefined;
                lineItems.push({
                    component: t.component, packageType, activityName: t.name,
                    objectType: e.objectType, uacsCode: e.uacsCode, amount: e.amount
                });
            });
        });
        
        data.otherActivities.forEach(oa => {
            oa.expenses.forEach(e => {
                ensureHeader(e.objectType, e.expenseParticular, e.uacsCode);
                const packageType = oa.component === 'Program Management' ? 'Activities' : undefined;
                lineItems.push({
                    component: oa.component, packageType, activityName: oa.name,
                    objectType: e.objectType, uacsCode: e.uacsCode, amount: e.amount
                });
            });
        });
        
        data.staffingReqs.forEach(sr => {
            const objType = getObjectTypeByCode(sr.uacsCode, uacsCodes);
            ensureHeader(objType, 'Salaries & Wages', sr.uacsCode);
            lineItems.push({
                component: 'Program Management', packageType: 'Staff Requirements', activityName: sr.personnelPosition,
                objectType: objType, uacsCode: sr.uacsCode, amount: sr.annualSalary
            });
        });
        
        data.officeReqs.forEach(or => {
            const objType = getObjectTypeByCode(or.uacsCode, uacsCodes);
            ensureHeader(objType, 'Office Equipment', or.uacsCode);
            lineItems.push({
                component: 'Program Management', packageType: 'Office Requirements', activityName: or.equipment,
                objectType: objType, uacsCode: or.uacsCode, amount: or.pricePerUnit * or.numberOfUnits
            });
        });
        
        data.otherProgramExpenses.forEach(ope => {
            const objType = getObjectTypeByCode(ope.uacsCode, uacsCodes);
            ensureHeader(objType, 'Other Expenses', ope.uacsCode);
            lineItems.push({
                component: 'Program Management', packageType: 'Office Requirements', activityName: ope.particulars,
                objectType: objType, uacsCode: ope.uacsCode, amount: ope.amount
            });
        });

        // Derive flat lists of codes for rendering columns
        const mooeCodes: string[] = [];
        Object.values(headers.MOOE).forEach(codes => {
            codes.forEach(c => { if (!mooeCodes.includes(c)) mooeCodes.push(c); });
        });
        const coCodes: string[] = [];
        Object.values(headers.CO).forEach(codes => {
            codes.forEach(c => { if (!coCodes.includes(c)) coCodes.push(c); });
        });

        const initialUacsValues = [...mooeCodes, ...coCodes].reduce((acc, code) => ({ ...acc, [code]: 0 }), {});
        
        const groupedData: { [key: string]: any } = {
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
        
        lineItems.forEach(item => {
            let targetList;
            if (item.component === 'Production and Livelihood') {
                const packageKey = item.packageType || 'Trainings';
                if (!groupedData['Production and Livelihood'].packages[packageKey]) {
                    groupedData['Production and Livelihood'].packages[packageKey] = { items: [] };
                }
                targetList = groupedData['Production and Livelihood'].packages[packageKey].items;
            } else if (item.component === 'Program Management') {
                 const packageKey = item.packageType || 'Activities';
                 if (!groupedData['Program Management'].packages[packageKey]) {
                    groupedData['Program Management'].packages[packageKey] = { items: [] };
                 }
                 targetList = groupedData['Program Management'].packages[packageKey].items;
            } else if (groupedData[item.component]) {
                targetList = groupedData[item.component];
            } else {
                return; 
            }

            let activity = targetList.find((a: any) => a.name === item.activityName);
            if (!activity) {
                activity = { 
                    name: item.activityName, 
                    uacsValues: { ...initialUacsValues }, 
                    totalMOOE: 0, 
                    totalCO: 0 
                };
                targetList.push(activity);
            }
            
            if(item.uacsCode) {
                activity.uacsValues[item.uacsCode] = (activity.uacsValues[item.uacsCode] || 0) + item.amount;
            }

            // Determine if MOOE or CO for Total calc (can infer from code presence in mooeCodes/coCodes too)
            if (item.objectType === 'CO') {
                activity.totalCO += item.amount;
            } else {
                // Default to MOOE
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

    const handleDownloadBpFormsXlsx = () => {
        const flatData: any[] = [];
        const allCodes = [...mooeCodes, ...coCodes];

        Object.entries(rows).forEach(([componentName, componentData]) => {
            if (Array.isArray(componentData) && componentData.length > 0) {
                componentData.forEach((activity: any) => {
                    const row: { [key: string]: string | number } = {
                        'Program/Activity/Project': `${componentName} - ${activity.name}`,
                    };
                    allCodes.forEach((code: string) => {
                        row[code] = activity.uacsValues[code] || 0;
                    });
                    row['Total MOOE'] = activity.totalMOOE;
                    row['Total CO'] = activity.totalCO;
                    row['Grand Total'] = activity.totalMOOE + activity.totalCO;
                    flatData.push(row);
                });
            } else if ((componentData as any).isNestedExpandable) {
                Object.entries((componentData as any).packages).forEach(([pkgName, pkgData]: [string, any]) => {
                    if (pkgData.items.length > 0) {
                        pkgData.items.forEach((activity: any) => {
                             const row: { [key: string]: string | number } = {
                                'Program/Activity/Project': `${componentName} - ${pkgName} - ${activity.name}`,
                            };
                            allCodes.forEach((code: string) => {
                                row[code] = activity.uacsValues[code] || 0;
                            });
                            row['Total MOOE'] = activity.totalMOOE;
                            row['Total CO'] = activity.totalCO;
                            row['Grand Total'] = activity.totalMOOE + activity.totalCO;
                            flatData.push(row);
                        });
                    }
                });
            }
        });

        if (flatData.length > 0) {
            const grandTotalsRow = flatData.reduce((acc, row) => {
                 allCodes.forEach(code => {
                    acc[code] = (acc[code] || 0) + (row[code] as number);
                 });
                 acc['Total MOOE'] += (row['Total MOOE'] as number);
                 acc['Total CO'] += (row['Total CO'] as number);
                 acc['Grand Total'] += (row['Grand Total'] as number);
                 return acc;
            }, {
                 'Program/Activity/Project': 'GRAND TOTAL',
                 ...allCodes.reduce((acc, code) => ({...acc, [code]: 0}), {}),
                 'Total MOOE': 0,
                 'Total CO': 0,
                 'Grand Total': 0,
            });
            flatData.push(grandTotalsRow);
        }

        const ws = XLSX.utils.json_to_sheet(flatData);
        
        const currencyColumns = [...allCodes, 'Total MOOE', 'Total CO', 'Grand Total'];
        const headers = Object.keys(flatData.length > 0 ? flatData[0] : {});
        currencyColumns.forEach(colName => {
            const colIndex = headers.indexOf(colName);
            if (colIndex !== -1) {
                const colLetter = XLSX.utils.encode_col(colIndex);
                for (let i = 2; i <= flatData.length + 1; i++) {
                    const cellAddress = colLetter + i;
                    if(ws[cellAddress] && ws[cellAddress].v > 0) {
                         ws[cellAddress].t = 'n';
                         ws[cellAddress].z = '₱#,##0.00';
                    } else if (ws[cellAddress]) {
                        ws[cellAddress].v = ''; 
                    }
                }
            }
        });
        
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "BP Forms Report");
        XLSX.writeFile(wb, `BP_Forms_Report_${selectedYear}_${selectedOu}.xlsx`);
    };

    const mooeParticulars = Object.keys(headers.MOOE);
    const coParticulars = Object.keys(headers.CO);
    
    // Ensure all MOOE cols + 1 for Total MOOE
    const mooeColSpan = mooeCodes.length + 1; 
    // Ensure all CO cols + 1 for Total CO
    const coColSpan = coCodes.length + 1;

    const indentClasses = ['pl-2', 'pl-6', 'pl-10'];
    const borderClass = "border border-gray-300 dark:border-gray-600";
    const headerCellClass = `p-1 ${borderClass} text-center align-middle`;
    const dataCellClass = `p-1 ${borderClass}`;

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            <div className="flex justify-between items-center mb-4 print-hidden">
                <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Budget Proposal (BP) Forms</h3>
                 <button onClick={handleDownloadBpFormsXlsx} className="px-4 py-2 bg-accent text-white rounded-md font-semibold hover:brightness-95">Download XLSX</button>
            </div>
            <div className="overflow-x-auto relative">
                <table className="min-w-full border-collapse text-xs text-gray-900 dark:text-gray-200">
                    <thead className="sticky top-0 z-20 shadow-sm">
                        <tr className="bg-gray-200 dark:bg-gray-800">
                            {/* PAP Column: Frozen */}
                            <th rowSpan={4} className={`${headerCellClass} min-w-[300px] sticky left-0 bg-gray-200 dark:bg-gray-800 z-30 border-r-2 border-r-gray-400 dark:border-r-gray-500`}>Program/Activity/Project</th>
                            
                            {/* MOOE Group */}
                            {mooeColSpan > 1 && <th colSpan={mooeColSpan} className={`${headerCellClass}`}>MOOE</th>}
                            
                            {/* CO Group */}
                            {coColSpan > 1 && <th colSpan={coColSpan} className={`${headerCellClass}`}>CO</th>}
                            
                            {/* Grand Total */}
                            <th rowSpan={4} className={`${headerCellClass} min-w-[100px]`}>Grand Total</th>
                        </tr>
                        <tr className="bg-gray-100 dark:bg-gray-700/80">
                            {/* MOOE Particulars + Total MOOE */}
                            {mooeParticulars.map(p => <th key={`p-mooe-${p}`} colSpan={headers.MOOE[p].length} className={`${headerCellClass}`}>{p}</th>)}
                            <th rowSpan={3} className={`${headerCellClass} bg-blue-100 dark:bg-blue-900/40 font-bold min-w-[100px]`}>Total MOOE</th>

                            {/* CO Particulars + Total CO */}
                            {coParticulars.map(p => <th key={`p-co-${p}`} colSpan={headers.CO[p].length} className={`${headerCellClass}`}>{p}</th>)}
                            <th rowSpan={3} className={`${headerCellClass} bg-orange-100 dark:bg-orange-900/40 font-bold min-w-[100px]`}>Total CO</th>
                        </tr>
                        <tr className="bg-gray-5 dark:bg-gray-700/60">
                            {/* MOOE Descriptions */}
                            {mooeParticulars.flatMap(p => headers.MOOE[p].map(code => ({ code, p }))).map(({ code, p }) => (
                                <th key={`desc-mooe-${code}`} className={`${headerCellClass} text-[10px] italic font-normal max-w-[150px] whitespace-normal`}>
                                    {getDescription('MOOE', p, code)}
                                </th>
                            ))}
                            {/* CO Descriptions */}
                            {coParticulars.flatMap(p => headers.CO[p].map(code => ({ code, p }))).map(({ code, p }) => (
                                <th key={`desc-co-${code}`} className={`${headerCellClass} text-[10px] italic font-normal max-w-[150px] whitespace-normal`}>
                                    {getDescription('CO', p, code)}
                                </th>
                            ))}
                        </tr>
                        <tr className="bg-gray-5 dark:bg-gray-700/50">
                            {/* MOOE Codes */}
                            {mooeParticulars.flatMap(p => headers.MOOE[p]).map(code => <th key={code} className={`${headerCellClass} font-mono whitespace-nowrap`}>{code}</th>)}
                            {/* CO Codes */}
                            {coParticulars.flatMap(p => headers.CO[p]).map(code => <th key={code} className={`${headerCellClass} font-mono whitespace-nowrap`}>{code}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(rows).map(([componentName, componentData]) => {
                            const isComponentExpanded = expandedRows.has(componentName);
                            if (Array.isArray(componentData)) {
                                 return (
                                    <React.Fragment key={componentName}>
                                        <SummaryRow 
                                            items={componentData}
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
                                        {isComponentExpanded && componentData.map((act, i) => (
                                            <ActivityRow 
                                                key={`${componentName}-${i}`}
                                                activity={act}
                                                mooeCodes={mooeCodes}
                                                coCodes={coCodes}
                                                indentLevel={1}
                                                dataCellClass={dataCellClass}
                                                indentClasses={indentClasses}
                                            />
                                        ))}
                                    </React.Fragment>
                                );
                            }
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
                                                    {isPkgExpanded && pkgData.items.map((act: any, i: number) => (
                                                        <ActivityRow 
                                                            key={`${pkgName}-${i}`}
                                                            activity={act}
                                                            mooeCodes={mooeCodes}
                                                            coCodes={coCodes}
                                                            indentLevel={2}
                                                            dataCellClass={dataCellClass}
                                                            indentClasses={indentClasses}
                                                        />
                                                    ))}
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
                                    {grandTotals.uacsValues[code] > 0 ? formatCurrency(grandTotals.uacsValues[code]) : ''}
                                </td>
                            ))}
                            <td className={`${dataCellClass} text-right whitespace-nowrap bg-blue-100 dark:bg-blue-900/40`}>{grandTotals.totalMOOE > 0 ? formatCurrency(grandTotals.totalMOOE) : ''}</td>

                            {/* CO Totals */}
                            {coCodes.map((code: string) => (
                                <td key={`total-co-${code}`} className={`${dataCellClass} text-right whitespace-nowrap`}>
                                    {grandTotals.uacsValues[code] > 0 ? formatCurrency(grandTotals.uacsValues[code]) : ''}
                                </td>
                            ))}
                            <td className={`${dataCellClass} text-right whitespace-nowrap bg-orange-100 dark:bg-orange-900/40`}>{grandTotals.totalCO > 0 ? formatCurrency(grandTotals.totalCO) : ''}</td>

                            {/* Grand Total */}
                            <td className={`${dataCellClass} text-right whitespace-nowrap bg-green-100 dark:bg-green-900/40`}>{(grandTotals.totalMOOE + grandTotals.totalCO) > 0 ? formatCurrency(grandTotals.totalMOOE + grandTotals.totalCO) : ''}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

export default BPFormsReport;
