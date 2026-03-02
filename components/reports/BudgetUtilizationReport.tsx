// Author: 4K 
import React, { useMemo, useState } from 'react';
import { Subproject, Training, OtherActivity, OfficeRequirement, StaffingRequirement, OtherProgramExpense } from '../../constants';
import { getObjectTypeByCode, XLSX } from './ReportUtils';

interface BudgetUtilizationReportProps {
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

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const QUARTERS = [
    { name: '1st Quarter', months: [0, 1, 2] },
    { name: '2nd Quarter', months: [3, 4, 5] },
    { name: '3rd Quarter', months: [6, 7, 8] },
    { name: '4th Quarter', months: [9, 10, 11] }
];

const formatCurrencyWhole = (amount: number) => {
    if (!amount) return '';
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.ceil(amount));
};

const formatPercent = (value: number, total: number) => {
    if (!total || total === 0) return '0%';
    return `${Math.round((value / total) * 100)}%`;
};

const createMetrics = () => ({ mooe: 0, co: 0, total: 0 });
const createMonthData = () => ({ obligation: createMetrics(), disbursement: createMetrics() });
const createActivityData = (name: string) => ({
    name,
    allotment: createMetrics(),
    months: Array.from({ length: 12 }, createMonthData)
});

const addMetrics = (a: any, b: any) => {
    a.mooe += b.mooe;
    a.co += b.co;
    a.total += b.total;
};

const addMonthData = (a: any, b: any) => {
    addMetrics(a.obligation, b.obligation);
    addMetrics(a.disbursement, b.disbursement);
};

const addActivityData = (a: any, b: any) => {
    addMetrics(a.allotment, b.allotment);
    for (let i = 0; i < 12; i++) {
        addMonthData(a.months[i], b.months[i]);
    }
};

const getMonthIndex = (dateString: string) => {
    if (!dateString) return -1;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return -1;
    return date.getMonth();
};

const MetricsColumns: React.FC<{ metrics: any, allotmentTotal: number, obligationTotal?: number, showPercent?: boolean, isUnpaid?: boolean }> = ({ metrics, allotmentTotal, obligationTotal, showPercent = true, isUnpaid = false }) => {
    const cellClass = "p-1 border border-gray-300 dark:border-gray-600 text-right whitespace-nowrap";
    return (
        <>
            <td className={cellClass}>{formatCurrencyWhole(metrics.mooe)}</td>
            <td className={cellClass}>{formatCurrencyWhole(metrics.co)}</td>
            <td className={`${cellClass} font-bold`}>{formatCurrencyWhole(metrics.total)}</td>
            {showPercent && !isUnpaid && (
                <>
                    {obligationTotal !== undefined && (
                        <td className={`${cellClass} text-blue-600 dark:text-blue-400`}>{formatPercent(metrics.total, obligationTotal)}</td>
                    )}
                    <td className={`${cellClass} text-green-600 dark:text-green-400`}>{formatPercent(metrics.total, allotmentTotal)}</td>
                </>
            )}
            {showPercent && isUnpaid && (
                <td className={`${cellClass} text-red-600 dark:text-red-400`}>{formatPercent(metrics.total, obligationTotal || 0)}</td>
            )}
        </>
    );
};

const MonthColumns: React.FC<{ monthData: any, allotmentTotal: number }> = ({ monthData, allotmentTotal }) => {
    return (
        <>
            <MetricsColumns metrics={monthData.obligation} allotmentTotal={allotmentTotal} />
            <MetricsColumns metrics={monthData.disbursement} allotmentTotal={allotmentTotal} obligationTotal={monthData.obligation.total} />
        </>
    );
};

