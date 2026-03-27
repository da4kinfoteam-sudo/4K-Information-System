// Author: 4K 
import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Subproject, IPO, Training, OtherActivity, IpoIcon, ProjectsIcon, TrainingIcon, ouToRegionMap } from '../../constants';
import { parseLocation } from '../LocationPicker';
import { 
    QuarterlyBarChart, IpoEngagementChart, 
    ProvincialComparisonChart, RankingList, ModalItem, IndicatorData 
} from './DashboardComponents';

interface PhysicalDashboardProps {
    data: {
        subprojects: Subproject[];
        trainings: Training[];
        otherActivities: OtherActivity[];
        ipos: IPO[];
    };
    setModalData: (data: { title: string; items: ModalItem[] } | null) => void;
    selectedYear: string;
    onSelectIpo?: (ipo: IPO) => void;
    onSelectSubproject?: (project: Subproject) => void;
    onSelectActivity?: (activity: Training | OtherActivity) => void;
    setExternalFilters?: (filters: any) => void;
    navigateTo?: (page: string) => void;
}

const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
};

const PhysicalStatCard: React.FC<{ label: string; value: string | number; gradient: string; onClick?: () => void; }> = ({ label, value, gradient, onClick }) => (
    <div 
        className={`bg-gradient-to-br ${gradient} text-white p-6 rounded-lg shadow-lg transform transition hover:scale-105 cursor-pointer`}
        onClick={onClick}
    >
        <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-4xl font-bold drop-shadow-md">{value.toLocaleString()}</p>
            <p className="text-sm font-medium uppercase tracking-wider opacity-90 mt-2">{label}</p>
        </div>
    </div>
);

