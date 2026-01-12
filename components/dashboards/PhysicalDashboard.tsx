
import React, { useMemo } from 'react';
import { Subproject, IPO, Training, OtherActivity, IpoIcon, ProjectsIcon, TrainingIcon } from '../../constants';
import { parseLocation } from '../LocationPicker';
import { 
    AccomplishmentCard, QuarterlyBarChart, IpoEngagementChart, 
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

        data.subprojects.forEach(p => {
            if (p.startDate) {
                const quarter = getQuarter(new Date(p.startDate));
                if (quarter >= 1 && quarter <= 4) targets[`Q${quarter}`].subprojects++;
            }
        });
        data.trainings.forEach(t => {
            if (t.date) {
                const quarter = getQuarter(new Date(t.date));
                if (quarter >= 1 && quarter <= 4) targets[`Q${quarter}`].trainings++;
            }
        });
        data.ipos.forEach(ipo => {
            if(ipo.registrationDate) {
                const quarter = getQuarter(new Date(ipo.registrationDate));
                if (quarter >= 1 && quarter <= 4) targets[`Q${quarter}`].ipos++;
            }
        });
        return targets as any;
    }, [data.subprojects, data.trainings, data.ipos]);
    
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
            const quarter = getQuarter(new Date(t.date));
            if (!assistedIposByQuarter.has(quarter)) assistedIposByQuarter.set(quarter, new Set());
            t.participatingIpos.forEach(ipoName => assistedIposByQuarter.get(quarter)!.add(ipoName));

            if (quarter >= 1 && quarter <= 4) accomplishments[`Q${quarter}`].trainings++;
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

     const ipoEngagementData = useMemo(() => {
        const trainedIpos = new Set(data.trainings.flatMap(t => t.participatingIpos));
        const iposWithCompletedSubprojects = new Set(data.subprojects.filter(p => p.status === 'Completed').map(p => p.indigenousPeopleOrganization));
        
        const assistedIpoNames = new Set([
            ...trainedIpos,
            ...iposWithCompletedSubprojects
        ]);

        const assistedDomains = new Set<string>();
        data.ipos.forEach(ipo => {
            if (assistedIpoNames.has(ipo.name) && ipo.ancestralDomainNo) {
                assistedDomains.add(ipo.ancestralDomainNo);
            }
        });

        return {
            'Total IPOs': data.ipos.length,
            'IPOs Trained': trainedIpos.size,
            'IPOs w/ Subprojects': iposWithCompletedSubprojects.size,
            'ADs Assisted': assistedDomains.size
        };
    }, [data.ipos, data.trainings, data.subprojects]);

    const completedSubprojectsCount = useMemo(() => {
        return data.subprojects.filter(p => p.status === 'Completed').length;
    }, [data.subprojects]);

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
            
            const trainedIpoNames = new Set(data.trainings.filter(t => provinceMap[province].trainings.has(t.id)).flatMap(t => t.participatingIpos));
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
                    trainings: targetTrainings, // Assuming all trainings are accomplished
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
            if (sp.operatingUnit) {
                const s = ensureOu(sp.operatingUnit);
                s.subprojects++;
                s.ipos.add(sp.indigenousPeopleOrganization);
            }
        });

        data.trainings.forEach(t => {
            if (t.operatingUnit) {
                const s = ensureOu(t.operatingUnit);
                s.trainings++;
                t.participatingIpos.forEach(ipo => s.ipos.add(ipo));
            }
        });

        data.otherActivities.forEach(oa => {
             if (oa.operatingUnit) {
                const s = ensureOu(oa.operatingUnit);
                oa.participatingIpos.forEach(ipo => s.ipos.add(ipo));
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


    const handleShowTotalIpos = () => {
        const items = data.ipos.map(ipo => ({ id: ipo.id, name: ipo.name, details: ipo.location }));
        setModalData({ title: 'Total IPOs', items });
    };

    const handleShowIposTrained = () => {
        const trainedIpoNames = new Set(data.trainings.flatMap(t => t.participatingIpos));
        const items = data.ipos.filter(ipo => trainedIpoNames.has(ipo.name)).map(ipo => ({ id: ipo.id, name: ipo.name, details: ipo.location }));
        setModalData({ title: 'IPOs Trained', items });
    };

    const handleShowIposWithSubprojects = () => {
        const ipoNames = new Set(data.subprojects.filter(p => p.status === 'Completed').map(p => p.indigenousPeopleOrganization));
        const items = data.ipos.filter(ipo => ipoNames.has(ipo.name)).map(ipo => ({ id: ipo.id, name: ipo.name, details: ipo.location }));
        setModalData({ title: 'IPOs with Completed Subprojects', items });
    };

    const handleShowCompletedSubprojects = () => {
        const items = data.subprojects.filter(p => p.status === 'Completed').map(p => ({ id: p.id, name: p.name, details: `Completed on: ${formatDate(p.actualCompletionDate)}` }));
        setModalData({ title: 'Completed Subprojects', items });
    };

    const handleShowAdsAssisted = () => {
        const assistedIpoNames = new Set([...data.trainings.flatMap(t => t.participatingIpos), ...data.subprojects.filter(p => p.status === 'Completed').map(p => p.indigenousPeopleOrganization)]);
        const assistedAds = new Map<string, string[]>();
        data.ipos.forEach(ipo => {
            if (assistedIpoNames.has(ipo.name) && ipo.ancestralDomainNo) {
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
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <AccomplishmentCard label="Total IPOs" value={data.ipos.length} onClick={handleShowTotalIpos} />
                    <AccomplishmentCard label="IPOs Trained" value={ipoEngagementData['IPOs Trained']} onClick={handleShowIposTrained} />
                    <AccomplishmentCard label="IPOs w/ Completed Subprojects" value={ipoEngagementData['IPOs w/ Subprojects']} onClick={handleShowIposWithSubprojects} />
                    <AccomplishmentCard label="Subprojects Completed" value={completedSubprojectsCount} onClick={handleShowCompletedSubprojects} />
                    <AccomplishmentCard label="ADs Assisted" value={ipoEngagementData['ADs Assisted']} onClick={handleShowAdsAssisted} />
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
                     <IpoEngagementChart data={ipoEngagementData} />
                     <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md flex items-center justify-center">
                        <p className="text-gray-500 dark:text-gray-400">Additional metrics can be shown here.</p>
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
                 <h3 id="ou-rankings" className="text-2xl font-semibold text-gray-800 dark:text-white mb-4">Operating Unit Rankings</h3>
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
                        colorClass="text-blue-600 dark:text-blue-400"
                        icon={<ProjectsIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
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