const ActivityRow: React.FC<{
    activity: any;
    indentLevel: number;
    dataCellClass: string;
    indentClasses: string[];
}> = ({ activity, indentLevel, dataCellClass, indentClasses }) => {
    
    const quarters = QUARTERS.map(q => {
        const qData = createMonthData();
        q.months.forEach(m => addMonthData(qData, activity.months[m]));
        return qData;
    });

    const grandTotal = createMonthData();
    quarters.forEach(q => addMonthData(grandTotal, q));

    const unpaidObligation = createMetrics();
    unpaidObligation.mooe = grandTotal.obligation.mooe - grandTotal.disbursement.mooe;
    unpaidObligation.co = grandTotal.obligation.co - grandTotal.disbursement.co;
    unpaidObligation.total = grandTotal.obligation.total - grandTotal.disbursement.total;

    return (
        <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
            <td className={`${dataCellClass} text-left ${indentClasses[indentLevel]} sticky left-0 bg-white dark:bg-gray-800 z-10 border-r-2 border-r-gray-300 dark:border-r-gray-600`}>{activity.name}</td>
            
            {/* Allotment */}
            <td className={`${dataCellClass} text-right whitespace-nowrap`}>{formatCurrencyWhole(activity.allotment.mooe)}</td>
            <td className={`${dataCellClass} text-right whitespace-nowrap`}>{formatCurrencyWhole(activity.allotment.co)}</td>
            <td className={`${dataCellClass} font-bold text-right whitespace-nowrap bg-gray-100 dark:bg-gray-700`}>{formatCurrencyWhole(activity.allotment.total)}</td>
            
            {/* Adjustment (Placeholder) */}
            <td className={`${dataCellClass} text-right whitespace-nowrap`}></td>
            <td className={`${dataCellClass} text-right whitespace-nowrap`}></td>
            <td className={`${dataCellClass} font-bold text-right whitespace-nowrap bg-gray-100 dark:bg-gray-700`}></td>

            {/* Adjusted Allotment (Placeholder) */}
            <td className={`${dataCellClass} text-right whitespace-nowrap`}></td>
            <td className={`${dataCellClass} text-right whitespace-nowrap`}></td>
            <td className={`${dataCellClass} font-bold text-right whitespace-nowrap bg-gray-100 dark:bg-gray-700`}></td>

            {/* Months and Quarters */}
            {QUARTERS.map((q, qIdx) => (
                <React.Fragment key={q.name}>
                    {q.months.map(mIdx => (
                        <MonthColumns key={mIdx} monthData={activity.months[mIdx]} allotmentTotal={activity.allotment.total} />
                    ))}
                    {/* Quarter Total */}
                    <td className="border-l-4 border-gray-400 dark:border-gray-500 p-0"></td>
                    <MonthColumns monthData={quarters[qIdx]} allotmentTotal={activity.allotment.total} />
                    <td className="border-r-4 border-gray-400 dark:border-gray-500 p-0"></td>
                </React.Fragment>
            ))}

            {/* Grand Total */}
            <td className="border-l-4 border-gray-800 dark:border-gray-200 p-0"></td>
            <MonthColumns monthData={grandTotal} allotmentTotal={activity.allotment.total} />
            <td className="border-r-4 border-gray-800 dark:border-gray-200 p-0"></td>

            {/* Unpaid Obligation */}
            <MetricsColumns metrics={unpaidObligation} allotmentTotal={activity.allotment.total} obligationTotal={grandTotal.obligation.total} isUnpaid={true} />
        </tr>
    );
};

