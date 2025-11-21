// Author: AI
// OS support: Any
// Description: Reports component for generating various reports

import React, { useMemo, useState } from 'react';
import { Subproject, Training, OtherActivity, IPO, OfficeRequirement, StaffingRequirement, OtherProgramExpense, tiers, fundTypes, operatingUnits, ouToRegionMap } from '../constants';

// Declare XLSX to inform TypeScript about the global variable
declare const XLSX: any;

interface ReportsProps {
    ipos: IPO[];
    subprojects: Subproject[];
    trainings: Training[];
    otherActivities: OtherActivity[];
    officeReqs: OfficeRequirement[];
    staffingReqs: StaffingRequirement[];
    otherProgramExpenses: OtherProgramExpense[];
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
}

type ReportTab = 'WFP' | 'BP Forms' | 'BEDS' | 'BAR1';

const getObjectTypeByCode = (code: string, uacsData: any): 'MOOE' | 'CO' => {
    for (const type of ['MOOE', 'CO']) {
        if (uacsData[type]) {
             for (const particular in uacsData[type]) {
                 if (uacsData[type][particular] && uacsData[type][particular][code]) return type as 'MOOE' | 'CO';
            }
        }
    }
    return 'MOOE'; // Default
};

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
};

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
                <td colSpan={allUacsCodes.length + 3} className={`${dataCellClass} text-center italic text-gray-500`}>No activities for this item.</td>
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
                <span className="inline-block w-5 text-center">{isExpanded ? '−' : '+'}</span> {label}
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


const BPFormsReport: React.FC<{ data: any }> = ({ data }) => {
    const [expandedRows, setExpandedRows] = useState(new Set<string>());
    const { headers, rows, allUacsCodes } = data;

    if (!headers || !rows || !allUacsCodes) return null;

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


    const mooeParticulars = Object.keys(headers.MOOE);
    const coParticulars = Object.keys(headers.CO);
    const mooeUacsCount = mooeParticulars.reduce((sum, p) => sum + headers.MOOE[p].length, 0);
    const coUacsCount = coParticulars.reduce((sum, p) => sum + headers.CO[p].length, 0);

    const indentClasses = ['pl-2', 'pl-6', 'pl-10'];
    const borderClass = "border border-gray-300 dark:border-gray-600";
    const headerCellClass = `p-1 ${borderClass} text-center align-middle`;
    const dataCellClass = `p-1 ${borderClass}`;

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-xs">
                <thead className="sticky top-0 z-10">
                    <tr className="bg-gray-200 dark:bg-gray-800">
                        <th rowSpan={3} className={`${headerCellClass} min-w-[300px]`}>Program/Activity/Project</th>
                        {mooeUacsCount > 0 && <th colSpan={mooeUacsCount} className={`${headerCellClass}`}>MOOE</th>}
                        {coUacsCount > 0 && <th colSpan={coUacsCount} className={`${headerCellClass}`}>CO</th>}
                        <th colSpan={3} rowSpan={2} className={`${headerCellClass}`}>Totals</th>
                    </tr>
                    <tr className="bg-gray-100 dark:bg-gray-700/80">
                        {mooeParticulars.map(p => <th key={p} colSpan={headers.MOOE[p].length} className={`${headerCellClass}`}>{p}</th>)}
                        {coParticulars.map(p => <th key={p} colSpan={headers.CO[p].length} className={`${headerCellClass}`}>{p}</th>)}
                    </tr>
                    <tr className="bg-gray-50 dark:bg-gray-700/50">
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
                             const allPackageActivities = Object.values((componentData as any).packages).flatMap((pkg: any) => pkg.items);
                             return (
                                <React.Fragment key={componentName}>
                                    <SummaryRow 
                                        items={allPackageActivities}
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
    );
};

