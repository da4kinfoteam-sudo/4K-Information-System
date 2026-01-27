
// Author: 4K 
import React, { useMemo } from 'react';
import { Subproject, Training, OtherActivity, IPO, OfficeRequirement, StaffingRequirement, OtherProgramExpense, operatingUnits } from '../../constants';
import { formatCurrency } from '../reports/ReportUtils';
import { parseLocation } from '../LocationPicker';

interface FinancialDashboardProps {
    data: {
        subprojects: Subproject[];
        trainings: Training[];
        otherActivities: OtherActivity[];
        ipos: IPO[];
        officeReqs: OfficeRequirement[];
        staffingReqs: StaffingRequirement[];
        otherProgramExpenses: OtherProgramExpense[];
    };
}

interface MonthlyDataPoint {
    target: number;
    obligation: number;
    disbursement: number;
}

const getComponentColor = (name: string) => {
    switch (name) {
        case 'Social Preparation': return '#60a5fa'; // Blue-400
        case 'Production and Livelihood': return '#4ade80'; // Green-400
        case 'Marketing and Enterprise': return '#facc15'; // Yellow-400
        case 'Program Management': return '#a78bfa'; // Violet-400
        default: return '#9ca3af'; // Gray-400
    }
};

const SimplePieChart: React.FC<{ data: { label: string; value: number; color: string }[]; size?: number }> = ({ data, size = 180 }) => {
    const total = data.reduce((acc, cur) => acc + cur.value, 0);
    let cumulativePercent = 0;

    if (total === 0) return <div className="text-gray-400 text-sm italic h-full flex items-center justify-center">No data available</div>;

    const getCoordinatesForPercent = (percent: number) => {
        const x = Math.cos(2 * Math.PI * percent);
        const y = Math.sin(2 * Math.PI * percent);
        return [x, y];
    };

    const slices = data.map(slice => {
        const percent = slice.value / total;
        const startPercent = cumulativePercent;
        const endPercent = cumulativePercent + percent;
        cumulativePercent += percent;

        const [startX, startY] = getCoordinatesForPercent(startPercent);
        const [endX, endY] = getCoordinatesForPercent(endPercent);
        const largeArcFlag = percent > 0.5 ? 1 : 0;

        const r = size / 2; 
        const cx = size / 2;
        const cy = size / 2;

        const pathData = [
            `M ${cx} ${cy}`,
            `L ${cx + (r) * startX} ${cy + (r) * startY}`,
            `A ${r} ${r} 0 ${largeArcFlag} 1 ${cx + (r) * endX} ${cy + (r) * endY}`,
            `Z`
        ].join(' ');

        return { path: pathData, ...slice, percent };
    });

    return (
        <div className="flex flex-col items-center w-full">
            <div className="relative" style={{ width: size, height: size }}>
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
                    {slices.map((slice, i) => (
                        <path key={i} d={slice.path} fill={slice.color} stroke="white" strokeWidth="2" />
                    ))}
                </svg>
            </div>
            <div className="mt-6 w-full space-y-2">
                {slices.map((slice, i) => (
                    <div key={i} className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: slice.color }}></span>
                            <span className="text-gray-600 dark:text-gray-300 font-medium truncate max-w-[120px]" title={slice.label}>{slice.label}</span>
                        </div>
                        <span className="font-bold text-gray-800 dark:text-gray-200">{(slice.percent * 100).toFixed(1)}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const FinancialDashboard: React.FC<FinancialDashboardProps> = ({ data }) => {

    const financialData = useMemo(() => {
        const components: { [key: string]: { target: number; obligation: number; disbursement: number } } = {
            'Social Preparation': { target: 0, obligation: 0, disbursement: 0 },
            'Production and Livelihood': { target: 0, obligation: 0, disbursement: 0 },
            'Marketing and Enterprise': { target: 0, obligation: 0, disbursement: 0 },
            'Program Management': { target: 0, obligation: 0, disbursement: 0 }
        };

        const provinceData: { [key: string]: number } = {};

        let totalAllocation = 0;
        let totalObligation = 0;
        let totalDisbursement = 0;

        const monthlyData: { [key: number]: MonthlyDataPoint } = {};
        for (let i = 0; i < 12; i++) {
            monthlyData[i] = { target: 0, obligation: 0, disbursement: 0 };
        }

        const getMonth = (dateStr?: string) => {
            if (!dateStr) return -1;
            return new Date(dateStr).getMonth();
        };

        const addToProvince = (loc: string, amount: number) => {
            const { province } = parseLocation(loc);
            const key = province || 'Unspecified';
            if (!provinceData[key]) provinceData[key] = 0;
            provinceData[key] += amount;
        };

        // 1. Process Subprojects
        data.subprojects.forEach(sp => {
            const spBudget = sp.details.reduce((sum, d) => {
                const amount = d.pricePerUnit * d.numberOfUnits;
                
                // Monthly Targets (based on delivery date as proxy for target obligation)
                const targetMonth = getMonth(d.obligationMonth);
                if (targetMonth !== -1) monthlyData[targetMonth].target += amount;

                // Monthly Actuals
                const obMonth = getMonth(d.actualObligationDate);
                if (obMonth !== -1) monthlyData[obMonth].obligation += (d.actualAmount || amount);

                const disbMonth = getMonth(d.actualDisbursementDate);
                if (disbMonth !== -1) monthlyData[disbMonth].disbursement += (d.actualAmount || amount);

                return sum + amount;
            }, 0);

            const spObligation = sp.details.reduce((sum, d) => sum + (d.actualObligationDate ? (d.actualAmount || (d.pricePerUnit * d.numberOfUnits)) : 0), 0);
            const spDisbursement = sp.details.reduce((sum, d) => sum + (d.actualDisbursementDate ? (d.actualAmount || (d.pricePerUnit * d.numberOfUnits)) : 0), 0);

            components['Production and Livelihood'].target += spBudget;
            components['Production and Livelihood'].obligation += spObligation;
            components['Production and Livelihood'].disbursement += spDisbursement;

            addToProvince(sp.location, spBudget);

            totalAllocation += spBudget;
            totalObligation += spObligation;
            totalDisbursement += spDisbursement;
        });

        // 2. Process Trainings & Activities
        const processActivity = (act: Training | OtherActivity) => {
            const actBudget = act.expenses.reduce((sum, e) => {
                const targetMonth = getMonth(e.obligationMonth);
                if (targetMonth !== -1) monthlyData[targetMonth].target += e.amount;

                const obMonth = getMonth(e.actualObligationDate);
                if (obMonth !== -1) monthlyData[obMonth].obligation += (e.actualAmount || e.amount);

                const disbMonth = getMonth(e.actualDisbursementDate);
                if (disbMonth !== -1) monthlyData[disbMonth].disbursement += (e.actualAmount || e.amount);

                return sum + e.amount;
            }, 0);

            const actObligation = act.expenses.reduce((sum, e) => sum + (e.actualObligationDate ? (e.actualAmount || e.amount) : 0), 0);
            const actDisbursement = act.expenses.reduce((sum, e) => sum + (e.actualDisbursementDate ? (e.actualAmount || e.amount) : 0), 0);

            totalAllocation += actBudget;
            totalObligation += actObligation;
            totalDisbursement += actDisbursement;

            const componentName = act.component || 'Program Management';
            if (components[componentName]) {
                components[componentName].target += actBudget;
                components[componentName].obligation += actObligation;
                components[componentName].disbursement += actDisbursement;
            } else {
                components['Program Management'].target += actBudget;
                components['Program Management'].obligation += actObligation;
                components['Program Management'].disbursement += actDisbursement;
            }

            addToProvince(act.location, actBudget);
        };

        data.trainings.forEach(processActivity);
        data.otherActivities.forEach(processActivity);

        // 3. Process Office Requirements
        data.officeReqs.forEach(or => {
            const targetAmount = or.pricePerUnit * or.numberOfUnits;
            const actualOb = or.actualObligationAmount || 0;
            const actualDisb = or.actualDisbursementAmount || 0;

            const targetMonth = getMonth(or.obligationDate);
            if(targetMonth !== -1) monthlyData[targetMonth].target += targetAmount;

            const obMonth = getMonth(or.actualObligationDate);
            if(obMonth !== -1) monthlyData[obMonth].obligation += actualOb;

            const disbMonth = getMonth(or.actualDisbursementDate);
            if(disbMonth !== -1) monthlyData[disbMonth].disbursement += actualDisb;

            totalAllocation += targetAmount;
            totalObligation += actualOb;
            totalDisbursement += actualDisb;

            components['Program Management'].target += targetAmount;
            components['Program Management'].obligation += actualOb;
            components['Program Management'].disbursement += actualDisb;
        });

        // 4. Process Staffing Requirements
        data.staffingReqs.forEach(sr => {
            const targetAmount = sr.annualSalary;
            const actualOb = sr.actualObligationAmount || 0;
            const actualDisb = sr.actualDisbursementAmount || 0;

            const targetMonth = getMonth(sr.obligationDate);
            if(targetMonth !== -1) monthlyData[targetMonth].target += targetAmount;

            const obMonth = getMonth(sr.actualObligationDate);
            if(obMonth !== -1) monthlyData[obMonth].obligation += actualOb;

            const disbMonth = getMonth(sr.actualDisbursementDate);
            if(disbMonth !== -1) monthlyData[disbMonth].disbursement += actualDisb;

            totalAllocation += targetAmount;
            totalObligation += actualOb;
            totalDisbursement += actualDisb;

            components['Program Management'].target += targetAmount;
            components['Program Management'].obligation += actualOb;
            components['Program Management'].disbursement += actualDisb;
        });

        // 5. Process Other Program Expenses
        data.otherProgramExpenses.forEach(oe => {
            const targetAmount = oe.amount;
            const actualOb = oe.actualObligationAmount || 0;
            const actualDisb = oe.actualDisbursementAmount || 0;

            const targetMonth = getMonth(oe.obligationDate);
            if(targetMonth !== -1) monthlyData[targetMonth].target += targetAmount;

            const obMonth = getMonth(oe.actualObligationDate);
            if(obMonth !== -1) monthlyData[obMonth].obligation += actualOb;

            const disbMonth = getMonth(oe.actualDisbursementDate);
            if(disbMonth !== -1) monthlyData[disbMonth].disbursement += actualDisb;

            totalAllocation += targetAmount;
            totalObligation += actualOb;
            totalDisbursement += actualDisb;

            components['Program Management'].target += targetAmount;
            components['Program Management'].obligation += actualOb;
            components['Program Management'].disbursement += actualDisb;
        });

        return { components, provinceData, totalAllocation, totalObligation, totalDisbursement, monthlyData };
    }, [data]);

    // Matrix Logic for breakdown table
    const matrixData = useMemo(() => {
        // Initialize Matrix
        const matrix: Record<string, Record<string, { alloc: number, obli: number, disb: number }>> = {};
        
        operatingUnits.forEach(ou => {
            matrix[ou] = {
                'Social Preparation': { alloc: 0, obli: 0, disb: 0 },
                'Production and Livelihood': { alloc: 0, obli: 0, disb: 0 },
                'Marketing and Enterprise': { alloc: 0, obli: 0, disb: 0 },
                'Program Management': { alloc: 0, obli: 0, disb: 0 },
            };
        });

        // Helper to safely add to matrix
        const addToMatrix = (ou: string, component: string, alloc: number, obli: number, disb: number) => {
            if (!matrix[ou]) return; // Should allow 'Unassigned' or dynamic OUs if strictly needed, but sticking to predefined list for cleaner table
            const targetComp = component || 'Program Management';
            if (matrix[ou][targetComp]) {
                matrix[ou][targetComp].alloc += alloc;
                matrix[ou][targetComp].obli += obli;
                matrix[ou][targetComp].disb += disb;
            }
        };

        // 1. Subprojects (Production and Livelihood)
        data.subprojects.forEach(sp => {
            const alloc = sp.details.reduce((s, d) => s + (d.pricePerUnit * d.numberOfUnits), 0);
            const obli = sp.details.reduce((s, d) => d.actualObligationDate ? s + (d.actualAmount || 0) : s, 0);
            const disb = sp.details.reduce((s, d) => d.actualDisbursementDate ? s + (d.actualAmount || 0) : s, 0);
            addToMatrix(sp.operatingUnit, 'Production and Livelihood', alloc, obli, disb);
        });

        // 2. Activities (Various Components)
        const processAct = (act: Training | OtherActivity) => {
            const alloc = act.expenses.reduce((s, e) => s + e.amount, 0);
            const obli = act.expenses.reduce((s, e) => e.actualObligationDate ? s + (e.actualAmount || e.amount) : s, 0);
            const disb = act.expenses.reduce((s, e) => e.actualDisbursementDate ? s + (e.actualAmount || e.amount) : s, 0);
            addToMatrix(act.operatingUnit, act.component, alloc, obli, disb);
        };
        data.trainings.forEach(processAct);
        data.otherActivities.forEach(processAct);

        // 3. Program Management Items
        const processPM = (item: any, isStaff = false) => {
            const alloc = isStaff ? item.annualSalary : (item.amount || (item.pricePerUnit * item.numberOfUnits));
            const obli = item.actualObligationAmount || 0;
            const disb = item.actualDisbursementAmount || 0;
            addToMatrix(item.operatingUnit, 'Program Management', alloc, obli, disb);
        };
        data.officeReqs.forEach(item => processPM(item));
        data.staffingReqs.forEach(item => processPM(item, true));
        data.otherProgramExpenses.forEach(item => processPM(item));

        return matrix;
    }, [data]);

    const { components, provinceData, totalAllocation, totalObligation, totalDisbursement, monthlyData } = financialData;

    const getPieData = (type: 'target' | 'obligation' | 'disbursement') => {
        return Object.entries(components)
            .map(([name, stats]) => ({
                label: name,
                value: stats[type],
                color: getComponentColor(name)
            }))
            .filter(d => d.value > 0)
            .sort((a, b) => b.value - a.value);
    };

    // Comparison Component Card
    const ComponentComparisonCard: React.FC<{ title: string, target: number, obligation: number, disbursement: number }> = ({ title, target, obligation, disbursement }) => {
        const obliPercent = target > 0 ? (obligation / target) * 100 : 0;
        const disbPercent = target > 0 ? (disbursement / target) * 100 : 0;

        return (
            <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow border-l-4 border-green-500 dark:border-green-600 hover:shadow-lg transition-shadow">
                <h5 className="font-bold text-gray-700 dark:text-gray-200 mb-4 text-lg border-b border-gray-100 dark:border-gray-700 pb-2">{title}</h5>
                
                <div className="space-y-4">
                    <div>
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-500 dark:text-gray-400 font-medium">Target Allocation</span>
                            <span className="font-bold text-gray-800 dark:text-gray-100">{formatCurrency(target)}</span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                            <div className="bg-green-300 h-full rounded-full" style={{ width: '100%' }}></div>
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-500 dark:text-gray-400 font-medium">Actual Obligation ({obliPercent.toFixed(1)}%)</span>
                            <span className="font-bold text-gray-800 dark:text-gray-100">{formatCurrency(obligation)}</span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                            <div className="bg-green-500 h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(obliPercent, 100)}%` }}></div>
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-500 dark:text-gray-400 font-medium">Actual Disbursement ({disbPercent.toFixed(1)}%)</span>
                            <span className="font-bold text-gray-800 dark:text-gray-100">{formatCurrency(disbursement)}</span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                            <div className="bg-green-700 h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(disbPercent, 100)}%` }}></div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // Monthly Chart Component (Green Theme)
    const MonthlyChart = () => {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        // Ensure dataPoints is strictly typed
        // Use Array.from with map function
        const dataPoints: MonthlyDataPoint[] = Array.from({ length: 12 }, (_, i) => {
            const data = monthlyData[i];
            return data ? data : { target: 0, obligation: 0, disbursement: 0 };
        });

        const maxVal = Math.max(
            ...dataPoints.map(d => Math.max(d.target, d.obligation, d.disbursement)),
            1000 // Minimum scale
        );
        const height = 300;
        const width = 800; // ViewBox width
        const padding = 40;
        const chartHeight = height - padding * 2;
        const chartWidth = width - padding * 2;
        const barWidth = (chartWidth / 12) / 4; 

        const getY = (val: number) => height - padding - (val / maxVal) * chartHeight;

        return (
            <div className="w-full h-full overflow-hidden">
                <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto font-sans text-xs">
                    {/* Grid Lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map((t: number) => {
                        const y = height - padding - (t * chartHeight);
                        return (
                            <g key={t}>
                                <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#e5e7eb" strokeDasharray="4" />
                                <text x={padding - 5} y={y + 4} textAnchor="end" fill="#9ca3af">{formatCurrency(maxVal * t).replace('₱', '')}</text>
                            </g>
                        );
                    })}

                    {/* Data */}
                    {dataPoints.map((d, i) => {
                        const xBase = padding + (i * (chartWidth / 12));
                        // Ensure values are numbers
                        const tVal = Number(d.target || 0);
                        const oVal = Number(d.obligation || 0);
                        const dVal = Number(d.disbursement || 0);

                        const yTarget = getY(tVal);
                        const yOb = getY(oVal);
                        const yDisb = getY(dVal);
                        
                        return (
                            <g key={i}>
                                {/* Target Bar */}
                                <rect x={xBase + 5} y={yTarget} width={barWidth} height={Math.max(0, height - padding - yTarget)} fill="#86efac" className="opacity-80 hover:opacity-100 transition-opacity" rx="1">
                                    <title>Target: {formatCurrency(tVal)}</title>
                                </rect>
                                
                                {/* Obligation Bar */}
                                <rect x={xBase + 5 + barWidth} y={yOb} width={barWidth} height={Math.max(0, height - padding - yOb)} fill="#22c55e" className="hover:brightness-110 transition-all" rx="1">
                                    <title>Obligation: {formatCurrency(oVal)}</title>
                                </rect>

                                {/* Disbursement Bar */}
                                <rect x={xBase + 5 + barWidth * 2} y={yDisb} width={barWidth} height={Math.max(0, height - padding - yDisb)} fill="#15803d" className="hover:brightness-110 transition-all" rx="1">
                                    <title>Disbursement: {formatCurrency(dVal)}</title>
                                </rect>

                                {/* Month Label */}
                                <text x={xBase + (chartWidth / 12) / 2} y={height - 10} textAnchor="middle" fill="#6b7280" fontWeight="bold">{months[i]}</text>
                            </g>
                        );
                    })}
                </svg>
                <div className="flex justify-center gap-4 mt-2 text-xs text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-1"><span className="w-3 h-3 bg-green-300 rounded-sm"></span> Target</div>
                    <div className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500 rounded-sm"></span> Obligation</div>
                    <div className="flex items-center gap-1"><span className="w-3 h-3 bg-green-700 rounded-sm"></span> Disbursement</div>
                </div>
            </div>
        );
    };

    // New Helper Component for Matrix Table
    const MatrixTable = ({ title, metricKey }: { title: string, metricKey: 'alloc' | 'obli' | 'disb' }) => {
        const headers = ['Social Preparation', 'Production and Livelihood', 'Marketing and Enterprise', 'Program Management'];
        
        // Calculate Totals
        const columnTotals = headers.reduce((acc, h) => {
            acc[h] = operatingUnits.reduce((sum, ou) => sum + (matrixData[ou]?.[h]?.[metricKey] || 0), 0);
            return acc;
        }, {} as Record<string, number>);
        
        const grandTotal = Object.values(columnTotals).reduce((a, b) => a + b, 0);

        return (
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md overflow-x-auto">
                <h4 className="font-bold text-lg text-gray-800 dark:text-white mb-4 border-l-4 border-green-500 pl-3">{title}</h4>
                <table className="min-w-full text-xs text-left text-gray-600 dark:text-gray-300">
                    <thead className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold uppercase">
                        <tr>
                            <th className="px-4 py-3">Operating Unit</th>
                            {headers.map(h => <th key={h} className="px-4 py-3 text-right">{h}</th>)}
                            <th className="px-4 py-3 text-right bg-gray-200 dark:bg-gray-600">Grand Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {operatingUnits.map(ou => {
                            const rowTotal = headers.reduce((sum, h) => sum + (matrixData[ou]?.[h]?.[metricKey] || 0), 0);
                            return (
                                <tr key={ou} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                    <td className="px-4 py-2 font-medium">{ou}</td>
                                    {headers.map(h => (
                                        <td key={h} className="px-4 py-2 text-right">
                                            {formatCurrency(matrixData[ou]?.[h]?.[metricKey] || 0)}
                                        </td>
                                    ))}
                                    <td className="px-4 py-2 text-right font-bold bg-gray-50 dark:bg-gray-800/50">{formatCurrency(rowTotal)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot className="bg-gray-100 dark:bg-gray-700 font-bold text-gray-800 dark:text-white">
                        <tr>
                            <td className="px-4 py-3">TOTAL</td>
                            {headers.map(h => (
                                <td key={h} className="px-4 py-3 text-right">{formatCurrency(columnTotals[h])}</td>
                            ))}
                            <td className="px-4 py-3 text-right bg-gray-200 dark:bg-gray-600 text-blue-700 dark:text-blue-300">{formatCurrency(grandTotal)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        );
    };

    return (
        <div className="space-y-8 animate-fadeIn">
            {/* Section 1: Budget Utilization (Green Theme) */}
            <section aria-labelledby="budget-utilization">
                <h3 id="budget-utilization" className="text-xl font-bold text-gray-800 dark:text-white mb-4">Budget Utilization</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-gradient-to-br from-green-400 to-green-600 text-white p-6 rounded-lg shadow-lg transform transition hover:scale-105">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-white/20 rounded-full"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                            <h4 className="text-sm font-medium uppercase tracking-wider opacity-90">Budget Allocation</h4>
                        </div>
                        <p className="text-3xl font-bold">{formatCurrency(totalAllocation)}</p>
                        <p className="text-xs mt-2 opacity-80">Total Target</p>
                    </div>

                    <div className="bg-gradient-to-br from-teal-500 to-teal-700 text-white p-6 rounded-lg shadow-lg transform transition hover:scale-105">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-white/20 rounded-full"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                            <h4 className="text-sm font-medium uppercase tracking-wider opacity-90">Total Obligation</h4>
                        </div>
                        <p className="text-3xl font-bold">{formatCurrency(totalObligation)}</p>
                        <div className="flex justify-between items-center mt-2">
                            <p className="text-xs opacity-80">Actual Obligated</p>
                            <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded text-white">
                                {totalAllocation > 0 ? Math.round((totalObligation / totalAllocation) * 100) : 0}% Utilized
                            </span>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 text-white p-6 rounded-lg shadow-lg transform transition hover:scale-105">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-white/20 rounded-full"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg></div>
                            <h4 className="text-sm font-medium uppercase tracking-wider opacity-90">Total Disbursement</h4>
                        </div>
                        <p className="text-3xl font-bold">{formatCurrency(totalDisbursement)}</p>
                        <div className="flex justify-between items-center mt-2">
                            <p className="text-xs opacity-80">Actual Disbursed</p>
                            <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded text-white">
                                {totalObligation > 0 ? Math.round((totalDisbursement / totalObligation) * 100) : 0}% of Obli.
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Section 1.5: Component Distribution Pie Charts */}
            <section aria-labelledby="component-distribution">
                <h3 id="component-distribution" className="text-xl font-bold text-gray-800 dark:text-white mb-4">Budget Distribution by Component</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md flex flex-col items-center">
                        <h4 className="font-bold text-gray-700 dark:text-gray-200 mb-6 text-center">Allocation (Target)</h4>
                        <SimplePieChart data={getPieData('target')} />
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md flex flex-col items-center">
                        <h4 className="font-bold text-gray-700 dark:text-gray-200 mb-6 text-center">Actual Obligation</h4>
                        <SimplePieChart data={getPieData('obligation')} />
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md flex flex-col items-center">
                        <h4 className="font-bold text-gray-700 dark:text-gray-200 mb-6 text-center">Actual Disbursement</h4>
                        <SimplePieChart data={getPieData('disbursement')} />
                    </div>
                </div>
            </section>

            {/* Section 2: Budget Breakdown by Component (Comparisons) */}
            <section aria-labelledby="budget-breakdown">
                <h3 id="budget-breakdown" className="text-xl font-bold text-gray-800 dark:text-white mb-4">Budget Performance by Component</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {Object.entries(components).map(([key, value]) => (
                        <ComponentComparisonCard 
                            key={key} 
                            title={key} 
                            target={value.target} 
                            obligation={value.obligation} 
                            disbursement={value.disbursement} 
                        />
                    ))}
                </div>
            </section>

            {/* Section 3: Allocation by Province */}
            <section aria-labelledby="province-breakdown">
                <h3 id="province-breakdown" className="text-xl font-bold text-gray-800 dark:text-white mb-4">Total Allocation by Province</h3>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md max-h-[500px] overflow-y-auto custom-scrollbar">
                    <div className="space-y-4">
                        {Object.entries(provinceData)
                            .sort(([, a], [, b]) => b - a)
                            .map(([province, amount], index) => {
                                const maxVal = Math.max(...Object.values(provinceData));
                                const percent = maxVal > 0 ? (amount / maxVal) * 100 : 0;
                                return (
                                    <div key={province} className="flex items-center text-sm group">
                                        <div className="w-6 text-gray-400 font-mono text-xs">{index + 1}</div>
                                        <div className="w-40 truncate font-medium text-gray-700 dark:text-gray-300" title={province}>{province}</div>
                                        <div className="flex-1 mx-4">
                                            <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-gradient-to-r from-green-400 to-green-600 group-hover:from-green-500 group-hover:to-green-700 transition-all duration-500" 
                                                    style={{ width: `${percent}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                        <div className="w-32 text-right font-semibold text-gray-800 dark:text-gray-100">{formatCurrency(amount)}</div>
                                    </div>
                                );
                            })}
                        {Object.keys(provinceData).length === 0 && <p className="text-center text-gray-500 italic py-4">No location data available for current selection.</p>}
                    </div>
                </div>
            </section>

            {/* Section 4: Monthly Breakdown Chart */}
            <section aria-labelledby="monthly-breakdown">
                <h3 id="monthly-breakdown" className="text-xl font-bold text-gray-800 dark:text-white mb-4">Monthly Financial Performance</h3>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md h-96">
                    <MonthlyChart />
                </div>
            </section>

            {/* Section 5: Matrix Breakdowns */}
            <section aria-labelledby="financial-matrices">
                <h3 id="financial-matrices" className="text-xl font-bold text-gray-800 dark:text-white mb-4">Detailed Financial Matrix by Operating Unit</h3>
                <div className="space-y-8">
                    <MatrixTable title="Total Allocation (Target)" metricKey="alloc" />
                    <MatrixTable title="Actual Obligation" metricKey="obli" />
                    <MatrixTable title="Actual Disbursement" metricKey="disb" />
                </div>
            </section>
        </div>
    );
};

export default FinancialDashboard;