const SummaryRow: React.FC<{
    items: any[];
    label: string;
    rowKey: string;
    isExpanded: boolean;
    indentLevel: number;
    toggleRow: (key: string) => void;
    dataCellClass: string;
    indentClasses: string[];
}> = ({ items, label, rowKey, isExpanded, indentLevel, toggleRow, dataCellClass, indentClasses }) => {
    
    if (!items || items.length === 0) {
        return (
             <tr className="font-bold bg-gray-100 dark:bg-gray-700/50">
                <td className={`${dataCellClass} text-left ${indentClasses[indentLevel]} sticky left-0 bg-gray-100 dark:bg-gray-700 z-10 border-r-2 border-r-gray-300 dark:border-r-gray-600`}>
                     <span className="inline-block w-5 text-center"></span> {label}
                </td>
                <td colSpan={166} className={`${dataCellClass} text-center italic text-gray-500 dark:text-gray-400`}>No activities for this item.</td>
            </tr>
        );
    }

    const summary = createActivityData(label);
    items.forEach(item => addActivityData(summary, item));

    const quarters = QUARTERS.map(q => {
        const qData = createMonthData();
        q.months.forEach(m => addMonthData(qData, summary.months[m]));
        return qData;
    });

    const grandTotal = createMonthData();
    quarters.forEach(q => addMonthData(grandTotal, q));

    const unpaidObligation = createMetrics();
    unpaidObligation.mooe = grandTotal.obligation.mooe - grandTotal.disbursement.mooe;
    unpaidObligation.co = grandTotal.obligation.co - grandTotal.disbursement.co;
    unpaidObligation.total = grandTotal.obligation.total - grandTotal.disbursement.total;

    return (
        <tr onClick={() => toggleRow(rowKey)} className="font-bold bg-gray-100 dark:bg-gray-700/50 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700">
            <td className={`${dataCellClass} text-left ${indentClasses[indentLevel]} sticky left-0 bg-gray-100 dark:bg-gray-700 z-10 border-r-2 border-r-gray-300 dark:border-r-gray-600`}>
                <span className="inline-block w-5 text-center text-gray-500 dark:text-gray-400">{isExpanded ? '−' : '+'}</span> {label}
            </td>
            
            {/* Allotment */}
            <td className={`${dataCellClass} text-right whitespace-nowrap`}>{formatCurrencyWhole(summary.allotment.mooe)}</td>
            <td className={`${dataCellClass} text-right whitespace-nowrap`}>{formatCurrencyWhole(summary.allotment.co)}</td>
            <td className={`${dataCellClass} font-bold text-right whitespace-nowrap bg-gray-200 dark:bg-gray-600`}>{formatCurrencyWhole(summary.allotment.total)}</td>
            
            {/* Adjustment (Placeholder) */}
            <td className={`${dataCellClass} text-right whitespace-nowrap`}></td>
            <td className={`${dataCellClass} text-right whitespace-nowrap`}></td>
            <td className={`${dataCellClass} font-bold text-right whitespace-nowrap bg-gray-200 dark:bg-gray-600`}></td>

            {/* Adjusted Allotment (Placeholder) */}
            <td className={`${dataCellClass} text-right whitespace-nowrap`}></td>
            <td className={`${dataCellClass} text-right whitespace-nowrap`}></td>
            <td className={`${dataCellClass} font-bold text-right whitespace-nowrap bg-gray-200 dark:bg-gray-600`}></td>

            {/* Months and Quarters */}
            {QUARTERS.map((q, qIdx) => (
                <React.Fragment key={q.name}>
                    {q.months.map(mIdx => (
                        <MonthColumns key={mIdx} monthData={summary.months[mIdx]} allotmentTotal={summary.allotment.total} />
                    ))}
                    {/* Quarter Total */}
                    <td className="border-l-4 border-gray-400 dark:border-gray-500 p-0"></td>
                    <MonthColumns monthData={quarters[qIdx]} allotmentTotal={summary.allotment.total} />
                    <td className="border-r-4 border-gray-400 dark:border-gray-500 p-0"></td>
                </React.Fragment>
            ))}

            {/* Grand Total */}
            <td className="border-l-4 border-gray-800 dark:border-gray-200 p-0"></td>
            <MonthColumns monthData={grandTotal} allotmentTotal={summary.allotment.total} />
            <td className="border-r-4 border-gray-800 dark:border-gray-200 p-0"></td>

            {/* Unpaid Obligation */}
            <MetricsColumns metrics={unpaidObligation} allotmentTotal={summary.allotment.total} obligationTotal={grandTotal.obligation.total} isUnpaid={true} />
        </tr>
    );
};

