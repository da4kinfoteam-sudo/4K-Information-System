
import React, { useMemo, useState } from 'react';
import { Subproject, Training, OtherActivity, IPO, philippineRegions, months, tiers, fundTypes } from '../constants';

// Declare XLSX to inform TypeScript about the global variable
declare const XLSX: any;

interface ReportsProps {
    ipos: IPO[];
    subprojects: Subproject[];
    trainings: Training[];
    otherActivities: OtherActivity[];
}

type ReportTab = 'WFP' | 'BP Forms' | 'BEDS' | 'BAR1';

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
    
    const formatCurrency = (amount: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);

    const indentClasses: { [key: number]: string } = {
        0: '',
        1: 'pl-6',
        2: 'pl-10',
        3: 'pl-14',
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
            <tr className="font-bold bg-gray-100 dark:bg-gray-700/50">
                <td className="p-2 border border-gray-300 dark:border-gray-600">{label}</td>
                <td className="p-2 border border-gray-300 dark:border-gray-600 text-center">{totals.totalPhysicalTarget}</td>
                <td className="p-2 border border-gray-300 dark:border-gray-600 text-right">{formatCurrency(totals.mooeCost)}</td>
                <td className="p-2 border border-gray-300 dark:border-gray-600 text-right">{formatCurrency(totals.coCost)}</td>
                <td className="p-2 border border-gray-300 dark:border-gray-600 text-right">{formatCurrency(totals.totalCost)}</td>
                {[totals.q1Physical, totals.q2Physical, totals.q3Physical, totals.q4Physical].map((q, i) => <td key={i} className="p-2 border border-gray-300 dark:border-gray-600 text-center">{q || ''}</td>)}
                <td className="p-2 border border-gray-300 dark:border-gray-600 text-center">{totalQuarterlyPhysical || ''}</td>
                {[totals.q1Financial, totals.q2Financial, totals.q3Financial, totals.q4Financial].map((q, i) => <td key={i} className="p-2 border border-gray-300 dark:border-gray-600 text-right">{q ? formatCurrency(q) : ''}</td>)}
                 <td className="p-2 border border-gray-300 dark:border-gray-600 text-right">{totalQuarterlyFinancial ? formatCurrency(totalQuarterlyFinancial) : ''}</td>
            </tr>
        );
    };
    
    const renderSummaryRow = (items: any[], label: string, rowKey: string, isExpanded: boolean, indentLevel = 0) => {
        if (items.length === 0) {
            return (
                <tr className="font-semibold bg-gray-50 dark:bg-gray-800/60">
                     <td className={`p-2 border border-gray-300 dark:border-gray-600 ${indentClasses[indentLevel]}`}>
                        <span className="inline-block w-5"></span> {label}
                    </td>
                    <td colSpan={14} className="p-2 border border-gray-300 dark:border-gray-600 text-center italic text-gray-500">No activities for this component.</td>
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
             <tr onClick={() => toggleRow(rowKey)} className="font-semibold bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer">
                <td className={`p-2 border border-gray-300 dark:border-gray-600 ${indentClasses[indentLevel]}`}>
                    <span className="inline-block w-5 text-center text-gray-500 dark:text-gray-400">{isExpanded ? '−' : '+'}</span> {label}
                </td>
                <td className="p-2 border border-gray-300 dark:border-gray-600 text-center">{totals.totalPhysicalTarget}</td>
                <td className="p-2 border border-gray-300 dark:border-gray-600 text-right">{formatCurrency(totals.mooeCost)}</td>
                <td className="p-2 border border-gray-300 dark:border-gray-600 text-right">{formatCurrency(totals.coCost)}</td>
                <td className="p-2 border border-gray-300 dark:border-gray-600 text-right">{formatCurrency(totals.totalCost)}</td>
                {[totals.q1Physical, totals.q2Physical, totals.q3Physical, totals.q4Physical].map((q, i) => <td key={i} className="p-2 border border-gray-300 dark:border-gray-600 text-center">{q || ''}</td>)}
                <td className="p-2 border border-gray-300 dark:border-gray-600 text-center">{totalQuarterlyPhysical || ''}</td>
                {[totals.q1Financial, totals.q2Financial, totals.q3Financial, totals.q4Financial].map((q, i) => <td key={i} className="p-2 border border-gray-300 dark:border-gray-600 text-right">{q ? formatCurrency(q) : ''}</td>)}
                <td className="p-2 border border-gray-300 dark:border-gray-600 text-right">{totalQuarterlyFinancial ? formatCurrency(totalQuarterlyFinancial) : ''}</td>
            </tr>
        );
    };
    
    const renderDataRow = (item: any, key: string, indentLevel = 0) => {
        const totalQuarterlyPhysical = item.q1Physical + item.q2Physical + item.q3Physical + item.q4Physical;
        const totalQuarterlyFinancial = item.q1Financial + item.q2Financial + item.q3Financial + item.q4Financial;
        return (
            <tr key={key}>
                <td className={`p-2 border border-gray-300 dark:border-gray-600 ${indentClasses[indentLevel]}`}>{item.indicator}</td>
                <td className="p-2 border border-gray-300 dark:border-gray-600 text-center">{item.totalPhysicalTarget}</td>
                <td className="p-2 border border-gray-300 dark:border-gray-600 text-right">{formatCurrency(item.mooeCost)}</td>
                <td className="p-2 border border-gray-300 dark:border-gray-600 text-right">{formatCurrency(item.coCost)}</td>
                <td className="p-2 border border-gray-300 dark:border-gray-600 text-right">{formatCurrency(item.totalCost)}</td>
                {[item.q1Physical, item.q2Physical, item.q3Physical, item.q4Physical].map((q, i) => <td key={i} className="p-2 border border-gray-300 dark:border-gray-600 text-center">{q || ''}</td>)}
                <td className="p-2 border border-gray-300 dark:border-gray-600 text-center">{totalQuarterlyPhysical || ''}</td>
                {[item.q1Financial, item.q2Financial, item.q3Financial, item.q4Financial].map((q, i) => <td key={i} className="p-2 border border-gray-300 dark:border-gray-600 text-right">{q ? formatCurrency(q) : ''}</td>)}
                <td className="p-2 border border-gray-300 dark:border-gray-600 text-right">{totalQuarterlyFinancial ? formatCurrency(totalQuarterlyFinancial) : ''}</td>
            </tr>
        )
    };

    const grandTotals = useMemo(() => Object.values(data).flatMap(component => {
        if (Array.isArray(component)) return component;
        if (component.isExpandable) return component.items;
        if (component.isNestedExpandable) return Object.values(component.packages).flatMap((pkg: any) => pkg.items);
        return [];
    }), [data]);

    return (
        <div id="wfp-report" className="overflow-x-auto">
            <table className="min-w-full border-collapse text-xs">
                <thead className="bg-gray-200 dark:bg-gray-700">
                    <tr>
                        <th rowSpan={2} className="p-2 border border-gray-300 dark:border-gray-600 align-bottom">Indicator</th>
                        <th colSpan={4} className="p-2 border border-gray-300 dark:border-gray-600 text-center">Total Target</th>
                        <th colSpan={5} className="p-2 border border-gray-300 dark:border-gray-600 text-center">Quarterly Physical Target</th>
                        <th colSpan={5} className="p-2 border border-gray-300 dark:border-gray-600 text-center">Quarterly Financial Target (PHP)</th>
                    </tr>
                    <tr>
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center">Physical</th>
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center">MOOE (PHP)</th>
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center">CO (PHP)</th>
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center">Total (PHP)</th>
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center">Q1</th>
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center">Q2</th>
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center">Q3</th>
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center">Q4</th>
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center">Total</th>
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center">Q1</th>
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center">Q2</th>
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center">Q3</th>
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center">Q4</th>
                        <th className="p-2 border border-gray-300 dark:border-gray-600 text-center">Total</th>
                    </tr>
                </thead>
                <tbody>
                    {Object.entries(data).map(([key, componentData]) => {
                        // Case 1: Flat list of items, now collapsible
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
                        // Case 2: Expandable group (Trainings)
                        if (componentData.isExpandable) {
                             const isComponentExpanded = expandedRows.has(key);
                             return (
                                <React.Fragment key={key}>
                                    {renderSummaryRow(componentData.items, key, key, isComponentExpanded, 0)}
                                    {isComponentExpanded && componentData.items.map((item: any, index: number) => renderDataRow(item, `${key}-${index}`, 1))}
                                </React.Fragment>
                            );
                        }
                        // Case 3: Nested expandable group (Subprojects)
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

const Reports: React.FC<ReportsProps> = ({ ipos, subprojects, trainings, otherActivities }) => {
    const [activeTab, setActiveTab] = useState<ReportTab>('WFP');
    const [selectedYear, setSelectedYear] = useState<string>('All');
    const [selectedRegion, setSelectedRegion] = useState<string>('All');
    const [selectedTier, setSelectedTier] = useState<string>('All');
    const [selectedFundType, setSelectedFundType] = useState<string>('All');

    const availableYears = useMemo(() => {
        const years = new Set<string>();
        subprojects.forEach(p => p.fundingYear && years.add(p.fundingYear.toString()));
        trainings.forEach(t => t.fundingYear && years.add(t.fundingYear.toString()));
        otherActivities.forEach(a => years.add(new Date(a.date).getFullYear().toString()));
        return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
    }, [subprojects, trainings, otherActivities]);

    const filteredData = useMemo(() => {
        let filtered = {
            subprojects: subprojects,
            ipos: ipos,
            trainings: trainings,
            otherActivities: otherActivities,
        };

        if (selectedYear !== 'All') {
            filtered = {
                ...filtered,
                subprojects: filtered.subprojects.filter(p => p.fundingYear?.toString() === selectedYear),
                trainings: filtered.trainings.filter(t => t.fundingYear?.toString() === selectedYear),
                otherActivities: filtered.otherActivities.filter(a => new Date(a.date).getFullYear().toString() === selectedYear),
            };
        }

        if (selectedTier !== 'All') {
            filtered = {
                ...filtered,
                subprojects: filtered.subprojects.filter(p => p.tier === selectedTier),
                trainings: filtered.trainings.filter(t => t.tier === selectedTier),
            };
        }

        if (selectedFundType !== 'All') {
            filtered = {
                ...filtered,
                subprojects: filtered.subprojects.filter(p => p.fundType === selectedFundType),
                trainings: filtered.trainings.filter(t => t.fundType === selectedFundType),
            };
        }

        if (selectedRegion === 'All') {
            return filtered;
        }

        const iposInRegionSet = new Set(ipos.filter(i => i.region === selectedRegion).map(i => i.name));
        return {
            subprojects: filtered.subprojects.filter(p => iposInRegionSet.has(p.indigenousPeopleOrganization)),
            ipos: filtered.ipos.filter(i => i.region === selectedRegion),
            trainings: filtered.trainings.filter(t => t.participatingIpos.some(ipoName => iposInRegionSet.has(ipoName))),
            otherActivities: filtered.otherActivities.filter(a => a.participatingIpos.some(ipoName => iposInRegionSet.has(ipoName))),
        };
    }, [selectedYear, selectedRegion, selectedTier, selectedFundType, subprojects, ipos, trainings, otherActivities]);

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
            'Program Management': []
        };
        
        filteredData.subprojects.forEach(sp => {
            const mooeCost = sp.details.filter(d => d.objectCode === 'MOOE' || d.objectCode === 'PS').reduce((sum, d) => sum + d.pricePerUnit * d.numberOfUnits, 0);
            const coCost = sp.details.filter(d => d.objectCode === 'CO').reduce((sum, d) => sum + d.pricePerUnit * d.numberOfUnits, 0);
            const totalCost = mooeCost + coCost;
            const physicalTargetQuarter = getQuarter(sp.startDate);

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
            const mooeCost = t.expenses.filter(e => e.objectCode === 'MOOE' || e.objectCode === 'PS').reduce((sum, e) => sum + e.amount, 0);
            const coCost = t.expenses.filter(e => e.objectCode === 'CO').reduce((sum, e) => sum + e.amount, 0);
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
            } else if (finalData[t.component]) {
                finalData[t.component].push(item);
            }
        });

        const packageKeys = Object.keys(finalData['Production and Livelihood'].packages);
        packageKeys.sort((a, b) => {
            if (a === 'Trainings') return -1;
            if (b === 'Trainings') return 1;
            return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        });

        const sortedPackageData: { [key: string]: any } = {};
        for (const key of packageKeys) {
            sortedPackageData[key] = finalData['Production and Livelihood'].packages[key];
        }
        finalData['Production and Livelihood'].packages = sortedPackageData;

        filteredData.otherActivities.forEach(oa => {
            const mooeCost = oa.expenses.filter(e => e.objectCode === 'MOOE' || e.objectCode === 'PS').reduce((sum, e) => sum + e.amount, 0);
            const coCost = oa.expenses.filter(e => e.objectCode === 'CO').reduce((sum, e) => sum + e.amount, 0);
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
             if (finalData[oa.component]) {
                finalData[oa.component].push(item);
            }
        });

        return finalData;
    }, [filteredData]);

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
            } else if (items.isExpandable) {
                if(items.items.length > 0) processItems(items.items);
            } else if (items.isNestedExpandable) {
                Object.entries(items.packages).forEach(([packageName, packageData] : [string, any]) => {
                    aoa.push([`  ${packageName}`, null, null, null, null, null, null, null, null, null, null, null, null, null, null]);
                    if(packageData.items.length > 0) processItems(packageData.items);
                });
            }
        });

        const grandTotals = Object.values(wfpData).flatMap(component => {
            if (Array.isArray(component)) return component;
            if (component.isExpandable) return component.items;
            if (component.isNestedExpandable) return Object.values(component.packages).flatMap((pkg: any) => pkg.items);
            return [];
        });

        addTotalsRow(grandTotals, "GRAND TOTAL");
        
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "WFP Report");
        XLSX.writeFile(wb, `WFP_Report_${selectedYear}_${selectedRegion}.xlsx`);
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
            case 'BP Forms': return <Placeholder title="Budget Proposal (BP) Forms" />;
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
                        <label htmlFor="region-filter" className="text-sm font-medium text-gray-600 dark:text-gray-300">Region:</label>
                        <select 
                            id="region-filter"
                            value={selectedRegion}
                            onChange={(e) => setSelectedRegion(e.target.value)}
                            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-10 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
                        >
                            <option value="All">All Regions</option>
                            <option value="Online">Online</option>
                            {philippineRegions.map(region => ( <option key={region} value={region}>{region}</option> ))}
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