const WFPTable: React.FC<{ data: { [key: string]: any } }> = ({ data }) => {
    const [expandedRows, setExpandedRows] = useState(new Set<string>());
    const toggleRow = (key: string) => {
        setExpandedRows(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) {
                newSet.delete(key);
            } else {
                newSet.add(key);
            }
            return newSet;
        });
    };

    const indentClasses: { [key: number]: string } = {
        0: '',
        1: 'pl-6',
        2: 'pl-10',
        3: 'pl-14',
    };
    
    const dataCellClass = "p-1 border border-gray-300 dark:border-gray-600";

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
                    <td colSpan={14} className={`${dataCellClass} text-center italic text-gray-500`}>No activities for this component.</td>
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

    const grandTotals = useMemo(() => Object.values(data).flatMap(component => {
        if (Array.isArray(component)) return component;
        if ((component as any).isExpandable) return (component as any).items;
        if ((component as any).isNestedExpandable) return Object.values((component as any).packages).flatMap((pkg: any) => pkg.items);
        return [];
    }), [data]);

    return (
        <div id="wfp-report" className="overflow-x-auto">
            <table className="min-w-full border-collapse text-xs">
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
                    {Object.entries(data).map(([key, componentData]) => {
                        if (Array.isArray(componentData)) {
                             const isComponentExpanded = expandedRows.has(key);
                             return (
                                <React.Fragment key={key}>
                                    {renderSummaryRow(componentData, key, key, isComponentExpanded, 0)}
                                    {isComponentExpanded &&
                                        componentData.map((item, index) => renderDataRow(item, `${key}-${index}`, 1))
                                    }
                                </React.Fragment>
                            );
                        }
                        if ((componentData as any).isExpandable) {
                             const isComponentExpanded = expandedRows.has(key);
                             return (
                                <React.Fragment key={key}>
                                    {renderSummaryRow((componentData as any).items, key, key, isComponentExpanded, 0)}
                                    {isComponentExpanded && (componentData as any).items.map((item: any, index: number) => renderDataRow(item, `${key}-${index}`, 1))}
                                </React.Fragment>
                            );
                        }
                        if ((componentData as any).isNestedExpandable) {
                            const isComponentExpanded = expandedRows.has(key);
                            const allPackageItems = Object.values((componentData as any).packages).flatMap((pkg: any) => pkg.items);
                             return (
                                <React.Fragment key={key}>
                                    {renderSummaryRow(allPackageItems, key, key, isComponentExpanded, 0)}
                                    {isComponentExpanded && Object.entries((componentData as any).packages).map(([packageName, packageData]: [string, any]) => (
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
    );
};

const Reports: React.FC<ReportsProps> = ({ ipos, subprojects, trainings, otherActivities, officeReqs, staffingReqs, otherProgramExpenses, uacsCodes }) => {
    const [activeTab, setActiveTab] = useState<ReportTab>('WFP');
    const [selectedYear, setSelectedYear] = useState<string>('All');
    const [selectedOu, setSelectedOu] = useState<string>('All');
    const [selectedTier, setSelectedTier] = useState<string>('All');
    const [selectedFundType, setSelectedFundType] = useState<string>('All');

    const availableYears = useMemo(() => {
        const years = new Set<string>();
        subprojects.forEach(p => p.fundingYear && years.add(p.fundingYear.toString()));
        trainings.forEach(t => t.fundingYear && years.add(t.fundingYear.toString()));
        otherActivities.forEach(a => years.add(new Date(a.date).getFullYear().toString()));
        officeReqs.forEach(i => years.add(i.fundYear.toString()));
        staffingReqs.forEach(i => years.add(i.fundYear.toString()));
        otherProgramExpenses.forEach(i => years.add(i.fundYear.toString()));
        return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
    }, [subprojects, trainings, otherActivities, officeReqs, staffingReqs, otherProgramExpenses]);

    const filteredData = useMemo(() => {
        let filtered = {
            subprojects: subprojects,
            ipos: ipos,
            trainings: trainings,
            otherActivities: otherActivities,
            officeReqs: officeReqs,
            staffingReqs: staffingReqs,
            otherProgramExpenses: otherProgramExpenses
        };

        if (selectedYear !== 'All') {
            filtered = {
                ...filtered,
                subprojects: filtered.subprojects.filter(p => p.fundingYear?.toString() === selectedYear),
                trainings: filtered.trainings.filter(t => t.fundingYear?.toString() === selectedYear),
                otherActivities: filtered.otherActivities.filter(a => new Date(a.date).getFullYear().toString() === selectedYear),
                officeReqs: filtered.officeReqs.filter(i => i.fundYear.toString() === selectedYear),
                staffingReqs: filtered.staffingReqs.filter(i => i.fundYear.toString() === selectedYear),
                otherProgramExpenses: filtered.otherProgramExpenses.filter(i => i.fundYear.toString() === selectedYear),
            };
        }

        if (selectedTier !== 'All') {
            filtered = {
                ...filtered,
                subprojects: filtered.subprojects.filter(p => p.tier === selectedTier),
                trainings: filtered.trainings.filter(t => t.tier === selectedTier),
                officeReqs: filtered.officeReqs.filter(i => i.tier === selectedTier),
                staffingReqs: filtered.staffingReqs.filter(i => i.tier === selectedTier),
                otherProgramExpenses: filtered.otherProgramExpenses.filter(i => i.tier === selectedTier),
            };
        }

        if (selectedFundType !== 'All') {
            filtered = {
                ...filtered,
                subprojects: filtered.subprojects.filter(p => p.fundType === selectedFundType),
                trainings: filtered.trainings.filter(t => t.fundType === selectedFundType),
                officeReqs: filtered.officeReqs.filter(i => i.fundType === selectedFundType),
                staffingReqs: filtered.staffingReqs.filter(i => i.fundType === selectedFundType),
                otherProgramExpenses: filtered.otherProgramExpenses.filter(i => i.fundType === selectedFundType),
            };
        }

        if (selectedOu === 'All') {
            return filtered;
        }

        const targetRegion = ouToRegionMap[selectedOu];

        return {
            subprojects: filtered.subprojects.filter(p => p.operatingUnit === selectedOu),
            ipos: filtered.ipos.filter(i => i.region === targetRegion),
            trainings: filtered.trainings.filter(t => t.operatingUnit === selectedOu),
            otherActivities: filtered.otherActivities.filter(a => a.operatingUnit === selectedOu),
            // Simple filter for PM items based on OU name approximation or mapped value
            officeReqs: filtered.officeReqs.filter(i => i.operatingUnit === selectedOu),
            staffingReqs: filtered.staffingReqs.filter(i => i.operatingUnit === selectedOu),
            otherProgramExpenses: filtered.otherProgramExpenses.filter(i => i.operatingUnit === selectedOu),
        };
    }, [selectedYear, selectedOu, selectedTier, selectedFundType, subprojects, ipos, trainings, otherActivities, officeReqs, staffingReqs, otherProgramExpenses]);
    
    const bpFormsProcessedData = useMemo(() => {
        const headers: { [objectType: string]: { [particular: string]: string[] } } = { MOOE: {}, CO: {} };
        const allUacsCodes: string[] = [];
        
        for (const objectType of Object.keys(uacsCodes)) {
            // @ts-ignore
            if (!uacsCodes[objectType]) continue;
            // @ts-ignore
            for (const particular of Object.keys(uacsCodes[objectType])) {
                // @ts-ignore
                const codes = Object.keys(uacsCodes[objectType][particular]);
                headers[objectType as keyof typeof headers][particular] = codes;
                allUacsCodes.push(...codes);
            }
        }

        const lineItems: any[] = [];
        filteredData.subprojects.forEach(sp => {
            sp.details.forEach(d => {
                lineItems.push({
                    component: 'Production and Livelihood', packageType: sp.packageType, activityName: sp.name,
                    objectType: d.objectType, uacsCode: d.uacsCode, amount: d.pricePerUnit * d.numberOfUnits
                });
            });
        });
        filteredData.trainings.forEach(t => {
            t.expenses.forEach(e => {
                // If component is Program Management, set specific package type 'Trainings'
                const packageType = t.component === 'Program Management' ? 'Trainings' : undefined;
                lineItems.push({
                    component: t.component, packageType, activityName: t.name,
                    objectType: e.objectType, uacsCode: e.uacsCode, amount: e.amount
                });
            });
        });
        filteredData.otherActivities.forEach(oa => {
            oa.expenses.forEach(e => {
                 // If component is Program Management, set specific package type 'Activities'
                const packageType = oa.component === 'Program Management' ? 'Activities' : undefined;
                lineItems.push({
                    component: oa.component, packageType, activityName: oa.name,
                    objectType: e.objectType, uacsCode: e.uacsCode, amount: e.amount
                });
            });
        });
        filteredData.staffingReqs.forEach(sr => {
            lineItems.push({
                component: 'Program Management', packageType: 'Staff Requirements', activityName: sr.personnelPosition,
                objectType: getObjectTypeByCode(sr.uacsCode, uacsCodes), uacsCode: sr.uacsCode, amount: sr.annualSalary
            });
        });
        filteredData.officeReqs.forEach(or => {
            lineItems.push({
                component: 'Program Management', packageType: 'Office Requirements', activityName: or.equipment,
                objectType: getObjectTypeByCode(or.uacsCode, uacsCodes), uacsCode: or.uacsCode, amount: or.pricePerUnit * or.numberOfUnits
            });
        });
        filteredData.otherProgramExpenses.forEach(ope => {
            lineItems.push({
                component: 'Program Management', packageType: 'Office Requirements', activityName: ope.particulars,
                objectType: getObjectTypeByCode(ope.uacsCode, uacsCodes), uacsCode: ope.uacsCode, amount: ope.amount
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
                 // Packages are pre-initialized for PM but safety check
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
            
            if(activity.uacsValues.hasOwnProperty(item.uacsCode)) {
                activity.uacsValues[item.uacsCode] += item.amount;
            }

            if (item.objectType === 'MOOE') {
                activity.totalMOOE += item.amount;
            } else if (item.objectType === 'CO') {
                activity.totalCO += item.amount;
            }
        });
        
        // Sort packages within Production and Livelihood
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
    }, [filteredData, uacsCodes]);

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
        
        filteredData.subprojects.forEach(sp => {
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
            finalData['Production and Livelihood'].packages[packageKey].items.push(item);
        });

        filteredData.trainings.forEach(t => {
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
                 finalData['Production and Livelihood'].packages[packageKey].items.push(item);
            } else if (t.component === 'Program Management') {
                 finalData['Program Management'].packages['Trainings'].items.push(item);
            } else if (finalData[t.component]) {
                finalData[t.component].push(item);
            }
        });

        filteredData.otherActivities.forEach(oa => {
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
                 finalData['Program Management'].packages['Activities'].items.push(item);
            } else if (finalData[oa.component]) {
                finalData[oa.component].push(item);
            }
        });

        // Helper for Program Management Items (Staff, Office, Other)
        const processPmItem = (items: any[], packageKey: string, isStaff = false) => {
            items.forEach(pm => {
                const objType = getObjectTypeByCode(pm.uacsCode, uacsCodes);
                const amount = isStaff ? pm.annualSalary : (pm.amount || (pm.pricePerUnit * pm.numberOfUnits));
                
                const financialQuarter = getQuarter(pm.obligationDate);
                const physicalQuarter = getQuarter(pm.obligationDate); // Simplified assumption

                const item = {
                    indicator: isStaff ? pm.personnelPosition : (pm.equipment || pm.particulars),
                    totalPhysicalTarget: isStaff ? 1 : (pm.numberOfUnits || 1),
                    mooeCost: objType === 'MOOE' ? amount : 0,
                    coCost: objType === 'CO' ? amount : 0,
                    totalCost: amount,
                    q1Physical: physicalQuarter === 1 ? (isStaff ? 1 : (pm.numberOfUnits || 1)) : 0,
                    q2Physical: physicalQuarter === 2 ? (isStaff ? 1 : (pm.numberOfUnits || 1)) : 0,
                    q3Physical: physicalQuarter === 3 ? (isStaff ? 1 : (pm.numberOfUnits || 1)) : 0,
                    q4Physical: physicalQuarter === 4 ? (isStaff ? 1 : (pm.numberOfUnits || 1)) : 0,
                    q1Financial: financialQuarter === 1 ? amount : 0,
                    q2Financial: financialQuarter === 2 ? amount : 0,
                    q3Financial: financialQuarter === 3 ? amount : 0,
                    q4Financial: financialQuarter === 4 ? amount : 0,
                };
                finalData['Program Management'].packages[packageKey].items.push(item);
            });
        }

        processPmItem(filteredData.staffingReqs, 'Staff Requirements', true);
        processPmItem(filteredData.officeReqs, 'Office Requirements');
        processPmItem(filteredData.otherProgramExpenses, 'Office Requirements'); // Grouped with Office as requested

        // Sort PL packages
        const plPackageKeys = Object.keys(finalData['Production and Livelihood'].packages);
        plPackageKeys.sort((a, b) => {
            if (a === 'Trainings') return -1;
            if (b === 'Trainings') return 1;
            return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        });
        const sortedPLPackageData: { [key: string]: any } = {};
        for (const key of plPackageKeys) sortedPLPackageData[key] = finalData['Production and Livelihood'].packages[key];
        finalData['Production and Livelihood'].packages = sortedPLPackageData;

        return finalData;
    }, [filteredData, uacsCodes]);

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

        const grandTotals = Object.values(wfpData).flatMap(component => {
            if (Array.isArray(component)) return component;
            if ((component as any).isExpandable) return (component as any).items;
            if ((component as any).isNestedExpandable) return Object.values((component as any).packages).flatMap((pkg: any) => pkg.items);
            return [];
        });

        addTotalsRow(grandTotals, "GRAND TOTAL");
        
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "WFP Report");
        XLSX.writeFile(wb, `WFP_Report_${selectedYear}_${selectedOu}.xlsx`);
    };

    const handleDownloadBpFormsXlsx = () => {
        const { allUacsCodes, rows } = bpFormsProcessedData;
        
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

    const handlePrint = () => {
        window.print();
    };
    
    const TabButton: React.FC<{ tabName: ReportTab; label: string; }> = ({ tabName, label }) => {
        const isActive = activeTab === tabName;
        return (
            <button
                type="button"
                onClick={() => setActiveTab(tabName)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-200
                    ${isActive
                        ? 'border-accent text-accent dark:text-green-400 dark:border-green-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
            >
                {label}
            </button>
        );
    }
    
    const renderTabContent = () => {
        const Placeholder: React.FC<{ title: string }> = ({ title }) => (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                <h3 className="text-xl font-semibold">{title}</h3>
                <p className="mt-2 text-gray-600 dark:text-gray-400">Content for this report will be available soon.</p>
            </div>
        );
        
        switch (activeTab) {
            case 'WFP':
                return (
                    <div id="wfp-container-for-print" className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                        <div className="flex justify-between items-center mb-4 print-hidden">
                            <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Work and Financial Plan (WFP)</h3>
                            <div className="flex items-center gap-4">
                                <button onClick={handlePrint} className="px-4 py-2 bg-gray-500 text-white rounded-md font-semibold hover:bg-gray-600">Print Report</button>
                                <button onClick={handleDownloadXLSX} className="px-4 py-2 bg-accent text-white rounded-md font-semibold hover:brightness-95">Download XLSX</button>
                            </div>
                        </div>
                        <WFPTable data={wfpData} />
                    </div>
                );
            case 'BP Forms': 
                return (
                     <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                        <div className="flex justify-between items-center mb-4 print-hidden">
                            <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Budget Proposal (BP) Forms</h3>
                             <button onClick={handleDownloadBpFormsXlsx} className="px-4 py-2 bg-accent text-white rounded-md font-semibold hover:brightness-95">Download XLSX</button>
                        </div>
                        <BPFormsReport data={bpFormsProcessedData} />
                    </div>
                );
            case 'BEDS': return <Placeholder title="Budget Execution Documents (BEDS)" />;
            case 'BAR1': return <Placeholder title="BAR1 Reports" />;
            default: return null;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-4 print-hidden">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Reports</h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                     <div className="flex items-center gap-2">
                        <label htmlFor="ou-filter" className="text-sm font-medium text-gray-600 dark:text-gray-300">Operating Unit:</label>
                        <select 
                            id="ou-filter"
                            value={selectedOu}
                            onChange={(e) => setSelectedOu(e.target.value)}
                            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-10 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
                        >
                            <option value="All">All OUs</option>
                            {operatingUnits.map(ou => (
                                <option key={ou} value={ou}>{ou}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <label htmlFor="tier-filter" className="text-sm font-medium text-gray-600 dark:text-gray-300">Tier:</label>
                        <select 
                            id="tier-filter"
                            value={selectedTier}
                            onChange={(e) => setSelectedTier(e.target.value)}
                            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-10 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
                        >
                            <option value="All">All Tiers</option>
                            {tiers.map(tier => (
                                <option key={tier} value={tier}>{tier}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <label htmlFor="fund-type-filter" className="text-sm font-medium text-gray-600 dark:text-gray-300">Fund Type:</label>
                        <select 
                            id="fund-type-filter"
                            value={selectedFundType}
                            onChange={(e) => setSelectedFundType(e.target.value)}
                            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-10 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
                        >
                            <option value="All">All Fund Types</option>
                            {fundTypes.map(ft => (
                                <option key={ft} value={ft}>{ft}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <label htmlFor="year-filter" className="text-sm font-medium text-gray-600 dark:text-gray-300">Year:</label>
                        <select 
                            id="year-filter"
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(e.target.value)}
                            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-10 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
                        >
                            <option value="All">All Years</option>
                            {availableYears.map(year => ( <option key={year} value={year}>{year}</option> ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md print-hidden">
                <div className="border-b border-gray-200 dark:border-gray-700">
                    <nav className="-mb-px flex space-x-4 px-4 overflow-x-auto" aria-label="Tabs">
                        <TabButton tabName="WFP" label="WFP" />
                        <TabButton tabName="BP Forms" label="BP Forms" />
                        <TabButton tabName="BEDS" label="BEDS" />
                        <TabButton tabName="BAR1" label="BAR1" />
                    </nav>
                </div>
            </div>

            <div className="mt-4">
                {renderTabContent()}
            </div>
        </div>
    );
};

export default Reports;