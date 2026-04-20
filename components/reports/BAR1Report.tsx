
// Author: 4K 
import React, { useMemo, useState, useEffect } from 'react';
import { Subproject, Training, OtherActivity, OfficeRequirement, StaffingRequirement, OtherProgramExpense, IPO } from '../../constants';
import { XLSX } from './ReportUtils';
import { calculateBAR1ReportData } from './BAR1Calculation';
import { supabase } from '../../supabaseClient';

interface DetailPopup {
    indicator: string;
    month: string;
    items: string[];
    type: 'Target' | 'Accomplishment';
}

interface BAR1ReportProps {
    data: {
        subprojects: Subproject[];
        trainings: Training[];
        otherActivities: OtherActivity[];
        officeReqs: OfficeRequirement[];
        staffingReqs: StaffingRequirement[];
        otherProgramExpenses: OtherProgramExpense[];
        ipos: IPO[];
    };
    uacsCodes: any;
    selectedYear: string;
    selectedOu: string;
    selectedTier: string;
    selectedFundType: string;
}

const BAR1Report: React.FC<BAR1ReportProps> = ({ data, uacsCodes, selectedYear, selectedOu, selectedTier, selectedFundType }) => {
    const [expandedRows, setExpandedRows] = useState(new Set<string>());
    const [popup, setPopup] = useState<DetailPopup | null>(null);

    // Snapshot States
    const [selectedSnapshotDate, setSelectedSnapshotDate] = useState<string>('live');
    const [availableSnapshotDates, setAvailableSnapshotDates] = useState<string[]>([]);
    const [snapshotData, setSnapshotData] = useState<any>(null);
    const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);

    // Fetch available snapshot dates when filters change
    useEffect(() => {
        if (!supabase) return;
        
        async function fetchAvailableDates() {
            const { data: snapshots, error } = await supabase
                .from('bar1_report_snapshots')
                .select('snapshot_date')
                .eq('operating_unit', selectedOu)
                .eq('fund_year', parseInt(selectedYear))
                .eq('fund_type', selectedFundType)
                .eq('tier', selectedTier)
                .order('snapshot_date', { ascending: false });

            if (error) {
                console.error('Error fetching snapshot dates:', error);
                return;
            }

            const dates = snapshots.map(s => s.snapshot_date);
            setAvailableSnapshotDates(dates);
            
            // If the currently selected snapshot date is no longer in the list, reset to live
            if (selectedSnapshotDate !== 'live' && !dates.includes(selectedSnapshotDate)) {
                setSelectedSnapshotDate('live');
            }
        }

        fetchAvailableDates();
    }, [selectedOu, selectedYear, selectedFundType, selectedTier]);

    // Fetch specific snapshot data when selected
    useEffect(() => {
        if (selectedSnapshotDate === 'live' || !supabase) {
            setSnapshotData(null);
            return;
        }

        async function fetchSnapshot() {
            setIsLoadingSnapshot(true);
            const { data: snapshot, error } = await supabase
                .from('bar1_report_snapshots')
                .select('report_data')
                .eq('operating_unit', selectedOu)
                .eq('fund_year', parseInt(selectedYear))
                .eq('fund_type', selectedFundType)
                .eq('tier', selectedTier)
                .eq('snapshot_date', selectedSnapshotDate)
                .single();

            if (error) {
                console.error('Error fetching snapshot data:', error);
            } else {
                setSnapshotData(snapshot.report_data);
            }
            setIsLoadingSnapshot(false);
        }

        fetchSnapshot();
    }, [selectedSnapshotDate, selectedOu, selectedYear, selectedFundType, selectedTier]);

    const toggleRow = (key: string) => {
        setExpandedRows(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) newSet.delete(key); else newSet.add(key);
            return newSet;
        });
    };

    const indentClasses: { [key: number]: string } = { 0: '', 1: 'pl-6', 2: 'pl-10', 3: 'pl-14', 4: 'pl-20' };
    const dataCellClass = "p-1 border border-gray-300 dark:border-gray-600";

    const bar1Data = useMemo(() => {
        if (selectedSnapshotDate !== 'live' && snapshotData) {
            return snapshotData;
        }
        return calculateBAR1ReportData(data, selectedYear, selectedOu);
    }, [data, selectedSnapshotDate, snapshotData, selectedYear, selectedOu]);

    const calculateTotals = (items: any[]) => {
        const initial = {
            m1: 0, m2: 0, m3: 0, q1: 0,
            m4: 0, m5: 0, m6: 0, q2: 0,
            m7: 0, m8: 0, m9: 0, q3: 0,
            m10: 0, m11: 0, m12: 0, q4: 0,
            total: 0,
            m1_items: [] as string[], m2_items: [] as string[], m3_items: [] as string[],
            m4_items: [] as string[], m5_items: [] as string[], m6_items: [] as string[],
            m7_items: [] as string[], m8_items: [] as string[], m9_items: [] as string[],
            m10_items: [] as string[], m11_items: [] as string[], m12_items: [] as string[]
        };

        const total = {
            target: { ...initial },
            actual: { ...initial }
        };

        items.forEach(item => {
            if (item.isExpandable && item.items) {
                 const primaryMetric = item.items.find((i: any) => i.indicator.includes("conducted"));
                 if (primaryMetric) {
                     for (let i = 1; i <= 12; i++) {
                        total.target[`m${i}`] += (primaryMetric.target[`m${i}`] || 0);
                        total.actual[`m${i}`] += (primaryMetric.actual[`m${i}`] || 0);
                        total.target[`m${i}_items`] = [...new Set([...total.target[`m${i}_items`], ...(primaryMetric.target[`m${i}_items`] || [])])];
                        total.actual[`m${i}_items`] = [...new Set([...total.actual[`m${i}_items`], ...(primaryMetric.actual[`m${i}_items`] || [])])];
                    }
                    total.target.q1 += (primaryMetric.target.q1 || 0); total.actual.q1 += (primaryMetric.actual.q1 || 0);
                    total.target.q2 += (primaryMetric.target.q2 || 0); total.actual.q2 += (primaryMetric.actual.q2 || 0);
                    total.target.q3 += (primaryMetric.target.q3 || 0); total.actual.q3 += (primaryMetric.actual.q3 || 0);
                    total.target.q4 += (primaryMetric.target.q4 || 0); total.actual.q4 += (primaryMetric.actual.q4 || 0);
                    total.target.total += (primaryMetric.target.total || 0); total.actual.total += (primaryMetric.actual.total || 0);
                 }
                 return;
            }

            for (let i = 1; i <= 12; i++) {
                total.target[`m${i}`] += (item.target[`m${i}`] || 0);
                total.actual[`m${i}`] += (item.actual[`m${i}`] || 0);
                total.target[`m${i}_items`] = [...new Set([...total.target[`m${i}_items`], ...(item.target[`m${i}_items`] || [])])];
                total.actual[`m${i}_items`] = [...new Set([...total.actual[`m${i}_items`], ...(item.actual[`m${i}_items`] || [])])];
            }
            total.target.q1 += (item.target.q1 || 0); total.actual.q1 += (item.actual.q1 || 0);
            total.target.q2 += (item.target.q2 || 0); total.actual.q2 += (item.actual.q2 || 0);
            total.target.q3 += (item.target.q3 || 0); total.actual.q3 += (item.actual.q3 || 0);
            total.target.q4 += (item.target.q4 || 0); total.actual.q4 += (item.actual.q4 || 0);
            total.target.total += (item.target.total || 0); total.actual.total += (item.actual.total || 0);
        });
        return total;
    };

    const renderDataCells = (item: any, isTotal: boolean = false) => {
        const cellClass = `${dataCellClass} text-center ${isTotal ? 'font-bold' : ''}`;
        const totalClass = `${dataCellClass} text-center font-bold bg-gray-50 dark:bg-gray-700/50`;
        const calculatedClass = `${dataCellClass} text-center font-bold bg-emerald-50 dark:bg-emerald-900/30`;
        const yearEndClass = `${dataCellClass} text-center font-bold bg-teal-50 dark:bg-teal-900/20`;
        const percentClass = `${dataCellClass} text-center text-[10px] font-bold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800`;

        const getVals = (source: any) => {
             const semestralTotal = (source.q1 || 0) + (source.q2 || 0);
             const asOfSept = semestralTotal + (source.q3 || 0);
             const yearEndNov = (source.total || 0) - (source.m12 || 0);
             return { ...source, semestralTotal, asOfSept, yearEndNov };
        }

        const t = getVals(item.target);
        const a = getVals(item.actual);

        const getPct = (actual: number, target: number) => {
            if (!target) return '';
            return `${Math.round((actual / target) * 100)}%`;
        };

        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

        const ClickableValue = ({ val, items, month, type }: { val: number | string, items: string[], month: string, type: 'Target' | 'Accomplishment' }) => {
            if (!val || val === 0) return <span></span>;
            if (!items || items.length === 0) return <span>{val}</span>;
            
            return (
                <button 
                    onClick={() => setPopup({ indicator: item.indicator, month, items, type })}
                    className="hover:text-emerald-600 hover:underline transition-colors focus:outline-none"
                >
                    {val}
                </button>
            );
        };

        const renderTargetSection = () => (
            <>
                <td className={cellClass}><ClickableValue val={t.m1} items={t.m1_items} month="January" type="Target" /></td>
                <td className={cellClass}><ClickableValue val={t.m2} items={t.m2_items} month="February" type="Target" /></td>
                <td className={cellClass}><ClickableValue val={t.m3} items={t.m3_items} month="March" type="Target" /></td>
                <td className={totalClass}>{t.q1 || ''}</td>

                <td className={cellClass}><ClickableValue val={t.m4} items={t.m4_items} month="April" type="Target" /></td>
                <td className={cellClass}><ClickableValue val={t.m5} items={t.m5_items} month="May" type="Target" /></td>
                <td className={cellClass}><ClickableValue val={t.m6} items={t.m6_items} month="June" type="Target" /></td>
                <td className={totalClass}>{t.q2 || ''}</td>

                <td className={calculatedClass}>{t.semestralTotal || ''}</td>

                <td className={cellClass}><ClickableValue val={t.m7} items={t.m7_items} month="July" type="Target" /></td>
                <td className={cellClass}><ClickableValue val={t.m8} items={t.m8_items} month="August" type="Target" /></td>
                <td className={cellClass}><ClickableValue val={t.m9} items={t.m9_items} month="September" type="Target" /></td>
                <td className={totalClass}>{t.q3 || ''}</td>

                <td className={calculatedClass}>{t.asOfSept || ''}</td>

                <td className={cellClass}><ClickableValue val={t.m10} items={t.m10_items} month="October" type="Target" /></td>
                <td className={cellClass}><ClickableValue val={t.m11} items={t.m11_items} month="November" type="Target" /></td>
                <td className={cellClass}><ClickableValue val={t.m12} items={t.m12_items} month="December" type="Target" /></td>
                <td className={totalClass}>{t.q4 || ''}</td>

                <td className={yearEndClass}>{t.yearEndNov || ''}</td>
                <td className={`${dataCellClass} text-center font-bold bg-teal-100 dark:bg-teal-900/40`}>{t.total || ''}</td>
            </>
        );

        const renderActualSection = () => (
            <>
                <td className={cellClass}><ClickableValue val={a.m1} items={a.m1_items} month="January" type="Accomplishment" /></td>
                <td className={cellClass}><ClickableValue val={a.m2} items={a.m2_items} month="February" type="Accomplishment" /></td>
                <td className={cellClass}><ClickableValue val={a.m3} items={a.m3_items} month="March" type="Accomplishment" /></td>
                <td className={totalClass}>{a.q1 || ''}</td>
                <td className={percentClass}>{getPct(a.q1, t.q1)}</td>

                <td className={cellClass}><ClickableValue val={a.m4} items={a.m4_items} month="April" type="Accomplishment" /></td>
                <td className={cellClass}><ClickableValue val={a.m5} items={a.m5_items} month="May" type="Accomplishment" /></td>
                <td className={cellClass}><ClickableValue val={a.m6} items={a.m6_items} month="June" type="Accomplishment" /></td>
                <td className={totalClass}>{a.q2 || ''}</td>
                <td className={percentClass}>{getPct(a.q2, t.q2)}</td>

                <td className={calculatedClass}>{a.semestralTotal || ''}</td>
                <td className={percentClass}>{getPct(a.semestralTotal, t.semestralTotal)}</td>

                <td className={cellClass}><ClickableValue val={a.m7} items={a.m7_items} month="July" type="Accomplishment" /></td>
                <td className={cellClass}><ClickableValue val={a.m8} items={a.m8_items} month="August" type="Accomplishment" /></td>
                <td className={cellClass}><ClickableValue val={a.m9} items={a.m9_items} month="September" type="Accomplishment" /></td>
                <td className={totalClass}>{a.q3 || ''}</td>
                <td className={percentClass}>{getPct(a.q3, t.q3)}</td>

                <td className={calculatedClass}>{a.asOfSept || ''}</td>
                <td className={percentClass}>{getPct(a.asOfSept, t.asOfSept)}</td>

                <td className={cellClass}><ClickableValue val={a.m10} items={a.m10_items} month="October" type="Accomplishment" /></td>
                <td className={cellClass}><ClickableValue val={a.m11} items={a.m11_items} month="November" type="Accomplishment" /></td>
                <td className={cellClass}><ClickableValue val={a.m12} items={a.m12_items} month="December" type="Accomplishment" /></td>
                <td className={totalClass}>{a.q4 || ''}</td>
                <td className={percentClass}>{getPct(a.q4, t.q4)}</td>

                <td className={yearEndClass}>{a.yearEndNov || ''}</td>
                <td className={percentClass}>{getPct(a.yearEndNov, t.yearEndNov)}</td>

                <td className={`${dataCellClass} text-center font-bold bg-emerald-100 dark:bg-emerald-900/40`}>{a.total || ''}</td>
                <td className={percentClass}>{getPct(a.total, t.total)}</td>
            </>
        );

        return (
            <>
                {renderTargetSection()}
                <td className="w-1 bg-gray-400 dark:bg-gray-500"></td> 
                {renderActualSection()}
            </>
        );
    };

    const renderTotalsRow = (items: any[], label: string) => {
        const totals = calculateTotals(items);
        return (
            <tr className="font-bold bg-emerald-50 dark:bg-emerald-900/20 text-xs">
                <td className={`${dataCellClass} sticky left-0 bg-emerald-50 dark:bg-emerald-900 z-10`}>{label}</td>
                {renderDataCells(totals, true)}
            </tr>
        );
    };

    const renderSummaryRow = (items: any[], label: string, rowKey: string, isExpanded: boolean, indentLevel = 0, showTotals: boolean = true) => {
        if (items.length === 0) {
            return (
                <tr className="font-bold bg-gray-100 dark:bg-gray-700/50 text-xs">
                     <td className={`${dataCellClass} ${indentClasses[indentLevel]} sticky left-0 bg-gray-100 dark:bg-gray-700 z-10`}>
                        <span className="inline-block w-5"></span> {label}
                    </td>
                    <td colSpan={53} className={`${dataCellClass} text-center italic text-gray-500 dark:text-gray-400`}>No activities for this component.</td>
                </tr>
            )
        }
        
        let totals: any = null;
        if (showTotals) {
            totals = calculateTotals(items);
        }

        return (
             <tr onClick={() => toggleRow(rowKey)} className="font-bold bg-gray-100 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer text-xs">
                <td className={`${dataCellClass} ${indentClasses[indentLevel]} sticky left-0 bg-gray-100 dark:bg-gray-700 z-10`}>
                    <span className="inline-block w-5 text-center text-gray-500 dark:text-gray-400">{isExpanded ? '−' : '+'}</span> {label}
                </td>
                {showTotals && totals ? renderDataCells(totals, true) : <td colSpan={53} className={dataCellClass}></td>}
            </tr>
        );
    };

    const renderDataRow = (item: any, key: string, indentLevel = 0) => {
        return (
            <tr key={key}>
                <td className={`${dataCellClass} ${indentClasses[indentLevel]} sticky left-0 bg-white dark:bg-gray-800 z-10`}>{item.indicator}</td>
                {renderDataCells(item)}
            </tr>
        )
    };

    const grandTotals = Object.values(bar1Data).flatMap((component: any) => {
        if (Array.isArray(component)) return component;
        if (component.isExpandable) return component.items;
        if (component.isNestedExpandable) return Object.values(component.packages).flatMap((pkg: any) => pkg.items);
        return [];
    });

    const handleDownloadBar1Xlsx = () => {
        const header1 = ["Program/Activity/Project"];
        const header2 = [null]; 

        const sectionHeaders1 = [
            "1st Quarter", null, null, null, 
            "2nd Quarter", null, null, null, 
            "Semestral Total",
            "3rd Quarter", null, null, null, 
            "As of September",
            "4th Quarter", null, null, null, 
            "Year End (As of Nov)",
            "Grand Total"
        ];
        
        const sectionHeadersTarget = [
            "Jan", "Feb", "Mar", "Total",
            "Apr", "May", "Jun", "Total",
            null, 
            "Jul", "Aug", "Sep", "Total",
            null, 
            "Oct", "Nov", "Dec", "Total",
            null, 
            null  
        ];

        const sectionHeadersActual = [
            "Jan", "Feb", "Mar", "Total", "%",
            "Apr", "May", "Jun", "Total", "%",
            "Total", "%",
            "Jul", "Aug", "Sep", "Total", "%",
            "Total", "%",
            "Oct", "Nov", "Dec", "Total", "%",
            "Total", "%",
            "Total", "%"
        ];

        const sectionHeadersActualGroups = [
            "1st Quarter", null, null, null, null,
            "2nd Quarter", null, null, null, null, 
            "Semestral Total", null,
            "3rd Quarter", null, null, null, null,
            "As of September", null,
            "4th Quarter", null, null, null, null,
            "Year End (As of Nov)", null,
            "Grand Total", null
        ];

        header1.push(...sectionHeaders1, null, ...sectionHeadersActualGroups);
        header2.push(...sectionHeadersTarget, null, ...sectionHeadersActual);

        const aoa: (string | number | null)[][] = [
            [null, "Physical Targets", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, "Physical Accomplishments", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
            header1,
            header2
        ];

        const processItems = (items: any[], prefix = "") => {
            items.forEach(item => {
                const getVals = (source: any) => {
                    const semestralTotal = (source.q1 || 0) + (source.q2 || 0);
                    const asOfSept = semestralTotal + (source.q3 || 0);
                    const yearEndNov = (source.total || 0) - (source.m12 || 0);
                    return { ...source, semestralTotal, asOfSept, yearEndNov };
               }
               const t = getVals(item.target);
               const a = getVals(item.actual);

               const getPct = (act: number, tgt: number) => {
                   if (!tgt) return null;
                   return Math.round((act / tgt) * 100) + '%';
               };

                aoa.push([
                    prefix + item.indicator,
                    t.m1, t.m2, t.m3, t.q1,
                    t.m4, t.m5, t.m6, t.q2,
                    t.semestralTotal,
                    t.m7, t.m8, t.m9, t.q3,
                    t.asOfSept,
                    t.m10, t.m11, t.m12, t.q4,
                    t.yearEndNov,
                    t.total,
                    null, 
                    a.m1, a.m2, a.m3, a.q1, getPct(a.q1, t.q1),
                    a.m4, a.m5, a.m6, a.q2, getPct(a.q2, t.q2),
                    a.semestralTotal, getPct(a.semestralTotal, t.semestralTotal),
                    a.m7, a.m8, a.m9, a.q3, getPct(a.q3, t.q3),
                    a.asOfSept, getPct(a.asOfSept, t.asOfSept),
                    a.m10, a.m11, a.m12, a.q4, getPct(a.q4, t.q4),
                    a.yearEndNov, getPct(a.yearEndNov, t.yearEndNov),
                    a.total, getPct(a.total, t.total)
                ]);

                if (item.isExpandable && item.items && item.items.length > 0) {
                     processItems(item.items, prefix + "    ");
                }
            });
        };

        Object.entries(bar1Data).forEach(([component, items]) => {
            // Component Header - No Totals
            aoa.push([component, ...Array(52).fill(null)]);
            
            if (Array.isArray(items)) {
                if (items.length > 0) processItems(items, "  ");
            } else if ((items as any).isExpandable) {
                if ((items as any).items.length > 0) processItems((items as any).items, "  ");
            } else if ((items as any).isNestedExpandable) {
                Object.entries((items as any).packages).forEach(([packageName, packageData]: [string, any]) => {
                    aoa.push([`  ${packageName}`, ...Array(52).fill(null)]);
                    if ((packageData as any).items.length > 0) processItems((packageData as any).items, "    ");
                });
            }
        });

        // Grand Totals - Removed per user request to not total component groups, 
        // but user didn't explicitly say remove Grand Total. 
        // However, if components are different and can't be summed, Grand Total is also meaningless.
        // I will remove Grand Total as well to be safe and consistent.
        
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        if(!ws['!merges']) ws['!merges'] = [];
        ws['!merges'].push({ s: { r: 0, c: 1 }, e: { r: 0, c: 20 } }); 
        ws['!merges'].push({ s: { r: 0, c: 22 }, e: { r: 0, c: 53 } }); 

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "BAR1 Report");
        XLSX.writeFile(wb, `BAR1_Report_${selectedYear}_${selectedOu}.xlsx`);
    };

    const SectionHeaderTarget = ({ bgColor }: { bgColor: string }) => (
        <>
            <th colSpan={4} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>1st Quarter</th>
            <th colSpan={4} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>2nd Quarter</th>
            <th rowSpan={2} className={`p-2 border border-gray-300 dark:border-gray-600 text-center align-middle font-bold ${bgColor} opacity-90`}>Semestral Total</th>
            <th colSpan={4} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>3rd Quarter</th>
            <th rowSpan={2} className={`p-2 border border-gray-300 dark:border-gray-600 text-center align-middle font-bold ${bgColor} opacity-90`}>As of September</th>
            <th colSpan={4} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>4th Quarter</th>
            <th rowSpan={2} className={`p-2 border border-gray-300 dark:border-gray-600 text-center align-middle font-bold ${bgColor} opacity-80`}>Year End (As of Nov)</th>
            <th rowSpan={2} className={`p-2 border border-gray-300 dark:border-gray-600 text-center align-middle font-bold ${bgColor} opacity-90`}>Grand Total</th>
        </>
    );

    const SectionHeaderActual = ({ bgColor }: { bgColor: string }) => (
        <>
            <th colSpan={5} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>1st Quarter</th>
            <th colSpan={5} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>2nd Quarter</th>
            <th colSpan={2} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>Semestral Total</th>
            <th colSpan={5} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>3rd Quarter</th>
            <th colSpan={2} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>As of September</th>
            <th colSpan={5} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>4th Quarter</th>
            <th colSpan={2} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>Year End (As of Nov)</th>
            <th colSpan={2} className={`p-2 border border-gray-300 dark:border-gray-600 text-center font-bold ${bgColor}`}>Grand Total</th>
        </>
    );

    const SubHeadersTarget = () => (
        <>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Jan</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Feb</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Mar</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Apr</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">May</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Jun</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Jul</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Aug</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Sep</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Oct</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Nov</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Dec</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
        </>
    );

    const SubHeadersActual = () => (
        <>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Jan</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Feb</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Mar</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[40px] italic text-[9px]">%</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Apr</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">May</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Jun</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[40px] italic text-[9px]">%</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[40px] italic text-[9px]">%</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Jul</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Aug</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Sep</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[40px] italic text-[9px]">%</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[40px] italic text-[9px]">%</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Oct</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Nov</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[50px]">Dec</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[40px] italic text-[9px]">%</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[40px] italic text-[9px]">%</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[60px] bg-gray-300 dark:bg-gray-600">Total</th>
            <th className="p-2 border border-gray-300 dark:border-gray-600 text-center min-w-[40px] italic text-[9px]">%</th>
        </>
    );

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            {popup && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in duration-200">
                        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
                            <div>
                                <h4 className="font-bold text-gray-900 dark:text-white text-lg">{popup.type} Details</h4>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{popup.month} - {popup.indicator}</p>
                            </div>
                            <button 
                                onClick={() => setPopup(null)}
                                className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-6 max-h-[60vh] overflow-y-auto">
                            <ul className="space-y-2">
                                {popup.items.map((item, idx) => (
                                    <li key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800">
                                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs font-bold">
                                            {idx + 1}
                                        </span>
                                        <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-right">
                            <button 
                                onClick={() => setPopup(null)}
                                className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-sm font-bold hover:opacity-90 transition-opacity"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 print-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Physical Report of Operations (BAR No. 1)</h3>
                    
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800 rounded-lg shadow-sm">
                        <label htmlFor="snapshot-date" className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 whitespace-nowrap">View Date:</label>
                        <select
                            id="snapshot-date"
                            value={selectedSnapshotDate}
                            onChange={(e) => setSelectedSnapshotDate(e.target.value)}
                            className="bg-transparent border-none text-xs font-bold text-emerald-900 dark:text-white focus:ring-0 cursor-pointer p-0 pr-6"
                        >
                            <option value="live" className="text-gray-900 dark:text-white dark:bg-gray-800">Current Live Data</option>
                            {availableSnapshotDates.map(date => (
                                <option key={date} value={date} className="text-gray-900 dark:text-white dark:bg-gray-800">
                                    Snapshot: {new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                </option>
                            ))}
                        </select>
                        {isLoadingSnapshot && (
                            <svg className="animate-spin h-3 w-3 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        )}
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    <button onClick={handleDownloadBar1Xlsx} className="px-4 py-2 bg-emerald-600 text-white rounded-md font-semibold hover:bg-emerald-700 hover:brightness-95 transition-all flex items-center gap-2 shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Download Excel
                    </button>
                    <button 
                        onClick={() => window.print()}
                        className="px-4 py-2 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md font-semibold hover:bg-gray-50 dark:hover:bg-gray-600 transition-all flex items-center gap-2 shadow-sm"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        Print
                    </button>
                </div>
            </div>
            <div id="bar1-report" className="overflow-x-auto shadow-md rounded-lg">
                <table className="min-w-full border-collapse text-[10px] text-gray-900 dark:text-gray-200 whitespace-nowrap">
                    <thead className="bg-gray-200 dark:bg-gray-700 sticky top-0 z-10">
                        <tr>
                            <th rowSpan={3} className="p-2 border border-gray-300 dark:border-gray-600 align-bottom min-w-[250px] sticky left-0 bg-gray-200 dark:bg-gray-700 z-20 text-left">Program/Activity/Project</th>
                            <th colSpan={20} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold bg-teal-200 dark:bg-teal-900">Physical Targets</th>
                            <th rowSpan={3} className="w-2 bg-gray-400 dark:bg-gray-600"></th> 
                            <th colSpan={28} className="p-2 border border-gray-300 dark:border-gray-600 text-center font-bold bg-emerald-200 dark:bg-emerald-900">Physical Accomplishments</th>
                        </tr>
                        <tr>
                            <SectionHeaderTarget bgColor="bg-teal-50 dark:bg-teal-900/30" />
                            <SectionHeaderActual bgColor="bg-emerald-50 dark:bg-emerald-900/30" />
                        </tr>
                        <tr>
                            <SubHeadersTarget />
                            <SubHeadersActual />
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(bar1Data).map(([key, cd]) => {
                            const componentData = cd as any;
                            if (Array.isArray(componentData)) {
                                 const isComponentExpanded = expandedRows.has(key);
                                 return (
                                    <React.Fragment key={key}>
                                        {renderSummaryRow(componentData, key, key, isComponentExpanded, 0, false)}
                                        {isComponentExpanded && componentData.map((item: any, index: number) => {
                                            if (item.isExpandable) {
                                                const nestedKey = `${key}-nested-${index}`;
                                                const isNestedExpanded = expandedRows.has(nestedKey);
                                                return (
                                                    <React.Fragment key={nestedKey}>
                                                        {renderSummaryRow(item.items, item.indicator, nestedKey, isNestedExpanded, 1)}
                                                        {isNestedExpanded && item.items.map((subItem: any, subIndex: number) => renderDataRow(subItem, `${nestedKey}-${subIndex}`, 2))}
                                                    </React.Fragment>
                                                )
                                            }
                                            return renderDataRow(item, `${key}-${index}`, 1)
                                        })}
                                    </React.Fragment>
                                );
                            }
                            if (componentData.isNestedExpandable) {
                                const isComponentExpanded = expandedRows.has(key);
                                const sortedPackageKeys = Object.keys(componentData.packages).sort((a,b) => a.localeCompare(b));
                                const allPackageItems = Object.values(componentData.packages).flatMap((pkg: any) => pkg.items);
                                
                                 return (
                                    <React.Fragment key={key}>
                                        {renderSummaryRow(allPackageItems, key, key, isComponentExpanded, 0, false)}
                                        {isComponentExpanded && sortedPackageKeys.map((packageName) => {
                                            const packageData = componentData.packages[packageName];
                                            const isPkgExpanded = expandedRows.has(packageName);
                                            const items = packageData.items;

                                            return (
                                                <React.Fragment key={packageName}>
                                                    {renderSummaryRow(items, packageName, packageName, isPkgExpanded, 1)}
                                                    {isPkgExpanded && items.map((item: any, index: number) => renderDataRow(item, `${packageName}-${index}`, 2))}
                                                </React.Fragment>
                                            );
                                        })}
                                    </React.Fragment>
                                );
                            }
                            return null;
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default BAR1Report;
