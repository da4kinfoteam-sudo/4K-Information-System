
import React, { useMemo, useState, useEffect } from 'react';
import { Subproject, Training, OtherActivity, IPO, OfficeRequirement, StaffingRequirement, OtherProgramExpense, tiers, fundTypes, operatingUnits, ouToRegionMap } from '../constants';
import { parseLocation } from './LocationPicker';

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

type ReportTab = 'WFP' | 'BP Forms' | 'BEDS' | 'PICS' | 'BAR1';

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
            <table className="min-w-full border-collapse text-xs text-gray-900 dark:text-gray-200">
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
    );
};

const BEDSTable: React.FC<{ data: { [key: string]: any } }> = ({ data }) => {
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

    const grandTotals = useMemo(() => Object.values(data).flatMap((component: any) => {
        if (Array.isArray(component)) return component;
        if (component.isExpandable) return component.items;
        if (component.isNestedExpandable) return Object.values(component.packages).flatMap((pkg: any) => pkg.items);
        return [];
    }), [data]);

    return (
        <div id="beds-report" className="overflow-x-auto shadow-md rounded-lg">
            <table className="min-w-full border-collapse text-xs text-gray-900 dark:text-gray-200 whitespace-nowrap">
                <thead className="bg-gray-200 dark:bg-gray-700 sticky top-0 z-10">
                    <tr>
                        <th rowSpan={2} className="p-2 border border-gray-300 dark:border-gray-600 align-bottom min-w-[250px] sticky left-0 bg-gray-200 dark:bg-gray-700 z-20 text-left">Program/Activity/Project</th>
                        <th rowSpan={2} className="p-2 border border-gray-300 dark:border-gray-600 text-center align-middle min-w-[150px]">Performance Indicator</th>
                        
                        {/* Group: Current Year Obligation */}
                        <th colSpan={3} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold bg-gray-300 dark:bg-gray-600">Current Year Obligation</th>
                        
                        <th rowSpan={2} className="p-2 border border-gray-300 dark:border-gray-600 text-center align-middle bg-blue-100 dark:bg-blue-900/40 font-bold min-w-[100px]">Total Target</th>
                        
                        <th colSpan={5} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold">Comprehensive Release</th>
                        <th colSpan={5} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold">For Later Release</th>
                    </tr>
                    <tr>
                        {/* Current Year Obligation Sub-columns */}
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[100px]">Actual (Jan-Sept)</th>
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[100px]">Estimate (Oct-Dec)</th>
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[100px]">Total</th>

                        {/* Comprehensive Release Sub-columns */}
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[80px]">Q1</th>
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[80px]">Q2</th>
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[80px]">Q3</th>
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[80px]">Q4</th>
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[100px]">Subtotal</th>
                        
                        {/* For Later Release Sub-columns */}
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[80px]">Q1</th>
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[80px]">Q2</th>
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[80px]">Q3</th>
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[80px]">Q4</th>
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[100px]">Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    {Object.entries(data).map(([key, cd]) => {
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
    );
}

