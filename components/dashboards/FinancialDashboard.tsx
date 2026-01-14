
import React, { useMemo } from 'react';
import { Subproject, Training, OtherActivity, IPO } from '../../constants';
import { formatCurrency } from '../reports/ReportUtils';
import { parseLocation } from '../LocationPicker';

interface FinancialDashboardProps {
    data: {
        subprojects: Subproject[];
        trainings: Training[];
        otherActivities: OtherActivity[];
        ipos: IPO[];
    };
}

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

        const monthlyData: { [key: number]: { target: number; obligation: number; disbursement: number } } = {};
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

        return { components, provinceData, totalAllocation, totalObligation, totalDisbursement, monthlyData };
    }, [data]);

    const { components, provinceData, totalAllocation, totalObligation, totalDisbursement, monthlyData } = financialData;

    // Comparison Component Card
    const ComponentComparisonCard = ({ title, target, obligation, disbursement }: { title: string, target: number, obligation: number, disbursement: number }) => {
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
        const dataPoints = Object.values(monthlyData);
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
                    {[0, 0.25, 0.5, 0.75, 1].map(t => {
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
                        const yTarget = getY(d.target);
                        const yOb = getY(d.obligation);
                        const yDisb = getY(d.disbursement);
                        
                        return (
                            <g key={i}>
                                {/* Target Bar */}
                                <rect x={xBase + 5} y={yTarget} width={barWidth} height={height - padding - yTarget} fill="#86efac" className="opacity-80 hover:opacity-100 transition-opacity" rx="1">
                                    <title>Target: {formatCurrency(d.target)}</title>
                                </rect>
                                
                                {/* Obligation Bar */}
                                <rect x={xBase + 5 + barWidth} y={yOb} width={barWidth} height={height - padding - yOb} fill="#22c55e" className="hover:brightness-110 transition-all" rx="1">
                                    <title>Obligation: {formatCurrency(d.obligation)}</title>
                                </rect>

                                {/* Disbursement Bar */}
                                <rect x={xBase + 5 + barWidth * 2} y={yDisb} width={barWidth} height={height - padding - yDisb} fill="#15803d" className="hover:brightness-110 transition-all" rx="1">
                                    <title>Disbursement: {formatCurrency(d.disbursement)}</title>
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
        </div>
    );
};

export default FinancialDashboard;
