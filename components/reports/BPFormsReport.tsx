
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
    allUacsCodes: string[];
    indentLevel: number;
    dataCellClass: string;
    indentClasses: string[];
}> = ({ activity, allUacsCodes, indentLevel, dataCellClass, indentClasses }) => {
    return (
        <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
            <td className={`${dataCellClass} text-left ${indentClasses[indentLevel]}`}>{activity.name}</td>
            {allUacsCodes.map((code: string) => (
                <td key={code} className={`${dataCellClass} text-right whitespace-nowrap`}>{activity.uacsValues[code] > 0 ? formatCurrency(activity.uacsValues[code]) : ''}</td>
            ))}
            <td className={`${dataCellClass} font-semibold text-right whitespace-nowrap`}>{activity.totalMOOE > 0 ? formatCurrency(activity.totalMOOE) : ''}</td>
            <td className={`${dataCellClass} font-semibold text-right whitespace-nowrap`}>{activity.totalCO > 0 ? formatCurrency(activity.totalCO) : ''}</td>
            <td className={`${dataCellClass} font-bold bg-gray-50 dark:bg-gray-700/30 text-right whitespace-nowrap`}>{(activity.totalMOOE + activity.totalCO) > 0 ? formatCurrency(activity.totalMOOE + activity.totalCO) : ''}</td>
        </tr>
    );
};

const SummaryRow: React.FC<{
    items: any[];
    label: string;
    rowKey: string;
    isExpanded: boolean;
    indentLevel: number;
    allUacsCodes: string[];
    toggleRow: (key: string) => void;
    dataCellClass: string;
    indentClasses: string[];
}> = ({ items, label, rowKey, isExpanded, indentLevel, allUacsCodes, toggleRow, dataCellClass, indentClasses }) => {
    if (!items || items.length === 0) {
        return (
             <tr className="font-bold bg-gray-100 dark:bg-gray-700/50">
                <td className={`${dataCellClass} text-left ${indentClasses[indentLevel]}`}>
                     <span className="inline-block w-5 text-center"></span> {label}
                </td>
                <td colSpan={allUacsCodes.length + 3} className={`${dataCellClass} text-center italic text-gray-500 dark:text-gray-400`}>No activities for this item.</td>
            </tr>
        );
    }

    const summary = useMemo(() => items.reduce((acc, item) => {
        acc.totalMOOE += item.totalMOOE;
        acc.totalCO += item.totalCO;
        allUacsCodes.forEach((code: string) => {
            acc.uacsValues[code] = (acc.uacsValues[code] || 0) + item.uacsValues[code];
        });
        return acc;
    }, { totalMOOE: 0, totalCO: 0, uacsValues: allUacsCodes.reduce((acc: any, code: string) => ({...acc, [code]: 0}), {}) }), [items, allUacsCodes]);
    
    const numberCellClass = `${dataCellClass} text-right whitespace-nowrap`;

    return (
        <tr onClick={() => toggleRow(rowKey)} className="font-bold bg-gray-100 dark:bg-gray-700/50 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700">
            <td className={`${dataCellClass} text-left ${indentClasses[indentLevel]}`}>
                <span className="inline-block w-5 text-center text-gray-500 dark:text-gray-400">{isExpanded ? '−' : '+'}</span> {label}
            </td>
            {allUacsCodes.map((code: string) => (
                <td key={code} className={numberCellClass}>{summary.uacsValues[code] > 0 ? formatCurrency(summary.uacsValues[code]) : ''}</td>
            ))}
            <td className={numberCellClass}>{summary.totalMOOE > 0 ? formatCurrency(summary.totalMOOE) : ''}</td>
            <td className={numberCellClass}>{summary.totalCO > 0 ? formatCurrency(summary.totalCO) : ''}</td>
            <td className={numberCellClass}>{(summary.totalMOOE + summary.totalCO) > 0 ? formatCurrency(summary.totalMOOE + summary.totalCO) : ''}</td>
        </tr>
    );
};

