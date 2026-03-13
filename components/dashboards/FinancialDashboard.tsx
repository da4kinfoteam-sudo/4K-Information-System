// Author: 4K 
import React, { useMemo } from 'react';
import { Subproject, Training, OtherActivity, IPO, OfficeRequirement, StaffingRequirement, OtherProgramExpense, operatingUnits } from '../../constants';
import { parseLocation } from '../LocationPicker';
import { useAuth } from '../../contexts/AuthContext';

declare const PptxGenJS: any;

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

interface FinancialData {
    components: { [key: string]: { target: number; obligation: number; disbursement: number } };
    provinceData: { 
        [province: string]: {
            alloc: number;
            obli: number;
            disb: number;
            ancestralDomains: {
                [ad: string]: {
                    alloc: number;
                    obli: number;
                    disb: number;
                    ipos: {
                        [ipo: string]: {
                            alloc: number;
                            obli: number;
                            disb: number;
                        }
                    }
                }
            }
        }
    };
    totalAllocation: number;
    totalObligation: number;
    totalDisbursement: number;
    monthlyData: { [key: number]: MonthlyDataPoint };
}

interface MatrixData {
    [ou: string]: {
        [component: string]: { alloc: number; obli: number; disb: number };
    };
}

const formatCurrencyWhole = (amount: number) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.ceil(amount));
};

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
    const { currentUser } = useAuth();
    const canViewMatrix = currentUser?.role === 'Administrator' || currentUser?.role === 'Management';

    const financialData = useMemo<FinancialData>(() => {
        const components: { [key: string]: { target: number; obligation: number; disbursement: number } } = {
            'Social Preparation': { target: 0, obligation: 0, disbursement: 0 },
            'Production and Livelihood': { target: 0, obligation: 0, disbursement: 0 },
            'Marketing and Enterprise': { target: 0, obligation: 0, disbursement: 0 },
            'Program Management': { target: 0, obligation: 0, disbursement: 0 }
        };

        const provinceData: FinancialData['provinceData'] = {};

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

        const ipoToADMap: { [key: string]: string } = {};
        data.ipos.forEach(ipo => {
            ipoToADMap[ipo.name] = ipo.ancestralDomainNo || 'Unspecified AD';
        });

        const addToProvince = (loc: string, ipoName: string | string[] | undefined, alloc: number, obli: number, disb: number) => {
            const { province } = parseLocation(loc);
            const pKey = province || 'Unspecified';
            
            if (!provinceData[pKey]) {
                provinceData[pKey] = { alloc: 0, obli: 0, disb: 0, ancestralDomains: {} };
            }
            provinceData[pKey].alloc += alloc;
            provinceData[pKey].obli += obli;
            provinceData[pKey].disb += disb;

            const ipos = Array.isArray(ipoName) ? ipoName : (ipoName ? [ipoName] : ['Unspecified IPO']);
            const perIpoAlloc = alloc / ipos.length;
            const perIpoObli = obli / ipos.length;
            const perIpoDisb = disb / ipos.length;

            ipos.forEach(ipo => {
                const adKey = ipoToADMap[ipo] || 'Unspecified AD';
                
                if (!provinceData[pKey].ancestralDomains[adKey]) {
                    provinceData[pKey].ancestralDomains[adKey] = { alloc: 0, obli: 0, disb: 0, ipos: {} };
                }
                provinceData[pKey].ancestralDomains[adKey].alloc += perIpoAlloc;
                provinceData[pKey].ancestralDomains[adKey].obli += perIpoObli;
                provinceData[pKey].ancestralDomains[adKey].disb += perIpoDisb;

                if (!provinceData[pKey].ancestralDomains[adKey].ipos[ipo]) {
                    provinceData[pKey].ancestralDomains[adKey].ipos[ipo] = { alloc: 0, obli: 0, disb: 0 };
                }
                provinceData[pKey].ancestralDomains[adKey].ipos[ipo].alloc += perIpoAlloc;
                provinceData[pKey].ancestralDomains[adKey].ipos[ipo].obli += perIpoObli;
                provinceData[pKey].ancestralDomains[adKey].ipos[ipo].disb += perIpoDisb;
            });
        };

        // 1. Process Subprojects
        data.subprojects.forEach(sp => {
            const spBudget = sp.details.reduce((sum, d) => {
                const amount = d.pricePerUnit * d.numberOfUnits;
                
                // Monthly Targets
                const targetMonth = getMonth(d.obligationMonth);
                if (targetMonth !== -1) monthlyData[targetMonth].target += amount;

                // Monthly Actuals
                const obMonth = getMonth(d.actualObligationDate);
                if (obMonth !== -1) monthlyData[obMonth].obligation += (d.actualObligationAmount || 0);

                const disbMonth = getMonth(d.actualDisbursementDate);
                if (disbMonth !== -1) monthlyData[disbMonth].disbursement += (d.actualDisbursementAmount || 0);

                return sum + amount;
            }, 0);

            const spObligation = sp.details.reduce((sum, d) => sum + (d.actualObligationAmount || 0), 0);
            const spDisbursement = sp.details.reduce((sum, d) => sum + (d.actualDisbursementAmount || 0), 0);

            components['Production and Livelihood'].target += spBudget;
            components['Production and Livelihood'].obligation += spObligation;
            components['Production and Livelihood'].disbursement += spDisbursement;

            addToProvince(sp.location, sp.indigenousPeopleOrganization, spBudget, spObligation, spDisbursement);

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
                if (obMonth !== -1) monthlyData[obMonth].obligation += (e.actualObligationAmount || 0);

                const disbMonth = getMonth(e.actualDisbursementDate);
                if (disbMonth !== -1) monthlyData[disbMonth].disbursement += (e.actualDisbursementAmount || 0);

                return sum + e.amount;
            }, 0);

            const actObligation = act.expenses.reduce((sum, e) => sum + (e.actualObligationAmount || 0), 0);
            const actDisbursement = act.expenses.reduce((sum, e) => sum + (e.actualDisbursementAmount || 0), 0);

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

            addToProvince(act.location, act.participatingIpos, actBudget, actObligation, actDisbursement);
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

    const matrixData = useMemo<MatrixData>(() => {
        const matrix: MatrixData = {};
        operatingUnits.forEach(ou => {
            matrix[ou] = {
                'Social Preparation': { alloc: 0, obli: 0, disb: 0 },
                'Production and Livelihood': { alloc: 0, obli: 0, disb: 0 },
                'Marketing and Enterprise': { alloc: 0, obli: 0, disb: 0 },
                'Program Management': { alloc: 0, obli: 0, disb: 0 },
            };
        });

        const addToMatrix = (ou: string, component: string, alloc: number, obli: number, disb: number) => {
            if (!matrix[ou]) return; 
            const targetComp = component || 'Program Management';
            if (matrix[ou][targetComp]) {
                matrix[ou][targetComp].alloc += alloc;
                matrix[ou][targetComp].obli += obli;
                matrix[ou][targetComp].disb += disb;
            }
        };

        data.subprojects.forEach(sp => {
            const alloc = sp.details.reduce((s, d) => s + (d.pricePerUnit * d.numberOfUnits), 0);
            const obli = sp.details.reduce((s, d) => s + (d.actualObligationAmount || 0), 0);
            const disb = sp.details.reduce((s, d) => s + (d.actualDisbursementAmount || 0), 0);
            addToMatrix(sp.operatingUnit, 'Production and Livelihood', alloc, obli, disb);
        });

        const processAct = (act: Training | OtherActivity) => {
            const alloc = act.expenses.reduce((s, e) => s + e.amount, 0);
            const obli = act.expenses.reduce((s, e) => s + (e.actualObligationAmount || 0), 0);
            const disb = act.expenses.reduce((s, e) => s + (e.actualDisbursementAmount || 0), 0);
            addToMatrix(act.operatingUnit, act.component, alloc, obli, disb);
        };
        data.trainings.forEach(processAct);
        data.otherActivities.forEach(processAct);

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

    const handleExportPPTX = () => {
        const pptx = new PptxGenJS();
        pptx.layout = 'LAYOUT_WIDE';
        pptx.defineSlideMaster({
            title: 'MASTER_SLIDE',
            background: { fill: 'FFFFFF' },
            objects: [
                { rect: { x: 0, y: 0, w: '100%', h: 0.8, fill: '38761D' } },
                { text: { text: 'Financial Performance Dashboard', options: { x: 0.5, y: 0.2, w: 6, h: 0.4, color: 'FFFFFF', fontSize: 24, bold: true } } },
                { text: { text: `Generated: ${new Date().toLocaleDateString()}`, options: { x: 10, y: 0.2, w: 3, h: 0.4, color: 'FFFFFF', fontSize: 12, align: 'right' } } }
            ]
        });

        // Slide 1: Summary
        const slide1 = pptx.addSlide({ masterName: 'MASTER_SLIDE' });
        slide1.addText("Executive Financial Summary", { x: 0.5, y: 1.2, fontSize: 28, color: '38761D', bold: true });
        
        const summaryTable = [
            [{ text: "Metric", options: { bold: true, fill: 'EEEEEE' } }, { text: "Amount (PHP)", options: { bold: true, fill: 'EEEEEE' } }],
            ["Total Target Allocation", formatCurrencyWhole(totalAllocation)],
            ["Total Actual Obligated", formatCurrencyWhole(totalObligation)],
            ["Total Actual Disbursed", formatCurrencyWhole(totalDisbursement)]
        ];
        slide1.addTable(summaryTable, { x: 0.5, y: 2.0, w: 6, border: { type: 'solid', color: 'CCCCCC' } });

        // Slide 2: Budget Distribution (Pies)
        const slide2 = pptx.addSlide({ masterName: 'MASTER_SLIDE' });
        slide2.addText("Budget Distribution by Component", { x: 0.5, y: 1.0, fontSize: 24, color: '38761D', bold: true });
        
        const chartDataPie = [
            {
                name: "Allocation",
                labels: Object.keys(components),
                values: Object.values(components).map((v: any) => v.target)
            }
        ];
        slide2.addChart(pptx.ChartType.pie, chartDataPie, { x: 0.5, y: 1.8, w: 6, h: 4, showLegend: true, legendPos: 'b' });
        slide2.addText("Target Allocation %", { x: 0.5, y: 1.5, fontSize: 14, bold: true });

        const chartDataDisb = [
            {
                name: "Disbursement",
                labels: Object.keys(components),
                values: Object.values(components).map((v: any) => v.disbursement)
            }
        ];
        slide2.addChart(pptx.ChartType.pie, chartDataDisb, { x: 6.8, y: 1.8, w: 6, h: 4, showLegend: true, legendPos: 'b' });
        slide2.addText("Actual Disbursement %", { x: 6.8, y: 1.5, fontSize: 14, bold: true });

        // Slide 3: Monthly Performance (Graph)
        const slide3 = pptx.addSlide({ masterName: 'MASTER_SLIDE' });
        slide3.addText("Monthly Financial Performance", { x: 0.5, y: 1.0, fontSize: 24, color: '38761D', bold: true });
        
        const monthsLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const chartDataMonthly = [
            { name: "Target", labels: monthsLabels, values: Object.values(monthlyData).map((v: any) => v.target) },
            { name: "Obligation", labels: monthsLabels, values: Object.values(monthlyData).map((v: any) => v.obligation) },
            { name: "Disbursement", labels: monthsLabels, values: Object.values(monthlyData).map((v: any) => v.disbursement) }
        ];
        slide3.addChart(pptx.ChartType.bar, chartDataMonthly, { 
            x: 0.5, y: 1.5, w: 12, h: 5, 
            showLegend: true, legendPos: 't',
            barGapWidthPct: 20,
            chartColors: ['86efac', '22c55e', '15803d']
        });

        // Slide 4: Provinces
        const slide4 = pptx.addSlide({ masterName: 'MASTER_SLIDE' });
        slide4.addText("Top Allocations by Province", { x: 0.5, y: 1.2, fontSize: 28, color: '38761D', bold: true });
        const sortedProvinces = Object.entries(provinceData)
            .sort(([nameA, a], [nameB, b]) => {
                if (nameA === 'Unspecified') return 1;
                if (nameB === 'Unspecified') return -1;
                return (b as any).alloc - (a as any).alloc;
            })
            .slice(0, 15);
        const provTable = [
            [{ text: "Province", options: { bold: true, fill: 'EEEEEE' } }, { text: "Allocation", options: { bold: true, fill: 'EEEEEE' } }],
            ...sortedProvinces.map(([k, v]) => [k, formatCurrencyWhole((v as any).alloc)])
        ];
        slide4.addTable(provTable, { x: 0.5, y: 2.0, w: 6, border: { type: 'solid', color: 'CCCCCC' } });

        pptx.writeFile({ fileName: `4K_Financial_Report_${new Date().toISOString().split('T')[0]}.pptx` });
    };

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
                            <span className="font-bold text-gray-800 dark:text-gray-100">{formatCurrencyWhole(target)}</span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                            <div className="bg-green-300 h-full rounded-full" style={{ width: '100%' }}></div>
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-500 dark:text-gray-400 font-medium">Actual Obligation ({obliPercent.toFixed(1)}%)</span>
                            <span className="font-bold text-gray-800 dark:text-gray-100">{formatCurrencyWhole(obligation)}</span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                            <div className="bg-green-50 h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(obliPercent, 100)}%` }}></div>
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-500 dark:text-gray-400 font-medium">Actual Disbursement ({disbPercent.toFixed(1)}%)</span>
                            <span className="font-bold text-gray-800 dark:text-gray-100">{formatCurrencyWhole(disbursement)}</span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                            <div className="bg-green-700 h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(disbPercent, 100)}%` }}></div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const HierarchicalProvinceChart = () => {
        const [expandedProvinces, setExpandedProvinces] = React.useState<Set<string>>(new Set());
        const [expandedADs, setExpandedADs] = React.useState<Set<string>>(new Set());

        const toggleProvince = (p: string) => {
            const next = new Set(expandedProvinces);
            if (next.has(p)) next.delete(p);
            else next.add(p);
            setExpandedProvinces(next);
        };

        const toggleAD = (ad: string) => {
            const next = new Set(expandedADs);
            if (next.has(ad)) next.delete(ad);
            else next.add(ad);
            setExpandedADs(next);
        };

        const maxVal = useMemo(() => {
            let max = 0;
            Object.values(provinceData).forEach((p: any) => {
                max = Math.max(max, p.alloc, p.obli, p.disb);
                Object.values(p.ancestralDomains).forEach((ad: any) => {
                    max = Math.max(max, ad.alloc, ad.obli, ad.disb);
                    Object.values(ad.ipos).forEach((ipo: any) => {
                        max = Math.max(max, ipo.alloc, ipo.obli, ipo.disb);
                    });
                });
            });
            return max || 1;
        }, [provinceData]);

        const renderDataColumns = (alloc: number, obli: number, disb: number, isExpanded: boolean) => {
            if (isExpanded) return <div className="col-span-3 text-right italic text-gray-400 text-[10px] py-1">Showing sub-items...</div>;

            const allocWidth = (alloc / maxVal) * 100;
            const obliWidth = (obli / maxVal) * 100;
            const disbWidth = (disb / maxVal) * 100;

            return (
                <>
                    <div className="text-right">
                        <div className="text-xs font-bold text-gray-800 dark:text-gray-100">{formatCurrencyWhole(alloc)}</div>
                        <div className="h-1 bg-gray-100 dark:bg-gray-800 rounded-full mt-1 overflow-hidden">
                            <div className="h-full bg-green-400" style={{ width: `${allocWidth}%` }}></div>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs font-bold text-gray-800 dark:text-gray-100">{formatCurrencyWhole(obli)}</div>
                        <div className="h-1 bg-gray-100 dark:bg-gray-800 rounded-full mt-1 overflow-hidden">
                            <div className="h-full bg-teal-500" style={{ width: `${obliWidth}%` }}></div>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs font-bold text-gray-800 dark:text-gray-100">{formatCurrencyWhole(disb)}</div>
                        <div className="h-1 bg-gray-100 dark:bg-gray-800 rounded-full mt-1 overflow-hidden">
                            <div className="h-full bg-emerald-700" style={{ width: `${disbWidth}%` }}></div>
                        </div>
                    </div>
                </>
            );
        };

        return (
            <div className="w-full overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
                {/* Table Header */}
                <div className="grid grid-cols-[1.5fr,1fr,1fr,1fr] gap-4 bg-gray-100 dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-700 text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                    <div>Location Hierarchy</div>
                    <div className="text-right">Allocation</div>
                    <div className="text-right">Obligation</div>
                    <div className="text-right">Disbursement</div>
                </div>

                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {Object.entries(provinceData)
                        .sort(([nameA, a], [nameB, b]) => {
                            if (nameA === 'Unspecified') return 1;
                            if (nameB === 'Unspecified') return -1;
                            return (b as any).alloc - (a as any).alloc;
                        })
                        .map(([province, pData]: [string, any]) => {
                            const isExpanded = expandedProvinces.has(province);
                            return (
                                <div key={province} className="flex flex-col">
                                    {/* Province Row */}
                                    <div 
                                        className="grid grid-cols-[1.5fr,1fr,1fr,1fr] gap-4 px-4 py-2.5 items-center hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors cursor-pointer group"
                                        onClick={() => toggleProvince(province)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-5 h-5 flex items-center justify-center rounded bg-gray-100 dark:bg-gray-700 text-gray-500 group-hover:bg-green-100 group-hover:text-green-600 transition-colors text-xs font-bold">
                                                {isExpanded ? '−' : '+'}
                                            </div>
                                            <span className="font-bold text-gray-800 dark:text-gray-100 text-sm">{province}</span>
                                        </div>
                                        {renderDataColumns(pData.alloc, pData.obli, pData.disb, isExpanded)}
                                    </div>

                                    {/* Ancestral Domains Hierarchy */}
                                    {isExpanded && (
                                        <div className="bg-gray-50/30 dark:bg-gray-800/10 divide-y divide-gray-50 dark:divide-gray-800/50">
                                            {Object.entries(pData.ancestralDomains)
                                                .sort(([, a]: [any, any], [, b]: [any, any]) => b.alloc - a.alloc)
                                                .map(([ad, adData]: [string, any]) => {
                                                    const adKey = `${province}-${ad}`;
                                                    const isADExpanded = expandedADs.has(adKey);
                                                    return (
                                                        <div key={ad} className="flex flex-col">
                                                            {/* AD Row */}
                                                            <div 
                                                                className="grid grid-cols-[1.5fr,1fr,1fr,1fr] gap-4 px-4 py-2 items-center hover:bg-gray-100/50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer group pl-12"
                                                                onClick={() => toggleAD(adKey)}
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-4 h-4 flex items-center justify-center rounded bg-gray-200 dark:bg-gray-600 text-gray-500 group-hover:bg-green-100 group-hover:text-green-600 transition-colors text-[10px] font-bold">
                                                                        {isADExpanded ? '−' : '+'}
                                                                    </div>
                                                                    <span className="font-semibold text-gray-700 dark:text-gray-300 text-xs">{ad}</span>
                                                                </div>
                                                                {renderDataColumns(adData.alloc, adData.obli, adData.disb, isADExpanded)}
                                                            </div>

                                                            {/* IPOs Hierarchy */}
                                                            {isADExpanded && (
                                                                <div className="bg-white dark:bg-gray-900/50 divide-y divide-gray-50 dark:divide-gray-800/30">
                                                                    {Object.entries(adData.ipos)
                                                                        .sort(([, a]: [any, any], [, b]: [any, any]) => b.alloc - a.alloc)
                                                                        .map(([ipo, ipoData]: [string, any]) => (
                                                                            <div 
                                                                                key={ipo}
                                                                                className="grid grid-cols-[1.5fr,1fr,1fr,1fr] gap-4 px-4 py-1.5 items-center pl-20"
                                                                            >
                                                                                <div className="text-[11px] text-gray-500 dark:text-gray-400 font-medium italic">
                                                                                    {ipo}
                                                                                </div>
                                                                                {renderDataColumns(ipoData.alloc, ipoData.obli, ipoData.disb, false)}
                                                                            </div>
                                                                        ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                </div>
            </div>
        );
    };

    const MonthlyChart = () => {
        const monthsLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const dataPoints = useMemo<MonthlyDataPoint[]>(() => {
             const points: MonthlyDataPoint[] = [];
             const mData = monthlyData as unknown as Record<number, MonthlyDataPoint>;
             for(let i=0; i<12; i++) {
                 points.push(mData[i] || { target: 0, obligation: 0, disbursement: 0 });
             }
             return points;
        }, [monthlyData]);

        const values: number[] = dataPoints.map((d: MonthlyDataPoint) => Math.max(d.target, d.obligation, d.disbursement));
        const maxVal: number = Math.max(...values, 1000);

        const height = 400;
        const width = 1000;
        const padding = 50;
        const chartHeight = height - padding * 2;
        const chartWidth = width - padding * 2;
        const columnWidth = chartWidth / 12;
        const barWidth = columnWidth / 4; 

        const getY = (val: number) => height - padding - (val / maxVal) * chartHeight;

        return (
            <div className="w-full h-full overflow-hidden">
                <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full font-sans text-xs" preserveAspectRatio="xMidYMid meet">
                    {/* Grid Lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map((t: number) => {
                        const y = height - padding - (t * chartHeight);
                        return (
                            <g key={t}>
                                <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#e5e7eb" strokeDasharray="4" />
                                <text x={padding - 5} y={y + 4} textAnchor="end" fill="#9ca3af" className="text-[10px]">{formatCurrencyWhole(maxVal * t).replace('₱', '')}</text>
                            </g>
                        );
                    })}

                    {/* Data */}
                    {dataPoints.map((d: MonthlyDataPoint, i) => {
                        const xBase = padding + (i * columnWidth);
                        const yTarget = getY(d.target);
                        const yOb = getY(d.obligation);
                        const yDisb = getY(d.disbursement);
                        
                        return (
                            <g key={i}>
                                {/* Target Bar */}
                                <rect x={xBase + barWidth * 0.5} y={yTarget} width={barWidth} height={Math.max(0, height - padding - yTarget)} fill="#86efac" className="opacity-80 hover:opacity-100 transition-opacity" rx="1">
                                    <title>Target: {formatCurrencyWhole(d.target)}</title>
                                </rect>
                                
                                {/* Obligation Bar */}
                                <rect x={xBase + barWidth * 1.5} y={yOb} width={barWidth} height={Math.max(0, height - padding - yOb)} fill="#22c55e" className="hover:brightness-110 transition-all" rx="1">
                                    <title>Obligation: {formatCurrencyWhole(d.obligation)}</title>
                                </rect>

                                {/* Disbursement Bar */}
                                <rect x={xBase + barWidth * 2.5} y={yDisb} width={barWidth} height={Math.max(0, height - padding - yDisb)} fill="#15803d" className="hover:brightness-110 transition-all" rx="1">
                                    <title>Disbursement: {formatCurrencyWhole(d.disbursement)}</title>
                                </rect>

                                {/* Month Label */}
                                <text x={xBase + columnWidth / 2} y={height - padding + 20} textAnchor="middle" fill="#6b7280" className="font-bold text-[11px]">{monthsLabels[i]}</text>
                            </g>
                        );
                    })}
                </svg>
                <div className="flex justify-center gap-6 mt-2 text-[11px] text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-green-300 rounded-sm"></span> Target</div>
                    <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-green-500 rounded-sm"></span> Obligation</div>
                    <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-green-700 rounded-sm"></span> Disbursement</div>
                </div>
            </div>
        );
    };

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
                                            {formatCurrencyWhole(matrixData[ou]?.[h]?.[metricKey] || 0)}
                                        </td>
                                    ))}
                                    <td className="px-4 py-2 text-right font-bold bg-gray-50 dark:bg-gray-800/50">{formatCurrencyWhole(rowTotal)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot className="bg-gray-100 dark:bg-gray-700 font-bold text-gray-800 dark:text-white">
                        <tr>
                            <td className="px-4 py-3">TOTAL</td>
                            {headers.map(h => (
                                <td key={h} className="px-4 py-3 text-right">{formatCurrencyWhole(columnTotals[h])}</td>
                            ))}
                            <td className="px-4 py-3 text-right bg-gray-200 dark:bg-gray-600 text-blue-700 dark:text-blue-300">{formatCurrencyWhole(grandTotal)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        );
    };

    return (
        <div className="space-y-8 animate-fadeIn">
            {/* Action Bar */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Financial Dashboard</h1>
                <button 
                    onClick={handleExportPPTX}
                    className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-all shadow-md hover:shadow-lg"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    Download Financial Report
                </button>
            </div>

            <section aria-labelledby="budget-utilization">
                <h3 id="budget-utilization" className="text-xl font-bold text-gray-800 dark:text-white mb-4">Budget Utilization</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-gradient-to-br from-green-400 to-green-600 text-white p-6 rounded-lg shadow-lg transform transition hover:scale-105">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-white/20 rounded-full"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                            <h4 className="text-sm font-medium uppercase tracking-wider opacity-90">Budget Allocation</h4>
                        </div>
                        <p className="text-xl sm:text-2xl lg:text-3xl font-bold truncate" title={formatCurrencyWhole(totalAllocation)}>{formatCurrencyWhole(totalAllocation)}</p>
                        <p className="text-xs mt-2 opacity-80">Total Target</p>
                    </div>

                    <div className="bg-gradient-to-br from-teal-500 to-teal-700 text-white p-6 rounded-lg shadow-lg transform transition hover:scale-105">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-white/20 rounded-full"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                            <h4 className="text-sm font-medium uppercase tracking-wider opacity-90">Total Obligation</h4>
                        </div>
                        <p className="text-xl sm:text-2xl lg:text-3xl font-bold truncate" title={formatCurrencyWhole(totalObligation)}>{formatCurrencyWhole(totalObligation)}</p>
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
                        <p className="text-xl sm:text-2xl lg:text-3xl font-bold truncate" title={formatCurrencyWhole(totalDisbursement)}>{formatCurrencyWhole(totalDisbursement)}</p>
                        <div className="flex justify-between items-center mt-2">
                            <p className="text-xs opacity-80">Actual Disbursed</p>
                            <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded text-white">
                                {totalObligation > 0 ? Math.round((totalDisbursement / totalObligation) * 100) : 0}% of Obli.
                            </span>
                        </div>
                    </div>
                </div>
            </section>

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

            <section aria-labelledby="budget-breakdown">
                <h3 id="budget-breakdown" className="text-xl font-bold text-gray-800 dark:text-white mb-4">Budget Performance by Component</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {Object.entries(components).map(([key, value]) => (
                        <ComponentComparisonCard 
                            key={key} 
                            title={key} 
                            target={(value as any).target} 
                            obligation={(value as any).obligation} 
                            disbursement={(value as any).disbursement} 
                        />
                    ))}
                </div>
            </section>

            <section aria-labelledby="province-breakdown">
                <h3 id="province-breakdown" className="text-xl font-bold text-gray-800 dark:text-white mb-4">Allocation per Province, Ancestral Domains, IPOs</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 italic">Hierarchical breakdown of financial performance. Expand provinces and ancestral domains to see detailed allocations, obligations, and disbursements.</p>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md max-h-[600px] overflow-y-auto custom-scrollbar">
                    <HierarchicalProvinceChart />
                </div>
            </section>

            <section aria-labelledby="monthly-breakdown">
                <h3 id="monthly-breakdown" className="text-xl font-bold text-gray-800 dark:text-white mb-4">Monthly Financial Performance</h3>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md h-96">
                    <MonthlyChart />
                </div>
            </section>

            {canViewMatrix && (
                <section aria-labelledby="financial-matrices">
                    <h3 id="financial-matrices" className="text-xl font-bold text-gray-800 dark:text-white mb-4">Detailed Financial Matrix by Operating Unit</h3>
                    <div className="space-y-8">
                        <MatrixTable title="Total Allocation (Target)" metricKey="alloc" />
                        <MatrixTable title="Actual Obligation" metricKey="obli" />
                        <MatrixTable title="Actual Disbursement" metricKey="disb" />
                    </div>
                </section>
            )}
        </div>
    );
};

export default FinancialDashboard;