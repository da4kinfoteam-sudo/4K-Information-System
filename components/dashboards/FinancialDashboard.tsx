// Author: 4K 
import React, { useMemo } from 'react';
import { Subproject, Training, OtherActivity, IPO, OfficeRequirement, StaffingRequirement, OtherProgramExpense, operatingUnits } from '../../constants';
import { parseLocation } from '../LocationPicker';
import { useAuth } from '../../contexts/AuthContext';
import { collectFinancialLineItems, FinancialAggregationFilters } from '../../lib/financialAggregation';

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
    selectedYearProp?: string;
    selectedOuProp?: string;
    selectedTierProp?: string;
    selectedFundTypeProp?: string;
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

    if (total === 0) return <div className="dashboard-empty dashboard-empty--center">No data available</div>;

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
        <div className="financial-pie">
            <div className="financial-pie__chart" style={{ width: size, height: size }}>
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="financial-pie__svg">
                    {slices.map((slice, i) => (
                        <path key={i} d={slice.path} fill={slice.color} stroke="white" strokeWidth="2" />
                    ))}
                </svg>
            </div>
            <div className="financial-pie__legend">
                {slices.map((slice, i) => (
                    <div key={i} className="financial-pie__legend-row">
                        <div className="financial-pie__legend-label">
                            <span className="financial-pie__swatch" style={{ backgroundColor: slice.color }}></span>
                            <span title={slice.label}>{slice.label}</span>
                        </div>
                        <span className="financial-pie__percent">{(slice.percent * 100).toFixed(1)}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const FinancialDashboard: React.FC<FinancialDashboardProps> = ({ 
    data, 
    selectedYearProp, 
    selectedOuProp, 
    selectedTierProp, 
    selectedFundTypeProp 
}) => {
    const { currentUser } = useAuth();
    const canViewMatrix = currentUser?.role === 'Administrator' || currentUser?.role === 'Management';

    // Use props derived from parent DashboardsPage
    const selectedYear = selectedYearProp || new Date().getFullYear().toString();
    const selectedOu = selectedOuProp || (canViewMatrix ? 'All' : (currentUser?.operatingUnit || 'All'));
    const selectedTier = selectedTierProp || 'Tier 1';
    const selectedFundType = selectedFundTypeProp || 'Current';

    const dashboardFilters = useMemo<FinancialAggregationFilters>(() => ({
        year: selectedYear,
        operatingUnit: selectedOu,
        tier: selectedTier,
        fundType: selectedFundType,
    }), [selectedYear, selectedOu, selectedTier, selectedFundType]);

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

        const ipoToADMap: { [key: string]: string } = {};
        (data.ipos || []).forEach(ipo => {
            ipoToADMap[ipo.name] = ipo.ancestralDomainNo || 'Unspecified AD';
        });

        const addToProvince = (loc: string | undefined, ipoNames: string[] | undefined, alloc: number, obli: number, disb: number) => {
            const { province } = parseLocation(loc || '');
            const pKey = province || 'Unspecified';
            
            if (!provinceData[pKey]) {
                provinceData[pKey] = { alloc: 0, obli: 0, disb: 0, ancestralDomains: {} };
            }
            provinceData[pKey].alloc += alloc;
            provinceData[pKey].obli += obli;
            provinceData[pKey].disb += disb;

            const ipos = (ipoNames || []).filter(Boolean);
            if (ipos.length === 0) ipos.push('Unspecified IPO');
            const perIpoAlloc = alloc / (ipos.length || 1);
            const perIpoObli = obli / (ipos.length || 1);
            const perIpoDisb = disb / (ipos.length || 1);

            (ipos || []).forEach(ipo => {
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

        const lineItems = collectFinancialLineItems({
            subprojects: data.subprojects || [],
            activities: [...(data.trainings || []), ...(data.otherActivities || [])],
            officeReqs: data.officeReqs || [],
            staffingReqs: data.staffingReqs || [],
            otherProgramExpenses: data.otherProgramExpenses || [],
        }, dashboardFilters);

        lineItems.forEach(item => {
            components[item.component].target += item.alloc;
            components[item.component].obligation += item.obli;
            components[item.component].disbursement += item.disb;
            totalAllocation += item.alloc;
            totalObligation += item.obli;
            totalDisbursement += item.disb;

            if (item.targetMonth !== undefined) monthlyData[item.targetMonth].target += item.alloc;
            item.obligationByMonth.forEach((amount, monthIndex) => {
                monthlyData[monthIndex].obligation += amount;
            });
            item.disbursementByMonth.forEach((amount, monthIndex) => {
                monthlyData[monthIndex].disbursement += amount;
            });

            addToProvince(item.location, item.ipoNames, item.alloc, item.obli, item.disb);
        });

        return { components, provinceData, totalAllocation, totalObligation, totalDisbursement, monthlyData };
    }, [data, dashboardFilters]);

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

        const lineItems = collectFinancialLineItems({
            subprojects: data.subprojects || [],
            activities: [...(data.trainings || []), ...(data.otherActivities || [])],
            officeReqs: data.officeReqs || [],
            staffingReqs: data.staffingReqs || [],
            otherProgramExpenses: data.otherProgramExpenses || [],
        }, dashboardFilters);

        lineItems.forEach(item => {
            addToMatrix(item.operatingUnit || '', item.component, item.alloc, item.obli, item.disb);
        });

        return matrix;
    }, [data, dashboardFilters]);

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
            <div className="financial-component-card">
                <h5>{title}</h5>
                
                <div className="financial-progress-list">
                    <div className="financial-progress">
                        <div className="financial-progress__row">
                            <span>Target Allocation</span>
                            <strong>{formatCurrencyWhole(target)}</strong>
                        </div>
                        <div className="financial-progress__track">
                            <div className="financial-progress__bar financial-progress__bar--target" style={{ width: '100%' }}></div>
                        </div>
                    </div>

                    <div className="financial-progress">
                        <div className="financial-progress__row">
                            <span>Actual Obligation ({obliPercent.toFixed(1)}%)</span>
                            <strong>{formatCurrencyWhole(obligation)}</strong>
                        </div>
                        <div className="financial-progress__track">
                            <div className="financial-progress__bar financial-progress__bar--obligation" style={{ width: `${Math.min(obliPercent, 100)}%` }}></div>
                        </div>
                    </div>

                    <div className="financial-progress">
                        <div className="financial-progress__row">
                            <span>Actual Disbursement ({disbPercent.toFixed(1)}%)</span>
                            <strong>{formatCurrencyWhole(disbursement)}</strong>
                        </div>
                        <div className="financial-progress__track">
                            <div className="financial-progress__bar financial-progress__bar--disbursement" style={{ width: `${Math.min(disbPercent, 100)}%` }}></div>
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
            if (isExpanded) return <div className="financial-hierarchy__subitems-note">Showing sub-items...</div>;

            const allocWidth = (alloc / maxVal) * 100;
            const obliWidth = (obli / maxVal) * 100;
            const disbWidth = (disb / maxVal) * 100;

            return (
                <>
                    <div className="financial-hierarchy__value">
                        <div>{formatCurrencyWhole(alloc)}</div>
                        <div className="financial-hierarchy__track">
                            <span className="financial-hierarchy__bar financial-hierarchy__bar--allocation" style={{ width: `${allocWidth}%` }}></span>
                        </div>
                    </div>
                    <div className="financial-hierarchy__value">
                        <div>{formatCurrencyWhole(obli)}</div>
                        <div className="financial-hierarchy__track">
                            <span className="financial-hierarchy__bar financial-hierarchy__bar--obligation" style={{ width: `${obliWidth}%` }}></span>
                        </div>
                    </div>
                    <div className="financial-hierarchy__value">
                        <div>{formatCurrencyWhole(disb)}</div>
                        <div className="financial-hierarchy__track">
                            <span className="financial-hierarchy__bar financial-hierarchy__bar--disbursement" style={{ width: `${disbWidth}%` }}></span>
                        </div>
                    </div>
                </>
            );
        };

        return (
            <div className="financial-hierarchy">
                {/* Table Header */}
                <div className="financial-hierarchy__row financial-hierarchy__row--header">
                    <div>Location Hierarchy</div>
                    <div className="text-right">Allocation</div>
                    <div className="text-right">Obligation</div>
                    <div className="text-right">Disbursement</div>
                </div>

                <div className="financial-hierarchy__body">
                    {Object.entries(provinceData)
                        .sort(([nameA, a], [nameB, b]) => {
                            if (nameA === 'Unspecified') return 1;
                            if (nameB === 'Unspecified') return -1;
                            return (b as any).alloc - (a as any).alloc;
                        })
                        .map(([province, pData]: [string, any]) => {
                            const isExpanded = expandedProvinces.has(province);
                            return (
                                <div key={province} className="financial-hierarchy__group">
                                    {/* Province Row */}
                                    <div 
                                        className="financial-hierarchy__row financial-hierarchy__row--province"
                                        onClick={() => toggleProvince(province)}
                                    >
                                        <div className="financial-hierarchy__label">
                                            <div className="financial-hierarchy__toggle">
                                                {isExpanded ? '-' : '+'}
                                            </div>
                                            <span>{province}</span>
                                        </div>
                                        {renderDataColumns(pData.alloc, pData.obli, pData.disb, isExpanded)}
                                    </div>

                                    {/* Ancestral Domains Hierarchy */}
                                    {isExpanded && (
                                        <div className="financial-hierarchy__children">
                                            {Object.entries(pData.ancestralDomains)
                                                .sort(([, a]: [any, any], [, b]: [any, any]) => b.alloc - a.alloc)
                                                .map(([ad, adData]: [string, any]) => {
                                                    const adKey = `${province}-${ad}`;
                                                    const isADExpanded = expandedADs.has(adKey);
                                                    return (
                                                        <div key={ad} className="financial-hierarchy__group">
                                                            {/* AD Row */}
                                                            <div 
                                                                className="financial-hierarchy__row financial-hierarchy__row--ad"
                                                                onClick={() => toggleAD(adKey)}
                                                            >
                                                                <div className="financial-hierarchy__label">
                                                                    <div className="financial-hierarchy__toggle financial-hierarchy__toggle--small">
                                                                        {isADExpanded ? '-' : '+'}
                                                                    </div>
                                                                    <span>{ad}</span>
                                                                </div>
                                                                {renderDataColumns(adData.alloc, adData.obli, adData.disb, isADExpanded)}
                                                            </div>

                                                            {/* IPOs Hierarchy */}
                                                            {isADExpanded && (
                                                                <div className="financial-hierarchy__children financial-hierarchy__children--ipo">
                                                                    {Object.entries(adData.ipos)
                                                                        .sort(([, a]: [any, any], [, b]: [any, any]) => b.alloc - a.alloc)
                                                                        .map(([ipo, ipoData]: [string, any]) => (
                                                                            <div 
                                                                                key={ipo}
                                                                                className="financial-hierarchy__row financial-hierarchy__row--ipo"
                                                                            >
                                                                                <div className="financial-hierarchy__ipo-name">
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
            <div className="financial-monthly-chart">
                <svg viewBox={`0 0 ${width} ${height}`} className="financial-monthly-chart__svg" preserveAspectRatio="xMidYMid meet">
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
                <div className="dashboard-chart-legend">
                    <div className="dashboard-chart-legend__item"><span className="dashboard-chart-swatch bg-green-300"></span> Target</div>
                    <div className="dashboard-chart-legend__item"><span className="dashboard-chart-swatch bg-green-500"></span> Obligation</div>
                    <div className="dashboard-chart-legend__item"><span className="dashboard-chart-swatch bg-green-700"></span> Disbursement</div>
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
            <div className="report-card financial-matrix-card">
                <h4 className="report-card__title financial-matrix-card__title">{title}</h4>
                <div className="data-table-scroll">
                <table className="data-table financial-matrix-table">
                    <thead>
                        <tr>
                            <th>Operating Unit</th>
                            {headers.map(h => <th key={h} className="text-right">{h}</th>)}
                            <th className="text-right">Grand Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {operatingUnits.map(ou => {
                            const rowTotal = headers.reduce((sum, h) => sum + (matrixData[ou]?.[h]?.[metricKey] || 0), 0);
                            return (
                                <tr key={ou}>
                                    <td className="font-medium">{ou}</td>
                                    {headers.map(h => (
                                        <td key={h} className="text-right">
                                            {formatCurrencyWhole(matrixData[ou]?.[h]?.[metricKey] || 0)}
                                        </td>
                                    ))}
                                    <td className="text-right font-bold">{formatCurrencyWhole(rowTotal)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td>TOTAL</td>
                            {headers.map(h => (
                                <td key={h} className="text-right">{formatCurrencyWhole(columnTotals[h])}</td>
                            ))}
                            <td className="text-right">{formatCurrencyWhole(grandTotal)}</td>
                        </tr>
                    </tfoot>
                </table>
                </div>
            </div>
        );
    };

    return (
        <div className="financial-dashboard dashboard-view animate-fadeIn">
            {/* Action Bar */}
            <div className="report-card financial-action-card print-hidden">
                <div className="report-card__header">
                    <h1 className="report-card__title financial-action-card__title">Financial Performance</h1>
                    <button 
                        type="button"
                        onClick={handleExportPPTX}
                        className="btn btn-primary btn-responsive"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="btn-symbol" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        <span className="btn-text">Download Report</span>
                    </button>
                </div>
            </div>

            <section className="dashboard-section" aria-labelledby="budget-utilization">
                <h3 id="budget-utilization" className="dashboard-section__title">Budget Utilization</h3>
                <div className="financial-summary-grid">
                    <div className="financial-summary-card financial-summary-card--allocation">
                        <div className="financial-summary-card__header">
                            <div className="financial-summary-card__icon"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                            <h4>Budget Allocation</h4>
                        </div>
                        <p className="financial-summary-card__value" title={formatCurrencyWhole(totalAllocation)}>{formatCurrencyWhole(totalAllocation)}</p>
                        <p className="financial-summary-card__meta">Total Target</p>
                    </div>

                    <div className="financial-summary-card financial-summary-card--obligation">
                        <div className="financial-summary-card__header">
                            <div className="financial-summary-card__icon"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                            <h4>Total Obligation</h4>
                        </div>
                        <p className="financial-summary-card__value" title={formatCurrencyWhole(totalObligation)}>{formatCurrencyWhole(totalObligation)}</p>
                        <div className="financial-summary-card__footer">
                            <p>Actual Obligated</p>
                            <span>
                                {totalAllocation > 0 ? Math.round((totalObligation / totalAllocation) * 100) : 0}% Utilized
                            </span>
                        </div>
                    </div>

                    <div className="financial-summary-card financial-summary-card--disbursement">
                        <div className="financial-summary-card__header">
                            <div className="financial-summary-card__icon"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg></div>
                            <h4>Total Disbursement</h4>
                        </div>
                        <p className="financial-summary-card__value" title={formatCurrencyWhole(totalDisbursement)}>{formatCurrencyWhole(totalDisbursement)}</p>
                        <div className="financial-summary-card__footer">
                            <p>Actual Disbursed</p>
                            <span>
                                {totalObligation > 0 ? Math.round((totalDisbursement / totalObligation) * 100) : 0}% of Obli.
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            <section className="dashboard-section" aria-labelledby="component-distribution">
                <h3 id="component-distribution" className="dashboard-section__title">Budget Distribution by Component</h3>
                <div className="dashboard-card-grid dashboard-card-grid--three">
                    <div className="dashboard-chart-card financial-pie-card">
                        <h4 className="dashboard-chart-title">Allocation (Target)</h4>
                        <SimplePieChart data={getPieData('target')} />
                    </div>
                    <div className="dashboard-chart-card financial-pie-card">
                        <h4 className="dashboard-chart-title">Actual Obligation</h4>
                        <SimplePieChart data={getPieData('obligation')} />
                    </div>
                    <div className="dashboard-chart-card financial-pie-card">
                        <h4 className="dashboard-chart-title">Actual Disbursement</h4>
                        <SimplePieChart data={getPieData('disbursement')} />
                    </div>
                </div>
            </section>

            <section className="dashboard-section" aria-labelledby="budget-breakdown">
                <h3 id="budget-breakdown" className="dashboard-section__title">Budget Performance by Component</h3>
                <div className="financial-component-grid">
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

            <section className="dashboard-section" aria-labelledby="province-breakdown">
                <h3 id="province-breakdown" className="dashboard-section__title">Allocation per Province, Ancestral Domains, IPOs</h3>
                <p className="dashboard-section__note">Hierarchical breakdown of financial performance. Expand provinces and ancestral domains to see detailed allocations, obligations, and disbursements.</p>
                <div className="dashboard-chart-card financial-hierarchy-card custom-scrollbar">
                    <HierarchicalProvinceChart />
                </div>
            </section>

            <section className="dashboard-section" aria-labelledby="monthly-breakdown">
                <h3 id="monthly-breakdown" className="dashboard-section__title">Monthly Financial Performance</h3>
                <div className="dashboard-chart-card financial-monthly-card">
                    <MonthlyChart />
                </div>
            </section>

            {canViewMatrix && (
                <section className="dashboard-section" aria-labelledby="financial-matrices">
                    <h3 id="financial-matrices" className="dashboard-section__title">Detailed Financial Matrix by Operating Unit</h3>
                    <div className="financial-matrix-stack">
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