const BPFormsReport: React.FC<BPFormsReportProps> = ({ data, uacsCodes, selectedYear, selectedOu }) => {
    const [expandedRows, setExpandedRows] = useState(new Set<string>());

    const bpFormsProcessedData = useMemo(() => {
        const headers: { [objectType: string]: { [particular: string]: string[] } } = { MOOE: {}, CO: {} };
        const allUacsCodes: string[] = [];
        const seenCodes = new Set<string>();
        
        // 1. Populate headers from Reference List
        for (const objectType of Object.keys(uacsCodes)) {
            // @ts-ignore
            if (!uacsCodes[objectType]) continue;
            // @ts-ignore
            for (const particular of Object.keys(uacsCodes[objectType])) {
                // @ts-ignore
                const codes = Object.keys(uacsCodes[objectType][particular]);
                headers[objectType as keyof typeof headers][particular] = codes;
                codes.forEach(c => {
                    if (!seenCodes.has(c)) {
                        allUacsCodes.push(c);
                        seenCodes.add(c);
                    }
                });
            }
        }

        // Helper to ensure code exists in headers (dynamic discovery)
        const ensureHeader = (objType: string, particular: string, code: string) => {
            if (!code) return;
            // Normalize object type if missing or invalid
            const typeKey = (objType === 'CO' || objType === 'MOOE') ? objType : 'MOOE';
            
            if (!headers[typeKey]) headers[typeKey] = {};
            const partKey = particular || 'Other Expenses';
            
            if (!headers[typeKey][partKey]) headers[typeKey][partKey] = [];
            
            if (!headers[typeKey][partKey].includes(code)) {
                headers[typeKey][partKey].push(code);
            }
            if (!seenCodes.has(code)) {
                allUacsCodes.push(code);
                seenCodes.add(code);
            }
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
            // Staffing usually falls under PS (Personal Services), mapped here often to MOOE for simplified report or needs own category. 
            // For now, use derived type.
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

        const initialUacsValues = allUacsCodes.reduce((acc, code) => ({ ...acc, [code]: 0 }), {});
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

            if (item.objectType === 'MOOE') {
                activity.totalMOOE += item.amount;
            } else if (item.objectType === 'CO') {
                activity.totalCO += item.amount;
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

        return { headers, rows: groupedData, allUacsCodes };
    }, [data, uacsCodes]);

    const { headers, rows, allUacsCodes } = bpFormsProcessedData;

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
            allUacsCodes.forEach((code: string) => {
                acc.uacsValues[code] = (acc.uacsValues[code] || 0) + (item.uacsValues[code] || 0);
            });
            return acc;
        }, {
            totalMOOE: 0,
            totalCO: 0,
            uacsValues: allUacsCodes.reduce((acc: any, code: string) => ({...acc, [code]: 0}), {})
        });
    }, [rows, allUacsCodes]);

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
        Object.entries(rows).forEach(([componentName, componentData]) => {
            if (Array.isArray(componentData) && componentData.length > 0) {
                componentData.forEach((activity: any) => {
                    const row: { [key: string]: string | number } = {
                        'Program/Activity/Project': `${componentName} - ${activity.name}`,
                    };
                    allUacsCodes.forEach((code: string) => {
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
                            allUacsCodes.forEach((code: string) => {
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
            const grandTotals = flatData.reduce((acc, row) => {
                 allUacsCodes.forEach(code => {
                    acc[code] = (acc[code] || 0) + (row[code] as number);
                 });
                 acc['Total MOOE'] += (row['Total MOOE'] as number);
                 acc['Total CO'] += (row['Total CO'] as number);
                 acc['Grand Total'] += (row['Grand Total'] as number);
                 return acc;
            }, {
                 'Program/Activity/Project': 'GRAND TOTAL',
                 ...allUacsCodes.reduce((acc, code) => ({...acc, [code]: 0}), {}),
                 'Total MOOE': 0,
                 'Total CO': 0,
                 'Grand Total': 0,
            });
            flatData.push(grandTotals);
        }

        const ws = XLSX.utils.json_to_sheet(flatData);
        
        const currencyColumns = [...allUacsCodes, 'Total MOOE', 'Total CO', 'Grand Total'];
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
    const mooeUacsCount = mooeParticulars.reduce((sum, p) => sum + headers.MOOE[p].length, 0);
    const coUacsCount = coParticulars.reduce((sum, p) => sum + headers.CO[p].length, 0);

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
            <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-xs text-gray-900 dark:text-gray-200">
                    <thead className="sticky top-0 z-10">
                        <tr className="bg-gray-200 dark:bg-gray-800">
                            <th rowSpan={4} className={`${headerCellClass} min-w-[300px]`}>Program/Activity/Project</th>
                            {mooeUacsCount > 0 && <th colSpan={mooeUacsCount} className={`${headerCellClass}`}>MOOE</th>}
                            {coUacsCount > 0 && <th colSpan={coUacsCount} className={`${headerCellClass}`}>CO</th>}
                            <th colSpan={3} rowSpan={3} className={`${headerCellClass}`}>Totals</th>
                        </tr>
                        <tr className="bg-gray-100 dark:bg-gray-700/80">
                            {mooeParticulars.map(p => <th key={p} colSpan={headers.MOOE[p].length} className={`${headerCellClass}`}>{p}</th>)}
                            {coParticulars.map(p => <th key={p} colSpan={headers.CO[p].length} className={`${headerCellClass}`}>{p}</th>)}
                        </tr>
                        <tr className="bg-gray-50 dark:bg-gray-700/60">
                            {mooeParticulars.flatMap(p => headers.MOOE[p].map(code => ({ code, p }))).map(({ code, p }) => (
                                <th key={`desc-${code}`} className={`${headerCellClass} text-[10px] italic font-normal max-w-[150px] whitespace-normal`}>
                                    {getDescription('MOOE', p, code)}
                                </th>
                            ))}
                            {coParticulars.flatMap(p => headers.CO[p].map(code => ({ code, p }))).map(({ code, p }) => (
                                <th key={`desc-${code}`} className={`${headerCellClass} text-[10px] italic font-normal max-w-[150px] whitespace-normal`}>
                                    {getDescription('CO', p, code)}
                                </th>
                            ))}
                        </tr>
                        <tr className="bg-gray-5 dark:bg-gray-700/50">
                            {mooeParticulars.flatMap(p => headers.MOOE[p]).map(code => <th key={code} className={`${headerCellClass} font-mono whitespace-nowrap`}>{code}</th>)}
                            {coParticulars.flatMap(p => headers.CO[p]).map(code => <th key={code} className={`${headerCellClass} font-mono whitespace-nowrap`}>{code}</th>)}
                            <th className={`${headerCellClass}`}>MOOE</th>
                            <th className={`${headerCellClass}`}>CO</th>
                            <th className={`${headerCellClass}`}>Grand Total</th>
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
                                            allUacsCodes={allUacsCodes}
                                            toggleRow={toggleRow}
                                            dataCellClass={dataCellClass}
                                            indentClasses={indentClasses}
                                        />
                                        {isComponentExpanded && componentData.map((act, i) => (
                                            <ActivityRow 
                                                key={`${componentName}-${i}`}
                                                activity={act}
                                                allUacsCodes={allUacsCodes}
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
                                            allUacsCodes={allUacsCodes}
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
                                                        allUacsCodes={allUacsCodes}
                                                        toggleRow={toggleRow}
                                                        dataCellClass={dataCellClass}
                                                        indentClasses={indentClasses}
                                                    />
                                                    {isPkgExpanded && pkgData.items.map((act: any, i: number) => (
                                                        <ActivityRow 
                                                            key={`${pkgName}-${i}`}
                                                            activity={act}
                                                            allUacsCodes={allUacsCodes}
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
                            <td className={`${dataCellClass} text-left`}>GRAND TOTAL</td>
                            {allUacsCodes.map((code: string) => (
                                <td key={`total-${code}`} className={`${dataCellClass} text-right whitespace-nowrap`}>
                                    {grandTotals.uacsValues[code] > 0 ? formatCurrency(grandTotals.uacsValues[code]) : ''}
                                </td>
                            ))}
                            <td className={`${dataCellClass} text-right whitespace-nowrap`}>{grandTotals.totalMOOE > 0 ? formatCurrency(grandTotals.totalMOOE) : ''}</td>
                            <td className={`${dataCellClass} text-right whitespace-nowrap`}>{grandTotals.totalCO > 0 ? formatCurrency(grandTotals.totalCO) : ''}</td>
                            <td className={`${dataCellClass} text-right whitespace-nowrap`}>{(grandTotals.totalMOOE + grandTotals.totalCO) > 0 ? formatCurrency(grandTotals.totalMOOE + grandTotals.totalCO) : ''}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

export default BPFormsReport;
