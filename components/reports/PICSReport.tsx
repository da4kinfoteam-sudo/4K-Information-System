// Author: 4K 
import React, { useMemo, useState } from 'react';
import { Subproject, Training, OtherActivity, IPO, ouToRegionMap } from '../../constants';
import { parseLocation } from '../LocationPicker';
import { XLSX } from './ReportUtils';

interface PICSReportProps {
    data: {
        subprojects: Subproject[];
        trainings: Training[];
        otherActivities: OtherActivity[];
        ipos: IPO[];
    };
    selectedYear: string;
    selectedOu: string;
}

const PICSReport: React.FC<PICSReportProps> = ({ data, selectedYear, selectedOu }) => {
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const toggle = (id: string) => {
        setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const picsData = useMemo(() => {
        const aggregator = new Map<string, any>();
        const getKey = (r:string, p:string, i:string) => `${r}|${p}|${i}`;
        const ipoMap = new Map(); 
        data.ipos.forEach(ipo => ipoMap.set(ipo.name, ipo));
        const adTracker = new Map();
        
        data.subprojects.forEach(sp => {
            const region = ouToRegionMap[sp.operatingUnit] || 'Unmapped Region'; 
            if (region === 'National Capital Region (NCR)') return;
            const { province } = parseLocation(sp.location); 
            const indicator = `${sp.packageType} Subprojects provided`; 
            const key = getKey(region, province || 'Unspecified', indicator);
            
            if (!aggregator.has(key)) aggregator.set(key, { region, province: province || 'Unspecified', indicator, totalTarget: 0, ipoNames: new Set(), maleTarget: 0, femaleTarget: 0, unidentifiedTarget: 0, totalParticipants: 0, tier1TotalTarget: 0, tier1IpoNames: new Set(), tier1MaleTarget: 0, tier1FemaleTarget: 0, tier1UnidentifiedTarget: 0, tier1TotalParticipants: 0, tier2TotalTarget: 0, tier2IpoNames: new Set(), tier2MaleTarget: 0, tier2FemaleTarget: 0, tier2UnidentifiedTarget: 0, tier2TotalParticipants: 0 });
            
            const entry = aggregator.get(key); 
            entry.totalTarget += 1; 
            entry.ipoNames.add(sp.indigenousPeopleOrganization);
            if (sp.tier === 'Tier 1') { entry.tier1TotalTarget += 1; entry.tier1IpoNames.add(sp.indigenousPeopleOrganization); } 
            else if (sp.tier === 'Tier 2') { entry.tier2TotalTarget += 1; entry.tier2IpoNames.add(sp.indigenousPeopleOrganization); }
            
            const ipo = ipoMap.get(sp.indigenousPeopleOrganization);
            if (ipo && ipo.ancestralDomainNo) { 
                const locKey = `${region}|${province || 'Unspecified'}`; 
                if (!adTracker.has(locKey)) adTracker.set(locKey, { all: new Set(), t1: new Set(), t2: new Set() }); 
                const tracker = adTracker.get(locKey); 
                tracker.all.add(ipo.ancestralDomainNo); 
                if (sp.tier === 'Tier 1') tracker.t1.add(ipo.ancestralDomainNo); 
                if (sp.tier === 'Tier 2') tracker.t2.add(ipo.ancestralDomainNo); 
            }
        });

        adTracker.forEach((tracker, locKey) => { 
            const [region, province] = locKey.split('|'); 
            const indicator = "Ancestral Domains covered"; 
            const key = getKey(region, province, indicator); 
            if (!aggregator.has(key)) aggregator.set(key, { region, province, indicator, totalTarget: 0, ipoNames: new Set(), maleTarget: 0, femaleTarget: 0, unidentifiedTarget: 0, totalParticipants: 0, tier1TotalTarget: 0, tier1IpoNames: new Set(), tier1MaleTarget: 0, tier1FemaleTarget: 0, tier1UnidentifiedTarget: 0, tier1TotalParticipants: 0, tier2TotalTarget: 0, tier2IpoNames: new Set(), tier2MaleTarget: 0, tier2FemaleTarget: 0, tier2UnidentifiedTarget: 0, tier2TotalParticipants: 0 }); 
            const entry = aggregator.get(key); 
            entry.totalTarget = tracker.all.size; 
            entry.tier1TotalTarget = tracker.t1.size; 
            entry.tier2TotalTarget = tracker.t2.size; 
        });

        data.trainings.forEach(activity => { 
            if (activity.component === 'Program Management') return; 
            const region = ouToRegionMap[activity.operatingUnit] || 'Unmapped Region'; 
            if (region === 'National Capital Region (NCR)') return; 
            const { province } = parseLocation(activity.location); 
            const indicator = `${activity.component} Trainings conducted`; 
            const key = getKey(region, province || 'Unspecified', indicator); 
            if (!aggregator.has(key)) aggregator.set(key, { region, province: province || 'Unspecified', indicator, totalTarget: 0, ipoNames: new Set(), maleTarget: 0, femaleTarget: 0, unidentifiedTarget: 0, totalParticipants: 0, tier1TotalTarget: 0, tier1IpoNames: new Set(), tier1MaleTarget: 0, tier1FemaleTarget: 0, tier1UnidentifiedTarget: 0, tier1TotalParticipants: 0, tier2TotalTarget: 0, tier2IpoNames: new Set(), tier2MaleTarget: 0, tier2FemaleTarget: 0, tier2UnidentifiedTarget: 0, tier2TotalParticipants: 0 }); 
            const entry = aggregator.get(key); 
            entry.totalTarget += 1; 
            activity.participatingIpos.forEach((ipo:any) => entry.ipoNames.add(ipo)); 
            entry.maleTarget += (activity.participantsMale || 0); 
            entry.femaleTarget += (activity.participantsFemale || 0); 
            entry.totalParticipants += (activity.participantsMale || 0) + (activity.participantsFemale || 0); 
            if (activity.tier === 'Tier 1') { entry.tier1TotalTarget += 1; activity.participatingIpos.forEach((ipo:any) => entry.tier1IpoNames.add(ipo)); entry.tier1MaleTarget += (activity.participantsMale || 0); entry.tier1FemaleTarget += (activity.participantsFemale || 0); entry.tier1TotalParticipants += (activity.participantsMale || 0) + (activity.participantsFemale || 0); } 
            else if (activity.tier === 'Tier 2') { entry.tier2TotalTarget += 1; activity.participatingIpos.forEach((ipo:any) => entry.tier2IpoNames.add(ipo)); entry.tier2MaleTarget += (activity.participantsMale || 0); entry.tier2FemaleTarget += (activity.participantsFemale || 0); entry.tier2TotalParticipants += (activity.participantsMale || 0) + (activity.participantsFemale || 0); } 
        });

        data.otherActivities.forEach(activity => { 
            if (activity.component === 'Program Management') return; 
            const region = ouToRegionMap[activity.operatingUnit] || 'Unmapped Region'; 
            if (region === 'National Capital Region (NCR)') return; 
            const { province } = parseLocation(activity.location); 
            const indicator = `${activity.name} conducted`; 
            const key = getKey(region, province || 'Unspecified', indicator); 
            if (!aggregator.has(key)) aggregator.set(key, { region, province: province || 'Unspecified', indicator, totalTarget: 0, ipoNames: new Set(), maleTarget: 0, femaleTarget: 0, unidentifiedTarget: 0, totalParticipants: 0, tier1TotalTarget: 0, tier1IpoNames: new Set(), tier1MaleTarget: 0, tier1FemaleTarget: 0, tier1UnidentifiedTarget: 0, tier1TotalParticipants: 0, tier2TotalTarget: 0, tier2IpoNames: new Set(), tier2MaleTarget: 0, tier2FemaleTarget: 0, tier2UnidentifiedTarget: 0, tier2TotalParticipants: 0 }); 
            const entry = aggregator.get(key); 
            entry.totalTarget += 1; 
            activity.participatingIpos.forEach((ipo:any) => entry.ipoNames.add(ipo)); 
            entry.maleTarget += (activity.participantsMale || 0); 
            entry.femaleTarget += (activity.participantsFemale || 0); 
            entry.totalParticipants += (activity.participantsMale || 0) + (activity.participantsFemale || 0); 
            if (activity.tier === 'Tier 1') { entry.tier1TotalTarget += 1; activity.participatingIpos.forEach((ipo:any) => entry.tier1IpoNames.add(ipo)); entry.tier1MaleTarget += (activity.participantsMale || 0); entry.tier1FemaleTarget += (activity.participantsFemale || 0); entry.tier1TotalParticipants += (activity.participantsMale || 0) + (activity.participantsFemale || 0); } 
            else if (activity.tier === 'Tier 2') { entry.tier2TotalTarget += 1; activity.participatingIpos.forEach((ipo:any) => entry.tier2IpoNames.add(ipo)); entry.tier2MaleTarget += (activity.participantsMale || 0); entry.tier2FemaleTarget += (activity.participantsFemale || 0); entry.tier2TotalParticipants += (activity.participantsMale || 0) + (activity.participantsFemale || 0); } 
        });

        return Array.from(aggregator.values()).sort((a:any, b:any) => { if (a.region !== b.region) return a.region.localeCompare(b.region); if (a.province !== b.province) return a.province.localeCompare(b.province); return a.indicator.localeCompare(b.indicator); });
    }, [data, data.ipos]);

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

    const groupedData = useMemo<Record<string, { provinces: Record<string, { items: any[] }> }>>(() => {
        const regions: Record<string, { provinces: Record<string, { items: any[] }> }> = {};
        picsData.forEach(item => {
            if (!regions[item.region]) regions[item.region] = { provinces: {} };
            if (!regions[item.region].provinces[item.province]) regions[item.region].provinces[item.province] = { items: [] };
            regions[item.region].provinces[item.province].items.push(item);
        });
        return regions;
    }, [picsData]);

    const sortedRegions = Object.keys(groupedData).sort();
    const grandTotalSummary = calculateSummary(picsData);

    const dataCellClass = "p-1 border border-gray-300 dark:border-gray-600";
    const headerCellClass = "p-1 border border-gray-300 dark:border-gray-600 font-bold bg-gray-200 dark:bg-gray-700 text-center align-middle";
    const groupRowClass = "font-bold bg-gray-100 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer";

    const handleDownloadPicsXlsx = () => {
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

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            <div className="flex justify-between items-center mb-4 print-hidden">
                <h3 className="text-xl font-semibold text-gray-800 dark:text-white">PICS Report</h3>
                <button onClick={handleDownloadPicsXlsx} className="px-4 py-2 bg-accent text-white rounded-md font-semibold hover:brightness-95">Download XLSX</button>
            </div>
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
                            const regionItems = Object.values(regionData.provinces).flatMap((p: any) => p.items);
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
        </div>
    );
}

export default PICSReport;
// --- End of components/reports/PICSReport.tsx ---