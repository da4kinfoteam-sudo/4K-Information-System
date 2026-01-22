
// Author: 4K 
import React, { useMemo } from 'react';
import { Subproject, IPO, Training, OtherActivity, IpoIcon, ProjectsIcon, TrainingIcon } from '../../constants';
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
}

const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
};

const PhysicalStatCard: React.FC<{ label: string; value: number; gradient: string; onClick?: () => void; }> = ({ label, value, gradient, onClick }) => (
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

const PhysicalDashboard: React.FC<PhysicalDashboardProps> = ({ data, setModalData }) => {
    
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

    // REVISED LOGIC for Overall Performance
    const performanceStats = useMemo(() => {
        // 1. Total Subprojects Completed
        const completedSubprojects = data.subprojects.filter(p => p.status === 'Completed');
        
        // 2. Total Training (Must be completed status -> implied by presence of actualDate)
        const completedTrainings = data.trainings.filter(t => !!t.actualDate);

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

        return {
            totalEngagedIpos: allEngagedIpos,
            totalIposTrained: iposWithCompletedTrainings,
            totalIposWithSubprojects: iposWithCompletedSubprojects,
            totalSubprojectsCompleted: completedSubprojects,
            totalTrainingsCompleted: completedTrainings,
            totalAdsAssisted: assistedDomains
        };
    }, [data.subprojects, data.trainings, data.ipos]);

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
        const items = data.ipos
            .filter(ipo => performanceStats.totalEngagedIpos.has(ipo.name))
            .map(ipo => ({ id: ipo.id, name: ipo.name, details: ipo.location }));
        setModalData({ title: 'Total IPOs (With Completed Projects/Trainings)', items });
    };

    const handleShowIposTrained = () => {
        const items = data.ipos
            .filter(ipo => performanceStats.totalIposTrained.has(ipo.name))
            .map(ipo => ({ id: ipo.id, name: ipo.name, details: ipo.location }));
        setModalData({ title: 'IPOs Trained (Completed Trainings)', items });
    };

    const handleShowIposWithSubprojects = () => {
        const items = data.ipos
            .filter(ipo => performanceStats.totalIposWithSubprojects.has(ipo.name))
            .map(ipo => ({ id: ipo.id, name: ipo.name, details: ipo.location }));
        setModalData({ title: 'IPOs with Completed Subprojects', items });
    };

    const handleShowCompletedSubprojects = () => {
        const items = performanceStats.totalSubprojectsCompleted.map(p => ({ 
            id: p.id, 
            name: p.name, 
            details: `Completed: ${formatDate(p.actualCompletionDate)} | IPO: ${p.indigenousPeopleOrganization}` 
        }));
        setModalData({ title: 'Completed Subprojects', items });
    };
    
    const handleShowCompletedTrainings = () => {
        const items = performanceStats.totalTrainingsCompleted.map(t => ({ 
            id: t.id, 
            name: t.name, 
            details: `Conducted: ${formatDate(t.actualDate)} | Component: ${t.component}` 
        }));
        setModalData({ title: 'Completed Trainings', items });
    };

    const handleShowAdsAssisted = () => {
        const assistedAds = new Map<string, string[]>();
        data.ipos.forEach(ipo => {
            if (performanceStats.totalEngagedIpos.has(ipo.name) && ipo.ancestralDomainNo) {
                if (!assistedAds.has(ipo.ancestralDomainNo)) assistedAds.set(ipo.ancestralDomainNo, []);
                assistedAds.get(ipo.ancestralDomainNo)!.push(ipo.name);
            }
        });
        const items = Array.from(assistedAds.entries()).map(([adNo, ipoNames]) => ({ id: adNo, name: `AD No: ${adNo}`, details: `Assisted via IPO(s): ${ipoNames.join(', ')}` }));
        setModalData({ title: 'Ancestral Domains Assisted', items });
    };


    return (
        <div className="space-y-8 p-1">
             <section aria-labelledby="overall-performance">
                <h3 id="overall-performance" className="text-2xl font-semibold text-gray-800 dark:text-white mb-4">Overall Performance</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <PhysicalStatCard label="Total IPOs" value={performanceStats.totalEngagedIpos.size} gradient="from-teal-500 to-teal-700" onClick={handleShowTotalEngagedIpos} />
                    <PhysicalStatCard label="Total IPOs Trained" value={performanceStats.totalIposTrained.size} gradient="from-green-500 to-green-700" onClick={handleShowIposTrained} />
                    <PhysicalStatCard label="Total IPOs w/ SPs" value={performanceStats.totalIposWithSubprojects.size} gradient="from-emerald-500 to-emerald-700" onClick={handleShowIposWithSubprojects} />
                    <PhysicalStatCard label="Total SPs Completed" value={performanceStats.totalSubprojectsCompleted.length} gradient="from-cyan-600 to-cyan-800" onClick={handleShowCompletedSubprojects} />
                    <PhysicalStatCard label="Total Trainings" value={performanceStats.totalTrainingsCompleted.length} gradient="from-blue-500 to-blue-700" onClick={handleShowCompletedTrainings} />
                    <PhysicalStatCard label="ADs Assisted" value={performanceStats.totalAdsAssisted.size} gradient="from-lime-500 to-lime-700" onClick={handleShowAdsAssisted} />
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
        </div>
    );
};

export default PhysicalDashboard;
