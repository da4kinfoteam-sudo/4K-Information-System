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
}> = ({ activity, mooeCodes, coCodes, indentLevel, dataCellClass, indentClasses }) => {
    return (
        <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
            <td className={`${dataCellClass} text-left ${indentClasses[indentLevel]} sticky left-0 bg-white dark:bg-gray-800 z-10 border-r-2 border-r-gray-300 dark:border-r-gray-600`}>{activity.name}</td>
            
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
                    objectType: d.objectType, uacsCode: d.uacsCode, amount: d.pricePerUnit * d.numberOfUnits
                });
            });
        });
        
        data.trainings.forEach(t => {
            if (t.component === 'Program Management') return; // Skip Program Management Trainings

            t.expenses.forEach(e => {
                ensureHeader(e.objectType, e.expenseParticular, e.uacsCode, e.amount);
                lineItems.push({
                    component: t.component, packageType: undefined, activityName: t.name,
                    objectType: e.objectType, uacsCode: e.uacsCode, amount: e.amount
                });
            });
        });
        
        data.otherActivities.forEach(oa => {
            oa.expenses.forEach(e => {
                ensureHeader(e.objectType, e.expenseParticular, e.uacsCode, e.amount);
                const packageType = oa.component === 'Program Management' ? 'Activities' : undefined;
                lineItems.push({
                    component: oa.component, packageType, activityName: oa.name,
                    objectType: e.objectType, uacsCode: e.uacsCode, amount: e.amount
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

        // Derive flat lists of codes for rendering columns, sorting them
        const mooeCodes: string[] = [];
        Object.keys(headers.MOOE).sort().forEach(part => {
            headers.MOOE[part].sort().forEach(c => { if (!mooeCodes.includes(c)) mooeCodes.push(c); });
        });
        const coCodes: string[] = [];
        Object.keys(headers.CO).sort().forEach(part => {
            headers.CO[part].sort().forEach(c => { if (!coCodes.includes(c)) coCodes.push(c); });
        });

        const initialUacsValues = [...mooeCodes, ...coCodes].reduce((acc, code) => ({ ...acc, [code]: 0 }), {});
        
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
            if (item.amount <= 0) return;

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
        const mooeParticulars = Object.keys(headers.MOOE).sort();
        const coParticulars = Object.keys(headers.CO).sort();

        // Row 1: Object Types
        // PAP (A), MOOE (B..X), Total MOOE (Y), CO (Z..AA), Total CO (AB), Grand Total (AC)
        
        // Calculate dynamic spans
        const mooeSpan = mooeCodes.length;
        const coSpan = coCodes.length;
        
        const row1: (string | null)[] = ["Program/Activity/Project"];
        const row2: (string | null)[] = [null]; // Placeholder for PAP
        const row3: (string | null)[] = [null]; // Placeholder for PAP

        // MOOE Section
        if (mooeSpan > 0) {
            row1.push("MOOE");
            for(let i=1; i<mooeSpan; i++) row1.push(null);
        }
        // Total MOOE Column in Row 1 (actually it sits beside MOOE cols)
        row1.push("Total MOOE");

        // CO Section
        if (coSpan > 0) {
            row1.push("CO");
            for(let i=1; i<coSpan; i++) row1.push(null);
        }
        // Total CO Column
        row1.push("Total CO");
        row1.push("Grand Total");

        // Populate Rows 2 and 3
        
        // MOOE
        mooeParticulars.forEach(part => {
            const codes = headers.MOOE[part].sort();
            if(codes.length > 0) {
                row2.push(part);
                // Push nulls for span
                for(let i=1; i<codes.length; i++) row2.push(null);
                
                codes.forEach(code => {
                    row3.push(`${code} - ${getDescription('MOOE', part, code)}`);
                });
            }
        });
        row2.push(null); // Under Total MOOE
        row3.push(null); // Under Total MOOE

        // CO
        coParticulars.forEach(part => {
            const codes = headers.CO[part].sort();
            if(codes.length > 0) {
                row2.push(part);
                for(let i=1; i<codes.length; i++) row2.push(null);
                
                codes.forEach(code => {
                    row3.push(`${code} - ${getDescription('CO', part, code)}`);
                });
            }
        });
        row2.push(null); // Under Total CO
        row3.push(null); // Under Total CO
        
        row2.push(null); // Under Grand Total
        row3.push(null); // Under Grand Total

        // Flatten Data
        const flatDataRows: any[][] = [];
        const allCodesOrdered = [
            ...mooeParticulars.flatMap(p => headers.MOOE[p].sort()),
            ...coParticulars.flatMap(p => headers.CO[p].sort())
        ];

        const processRows = (items: any[], prefix: string) => {
            items.forEach((activity: any) => {
                const row: (string | number | null)[] = [`${prefix}${activity.name}`];
                
                // Add values according to ordered codes (rounded up)
                allCodesOrdered.forEach(code => {
                    row.push(Math.ceil(activity.uacsValues[code] || 0));
                });
                
                row.push(Math.ceil(activity.totalMOOE));
                row.push(Math.ceil(activity.totalCO));
                row.push(Math.ceil(activity.totalMOOE + activity.totalCO));
                flatDataRows.push(row);
            });
        };

        Object.entries(rows).forEach(([componentName, componentData]) => {
            if (Array.isArray(componentData) && componentData.length > 0) {
                flatDataRows.push([componentName, ...Array(allCodesOrdered.length + 3).fill(null)]);
                processRows(componentData, "  ");
            } else if ((componentData as any).isNestedExpandable) {
                let hasData = false;
                // Check if any package has items
                Object.values((componentData as any).packages).forEach((pkg: any) => {
                    if (pkg.items.length > 0) hasData = true;
                });

                if(hasData) {
                    flatDataRows.push([componentName, ...Array(allCodesOrdered.length + 3).fill(null)]);
                    Object.entries((componentData as any).packages).forEach(([pkgName, pkgData]: [string, any]) => {
                        if (pkgData.items.length > 0) {
                            flatDataRows.push([`  ${pkgName}`, ...Array(allCodesOrdered.length + 3).fill(null)]);
                            processRows(pkgData.items, "    ");
                        }
                    });
                }
            }
        });

        // Add Grand Total Row
        const totalRow: (string | number | null)[] = ["GRAND TOTAL"];
        allCodesOrdered.forEach(code => totalRow.push(Math.ceil(grandTotals.uacsValues[code] || 0)));
        totalRow.push(Math.ceil(grandTotals.totalMOOE), Math.ceil(grandTotals.totalCO), Math.ceil(grandTotals.totalMOOE + grandTotals.totalCO));
        flatDataRows.push(totalRow);

        // Combine all
        const aoa = [row1, row2, row3, ...flatDataRows];
        const ws: any = XLSX.utils.aoa_to_sheet(aoa);

        // Setup Merges
        if(!ws['!merges']) ws['!merges'] = [];
        
        let colIdx = 1; // Start after PAP
        // Row 1 merges (Object Types)
        if(mooeSpan > 0) {
            ws['!merges'].push({ s: { r: 0, c: colIdx }, e: { r: 0, c: colIdx + mooeSpan - 1 } });
            colIdx += mooeSpan;
        }
        colIdx++; // Total MOOE (No merge needed if just 1 cell, but rows 1-3 should likely merge vertically?)
        // Let's merge vertical titles: Total MOOE, Total CO, Grand Total
        ws['!merges'].push({ s: { r: 0, c: colIdx - 1 }, e: { r: 2, c: colIdx - 1 } }); // Total MOOE

        if(coSpan > 0) {
            ws['!merges'].push({ s: { r: 0, c: colIdx }, e: { r: 0, c: colIdx + coSpan - 1 } });
            colIdx += coSpan;
        }
        colIdx++; // Total CO
        ws['!merges'].push({ s: { r: 0, c: colIdx - 1 }, e: { r: 2, c: colIdx - 1 } }); // Total CO
        
        ws['!merges'].push({ s: { r: 0, c: colIdx }, e: { r: 2, c: colIdx } }); // Grand Total (Last col)

        // PAP Vertical Merge
        ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 2, c: 0 } });

        // Row 2 merges (Particulars)
        colIdx = 1;
        mooeParticulars.forEach(part => {
            const count = headers.MOOE[part].length;
            if (count > 1) {
                ws['!merges'].push({ s: { r: 1, c: colIdx }, e: { r: 1, c: colIdx + count - 1 } });
            }
            colIdx += count;
        });
        colIdx++; // Skip Total MOOE
        coParticulars.forEach(part => {
            const count = headers.CO[part].length;
            if (count > 1) {
                ws['!merges'].push({ s: { r: 1, c: colIdx }, e: { r: 1, c: colIdx + count - 1 } });
            }
            colIdx += count;
        });

        // Formatting Currency
        // Get range
        const range = XLSX.utils.decode_range(ws['!ref']);
        for(let R = 3; R <= range.e.r; ++R) {
            for(let C = 1; C <= range.e.c; ++C) {
                const cell_address = { c: C, r: R };
                const cell_ref = XLSX.utils.encode_cell(cell_address);
                if(ws[cell_ref] && typeof ws[cell_ref].v === 'number') {
                    ws[cell_ref].t = 'n';
                    // Whole number currency
                    ws[cell_ref].z = '#,##0';
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

    const indentClasses = ['pl-2', 'pl-6', 'pl-10'];
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
                    <button onClick={handleDownloadBpFormsXlsx} className="px-4 py-2 bg-accent text-white rounded-md font-semibold hover:brightness-95">Download XLSX</button>
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
                            {/* MOOE Particulars */}
                            {mooeParticulars.map(p => <th key={`p-mooe-${p}`} colSpan={headers.MOOE[p].length} className={`${headerCellClass}`}>{p}</th>)}
                            
                            {/* CO Particulars */}
                            {coParticulars.map(p => <th key={`p-co-${p}`} colSpan={headers.CO[p].length} className={`${headerCellClass}`}>{p}</th>)}
                        </tr>
                        <tr className="bg-gray-5 dark:bg-gray-700/60">
                            {/* MOOE Descriptions */}
                            {mooeParticulars.flatMap(p => headers.MOOE[p].sort().map(code => ({ code, p }))).map(({ code, p }) => (
                                <th key={`desc-mooe-${code}`} className={`${headerCellClass} text-[10px] italic font-normal max-w-[150px] whitespace-normal`}>
                                    {getDescription('MOOE', p, code)}
                                </th>
                            ))}
                            {/* CO Descriptions */}
                            {coParticulars.flatMap(p => headers.CO[p].sort().map(code => ({ code, p }))).map(({ code, p }) => (
                                <th key={`desc-co-${code}`} className={`${headerCellClass} text-[10px] italic font-normal max-w-[150px] whitespace-normal`}>
                                    {getDescription('CO', p, code)}
                                </th>
                            ))}
                        </tr>
                        <tr className="bg-gray-5 dark:bg-gray-700/50">
                            {/* MOOE Codes */}
                            {mooeParticulars.flatMap(p => headers.MOOE[p].sort()).map(code => <th key={code} className={`${headerCellClass} font-mono whitespace-nowrap`}>{code}</th>)}
                            {/* CO Codes */}
                            {coParticulars.flatMap(p => headers.CO[p].sort()).map(code => <th key={code} className={`${headerCellClass} font-mono whitespace-nowrap`}>{code}</th>)}
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