const WFPTable: React.FC<{ data: { [key: string]: any } }> = ({ data }) => {
    // ... [WFP Table Implementation] ...
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

    const grandTotals = useMemo(() => Object.values(data).flatMap((component: any) => {
        if (Array.isArray(component)) return component;
        if (component.isExpandable) return component.items;
        if (component.isNestedExpandable) return Object.values(component.packages).flatMap((pkg: any) => pkg.items);
        return [];
    }), [data]);

    return (
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
                    {Object.entries(data).map(([key, cd]) => {
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
    );
};

const PICSTable: React.FC<{ data: any[] }> = ({ data }) => {
    // ... [PICSTable remains unchanged] ...
    // State to track expanded status. Key = "RegionName" or "RegionName|ProvinceName"
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const toggle = (id: string) => {
        setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const calculateSummary = (items: any[]) => {
        const summary = {
            totalTarget: 0,
            maleTarget: 0,
            femaleTarget: 0,
            unidentifiedTarget: 0,
            totalParticipants: 0,
            allIpos: new Set<string>(),
            tier1TotalTarget: 0,
            tier1MaleTarget: 0,
            tier1FemaleTarget: 0,
            tier1UnidentifiedTarget: 0,
            tier1TotalParticipants: 0,
            tier1AllIpos: new Set<string>(),
            tier2TotalTarget: 0,
            tier2MaleTarget: 0,
            tier2FemaleTarget: 0,
            tier2UnidentifiedTarget: 0,
            tier2TotalParticipants: 0,
            tier2AllIpos: new Set<string>(),
        };
        items.forEach(item => {
            summary.totalTarget += item.totalTarget;
            summary.maleTarget += item.maleTarget;
            summary.femaleTarget += item.femaleTarget;
            summary.unidentifiedTarget += item.unidentifiedTarget;
            summary.totalParticipants += item.totalParticipants;
            if (item.ipoNames) {
                item.ipoNames.forEach((name: string) => summary.allIpos.add(name));
            }

            summary.tier1TotalTarget += item.tier1TotalTarget;
            summary.tier1MaleTarget += item.tier1MaleTarget;
            summary.tier1FemaleTarget += item.tier1FemaleTarget;
            summary.tier1UnidentifiedTarget += item.tier1UnidentifiedTarget;
            summary.tier1TotalParticipants += item.tier1TotalParticipants;
            if (item.tier1IpoNames) item.tier1IpoNames.forEach((name: string) => summary.tier1AllIpos.add(name));

            summary.tier2TotalTarget += item.tier2TotalTarget;
            summary.tier2MaleTarget += item.tier2MaleTarget;
            summary.tier2FemaleTarget += item.tier2FemaleTarget;
            summary.tier2UnidentifiedTarget += item.tier2UnidentifiedTarget;
            summary.tier2TotalParticipants += item.tier2TotalParticipants;
            if (item.tier2IpoNames) item.tier2IpoNames.forEach((name: string) => summary.tier2AllIpos.add(name));
        });
        return {
            ...summary,
            totalGroup: summary.allIpos.size,
            tier1TotalGroup: summary.tier1AllIpos.size,
            tier2TotalGroup: summary.tier2AllIpos.size,
        };
    };

    const groupedData = useMemo(() => {
        const regions: Record<string, { provinces: Record<string, { items: any[] }> }> = {};
        data.forEach(item => {
            if (!regions[item.region]) regions[item.region] = { provinces: {} };
            if (!regions[item.region].provinces[item.province]) regions[item.region].provinces[item.province] = { items: [] };
            regions[item.region].provinces[item.province].items.push(item);
        });
        return regions;
    }, [data]);

    const sortedRegions = Object.keys(groupedData).sort();
    const grandTotalSummary = calculateSummary(data);

    const dataCellClass = "p-1 border border-gray-300 dark:border-gray-600";
    const headerCellClass = "p-1 border border-gray-300 dark:border-gray-600 font-bold bg-gray-200 dark:bg-gray-700 text-center align-middle";
    const groupRowClass = "font-bold bg-gray-100 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer";

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-xs text-gray-900 dark:text-gray-200 whitespace-nowrap">
                <thead className="sticky top-0 z-10 bg-gray-200 dark:bg-gray-700">
                    <tr>
                        <th rowSpan={2} className={`${headerCellClass} text-left`}>Location / Performance Indicator</th>
                        <th rowSpan={2} className={headerCellClass}>Unit of Measure</th>
                        <th colSpan={6} className={headerCellClass}>TOTAL</th>
                        <th colSpan={6} className={headerCellClass}>TIER 1</th>
                        <th colSpan={6} className={headerCellClass}>TIER 2</th>
                    </tr>
                    <tr>
                        {/* Total Sub-columns */}
                        <th className={headerCellClass}>Target</th>
                        <th className={headerCellClass}>Group (IPOs)</th>
                        <th className={headerCellClass}>Male</th>
                        <th className={headerCellClass}>Female</th>
                        <th className={headerCellClass}>Unidentified</th>
                        <th className={headerCellClass}>Participants</th>
                        
                        {/* Tier 1 Sub-columns */}
                        <th className={headerCellClass}>Target</th>
                        <th className={headerCellClass}>Group</th>
                        <th className={headerCellClass}>Male</th>
                        <th className={headerCellClass}>Female</th>
                        <th className={headerCellClass}>Unidentified</th>
                        <th className={headerCellClass}>Participants</th>

                        {/* Tier 2 Sub-columns */}
                        <th className={headerCellClass}>Target</th>
                        <th className={headerCellClass}>Group</th>
                        <th className={headerCellClass}>Male</th>
                        <th className={headerCellClass}>Female</th>
                        <th className={headerCellClass}>Unidentified</th>
                        <th className={headerCellClass}>Participants</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedRegions.map(region => {
                        const regionData = groupedData[region];
                        const regionItems = Object.values(regionData.provinces).flatMap(p => p.items);
                        const regionSummary = calculateSummary(regionItems);
                        const isRegionExpanded = expanded[region];

                        return (
                            <React.Fragment key={region}>
                                <tr className={groupRowClass} onClick={() => toggle(region)}>
                                    <td className={`${dataCellClass} text-left`}>
                                        <span className="inline-block w-5 text-center text-gray-500 dark:text-gray-400 font-bold">{isRegionExpanded ? '−' : '+'}</span>
                                        {region}
                                    </td>
                                    <td className={`${dataCellClass} text-center`}>-</td>
                                    <td className={`${dataCellClass} text-center`}>{regionSummary.totalTarget}</td>
                                    <td className={`${dataCellClass} text-center`}>{regionSummary.totalGroup}</td>
                                    <td className={`${dataCellClass} text-center`}>{regionSummary.maleTarget}</td>
                                    <td className={`${dataCellClass} text-center`}>{regionSummary.femaleTarget}</td>
                                    <td className={`${dataCellClass} text-center`}>{regionSummary.unidentifiedTarget}</td>
                                    <td className={`${dataCellClass} text-center`}>{regionSummary.totalParticipants}</td>
                                    <td className={`${dataCellClass} text-center`}>{regionSummary.tier1TotalTarget}</td>
                                    <td className={`${dataCellClass} text-center`}>{regionSummary.tier1TotalGroup}</td>
                                    <td className={`${dataCellClass} text-center`}>{regionSummary.tier1MaleTarget}</td>
                                    <td className={`${dataCellClass} text-center`}>{regionSummary.tier1FemaleTarget}</td>
                                    <td className={`${dataCellClass} text-center`}>{regionSummary.tier1UnidentifiedTarget}</td>
                                    <td className={`${dataCellClass} text-center`}>{regionSummary.tier1TotalParticipants}</td>
                                    <td className={`${dataCellClass} text-center`}>{regionSummary.tier2TotalTarget}</td>
                                    <td className={`${dataCellClass} text-center`}>{regionSummary.tier2TotalGroup}</td>
                                    <td className={`${dataCellClass} text-center`}>{regionSummary.tier2MaleTarget}</td>
                                    <td className={`${dataCellClass} text-center`}>{regionSummary.tier2FemaleTarget}</td>
                                    <td className={`${dataCellClass} text-center`}>{regionSummary.tier2UnidentifiedTarget}</td>
                                    <td className={`${dataCellClass} text-center`}>{regionSummary.tier2TotalParticipants}</td>
                                </tr>
                                {isRegionExpanded && Object.keys(regionData.provinces).sort().map(province => {
                                    const provinceItems = regionData.provinces[province].items;
                                    const provinceSummary = calculateSummary(provinceItems);
                                    const provinceKey = `${region}|${province}`;
                                    const isProvinceExpanded = expanded[provinceKey];

                                    return (
                                        <React.Fragment key={provinceKey}>
                                            <tr className={groupRowClass} onClick={() => toggle(provinceKey)}>
                                                <td className={`${dataCellClass} text-left pl-6`}>
                                                    <span className="inline-block w-5 text-center text-gray-500 dark:text-gray-400 font-bold">{isProvinceExpanded ? '−' : '+'}</span>
                                                    {province}
                                                </td>
                                                <td className={`${dataCellClass} text-center`}>-</td>
                                                <td className={`${dataCellClass} text-center`}>{provinceSummary.totalTarget}</td>
                                                <td className={`${dataCellClass} text-center`}>{provinceSummary.totalGroup}</td>
                                                <td className={`${dataCellClass} text-center`}>{provinceSummary.maleTarget}</td>
                                                <td className={`${dataCellClass} text-center`}>{provinceSummary.femaleTarget}</td>
                                                <td className={`${dataCellClass} text-center`}>{provinceSummary.unidentifiedTarget}</td>
                                                <td className={`${dataCellClass} text-center`}>{provinceSummary.totalParticipants}</td>
                                                <td className={`${dataCellClass} text-center`}>{provinceSummary.tier1TotalTarget}</td>
                                                <td className={`${dataCellClass} text-center`}>{provinceSummary.tier1TotalGroup}</td>
                                                <td className={`${dataCellClass} text-center`}>{provinceSummary.tier1MaleTarget}</td>
                                                <td className={`${dataCellClass} text-center`}>{provinceSummary.tier1FemaleTarget}</td>
                                                <td className={`${dataCellClass} text-center`}>{provinceSummary.tier1UnidentifiedTarget}</td>
                                                <td className={`${dataCellClass} text-center`}>{provinceSummary.tier1TotalParticipants}</td>
                                                <td className={`${dataCellClass} text-center`}>{provinceSummary.tier2TotalTarget}</td>
                                                <td className={`${dataCellClass} text-center`}>{provinceSummary.tier2TotalGroup}</td>
                                                <td className={`${dataCellClass} text-center`}>{provinceSummary.tier2MaleTarget}</td>
                                                <td className={`${dataCellClass} text-center`}>{provinceSummary.tier2FemaleTarget}</td>
                                                <td className={`${dataCellClass} text-center`}>{provinceSummary.tier2UnidentifiedTarget}</td>
                                                <td className={`${dataCellClass} text-center`}>{provinceSummary.tier2TotalParticipants}</td>
                                            </tr>
                                            {isProvinceExpanded && provinceItems.map((item, idx) => (
                                                <tr key={`${provinceKey}-${idx}`} className="hover:bg-white dark:hover:bg-gray-700/30">
                                                    <td className={`${dataCellClass} text-left pl-10`}>{item.indicator}</td>
                                                    <td className={`${dataCellClass} text-center`}>number</td>
                                                    <td className={`${dataCellClass} text-center`}>{item.totalTarget}</td>
                                                    <td className={`${dataCellClass} text-center`}>{item.ipoNames.size}</td>
                                                    <td className={`${dataCellClass} text-center`}>{item.maleTarget}</td>
                                                    <td className={`${dataCellClass} text-center`}>{item.femaleTarget}</td>
                                                    <td className={`${dataCellClass} text-center`}>{item.unidentifiedTarget}</td>
                                                    <td className={`${dataCellClass} text-center`}>{item.totalParticipants}</td>
                                                    <td className={`${dataCellClass} text-center`}>{item.tier1TotalTarget}</td>
                                                    <td className={`${dataCellClass} text-center`}>{item.tier1IpoNames.size}</td>
                                                    <td className={`${dataCellClass} text-center`}>{item.tier1MaleTarget}</td>
                                                    <td className={`${dataCellClass} text-center`}>{item.tier1FemaleTarget}</td>
                                                    <td className={`${dataCellClass} text-center`}>{item.tier1UnidentifiedTarget}</td>
                                                    <td className={`${dataCellClass} text-center`}>{item.tier1TotalParticipants}</td>
                                                    <td className={`${dataCellClass} text-center`}>{item.tier2TotalTarget}</td>
                                                    <td className={`${dataCellClass} text-center`}>{item.tier2IpoNames.size}</td>
                                                    <td className={`${dataCellClass} text-center`}>{item.tier2MaleTarget}</td>
                                                    <td className={`${dataCellClass} text-center`}>{item.tier2FemaleTarget}</td>
                                                    <td className={`${dataCellClass} text-center`}>{item.tier2UnidentifiedTarget}</td>
                                                    <td className={`${dataCellClass} text-center`}>{item.tier2TotalParticipants}</td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    );
                                })}
                            </React.Fragment>
                        );
                    })}
                </tbody>
                <tfoot>
                    <tr className="font-bold bg-gray-200 dark:bg-gray-700">
                        <td className={`${dataCellClass} text-right`}>GRAND TOTAL</td>
                        <td className={`${dataCellClass} text-center`}>-</td>
                        <td className={`${dataCellClass} text-center`}>{grandTotalSummary.totalTarget}</td>
                        <td className={`${dataCellClass} text-center`}>{grandTotalSummary.totalGroup}</td>
                        <td className={`${dataCellClass} text-center`}>{grandTotalSummary.maleTarget}</td>
                        <td className={`${dataCellClass} text-center`}>{grandTotalSummary.femaleTarget}</td>
                        <td className={`${dataCellClass} text-center`}>{grandTotalSummary.unidentifiedTarget}</td>
                        <td className={`${dataCellClass} text-center`}>{grandTotalSummary.totalParticipants}</td>
                        <td className={`${dataCellClass} text-center`}>{grandTotalSummary.tier1TotalTarget}</td>
                        <td className={`${dataCellClass} text-center`}>{grandTotalSummary.tier1TotalGroup}</td>
                        <td className={`${dataCellClass} text-center`}>{grandTotalSummary.tier1MaleTarget}</td>
                        <td className={`${dataCellClass} text-center`}>{grandTotalSummary.tier1FemaleTarget}</td>
                        <td className={`${dataCellClass} text-center`}>{grandTotalSummary.tier1UnidentifiedTarget}</td>
                        <td className={`${dataCellClass} text-center`}>{grandTotalSummary.tier1TotalParticipants}</td>
                        <td className={`${dataCellClass} text-center`}>{grandTotalSummary.tier2TotalTarget}</td>
                        <td className={`${dataCellClass} text-center`}>{grandTotalSummary.tier2TotalGroup}</td>
                        <td className={`${dataCellClass} text-center`}>{grandTotalSummary.tier2MaleTarget}</td>
                        <td className={`${dataCellClass} text-center`}>{grandTotalSummary.tier2FemaleTarget}</td>
                        <td className={`${dataCellClass} text-center`}>{grandTotalSummary.tier2UnidentifiedTarget}</td>
                        <td className={`${dataCellClass} text-center`}>{grandTotalSummary.tier2TotalParticipants}</td>
                    </tr>
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
                otherActivities: filtered.otherActivities.filter(a => a.tier === selectedTier),
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
                otherActivities: filtered.otherActivities.filter(a => a.fundType === selectedFundType),
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
    
    // ... [BPForms Data Processing Code - no changes needed] ...
    const bpFormsProcessedData = useMemo(() => {
        // ... (existing implementation)
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
                const packageType = t.component === 'Program Management' ? 'Trainings' : undefined;
                lineItems.push({
                    component: t.component, packageType, activityName: t.name,
                    objectType: e.objectType, uacsCode: e.uacsCode, amount: e.amount
                });
            });
        });
        filteredData.otherActivities.forEach(oa => {
            oa.expenses.forEach(e => {
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

    // ... [WFP Data Processing Code - no changes needed] ...
    const wfpData = useMemo(() => {
        // ... (existing implementation)
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

        const processPmItem = (items: any[], packageKey: string, isStaff = false) => {
            items.forEach(pm => {
                const objType = getObjectTypeByCode(pm.uacsCode, uacsCodes);
                const amount = isStaff ? pm.annualSalary : (pm.amount || (pm.pricePerUnit * pm.numberOfUnits));
                
                const financialQuarter = getQuarter(pm.obligationDate);
                const physicalQuarter = getQuarter(pm.obligationDate);

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
        processPmItem(filteredData.otherProgramExpenses, 'Office Requirements');

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
            if (type === 'Subproject') sourceList = subprojects;
            else if (type === 'Training') sourceList = trainings;
            else if (type === 'Activity') sourceList = otherActivities;
            else if (type === 'Staff') sourceList = staffingReqs;
            else if (type === 'Office') sourceList = [...officeReqs, ...otherProgramExpenses];

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
        filteredData.subprojects.forEach(sp => {
            const item = createItem(sp.name, 'Subproject', sp, sp.details);
            const packageKey = sp.packageType;
            if (!finalData['Production and Livelihood'].packages[packageKey]) {
                finalData['Production and Livelihood'].packages[packageKey] = { items: [] };
            }
            finalData['Production and Livelihood'].packages[packageKey].items.push(item);
        });

        // Process Trainings
        filteredData.trainings.forEach(t => {
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
        filteredData.otherActivities.forEach(oa => {
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
        processPm(filteredData.staffingReqs, 'Staff Requirements', 'Staff');
        processPm(filteredData.officeReqs, 'Office Requirements', 'Office');
        processPm(filteredData.otherProgramExpenses, 'Office Requirements', 'Office');

        const plPackageKeys = Object.keys(finalData['Production and Livelihood'].packages).sort();
        const sortedPLPackageData: { [key: string]: any } = {};
        for (const key of plPackageKeys) sortedPLPackageData[key] = finalData['Production and Livelihood'].packages[key];
        finalData['Production and Livelihood'].packages = sortedPLPackageData;

        return finalData;
    }, [filteredData, selectedYear, subprojects, trainings, otherActivities, staffingReqs, officeReqs, otherProgramExpenses, selectedFundType, selectedTier]);

    // ... [PICS Data Processing Code preserved] ...
    const picsData = useMemo(() => {
        // ... (abbreviated for response limits, uses existing logic)
        const aggregator = new Map<string, any>();
        const getKey = (r:string, p:string, i:string) => `${r}|${p}|${i}`;
        const ipoMap = new Map(); ipos.forEach(ipo => ipoMap.set(ipo.name, ipo));
        const adTracker = new Map();
        
        filteredData.subprojects.forEach(sp => {
            const region = ouToRegionMap[sp.operatingUnit] || 'Unmapped Region'; if (region === 'National Capital Region (NCR)') return;
            const { province } = parseLocation(sp.location); const indicator = `${sp.packageType} Subprojects provided`; const key = getKey(region, province || 'Unspecified', indicator);
            if (!aggregator.has(key)) aggregator.set(key, { region, province: province || 'Unspecified', indicator, totalTarget: 0, ipoNames: new Set(), maleTarget: 0, femaleTarget: 0, unidentifiedTarget: 0, totalParticipants: 0, tier1TotalTarget: 0, tier1IpoNames: new Set(), tier1MaleTarget: 0, tier1FemaleTarget: 0, tier1UnidentifiedTarget: 0, tier1TotalParticipants: 0, tier2TotalTarget: 0, tier2IpoNames: new Set(), tier2MaleTarget: 0, tier2FemaleTarget: 0, tier2UnidentifiedTarget: 0, tier2TotalParticipants: 0 });
            const entry = aggregator.get(key); entry.totalTarget += 1; entry.ipoNames.add(sp.indigenousPeopleOrganization);
            if (sp.tier === 'Tier 1') { entry.tier1TotalTarget += 1; entry.tier1IpoNames.add(sp.indigenousPeopleOrganization); } else if (sp.tier === 'Tier 2') { entry.tier2TotalTarget += 1; entry.tier2IpoNames.add(sp.indigenousPeopleOrganization); }
            const ipo = ipoMap.get(sp.indigenousPeopleOrganization);
            if (ipo && ipo.ancestralDomainNo) { const locKey = `${region}|${province || 'Unspecified'}`; if (!adTracker.has(locKey)) adTracker.set(locKey, { all: new Set(), t1: new Set(), t2: new Set() }); const tracker = adTracker.get(locKey); tracker.all.add(ipo.ancestralDomainNo); if (sp.tier === 'Tier 1') tracker.t1.add(ipo.ancestralDomainNo); if (sp.tier === 'Tier 2') tracker.t2.add(ipo.ancestralDomainNo); }
        });
        // ... (Ancestral Domain logic) ...
        adTracker.forEach((tracker, locKey) => { const [region, province] = locKey.split('|'); const indicator = "Ancestral Domains covered"; const key = getKey(region, province, indicator); if (!aggregator.has(key)) aggregator.set(key, { region, province, indicator, totalTarget: 0, ipoNames: new Set(), maleTarget: 0, femaleTarget: 0, unidentifiedTarget: 0, totalParticipants: 0, tier1TotalTarget: 0, tier1IpoNames: new Set(), tier1MaleTarget: 0, tier1FemaleTarget: 0, tier1UnidentifiedTarget: 0, tier1TotalParticipants: 0, tier2TotalTarget: 0, tier2IpoNames: new Set(), tier2MaleTarget: 0, tier2FemaleTarget: 0, tier2UnidentifiedTarget: 0, tier2TotalParticipants: 0 }); const entry = aggregator.get(key); entry.totalTarget = tracker.all.size; entry.tier1TotalTarget = tracker.t1.size; entry.tier2TotalTarget = tracker.t2.size; });
        // ... (Trainings and Activities logic) ...
        filteredData.trainings.forEach(activity => { if (activity.component === 'Program Management') return; const region = ouToRegionMap[activity.operatingUnit] || 'Unmapped Region'; if (region === 'National Capital Region (NCR)') return; const { province } = parseLocation(activity.location); const indicator = `${activity.component} Trainings conducted`; const key = getKey(region, province || 'Unspecified', indicator); if (!aggregator.has(key)) aggregator.set(key, { region, province: province || 'Unspecified', indicator, totalTarget: 0, ipoNames: new Set(), maleTarget: 0, femaleTarget: 0, unidentifiedTarget: 0, totalParticipants: 0, tier1TotalTarget: 0, tier1IpoNames: new Set(), tier1MaleTarget: 0, tier1FemaleTarget: 0, tier1UnidentifiedTarget: 0, tier1TotalParticipants: 0, tier2TotalTarget: 0, tier2IpoNames: new Set(), tier2MaleTarget: 0, tier2FemaleTarget: 0, tier2UnidentifiedTarget: 0, tier2TotalParticipants: 0 }); const entry = aggregator.get(key); entry.totalTarget += 1; activity.participatingIpos.forEach((ipo:any) => entry.ipoNames.add(ipo)); entry.maleTarget += (activity.participantsMale || 0); entry.femaleTarget += (activity.participantsFemale || 0); entry.totalParticipants += (activity.participantsMale || 0) + (activity.participantsFemale || 0); if (activity.tier === 'Tier 1') { entry.tier1TotalTarget += 1; activity.participatingIpos.forEach((ipo:any) => entry.tier1IpoNames.add(ipo)); entry.tier1MaleTarget += (activity.participantsMale || 0); entry.tier1FemaleTarget += (activity.participantsFemale || 0); entry.tier1TotalParticipants += (activity.participantsMale || 0) + (activity.participantsFemale || 0); } else if (activity.tier === 'Tier 2') { entry.tier2TotalTarget += 1; activity.participatingIpos.forEach((ipo:any) => entry.tier2IpoNames.add(ipo)); entry.tier2MaleTarget += (activity.participantsMale || 0); entry.tier2FemaleTarget += (activity.participantsFemale || 0); entry.tier2TotalParticipants += (activity.participantsMale || 0) + (activity.participantsFemale || 0); } });
        filteredData.otherActivities.forEach(activity => { if (activity.component === 'Program Management') return; const region = ouToRegionMap[activity.operatingUnit] || 'Unmapped Region'; if (region === 'National Capital Region (NCR)') return; const { province } = parseLocation(activity.location); const indicator = `${activity.name} conducted`; const key = getKey(region, province || 'Unspecified', indicator); if (!aggregator.has(key)) aggregator.set(key, { region, province: province || 'Unspecified', indicator, totalTarget: 0, ipoNames: new Set(), maleTarget: 0, femaleTarget: 0, unidentifiedTarget: 0, totalParticipants: 0, tier1TotalTarget: 0, tier1IpoNames: new Set(), tier1MaleTarget: 0, tier1FemaleTarget: 0, tier1UnidentifiedTarget: 0, tier1TotalParticipants: 0, tier2TotalTarget: 0, tier2IpoNames: new Set(), tier2MaleTarget: 0, tier2FemaleTarget: 0, tier2UnidentifiedTarget: 0, tier2TotalParticipants: 0 }); const entry = aggregator.get(key); entry.totalTarget += 1; activity.participatingIpos.forEach((ipo:any) => entry.ipoNames.add(ipo)); entry.maleTarget += (activity.participantsMale || 0); entry.femaleTarget += (activity.participantsFemale || 0); entry.totalParticipants += (activity.participantsMale || 0) + (activity.participantsFemale || 0); if (activity.tier === 'Tier 1') { entry.tier1TotalTarget += 1; activity.participatingIpos.forEach((ipo:any) => entry.tier1IpoNames.add(ipo)); entry.tier1MaleTarget += (activity.participantsMale || 0); entry.tier1FemaleTarget += (activity.participantsFemale || 0); entry.tier1TotalParticipants += (activity.participantsMale || 0) + (activity.participantsFemale || 0); } else if (activity.tier === 'Tier 2') { entry.tier2TotalTarget += 1; activity.participatingIpos.forEach((ipo:any) => entry.tier2IpoNames.add(ipo)); entry.tier2MaleTarget += (activity.participantsMale || 0); entry.tier2FemaleTarget += (activity.participantsFemale || 0); entry.tier2TotalParticipants += (activity.participantsMale || 0) + (activity.participantsFemale || 0); } });

        return Array.from(aggregator.values()).sort((a:any, b:any) => { if (a.region !== b.region) return a.region.localeCompare(b.region); if (a.province !== b.province) return a.province.localeCompare(b.province); return a.indicator.localeCompare(b.indicator); });
    }, [filteredData, ipos]);

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
            if (component.isNestedExpandable) return Object.values(component.packages).flatMap((pkg: any) => pkg.items);
            return [];
        });

        addTotalsRow(grandTotals, "GRAND TOTAL");
        
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "WFP Report");
        XLSX.writeFile(wb, `WFP_Report_${selectedYear}_${selectedOu}.xlsx`);
    };

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

        // Merge cells logic handled by library or post-processing, but for simple export structure:
        // We will just push data rows aligned with the second header row indices.

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
            if (component.isNestedExpandable) return Object.values(component.packages).flatMap((pkg: any) => pkg.items);
            return [];
        });

        addTotalsRow(grandTotals, "GRAND TOTAL");

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        
        // Merges for headers
        // A1:A2, B1:B2, C1:E1, F1:F2, G1:K1, L1:P1
        if(!ws['!merges']) ws['!merges'] = [];
        ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }); // P/A/P
        ws['!merges'].push({ s: { r: 0, c: 1 }, e: { r: 1, c: 1 } }); // Indicator
        ws['!merges'].push({ s: { r: 0, c: 2 }, e: { r: 0, c: 4 } }); // Current Year Obligation Group
        ws['!merges'].push({ s: { r: 0, c: 5 }, e: { r: 1, c: 5 } }); // Total Target
        ws['!merges'].push({ s: { r: 0, c: 6 }, e: { r: 0, c: 10 } }); // Comprehensive Release Group
        ws['!merges'].push({ s: { r: 0, c: 11 }, e: { r: 0, c: 15 } }); // For Later Release Group

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "BEDS Report");
        XLSX.writeFile(wb, `BEDS_Report_${selectedYear}_${selectedOu}.xlsx`);
    };

    const handleDownloadPicsXlsx = () => {
        // ... (existing implementation)
        const aoa: (string | number | null)[][] = [
            [
                "Region", "Province", "Performance Indicator", "Unit of Measure", 
                "Total Target", "Total Group", "Total Male Target", "Total Female Target", 
                "Total Unidentified Target", "Total Participants",
                "Tier 1 Total Target", "Tier 1 Total Group", "Tier 1 Total Male", "Tier 1 Total Female",
                "Tier 1 Total Unidentified", "Tier 1 Total Participants",
                "Tier 2 Total Target", "Tier 2 Total Group", "Tier 2 Total Male", "Tier 2 Total Female",
                "Tier 2 Total Unidentified", "Tier 2 Total Participants"
            ]
        ];

        picsData.forEach(row => {
            aoa.push([
                row.region, 
                row.province, 
                row.indicator, 
                "number", 
                row.totalTarget, 
                row.ipoNames.size, 
                row.maleTarget, 
                row.femaleTarget, 
                null, 
                row.totalParticipants,
                row.tier1TotalTarget,
                row.tier1IpoNames.size,
                row.tier1MaleTarget,
                row.tier1FemaleTarget,
                null,
                row.tier1TotalParticipants,
                row.tier2TotalTarget,
                row.tier2IpoNames.size,
                row.tier2MaleTarget,
                row.tier2FemaleTarget,
                null,
                row.tier2TotalParticipants
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "PICS Report");
        XLSX.writeFile(wb, `PICS_Report_${selectedYear}_${selectedOu}.xlsx`);
    };

    const handleDownloadBpFormsXlsx = () => {
        // ... (existing implementation)
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
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h3>
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
            case 'BEDS':
                return (
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                        <div className="flex justify-between items-center mb-4 print-hidden">
                            <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Budget Execution Documents (BEDS)</h3>
                            <button onClick={handleDownloadBedsXlsx} className="px-4 py-2 bg-accent text-white rounded-md font-semibold hover:brightness-95">Download XLSX</button>
                        </div>
                        <BEDSTable data={bedsData} />
                    </div>
                );
            case 'PICS':
                return (
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                        <div className="flex justify-between items-center mb-4 print-hidden">
                            <h3 className="text-xl font-semibold text-gray-800 dark:text-white">PICS Report</h3>
                            <button onClick={handleDownloadPicsXlsx} className="px-4 py-2 bg-accent text-white rounded-md font-semibold hover:brightness-95">Download XLSX</button>
                        </div>
                        <PICSTable data={picsData} />
                    </div>
                );
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
                        <label htmlFor="ou-filter" className="text-sm font-medium text-gray-600 dark:text-gray-300">OU:</label>
                        <select 
                            id="ou-filter"
                            value={selectedOu}
                            onChange={(e) => setSelectedOu(e.target.value)}
                            className="bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-10 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
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
                            className="bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-10 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
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
                            className="bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-10 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
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
                            className="bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-10 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
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
                        <TabButton tabName="PICS" label="PICS" />
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