const PhysicalDashboard: React.FC<PhysicalDashboardProps> = ({ data, setModalData, selectedYear, onSelectIpo, onSelectSubproject, onSelectActivity, setExternalFilters, navigateTo }) => {
    
    const regionToOuMap = useMemo(() => {
        const map: { [key: string]: string } = {};
        Object.entries(ouToRegionMap).forEach(([ou, region]) => {
            map[region] = ou;
        });
        return map;
    }, []);

    const [localModal, setLocalModal] = useState<{
        title: string;
        type: 'ipos' | 'subprojects' | 'trainings' | 'ads';
        targets: (ModalItem & { operatingUnit?: string })[];
        accomplishments: (ModalItem & { operatingUnit?: string })[];
    } | null>(null);
    const [modalTab, setModalTab] = useState<'targets' | 'accomplishments'>('accomplishments');

    const getQuarter = (date: Date): number => {
        const month = date.getMonth();
        return Math.floor(month / 3) + 1;
    };

    const quarterlyTargets = useMemo(() => {
        const targets: { [key: string]: { subprojects: number; trainings: number; ipos: number } } = {
            Q1: { subprojects: 0, trainings: 0, ipos: 0 }, Q2: { subprojects: 0, trainings: 0, ipos: 0 },
            Q3: { subprojects: 0, trainings: 0, ipos: 0 }, Q4: { subprojects: 0, trainings: 0, ipos: 0 },
        };

        const targetIposByQuarter: { [key: string]: Set<string> } = {
            Q1: new Set(), Q2: new Set(), Q3: new Set(), Q4: new Set()
        };

        data.subprojects.forEach(p => {
            if (p.startDate) {
                const quarter = getQuarter(new Date(p.startDate));
                if (quarter >= 1 && quarter <= 4) {
                    targets[`Q${quarter}`].subprojects++;
                    if (p.indigenousPeopleOrganization) {
                        targetIposByQuarter[`Q${quarter}`].add(p.indigenousPeopleOrganization);
                    }
                }
            }
        });
        data.trainings.forEach(t => {
            if (t.date) {
                const quarter = getQuarter(new Date(t.date));
                if (quarter >= 1 && quarter <= 4) {
                    targets[`Q${quarter}`].trainings++;
                    t.participatingIpos.forEach(ipo => targetIposByQuarter[`Q${quarter}`].add(ipo));
                }
            }
        });
        
        (['Q1', 'Q2', 'Q3', 'Q4'] as const).forEach(q => {
            targets[q].ipos = targetIposByQuarter[q].size;
        });

        return targets as any;
    }, [data.subprojects, data.trainings]);
    
    const quarterlyAccomplishments = useMemo(() => {
        const accomplishments: { [key: string]: { subprojects: number; trainings: number; ipos: number } } = {
            Q1: { subprojects: 0, trainings: 0, ipos: 0 }, Q2: { subprojects: 0, trainings: 0, ipos: 0 },
            Q3: { subprojects: 0, trainings: 0, ipos: 0 }, Q4: { subprojects: 0, trainings: 0, ipos: 0 },
        };

        data.subprojects.forEach(p => {
            if (p.status === 'Completed' && p.actualCompletionDate) {
                const quarter = getQuarter(new Date(p.actualCompletionDate));
                 if (quarter >= 1 && quarter <= 4) accomplishments[`Q${quarter}`].subprojects++;
            }
        });

        const assistedIposByQuarter = new Map<number, Set<string>>();
        
        data.trainings.forEach(t => {
            // Check if training is actually completed (has actual date)
            if (t.actualDate) {
                const quarter = getQuarter(new Date(t.actualDate));
                if (!assistedIposByQuarter.has(quarter)) assistedIposByQuarter.set(quarter, new Set());
                t.participatingIpos.forEach(ipoName => assistedIposByQuarter.get(quarter)!.add(ipoName));

                if (quarter >= 1 && quarter <= 4) accomplishments[`Q${quarter}`].trainings++;
            }
        });

        data.subprojects.forEach(p => {
            if (p.status === 'Completed' && p.actualCompletionDate) {
                const quarter = getQuarter(new Date(p.actualCompletionDate));
                if (!assistedIposByQuarter.has(quarter)) assistedIposByQuarter.set(quarter, new Set());
                assistedIposByQuarter.get(quarter)!.add(p.indigenousPeopleOrganization);
            }
        });
        
        assistedIposByQuarter.forEach((ipoSet, quarter) => {
            if (quarter >= 1 && quarter <= 4) accomplishments[`Q${quarter}`].ipos = ipoSet.size;
        });

        return accomplishments as any;
    }, [data.subprojects, data.trainings]);

    // REVISED LOGIC for Overall Performance (Accomplishment vs Target)
    const performanceStats = useMemo(() => {
        // --- Accomplishments (Completed in Selected Year) ---
        
        // 1. Total Subprojects Completed
        const completedSubprojects = data.subprojects.filter(p => 
            p.status === 'Completed' && 
            p.actualCompletionDate && 
            (selectedYear === 'All' || new Date(p.actualCompletionDate).getFullYear().toString() === selectedYear)
        );
        
        // 2. Total Training (Must be completed status -> implied by presence of actualDate)
        const completedTrainings = data.trainings.filter(t => 
            !!t.actualDate && 
            (selectedYear === 'All' || new Date(t.actualDate).getFullYear().toString() === selectedYear)
        );

        // 3. Total IPOs with Subprojects (Linked with COMPLETED subprojects)
        const iposWithCompletedSubprojects = new Set(completedSubprojects.map(p => p.indigenousPeopleOrganization));

        // 4. Total IPOs trained (Linked with COMPLETED trainings)
        const iposWithCompletedTrainings = new Set(completedTrainings.flatMap(t => t.participatingIpos));

        // 5. Total IPOs (Linked with completed trainings OR completed subprojects)
        const allEngagedIpos = new Set([
            ...iposWithCompletedSubprojects,
            ...iposWithCompletedTrainings
        ]);

        // Ancestral Domains Assisted (Based on the Engaged IPOs)
        const assistedDomains = new Set<string>();
        data.ipos.forEach(ipo => {
            if (allEngagedIpos.has(ipo.name) && ipo.ancestralDomainNo) {
                assistedDomains.add(ipo.ancestralDomainNo);
            }
        });

        // --- Targets (Total in Registry/Plan for Selected Year) ---
        
        // 1. Target Subprojects (All in list - already filtered by fundingYear in DashboardsPage)
        const targetSubprojects = data.subprojects;

        // 2. Target Trainings (All in list - already filtered by fundingYear in DashboardsPage)
        const targetTrainings = data.trainings;

        // 3. Target IPOs with Subprojects (Unique IPOs in ANY target subproject)
        const targetIposWithSubprojects = new Set(targetSubprojects.map(p => p.indigenousPeopleOrganization));

        // 4. Target IPOs Trained (Unique IPOs in ANY target training)
        const targetIposTrained = new Set(targetTrainings.flatMap(t => t.participatingIpos));

        // 5. Target Total IPOs (Logic Updated: Only IPOs with linked subprojects or trainings)
        const targetTotalIposSet = new Set([
            ...targetIposWithSubprojects,
            ...targetIposTrained
        ]);

        // 6. Target ADs (Logic Updated: Unique ADs of the Target IPOs only)
        const targetAds = new Set<string>();
        data.ipos.forEach(ipo => {
            if (targetTotalIposSet.has(ipo.name) && ipo.ancestralDomainNo) {
                targetAds.add(ipo.ancestralDomainNo);
            }
        });

        return {
            // Accomplishment Data Sets (for modals)
            totalEngagedIpos: allEngagedIpos,
            totalIposTrained: iposWithCompletedTrainings,
            totalIposWithSubprojects: iposWithCompletedSubprojects,
            totalSubprojectsCompleted: completedSubprojects,
            totalTrainingsCompleted: completedTrainings,
            totalAdsAssisted: assistedDomains,

            // Target Data Sets (for modals)
            targetTotalIposSet,
            targetIposTrained,
            targetIposWithSubprojects,
            targetSubprojects,
            targetTrainings,
            targetAds,

            // Display Strings (Accomplished / Target)
            strEngagedIpos: `${allEngagedIpos.size} / ${targetTotalIposSet.size}`,
            strIposTrained: `${iposWithCompletedTrainings.size} / ${targetIposTrained.size}`,
            strIposWithSubprojects: `${iposWithCompletedSubprojects.size} / ${targetIposWithSubprojects.size}`,
            strSubprojects: `${completedSubprojects.length} / ${targetSubprojects.length}`,
            strTrainings: `${completedTrainings.length} / ${targetTrainings.length}`,
            strAds: `${assistedDomains.size} / ${targetAds.size}`
        };
    }, [data.subprojects, data.trainings, data.ipos, selectedYear]);

    const provincialComparisonData = useMemo(() => {
        const provinceMap: { [province: string]: { ipos: IPO[], trainings: Set<number>, subprojects: Subproject[] } } = {};

        data.ipos.forEach(ipo => {
            const { province } = parseLocation(ipo.location);
            if (!province) return;
            if (!provinceMap[province]) {
                provinceMap[province] = { ipos: [], trainings: new Set(), subprojects: [] };
            }
            provinceMap[province].ipos.push(ipo);
        });

        for (const province in provinceMap) {
            const provinceIpoNames = new Set(provinceMap[province].ipos.map(i => i.name));
            provinceMap[province].subprojects = data.subprojects.filter(sp => provinceIpoNames.has(sp.indigenousPeopleOrganization));
            data.trainings.forEach(t => {
                if (t.participatingIpos.some(ipoName => provinceIpoNames.has(ipoName))) {
                    provinceMap[province].trainings.add(t.id);
                }
            });
        }

        const chartData: { [province: string]: { targets: IndicatorData; accomplishments: IndicatorData } } = {};

        for (const province in provinceMap) {
            const provinceIpos = provinceMap[province].ipos;
            const provinceSubprojects = provinceMap[province].subprojects;
            
            // Targets
            const targetIpos = provinceIpos.length;
            const targetSubprojects = provinceSubprojects.length;
            const targetTrainings = provinceMap[province].trainings.size;
            const targetAds = new Set(provinceIpos.map(i => i.ancestralDomainNo).filter(Boolean)).size;

            // Accomplishments
            const accomplishedSubprojects = provinceSubprojects.filter(p => p.status === 'Completed').length;
            
            // For Provincial Comparison, we assume 'accomplished' means engaged in completed activities specific to that province's IPOs
            const completedTrainingsIds = new Set(data.trainings.filter(t => !!t.actualDate).map(t => t.id));
            const provinceCompletedTrainingIds = new Set([...provinceMap[province].trainings].filter(id => completedTrainingsIds.has(id)));
            const targetTrainingsCount = provinceMap[province].trainings.size; 
            const accomplishedTrainingsCount = provinceCompletedTrainingIds.size;

            const trainedIpoNames = new Set(data.trainings.filter(t => provinceCompletedTrainingIds.has(t.id)).flatMap(t => t.participatingIpos));
            const completedSubprojectIpoNames = new Set(provinceSubprojects.filter(p => p.status === 'Completed').map(p => p.indigenousPeopleOrganization));
            const assistedIpoNames = new Set([...trainedIpoNames, ...completedSubprojectIpoNames]);

            const accomplishedIpos = provinceIpos.filter(i => assistedIpoNames.has(i.name)).length;
            const accomplishedAds = new Set(provinceIpos.filter(i => assistedIpoNames.has(i.name)).map(i => i.ancestralDomainNo).filter(Boolean)).size;
            
            chartData[province] = {
                targets: {
                    ipos: targetIpos,
                    subprojects: targetSubprojects,
                    trainings: targetTrainings,
                    ads: targetAds,
                },
                accomplishments: {
                    ipos: accomplishedIpos,
                    subprojects: accomplishedSubprojects,
                    trainings: accomplishedTrainingsCount,
                    ads: accomplishedAds
                }
            };
        }
        return chartData;
    }, [data.ipos, data.subprojects, data.trainings]);

    const rankingData = useMemo(() => {
        const stats: Record<string, { ipos: Set<string>, subprojects: number, trainings: number }> = {};
        
        const ensureOu = (ou: string) => {
            if (!stats[ou]) stats[ou] = { ipos: new Set(), subprojects: 0, trainings: 0 };
            return stats[ou];
        }

        data.subprojects.forEach(sp => {
            if (sp.operatingUnit && sp.status === 'Completed') {
                const s = ensureOu(sp.operatingUnit);
                s.subprojects++;
                s.ipos.add(sp.indigenousPeopleOrganization);
            }
        });

        data.trainings.forEach(t => {
            if (t.operatingUnit && t.actualDate) {
                const s = ensureOu(t.operatingUnit);
                s.trainings++;
                t.participatingIpos.forEach(ipo => s.ipos.add(ipo));
            }
        });

        const entries = Object.entries(stats).map(([name, stat]) => ({
            name,
            iposCount: stat.ipos.size,
            subprojectsCount: stat.subprojects,
            trainingsCount: stat.trainings
        }));

        return {
            byIpos: [...entries].sort((a, b) => b.iposCount - a.iposCount),
            bySubprojects: [...entries].sort((a, b) => b.subprojectsCount - a.subprojectsCount),
            byTrainings: [...entries].sort((a, b) => b.trainingsCount - a.trainingsCount),
        };
    }, [data]);


    const handleShowTotalEngagedIpos = () => {
        const accomplishments = data.ipos
            .filter(ipo => performanceStats.totalEngagedIpos.has(ipo.name))
            .map(ipo => ({ 
                id: ipo.id, 
                name: ipo.name, 
                details: ipo.location,
                operatingUnit: regionToOuMap[ipo.region] || 'Unknown OU'
            }));
        
        const targets = data.ipos
            .filter(ipo => performanceStats.targetTotalIposSet.has(ipo.name))
            .map(ipo => ({ 
                id: ipo.id, 
                name: ipo.name, 
                details: ipo.location,
                operatingUnit: regionToOuMap[ipo.region] || 'Unknown OU'
            }));

        setLocalModal({ title: 'Total IPOs Engaged', type: 'ipos', targets, accomplishments });
        setModalTab('accomplishments');
    };

    const handleShowIposTrained = () => {
        const accomplishments = data.ipos
            .filter(ipo => performanceStats.totalIposTrained.has(ipo.name))
            .map(ipo => ({ 
                id: ipo.id, 
                name: ipo.name, 
                details: ipo.location,
                operatingUnit: regionToOuMap[ipo.region] || 'Unknown OU'
            }));
        
        const targets = data.ipos
            .filter(ipo => performanceStats.targetIposTrained.has(ipo.name))
            .map(ipo => ({ 
                id: ipo.id, 
                name: ipo.name, 
                details: ipo.location,
                operatingUnit: regionToOuMap[ipo.region] || 'Unknown OU'
            }));

        setLocalModal({ title: 'IPOs Trained', type: 'ipos', targets, accomplishments });
        setModalTab('accomplishments');
    };

    const handleShowIposWithSubprojects = () => {
        const accomplishments = data.ipos
            .filter(ipo => performanceStats.totalIposWithSubprojects.has(ipo.name))
            .map(ipo => ({ 
                id: ipo.id, 
                name: ipo.name, 
                details: ipo.location,
                operatingUnit: regionToOuMap[ipo.region] || 'Unknown OU'
            }));
        
        const targets = data.ipos
            .filter(ipo => performanceStats.targetIposWithSubprojects.has(ipo.name))
            .map(ipo => ({ 
                id: ipo.id, 
                name: ipo.name, 
                details: ipo.location,
                operatingUnit: regionToOuMap[ipo.region] || 'Unknown OU'
            }));

        setLocalModal({ title: 'IPOs with Subprojects', type: 'ipos', targets, accomplishments });
        setModalTab('accomplishments');
    };

    const handleShowCompletedSubprojects = () => {
        const accomplishments = performanceStats.totalSubprojectsCompleted.map(p => ({ 
            id: p.id, 
            name: p.name, 
            details: `Completed: ${formatDate(p.actualCompletionDate)} | IPO: ${p.indigenousPeopleOrganization}`,
            operatingUnit: p.operatingUnit
        }));
        
        const targets = performanceStats.targetSubprojects.map(p => ({
            id: p.id,
            name: p.name,
            details: `Target Start: ${formatDate(p.startDate)} | IPO: ${p.indigenousPeopleOrganization}`,
            operatingUnit: p.operatingUnit
        }));

        setLocalModal({ title: 'Subprojects Performance', type: 'subprojects', targets, accomplishments });
        setModalTab('accomplishments');
    };
    
    const handleShowCompletedTrainings = () => {
        const accomplishments = performanceStats.totalTrainingsCompleted.map(t => ({ 
            id: t.id, 
            name: t.name, 
            details: `Conducted: ${formatDate(t.actualDate)} | Component: ${t.component}`,
            operatingUnit: t.operatingUnit
        }));
        
        const targets = performanceStats.targetTrainings.map(t => ({
            id: t.id,
            name: t.name,
            details: `Target Date: ${formatDate(t.date)} | Component: ${t.component}`,
            operatingUnit: t.operatingUnit
        }));

        setLocalModal({ title: 'Trainings Performance', type: 'trainings', targets, accomplishments });
        setModalTab('accomplishments');
    };

    const handleShowAdsAssisted = () => {
        const assistedAdsMap = new Map<string, { ipoNames: string[], ou: string }>();
        data.ipos.forEach(ipo => {
            if (performanceStats.totalEngagedIpos.has(ipo.name) && ipo.ancestralDomainNo) {
                if (!assistedAdsMap.has(ipo.ancestralDomainNo)) {
                    assistedAdsMap.set(ipo.ancestralDomainNo, { 
                        ipoNames: [], 
                        ou: regionToOuMap[ipo.region] || 'Unknown OU' 
                    });
                }
                assistedAdsMap.get(ipo.ancestralDomainNo)!.ipoNames.push(ipo.name);
            }
        });
        const accomplishments = Array.from(assistedAdsMap.entries()).map(([adNo, data]) => ({ 
            id: adNo, 
            name: `AD No: ${adNo}`, 
            details: `Assisted via IPO(s): ${data.ipoNames.join(', ')}`,
            operatingUnit: data.ou
        }));

        const targetAdsMap = new Map<string, { ipoNames: string[], ou: string }>();
        data.ipos.forEach(ipo => {
            if (performanceStats.targetTotalIposSet.has(ipo.name) && ipo.ancestralDomainNo) {
                if (!targetAdsMap.has(ipo.ancestralDomainNo)) {
                    targetAdsMap.set(ipo.ancestralDomainNo, { 
                        ipoNames: [], 
                        ou: regionToOuMap[ipo.region] || 'Unknown OU' 
                    });
                }
                targetAdsMap.get(ipo.ancestralDomainNo)!.ipoNames.push(ipo.name);
            }
        });
        const targets = Array.from(targetAdsMap.entries()).map(([adNo, data]) => ({
            id: adNo,
            name: `AD No: ${adNo}`,
            details: `Target via IPO(s): ${data.ipoNames.join(', ')}`,
            operatingUnit: data.ou
        }));

        setLocalModal({ title: 'Ancestral Domains Performance', type: 'ads', targets, accomplishments });
        setModalTab('accomplishments');
    };

    const handleDownloadExcel = () => {
        if (!localModal) return;
        const wb = XLSX.utils.book_new();
        
        const enrich = (items: (ModalItem & { operatingUnit?: string })[]) => {
            return items.map(item => {
                let enriched: any = { Name: item.name };
                let province = '';
                let municipality = '';

                if (localModal.type === 'ipos') {
                    const ipo = data.ipos.find(i => i.id === item.id);
                    if (ipo) {
                        const loc = parseLocation(ipo.location);
                        province = loc.province;
                        municipality = loc.municipality;
                    }
                } else if (localModal.type === 'subprojects') {
                    const sp = data.subprojects.find(p => p.id === item.id);
                    if (sp) {
                        const ipo = data.ipos.find(i => i.name === sp.indigenousPeopleOrganization);
                        if (ipo) {
                            const loc = parseLocation(ipo.location);
                            province = loc.province;
                            municipality = loc.municipality;
                        }
                    }
                } else if (localModal.type === 'trainings') {
                    const tr = data.trainings.find(t => t.id === item.id);
                    if (tr && tr.participatingIpos.length > 0) {
                        const ipo = data.ipos.find(i => i.name === tr.participatingIpos[0]);
                        if (ipo) {
                            const loc = parseLocation(ipo.location);
                            province = loc.province;
                            municipality = loc.municipality;
                        }
                    }
                } else if (localModal.type === 'ads') {
                    const ipo = data.ipos.find(i => i.ancestralDomainNo === item.id);
                    if (ipo) {
                        const loc = parseLocation(ipo.location);
                        province = loc.province;
                        municipality = loc.municipality;
                    }
                }

                enriched.OU = item.operatingUnit || 'Unknown OU';
                if (localModal.type === 'ads') {
                    enriched.Province = province;
                    enriched.Municipality = municipality;
                }
                enriched.Details = item.details;
                return enriched;
            }).sort((a, b) => {
                const ouA = a.OU || '';
                const ouB = b.OU || '';
                if (ouA !== ouB) return ouA.localeCompare(ouB);
                
                if (localModal.type === 'ads') {
                    const provA = a.Province || '';
                    const provB = b.Province || '';
                    if (provA !== provB) return provA.localeCompare(provB);
                    
                    const munA = a.Municipality || '';
                    const munB = b.Municipality || '';
                    return munA.localeCompare(munB);
                }
                return 0;
            });
        };

        const targetData = enrich(localModal.targets);
        const accomplishmentData = enrich(localModal.accomplishments);
        
        const wsTargets = XLSX.utils.json_to_sheet(targetData);
        const wsAccomplishments = XLSX.utils.json_to_sheet(accomplishmentData);
        
        XLSX.utils.book_append_sheet(wb, wsTargets, "Targets");
        XLSX.utils.book_append_sheet(wb, wsAccomplishments, "Accomplishments");
        
        XLSX.writeFile(wb, `${localModal.title.replace(/\s+/g, '_')}_Report.xlsx`);
    };

    const handleItemClick = (item: ModalItem) => {
        if (localModal?.type === 'ipos') {
            const ipo = data.ipos.find(i => i.id === item.id);
            if (ipo && onSelectIpo) onSelectIpo(ipo);
        } else if (localModal?.type === 'subprojects') {
            const sp = data.subprojects.find(p => p.id === item.id);
            if (sp && onSelectSubproject) onSelectSubproject(sp);
        } else if (localModal?.type === 'trainings') {
            const tr = data.trainings.find(t => t.id === item.id);
            if (tr && onSelectActivity) onSelectActivity(tr);
        } else if (localModal?.type === 'ads') {
            if (setExternalFilters && navigateTo) {
                setExternalFilters({ search: item.id as string });
                navigateTo('/ipo');
            }
        }
    };


    return (
        <div className="space-y-8 p-1">
             <section aria-labelledby="overall-performance">
                <h3 id="overall-performance" className="text-2xl font-semibold text-gray-800 dark:text-white mb-4">Overall Performance</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <PhysicalStatCard label="Total IPOs" value={performanceStats.strEngagedIpos} gradient="from-teal-500 to-teal-700" onClick={handleShowTotalEngagedIpos} />
                    <PhysicalStatCard label="Total IPOs Trained" value={performanceStats.strIposTrained} gradient="from-green-500 to-green-700" onClick={handleShowIposTrained} />
                    <PhysicalStatCard label="Total IPOs w/ Subprojects" value={performanceStats.strIposWithSubprojects} gradient="from-emerald-500 to-emerald-700" onClick={handleShowIposWithSubprojects} />
                    <PhysicalStatCard label="Total Subprojects Completed" value={performanceStats.strSubprojects} gradient="from-cyan-600 to-cyan-800" onClick={handleShowCompletedSubprojects} />
                    <PhysicalStatCard label="Total Trainings" value={performanceStats.strTrainings} gradient="from-blue-500 to-blue-700" onClick={handleShowCompletedTrainings} />
                    <PhysicalStatCard label="ADs Assisted" value={performanceStats.strAds} gradient="from-lime-500 to-lime-700" onClick={handleShowAdsAssisted} />
                </div>
            </section>

            <section aria-labelledby="quarterly-progress">
                <h3 id="quarterly-progress" className="text-2xl font-semibold text-gray-800 dark:text-white mb-4">Quarterly Progress</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <QuarterlyBarChart title="Quarterly Targets" data={quarterlyTargets} />
                    <QuarterlyBarChart title="Quarterly Accomplishments" data={quarterlyAccomplishments} />
                </div>
            </section>

             <section aria-labelledby="ipo-engagement-breakdown">
                <h3 id="ipo-engagement-breakdown" className="text-2xl font-semibold text-gray-800 dark:text-white mb-4">IPO Engagement Breakdown</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                     <IpoEngagementChart data={{
                         'Total IPOs': performanceStats.totalEngagedIpos.size,
                         'IPOs Trained': performanceStats.totalIposTrained.size,
                         'IPOs w/ Subprojects': performanceStats.totalIposWithSubprojects.size,
                         'ADs Assisted': performanceStats.totalAdsAssisted.size
                     }} />
                     <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md flex items-center justify-center">
                        <p className="text-gray-500 dark:text-gray-400">
                            Total IPOs refers to IPOs with linked, completed trainings or subprojects. <br/>
                            Training count considers only trainings with actual conducted dates. <br/>
                            Subproject count considers only subprojects with 'Completed' status.
                        </p>
                     </div>
                </div>
            </section>

            <section aria-labelledby="provincial-breakdown">
                <h3 id="provincial-breakdown" className="text-2xl font-semibold text-gray-800 dark:text-white mb-4">Provincial Comparison</h3>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                    <ProvincialComparisonChart data={provincialComparisonData} />
                </div>
            </section>

             <section aria-labelledby="ou-rankings">
                 <h3 id="ou-rankings" className="text-2xl font-semibold text-gray-800 dark:text-white mb-4">Operating Unit Rankings (Accomplishment)</h3>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <RankingList 
                        title="By IPOs Assisted" 
                        items={rankingData.byIpos.map(i => ({ name: i.name, count: i.iposCount }))}
                        colorClass="text-teal-600 dark:text-teal-400"
                        icon={<IpoIcon className="h-5 w-5 text-teal-600 dark:text-teal-400" />}
                    />
                    <RankingList 
                        title="By Subprojects" 
                        items={rankingData.bySubprojects.map(i => ({ name: i.name, count: i.subprojectsCount }))}
                        colorClass="text-emerald-600 dark:text-emerald-400"
                        icon={<ProjectsIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
                    />
                     <RankingList 
                        title="By Trainings" 
                        items={rankingData.byTrainings.map(i => ({ name: i.name, count: i.trainingsCount }))}
                        colorClass="text-green-600 dark:text-green-400"
                        icon={<TrainingIcon className="h-5 w-5 text-green-600 dark:text-green-400" />}
                    />
                 </div>
            </section>

            {/* Custom Tabbed Modal for Physical Dashboard Cards */}
            {localModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setLocalModal(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold text-gray-800 dark:text-white">{localModal.title}</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Year: {selectedYear}</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <button 
                                    onClick={handleDownloadExcel}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    Excel
                                </button>
                                <button onClick={() => setLocalModal(null)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <div className="flex border-b border-gray-200 dark:border-gray-700">
                            <button
                                onClick={() => setModalTab('targets')}
                                className={`flex-1 py-3 text-sm font-semibold transition-colors ${modalTab === 'targets' ? 'text-accent border-b-2 border-accent' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Targets ({localModal.targets.length})
                            </button>
                            <button
                                onClick={() => setModalTab('accomplishments')}
                                className={`flex-1 py-3 text-sm font-semibold transition-colors ${modalTab === 'accomplishments' ? 'text-accent border-b-2 border-accent' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Accomplishments ({localModal.accomplishments.length})
                            </button>
                        </div>

                        <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
                            {modalTab === 'targets' ? (
                                localModal.targets.length > 0 ? (
                                    <div className="space-y-6">
                                        {Object.entries(
                                            localModal.targets.reduce((acc, item) => {
                                                const ou = item.operatingUnit || 'Unknown OU';
                                                if (!acc[ou]) acc[ou] = [];
                                                acc[ou].push(item);
                                                return acc;
                                            }, {} as Record<string, (ModalItem & { operatingUnit?: string })[]>)
                                        ).sort(([ouA], [ouB]) => ouA.localeCompare(ouB)).map(([ou, items]) => (
                                            <div key={ou} className="space-y-2">
                                                <div className="flex items-center gap-2 py-1 border-b border-gray-100 dark:border-gray-700">
                                                    <span className="text-xs font-bold uppercase tracking-wider text-accent dark:text-green-400">{ou}</span>
                                                    <div className="flex-grow h-px bg-gray-100 dark:bg-gray-700"></div>
                                                </div>
                                                <ul className="space-y-3">
                                                    {(items as (ModalItem & { operatingUnit?: string })[]).map((item, index) => (
                                                        <li 
                                                            key={index} 
                                                            className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors border border-transparent hover:border-accent/30"
                                                            onClick={() => handleItemClick(item)}
                                                        >
                                                            <p className="font-bold text-sm text-gray-800 dark:text-gray-100">{item.name}</p>
                                                            {item.details && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.details}</p>}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                                        <p>No targets found for this year.</p>
                                    </div>
                                )
                            ) : (
                                localModal.accomplishments.length > 0 ? (
                                    <div className="space-y-6">
                                        {Object.entries(
                                            localModal.accomplishments.reduce((acc, item) => {
                                                const ou = item.operatingUnit || 'Unknown OU';
                                                if (!acc[ou]) acc[ou] = [];
                                                acc[ou].push(item);
                                                return acc;
                                            }, {} as Record<string, (ModalItem & { operatingUnit?: string })[]>)
                                        ).sort(([ouA], [ouB]) => ouA.localeCompare(ouB)).map(([ou, items]) => (
                                            <div key={ou} className="space-y-2">
                                                <div className="flex items-center gap-2 py-1 border-b border-gray-100 dark:border-gray-700">
                                                    <span className="text-xs font-bold uppercase tracking-wider text-accent dark:text-green-400">{ou}</span>
                                                    <div className="flex-grow h-px bg-gray-100 dark:bg-gray-700"></div>
                                                </div>
                                                <ul className="space-y-3">
                                                    {(items as (ModalItem & { operatingUnit?: string })[]).map((item, index) => (
                                                        <li 
                                                            key={index} 
                                                            className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors border border-transparent hover:border-accent/30"
                                                            onClick={() => handleItemClick(item)}
                                                        >
                                                            <p className="font-bold text-sm text-gray-800 dark:text-gray-100">{item.name}</p>
                                                            {item.details && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.details}</p>}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                                        <p>No accomplishments found for this year.</p>
                                    </div>
                                )
                            )}
                        </div>
                        <div className="p-4 bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-500 dark:text-gray-400 italic">
                            Tip: Click on an item to view its profile.
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PhysicalDashboard;