const BudgetUtilizationReport: React.FC<BudgetUtilizationReportProps> = ({ data, uacsCodes, selectedYear, selectedOu }) => {
    const [expandedRows, setExpandedRows] = useState(new Set<string>());

    const processedData = useMemo(() => {
        const lineItems: any[] = [];
        
        const processItem = (component: string, packageType: string | undefined, activityName: string, objectType: string, uacsCode: string, allotment: number, obligationDate: string, obligationAmount: number, disbursements: any) => {
            const objType = objectType === 'CO' ? 'CO' : 'MOOE';
            const obliMonth = getMonthIndex(obligationDate);
            
            lineItems.push({
                component, packageType, activityName, objectType: objType, uacsCode,
                allotment, obligationMonth: obliMonth, obligationAmount, disbursements
            });
        };

        data.subprojects.forEach(sp => {
            sp.details.forEach(d => {
                const disbursements: any = {};
                SHORT_MONTHS.forEach(m => disbursements[m] = (d as any)[`actualDisbursement${m}`] || 0);
                processItem('Production and Livelihood', sp.packageType, sp.name, d.objectType, d.uacsCode, d.pricePerUnit * d.numberOfUnits, d.actualObligationDate || '', d.actualObligationAmount || 0, disbursements);
            });
        });
        
        data.trainings.forEach(t => {
            if (t.component === 'Program Management') return;
            t.expenses.forEach(e => {
                const disbursements: any = {};
                SHORT_MONTHS.forEach(m => disbursements[m] = (e as any)[`actualDisbursement${m}`] || 0);
                processItem(t.component, undefined, t.name, e.objectType || 'MOOE', e.uacsCode, e.amount, e.actualObligationDate || '', e.actualObligationAmount || 0, disbursements);
            });
        });
        
        data.otherActivities.forEach(oa => {
            oa.expenses.forEach(e => {
                const disbursements: any = {};
                SHORT_MONTHS.forEach(m => disbursements[m] = (e as any)[`actualDisbursement${m}`] || 0);
                const packageType = oa.component === 'Program Management' ? 'Activities' : undefined;
                processItem(oa.component, packageType, oa.name, e.objectType || 'MOOE', e.uacsCode, e.amount, e.actualObligationDate || '', e.actualObligationAmount || 0, disbursements);
            });
        });
        
        data.staffingReqs.forEach(sr => {
            if (sr.expenses && sr.expenses.length > 0) {
                sr.expenses.forEach(e => {
                    const objType = getObjectTypeByCode(e.uacsCode, uacsCodes);
                    const disbursements: any = {};
                    SHORT_MONTHS.forEach(m => disbursements[m] = (e as any)[`actualDisbursement${m}`] || 0);
                    processItem('Program Management', 'Staff Requirements', sr.personnelPosition, objType, e.uacsCode, e.amount, e.actualObligationDate || '', e.actualObligationAmount || 0, disbursements);
                });
            } else {
                const objType = getObjectTypeByCode(sr.uacsCode, uacsCodes);
                const disbursements: any = {};
                SHORT_MONTHS.forEach(m => disbursements[m] = (sr as any)[`actualDisbursement${m}`] || 0);
                processItem('Program Management', 'Staff Requirements', sr.personnelPosition, objType, sr.uacsCode, sr.annualSalary, sr.actualObligationDate || '', sr.actualObligationAmount || 0, disbursements);
            }
        });
        
        data.officeReqs.forEach(or => {
            const objType = getObjectTypeByCode(or.uacsCode, uacsCodes);
            const disbursements: any = {};
            SHORT_MONTHS.forEach(m => disbursements[m] = (or as any)[`actualDisbursement${m}`] || 0);
            processItem('Program Management', 'Office Requirements', or.equipment, objType, or.uacsCode, or.pricePerUnit * or.numberOfUnits, or.actualObligationDate || '', or.actualObligationAmount || 0, disbursements);
        });
        
        data.otherProgramExpenses.forEach(ope => {
            const objType = getObjectTypeByCode(ope.uacsCode, uacsCodes);
            const disbursements: any = {};
            SHORT_MONTHS.forEach(m => disbursements[m] = (ope as any)[`actualDisbursement${m}`] || 0);
            processItem('Program Management', 'Office Requirements', ope.particulars, objType, ope.uacsCode, ope.amount, ope.actualObligationDate || '', ope.actualObligationAmount || 0, disbursements);
        });

        const groupedData: { [key: string]: any } = {
            'Social Preparation': [], 
            'Production and Livelihood': { isNestedExpandable: true, packages: {} },
            'Marketing and Enterprise': [], 
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
            if (item.allotment <= 0) return;

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
                activity = createActivityData(item.activityName);
                targetList.push(activity);
            }
            
            const isCO = item.objectType === 'CO';
            
            // Allotment
            if (isCO) activity.allotment.co += item.allotment;
            else activity.allotment.mooe += item.allotment;
            activity.allotment.total += item.allotment;

            // Obligation
            if (item.obligationMonth >= 0 && item.obligationMonth < 12) {
                const obli = activity.months[item.obligationMonth].obligation;
                if (isCO) obli.co += item.obligationAmount;
                else obli.mooe += item.obligationAmount;
                obli.total += item.obligationAmount;
            }

            // Disbursement
            SHORT_MONTHS.forEach((m, idx) => {
                const disbAmount = item.disbursements[m] || 0;
                if (disbAmount > 0) {
                    const disb = activity.months[idx].disbursement;
                    if (isCO) disb.co += disbAmount;
                    else disb.mooe += disbAmount;
                    disb.total += disbAmount;
                }
            });
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

        return { rows: groupedData };
    }, [data, uacsCodes]);

    const { rows } = processedData;

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

        const summary = createActivityData('GRAND TOTAL');
        allActivities.forEach(item => addActivityData(summary, item));
        return summary;
    }, [rows]);

    const handlePrint = () => window.print();

    const handleDownloadXlsx = () => {
        // TODO: Implement XLSX download for this complex table if needed
        alert("XLSX Download for Budget Utilization Report is not yet implemented.");
    };

    const indentClasses = ['pl-2', 'pl-6', 'pl-10'];
    const borderClass = "border border-gray-300 dark:border-gray-600";
    const headerCellClass = `p-1 ${borderClass} text-center align-middle font-bold`;
    const dataCellClass = `p-1 ${borderClass}`;

    const renderMetricsHeaders = (title: string, showPercent: boolean = true, isUnpaid: boolean = false) => (
        <>
            <th rowSpan={2} className={headerCellClass}>MOOE</th>
            <th rowSpan={2} className={headerCellClass}>CO</th>
            <th rowSpan={2} className={headerCellClass}>Total</th>
            {showPercent && !isUnpaid && (
                <>
                    {title === 'Disbursement' && <th rowSpan={2} className={headerCellClass}>% of Disb/Obli</th>}
                    <th rowSpan={2} className={headerCellClass}>{title === 'Obligation' ? '% of Obli/Allot' : '% of Disb/Allot'}</th>
                </>
            )}
            {showPercent && isUnpaid && (
                <th rowSpan={2} className={headerCellClass}>% of Unpaid/Obli</th>
            )}
        </>
    );

    const renderMonthHeaders = (title: string) => (
        <>
            <th colSpan={4} className={headerCellClass}>Obligation</th>
            <th colSpan={5} className={headerCellClass}>Disbursement</th>
        </>
    );

    return (
        <div id="bur-container" className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            <style>{`
                @media print {
                    @page { size: landscape; }
                    #bur-table {
                        overflow: visible !important;
                        display: block !important;
                    }
                    #bur-table table {
                        width: 100% !important;
                        table-layout: auto !important;
                    }
                    body, #root, #bur-container {
                        width: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: visible !important;
                    }
                }
            `}</style>
            <div className="flex justify-between items-center mb-4 print-hidden">
                <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Budget Utilization Report</h3>
                <div className="flex gap-2">
                    <button onClick={handlePrint} className="px-4 py-2 bg-gray-500 text-white rounded-md font-semibold hover:bg-gray-600">Print Report</button>
                    <button onClick={handleDownloadXlsx} className="px-4 py-2 bg-accent text-white rounded-md font-semibold hover:brightness-95">Download XLSX</button>
                </div>
            </div>
            <div id="bur-table" className="overflow-x-auto overflow-y-auto max-h-[75vh] relative custom-scrollbar">
                <table className="min-w-full border-collapse text-[10px] text-gray-900 dark:text-gray-200">
                    <thead className="sticky top-0 z-20 shadow-sm bg-gray-200 dark:bg-gray-800">
                        <tr>
                            <th rowSpan={3} className={`${headerCellClass} min-w-[250px] sticky left-0 bg-gray-200 dark:bg-gray-800 z-30 border-r-2 border-r-gray-400 dark:border-r-gray-500`}>Program/Activity/Project</th>
                            
                            <th colSpan={3} className={headerCellClass}>Allotment</th>
                            <th colSpan={3} className={headerCellClass}>Adjustment (+/-)</th>
                            <th colSpan={3} className={headerCellClass}>Adjusted Allotment</th>
                            
                            {QUARTERS.map(q => (
                                <React.Fragment key={q.name}>
                                    {q.months.map(mIdx => (
                                        <th key={mIdx} colSpan={9} className={headerCellClass}>{SHORT_MONTHS[mIdx]}</th>
                                    ))}
                                    <th className="border-l-4 border-gray-400 dark:border-gray-500 p-0"></th>
                                    <th colSpan={9} className={`${headerCellClass} bg-blue-100 dark:bg-blue-900/30`}>{q.name} Total</th>
                                    <th className="border-r-4 border-gray-400 dark:border-gray-500 p-0"></th>
                                </React.Fragment>
                            ))}
                            
                            <th className="border-l-4 border-gray-800 dark:border-gray-200 p-0"></th>
                            <th colSpan={9} className={`${headerCellClass} bg-green-100 dark:bg-green-900/30`}>Grand Total</th>
                            <th className="border-r-4 border-gray-800 dark:border-gray-200 p-0"></th>

                            <th colSpan={4} className={`${headerCellClass} bg-red-100 dark:bg-red-900/30`}>Unpaid Obligation</th>
                        </tr>
                        <tr>
                            <th rowSpan={2} className={headerCellClass}>MOOE</th>
                            <th rowSpan={2} className={headerCellClass}>CO</th>
                            <th rowSpan={2} className={headerCellClass}>Total</th>
                            
                            <th rowSpan={2} className={headerCellClass}>MOOE</th>
                            <th rowSpan={2} className={headerCellClass}>CO</th>
                            <th rowSpan={2} className={headerCellClass}>Total</th>
                            
                            <th rowSpan={2} className={headerCellClass}>MOOE</th>
                            <th rowSpan={2} className={headerCellClass}>CO</th>
                            <th rowSpan={2} className={headerCellClass}>Total</th>

                            {QUARTERS.map(q => (
                                <React.Fragment key={q.name}>
                                    {q.months.map(mIdx => (
                                        <React.Fragment key={mIdx}>{renderMonthHeaders('')}</React.Fragment>
                                    ))}
                                    <th className="border-l-4 border-gray-400 dark:border-gray-500 p-0"></th>
                                    {renderMonthHeaders('')}
                                    <th className="border-r-4 border-gray-400 dark:border-gray-500 p-0"></th>
                                </React.Fragment>
                            ))}

                            <th className="border-l-4 border-gray-800 dark:border-gray-200 p-0"></th>
                            {renderMonthHeaders('')}
                            <th className="border-r-4 border-gray-800 dark:border-gray-200 p-0"></th>

                            {renderMetricsHeaders('Unpaid Obligation', true, true)}
                        </tr>
                        <tr>
                            {QUARTERS.map(q => (
                                <React.Fragment key={q.name}>
                                    {q.months.map(mIdx => (
                                        <React.Fragment key={mIdx}>
                                            {renderMetricsHeaders('Obligation')}
                                            {renderMetricsHeaders('Disbursement')}
                                        </React.Fragment>
                                    ))}
                                    <th className="border-l-4 border-gray-400 dark:border-gray-500 p-0"></th>
                                    {renderMetricsHeaders('Obligation')}
                                    {renderMetricsHeaders('Disbursement')}
                                    <th className="border-r-4 border-gray-400 dark:border-gray-500 p-0"></th>
                                </React.Fragment>
                            ))}

                            <th className="border-l-4 border-gray-800 dark:border-gray-200 p-0"></th>
                            {renderMetricsHeaders('Obligation')}
                            {renderMetricsHeaders('Disbursement')}
                            <th className="border-r-4 border-gray-800 dark:border-gray-200 p-0"></th>
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
                                            toggleRow={toggleRow}
                                            dataCellClass={dataCellClass}
                                            indentClasses={indentClasses}
                                        />
                                        {isComponentExpanded && componentData.map((act, i) => (
                                            <ActivityRow 
                                                key={`${componentName}-${i}`}
                                                activity={act}
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
                                                        toggleRow={toggleRow}
                                                        dataCellClass={dataCellClass}
                                                        indentClasses={indentClasses}
                                                    />
                                                    {isPkgExpanded && pkgData.items.map((act: any, i: number) => (
                                                        <ActivityRow 
                                                            key={`${pkgName}-${i}`}
                                                            activity={act}
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
                        <SummaryRow 
                            items={[grandTotals]} 
                            label="GRAND TOTAL" 
                            rowKey="grand-total" 
                            isExpanded={false} 
                            indentLevel={0} 
                            toggleRow={() => {}} 
                            dataCellClass={`${dataCellClass} bg-gray-200 dark:bg-gray-700`} 
                            indentClasses={indentClasses} 
                        />
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

export default BudgetUtilizationReport;
