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

const PhysicalStatCard: React.FC<{ label: string; value: string | number; variant: string; onClick?: () => void; }> = ({ label, value, variant, onClick }) => (
    <div 
        className={`physical-stat-card physical-stat-card--${variant} ${onClick ? 'physical-stat-card--clickable' : ''}`}
        onClick={onClick}
    >
        <div className="physical-stat-card__content">
            <p className="physical-stat-card__value">{value.toLocaleString()}</p>
            <p className="physical-stat-card__label">{label}</p>
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

        (data.subprojects || []).filter(p => !p.isRealignment && !p.isSavings).forEach(p => {
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
        (data.trainings || []).filter(t => !t.isRealignment && !t.isSavings).forEach(t => {
            if (t.date) {
                const quarter = getQuarter(new Date(t.date));
                if (quarter >= 1 && quarter <= 4) {
                    targets[`Q${quarter}`].trainings++;
                    (t.participatingIpos || []).forEach(ipo => targetIposByQuarter[`Q${quarter}`].add(ipo));
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

        (data.subprojects || []).forEach(p => {
            if (p.status === 'Completed' && p.actualCompletionDate) {
                const quarter = getQuarter(new Date(p.actualCompletionDate));
                 if (quarter >= 1 && quarter <= 4) accomplishments[`Q${quarter}`].subprojects++;
            }
        });

        const assistedIposByQuarter = new Map<number, Set<string>>();
        
        (data.trainings || []).forEach(t => {
            // Check if training is actually completed (has actual date)
            if (t.actualDate) {
                const quarter = getQuarter(new Date(t.actualDate));
                if (!assistedIposByQuarter.has(quarter)) assistedIposByQuarter.set(quarter, new Set());
                (t.participatingIpos || []).forEach(ipoName => assistedIposByQuarter.get(quarter)!.add(ipoName));

                if (quarter >= 1 && quarter <= 4) accomplishments[`Q${quarter}`].trainings++;
            }
        });

        (data.subprojects || []).forEach(p => {
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
        const completedSubprojects = (data.subprojects || []).filter(p => 
            p.status === 'Completed' && 
            p.actualCompletionDate && 
            (selectedYear === 'All' || new Date(p.actualCompletionDate).getFullYear().toString() === selectedYear)
        );
        
        // 2. Total Training (Must be completed status -> implied by presence of actualDate)
        const completedTrainings = (data.trainings || []).filter(t => 
            !!t.actualDate && 
            (selectedYear === 'All' || new Date(t.actualDate).getFullYear().toString() === selectedYear)
        );

        // 3. Total IPOs with Subprojects (Linked with COMPLETED subprojects)
        const iposWithCompletedSubprojects = new Set(completedSubprojects.map(p => p.indigenousPeopleOrganization));

        // 4. Total IPOs trained (Linked with COMPLETED trainings)
        const iposWithCompletedTrainings = new Set(completedTrainings.flatMap(t => t.participatingIpos || []));

        // 5. Total IPOs (Linked with completed trainings OR completed subprojects)
        const allEngagedIpos = new Set([
            ...iposWithCompletedSubprojects,
            ...iposWithCompletedTrainings
        ]);

        // Ancestral Domains Assisted (Based on the Engaged IPOs)
        const assistedDomains = new Set<string>();
        (data.ipos || []).forEach(ipo => {
            if (allEngagedIpos.has(ipo.name) && ipo.ancestralDomainNo) {
                assistedDomains.add(ipo.ancestralDomainNo);
            }
        });

        // --- Targets (Total in Registry/Plan for Selected Year) ---
        
        // 1. Target Subprojects (All in list - already filtered by fundingYear in DashboardsPage)
        const targetSubprojects = (data.subprojects || []).filter(p => !p.isRealignment && !p.isSavings);

        // 2. Target Trainings (All in list - already filtered by fundingYear in DashboardsPage)
        const targetTrainings = (data.trainings || []).filter(t => !t.isRealignment && !t.isSavings);

        // 3. Target IPOs with Subprojects (Unique IPOs in ANY target subproject)
        const targetIposWithSubprojects = new Set(targetSubprojects.map(p => p.indigenousPeopleOrganization));

        // 4. Target IPOs Trained (Unique IPOs in ANY target training)
        const targetIposTrained = new Set(targetTrainings.flatMap(t => t.participatingIpos || []));

        // 5. Target Total IPOs (Logic Updated: Only IPOs with linked subprojects or trainings)
        const targetTotalIposSet = new Set([
            ...targetIposWithSubprojects,
            ...targetIposTrained
        ]);

        // 6. Target ADs (Logic Updated: Unique ADs of the Target IPOs only)
        const targetAds = new Set<string>();
        (data.ipos || []).forEach(ipo => {
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

        (data.ipos || []).forEach(ipo => {
            const { province } = parseLocation(ipo.location);
            if (!province) return;
            if (!provinceMap[province]) {
                provinceMap[province] = { ipos: [], trainings: new Set(), subprojects: [] };
            }
            provinceMap[province].ipos.push(ipo);
        });

        for (const province in provinceMap) {
            const provinceIpoNames = new Set(provinceMap[province].ipos.map(i => i.name));
            provinceMap[province].subprojects = (data.subprojects || []).filter(sp => provinceIpoNames.has(sp.indigenousPeopleOrganization));
            (data.trainings || []).forEach(t => {
                if ((t.participatingIpos || []).some(ipoName => provinceIpoNames.has(ipoName))) {
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
            const completedTrainingsIds = new Set((data.trainings || []).filter(t => !!t.actualDate).map(t => t.id));
            const provinceCompletedTrainingIds = new Set([...provinceMap[province].trainings].filter(id => completedTrainingsIds.has(id)));
            const targetTrainingsCount = provinceMap[province].trainings.size; 
            const accomplishedTrainingsCount = provinceCompletedTrainingIds.size;

            const trainedIpoNames = new Set((data.trainings || []).filter(t => provinceCompletedTrainingIds.has(t.id)).flatMap(t => t.participatingIpos || []));
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

        (data.subprojects || []).forEach(sp => {
            if (sp.operatingUnit && sp.status === 'Completed') {
                const s = ensureOu(sp.operatingUnit);
                s.subprojects++;
                s.ipos.add(sp.indigenousPeopleOrganization);
            }
        });

        (data.trainings || []).forEach(t => {
            if (t.operatingUnit && t.actualDate) {
                const s = ensureOu(t.operatingUnit);
                s.trainings++;
                (t.participatingIpos || []).forEach(ipo => s.ipos.add(ipo));
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
        const accomplishments = (data.ipos || [])
            .filter(ipo => performanceStats.totalEngagedIpos.has(ipo.name))
            .map(ipo => ({ 
                id: ipo.id, 
                name: ipo.name, 
                details: ipo.location,
                operatingUnit: regionToOuMap[ipo.region] || 'Unknown OU'
            }));
        
        const targets = (data.ipos || [])
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
        const accomplishments = (data.ipos || [])
            .filter(ipo => performanceStats.totalIposTrained.has(ipo.name))
            .map(ipo => ({ 
                id: ipo.id, 
                name: ipo.name, 
                details: ipo.location,
                operatingUnit: regionToOuMap[ipo.region] || 'Unknown OU'
            }));
        
        const targets = (data.ipos || [])
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
        const accomplishments = (data.ipos || [])
            .filter(ipo => performanceStats.totalIposWithSubprojects.has(ipo.name))
            .map(ipo => ({ 
                id: ipo.id, 
                name: ipo.name, 
                details: ipo.location,
                operatingUnit: regionToOuMap[ipo.region] || 'Unknown OU'
            }));
        
        const targets = (data.ipos || [])
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
        const accomplishments = (performanceStats.totalSubprojectsCompleted || []).map(p => ({ 
            id: p.id, 
            name: p.name, 
            details: `Completed: ${formatDate(p.actualCompletionDate)} | IPO: ${p.indigenousPeopleOrganization}`,
            operatingUnit: p.operatingUnit
        }));
        
        const targets = (performanceStats.targetSubprojects || []).map(p => ({
            id: p.id,
            name: p.name,
            details: `Target Start: ${formatDate(p.startDate)} | IPO: ${p.indigenousPeopleOrganization}`,
            operatingUnit: p.operatingUnit
        }));

        setLocalModal({ title: 'Subprojects Performance', type: 'subprojects', targets, accomplishments });
        setModalTab('accomplishments');
    };
    
    const handleShowCompletedTrainings = () => {
        const accomplishments = (performanceStats.totalTrainingsCompleted || []).map(t => ({ 
            id: t.id, 
            name: t.name, 
            details: `Conducted: ${formatDate(t.actualDate)} | Component: ${t.component}`,
            operatingUnit: t.operatingUnit
        }));
        
        const targets = (performanceStats.targetTrainings || []).map(t => ({
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
        (data.ipos || []).forEach(ipo => {
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
        (data.ipos || []).forEach(ipo => {
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
                    const ipo = (data.ipos || []).find(i => i.id === item.id);
                    if (ipo) {
                        const loc = parseLocation(ipo.location);
                        province = loc.province;
                        municipality = loc.municipality;
                    }
                } else if (localModal.type === 'subprojects') {
                    const sp = (data.subprojects || []).find(p => p.id === item.id);
                    if (sp) {
                        const ipo = (data.ipos || []).find(i => i.name === sp.indigenousPeopleOrganization);
                        if (ipo) {
                            const loc = parseLocation(ipo.location);
                            province = loc.province;
                            municipality = loc.municipality;
                        }
                    }
                } else if (localModal.type === 'trainings') {
                    const tr = (data.trainings || []).find(t => t.id === item.id);
                    if (tr && (tr.participatingIpos || []).length > 0) {
                        const ipo = (data.ipos || []).find(i => i.name === tr.participatingIpos[0]);
                        if (ipo) {
                            const loc = parseLocation(ipo.location);
                            province = loc.province;
                            municipality = loc.municipality;
                        }
                    }
                } else if (localModal.type === 'ads') {
                    const ipo = (data.ipos || []).find(i => i.ancestralDomainNo === item.id);
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
            const ipo = (data.ipos || []).find(i => i.id === item.id);
            if (ipo && onSelectIpo) onSelectIpo(ipo);
        } else if (localModal?.type === 'subprojects') {
            const sp = (data.subprojects || []).find(p => p.id === item.id);
            if (sp && onSelectSubproject) onSelectSubproject(sp);
        } else if (localModal?.type === 'trainings') {
            const tr = (data.trainings || []).find(t => t.id === item.id);
            if (tr && onSelectActivity) onSelectActivity(tr);
        } else if (localModal?.type === 'ads') {
            if (setExternalFilters && navigateTo) {
                setExternalFilters({ search: item.id as string });
                navigateTo('/ipo');
            }
        }
    };


    return (
        <div className="physical-dashboard dashboard-view">
             <section className="dashboard-section" aria-labelledby="overall-performance">
                <h3 id="overall-performance" className="dashboard-section__title">Overall Performance</h3>
                <div className="physical-stat-grid">
                    <PhysicalStatCard label="Total IPOs" value={performanceStats.strEngagedIpos} variant="teal" onClick={handleShowTotalEngagedIpos} />
                    <PhysicalStatCard label="Total IPOs Trained" value={performanceStats.strIposTrained} variant="green" onClick={handleShowIposTrained} />
                    <PhysicalStatCard label="Total IPOs w/ Subprojects" value={performanceStats.strIposWithSubprojects} variant="emerald" onClick={handleShowIposWithSubprojects} />
                    <PhysicalStatCard label="Total Subprojects Completed" value={performanceStats.strSubprojects} variant="blue-green" onClick={handleShowCompletedSubprojects} />
                    <PhysicalStatCard label="Total Trainings" value={performanceStats.strTrainings} variant="blue" onClick={handleShowCompletedTrainings} />
                    <PhysicalStatCard label="ADs Assisted" value={performanceStats.strAds} variant="lime" onClick={handleShowAdsAssisted} />
                </div>
            </section>

            <section className="dashboard-section" aria-labelledby="quarterly-progress">
                <h3 id="quarterly-progress" className="dashboard-section__title">Quarterly Progress</h3>
                <div className="dashboard-card-grid dashboard-card-grid--two">
                    <QuarterlyBarChart title="Quarterly Targets" data={quarterlyTargets} />
                    <QuarterlyBarChart title="Quarterly Accomplishments" data={quarterlyAccomplishments} />
                </div>
            </section>

             <section className="dashboard-section" aria-labelledby="ipo-engagement-breakdown">
                <h3 id="ipo-engagement-breakdown" className="dashboard-section__title">IPO Engagement Breakdown</h3>
                <div className="dashboard-card-grid dashboard-card-grid--two">
                     <IpoEngagementChart data={{
                         'Total IPOs': performanceStats.totalEngagedIpos.size,
                         'IPOs Trained': performanceStats.totalIposTrained.size,
                         'IPOs w/ Subprojects': performanceStats.totalIposWithSubprojects.size,
                         'ADs Assisted': performanceStats.totalAdsAssisted.size
                     }} />
                     <div className="dashboard-note-card">
                        <p>
                            Total IPOs refers to IPOs with linked, completed trainings or subprojects. <br/>
                            Training count considers only trainings with actual conducted dates. <br/>
                            Subproject count considers only subprojects with 'Completed' status.
                        </p>
                     </div>
                </div>
            </section>

            <section className="dashboard-section" aria-labelledby="provincial-breakdown">
                <h3 id="provincial-breakdown" className="dashboard-section__title">Provincial Comparison</h3>
                <div className="dashboard-chart-card dashboard-chart-card--wide">
                    <ProvincialComparisonChart data={provincialComparisonData} />
                </div>
            </section>

             <section className="dashboard-section" aria-labelledby="ou-rankings">
                 <h3 id="ou-rankings" className="dashboard-section__title">Operating Unit Rankings (Accomplishment)</h3>
                 <div className="dashboard-card-grid dashboard-card-grid--three">
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
                <div className="dashboard-modal-backdrop" onClick={() => setLocalModal(null)}>
                    <div className="dashboard-modal dashboard-modal--wide" onClick={e => e.stopPropagation()}>
                        <div className="dashboard-modal__header">
                            <div>
                                <h3>{localModal.title}</h3>
                                <p className="dashboard-modal__metric-subtext">Year: {selectedYear}</p>
                            </div>
                            <div className="dashboard-modal__actions">
                                <button 
                                    type="button"
                                    onClick={handleDownloadExcel}
                                    className="btn btn-primary btn-responsive"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="btn-symbol" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    <span className="btn-text">Excel</span>
                                </button>
                                <button type="button" onClick={() => setLocalModal(null)} className="dashboard-modal__close" aria-label="Close modal">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <div className="data-tabs dashboard-modal-tabs">
                            <button
                                type="button"
                                onClick={() => setModalTab('targets')}
                                className={`data-tab ${modalTab === 'targets' ? 'is-active' : ''}`}
                            >
                                Targets ({localModal.targets.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setModalTab('accomplishments')}
                                className={`data-tab ${modalTab === 'accomplishments' ? 'is-active' : ''}`}
                            >
                                Accomplishments ({localModal.accomplishments.length})
                            </button>
                        </div>

                        <div className="dashboard-modal__body custom-scrollbar">
                            {modalTab === 'targets' ? (
                                localModal.targets.length > 0 ? (
                                    <div className="dashboard-modal__stack">
                                        {Object.entries(
                                            localModal.targets.reduce((acc, item) => {
                                                const ou = item.operatingUnit || 'Unknown OU';
                                                if (!acc[ou]) acc[ou] = [];
                                                acc[ou].push(item);
                                                return acc;
                                            }, {} as Record<string, (ModalItem & { operatingUnit?: string })[]>)
                                        ).sort(([ouA], [ouB]) => ouA.localeCompare(ouB)).map(([ou, items]) => (
                                            <div key={ou} className="dashboard-modal-group">
                                                <div className="dashboard-modal-group__heading">
                                                    <span>{ou}</span>
                                                    <div></div>
                                                </div>
                                                <ul className="dashboard-modal__stack">
                                                    {(items as (ModalItem & { operatingUnit?: string })[]).map((item, index) => (
                                                        <li 
                                                            key={index} 
                                                            className="dashboard-modal__event dashboard-modal__event--clickable"
                                                            onClick={() => handleItemClick(item)}
                                                        >
                                                            <p className="dashboard-modal__metric-value">{item.name}</p>
                                                            {item.details && <p className="dashboard-modal__metric-subtext">{item.details}</p>}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="dashboard-modal__empty">
                                        <p>No targets found for this year.</p>
                                    </div>
                                )
                            ) : (
                                localModal.accomplishments.length > 0 ? (
                                    <div className="dashboard-modal__stack">
                                        {Object.entries(
                                            localModal.accomplishments.reduce((acc, item) => {
                                                const ou = item.operatingUnit || 'Unknown OU';
                                                if (!acc[ou]) acc[ou] = [];
                                                acc[ou].push(item);
                                                return acc;
                                            }, {} as Record<string, (ModalItem & { operatingUnit?: string })[]>)
                                        ).sort(([ouA], [ouB]) => ouA.localeCompare(ouB)).map(([ou, items]) => (
                                            <div key={ou} className="dashboard-modal-group">
                                                <div className="dashboard-modal-group__heading">
                                                    <span>{ou}</span>
                                                    <div></div>
                                                </div>
                                                <ul className="dashboard-modal__stack">
                                                    {(items as (ModalItem & { operatingUnit?: string })[]).map((item, index) => (
                                                        <li 
                                                            key={index} 
                                                            className="dashboard-modal__event dashboard-modal__event--clickable"
                                                            onClick={() => handleItemClick(item)}
                                                        >
                                                            <p className="dashboard-modal__metric-value">{item.name}</p>
                                                            {item.details && <p className="dashboard-modal__metric-subtext">{item.details}</p>}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="dashboard-modal__empty">
                                        <p>No accomplishments found for this year.</p>
                                    </div>
                                )
                            )}
                        </div>
                        <div className="dashboard-modal__footer-note">
                            Tip: Click on an item to view its profile.
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PhysicalDashboard;
