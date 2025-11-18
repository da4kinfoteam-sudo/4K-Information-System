

import React from 'react';
import { Subproject, IPO, Training, OtherActivity, philippineRegions } from '../constants';
import { useState, useMemo, useRef } from 'react';
import { parseLocation } from './LocationPicker';

type ModalItem = {
    id: string | number;
    name: string;
    details?: string;
};

const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
};


// --- Reusable UI Components ---

const AccomplishmentCard: React.FC<{ label: string; value: number; onClick?: () => void; }> = ({ label, value, onClick }) => (
    <div 
        className={`bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md text-center ${onClick ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors' : ''}`}
        onClick={onClick}
    >
        <p className="text-3xl font-bold text-accent dark:text-green-400">{value.toLocaleString()}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{label}</p>
    </div>
);


const DoughnutChart: React.FC<{ data: Record<string, number>, colors: string[] }> = ({ data, colors }) => {
    const total = Object.values(data).reduce((sum, value) => sum + value, 0);
    if (total === 0) return <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No data available.</p>;

    let cumulativePercentage = 0;
    const gradientStops = Object.entries(data)
      .sort(([, a], [, b]) => b - a)
      .map(([_, value], index) => {
        const percentage = (value / total) * 100;
        const start = cumulativePercentage;
        const end = cumulativePercentage + percentage;
        cumulativePercentage = end;
        return `${colors[index % colors.length]} ${start}% ${end}%`;
    });
    const conicGradient = `conic-gradient(${gradientStops.join(', ')})`;

    return (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 p-4">
            <div className="relative w-32 h-32 rounded-full" style={{ background: conicGradient }}>
                <div className="absolute inset-2 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center">
                    <span className="font-bold text-2xl text-gray-800 dark:text-white">{total}</span>
                </div>
            </div>
            <div className="flex-shrink-0">
                <ul className="space-y-1 text-sm">
                    {Object.entries(data).sort(([, a], [, b]) => b - a).map(([label, value], index) => (
                        <li key={label} className="flex items-center">
                            <span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: colors[index % colors.length] }}></span>
                            <span className="text-gray-600 dark:text-gray-300">{label}:</span>
                            <span className="font-semibold ml-1 text-gray-800 dark:text-white">{value}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};


const QuarterlyBarChart: React.FC<{
    title: string;
    data: { [key: string]: { subprojects: number; trainings: number; ipos: number; } };
}> = ({ title, data }) => {
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    const maxVal = Math.max(1, ...quarters.flatMap(q => [data[q].subprojects, data[q].trainings, data[q].ipos]));
    const yAxisMax = maxVal === 1 ? 2 : Math.ceil(maxVal / 1.1 / 5) * 5;

    const indicators = [
        { key: 'subprojects', label: 'Subprojects', color: 'bg-accent dark:bg-green-700' },
        { key: 'ipos', label: 'IPOs', color: 'bg-teal-400 dark:bg-teal-600' },
        { key: 'trainings', label: 'Trainings', color: 'bg-green-300 dark:bg-green-500' }
    ];

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md h-full flex flex-col">
            <h4 className="font-semibold text-gray-800 dark:text-white mb-4">{title}</h4>
            <div className="flex-grow flex items-end gap-4" aria-label={title}>
                {/* Y Axis */}
                <div className="h-full flex flex-col justify-between text-xs text-gray-400 pb-6">
                    <span>{yAxisMax}</span>
                    <span>{yAxisMax > 1 ? Math.round(yAxisMax / 2) : ''}</span>
                    <span>0</span>
                </div>

                {/* Bars container */}
                <div className="flex-grow h-full flex justify-around border-l border-b border-gray-200 dark:border-gray-700">
                    {quarters.map(q => (
                        <div key={q} className="flex-1 flex flex-col items-center justify-end">
                            <div className="flex-grow flex items-end justify-center gap-1 w-full">
                                {indicators.map(indicator => {
                                    const value = data[q][indicator.key as keyof typeof data[typeof q]];
                                    const height = yAxisMax > 0 ? (value / yAxisMax) * 100 : 0;
                                    return (
                                        <div 
                                            key={indicator.key}
                                            title={`${indicator.label}: ${value}`}
                                            className={`${indicator.color} w-1/4 rounded-t-sm hover:brightness-110 transition-all`}
                                            style={{ height: `${height}%` }}
                                        ></div>
                                    );
                                })}
                            </div>
                            <span className="text-xs font-semibold pt-2 text-gray-500 dark:text-gray-400">{q}</span>
                        </div>
                    ))}
                </div>
            </div>
             <div className="flex justify-center gap-4 mt-4 text-xs">
                {indicators.map(indicator => (
                     <div key={indicator.key} className="flex items-center"><span className={`w-3 h-3 ${indicator.color.split(' ')[0]} mr-2 rounded-sm`}></span>{indicator.label}</div>
                ))}
            </div>
        </div>
    );
};

const IpoEngagementChart: React.FC<{
    data: { [key: string]: number };
}> = ({ data }) => {
    const maxVal = Math.max(...Object.values(data));
    const yAxisMax = maxVal === 0 ? 10 : Math.ceil(maxVal / 1.1 / 5) * 5;
    const categories = Object.keys(data);
    const colors = ['bg-accent', 'bg-green-500', 'bg-teal-500', 'bg-cyan-500'];

    return (
         <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md h-full flex flex-col">
            <h4 className="font-semibold text-gray-800 dark:text-white mb-4">IPO Engagement Breakdown</h4>
            <div className="flex-grow flex items-end gap-4" aria-label="IPO Engagement Breakdown Chart">
                {/* Y Axis */}
                <div className="h-full flex flex-col justify-between text-xs text-gray-400 pb-6">
                    <span>{yAxisMax}</span>
                    <span>{yAxisMax > 1 ? Math.round(yAxisMax / 2) : ''}</span>
                    <span>0</span>
                </div>
                 {/* Bars */}
                <div className={`flex-grow h-full grid grid-cols-${categories.length} gap-4 border-l border-b border-gray-200 dark:border-gray-700`}>
                    {categories.map((cat, index) => {
                        const value = data[cat];
                        const height = yAxisMax > 0 ? (value / yAxisMax) * 100 : 0;
                        return (
                            <div key={cat} className="flex flex-col items-center justify-end">
                                <span className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">{value}</span>
                                <div 
                                    title={`${cat}: ${value}`} 
                                    className={`${colors[index % colors.length]} w-3/5 hover:brightness-110 rounded-t-md transition-all duration-300`} 
                                    style={{ height: `${height}%` }}
                                ></div>
                                <span className="text-xs text-center font-semibold pt-2 text-gray-500 dark:text-gray-400">{cat}</span>
                            </div>
                        )
                    })}
                </div>
             </div>
        </div>
    )
}
type IndicatorData = { subprojects: number; ipos: number; trainings: number; ads: number; };

const ProvincialComparisonChart: React.FC<{ data: { [province: string]: { targets: IndicatorData; accomplishments: IndicatorData } } }> = ({ data }) => {
    const provinces = Object.keys(data).sort();
    if (provinces.length === 0) {
        return <p className="text-sm text-center text-gray-500 dark:text-gray-400 py-4">No provincial data to display for the selected filter.</p>;
    }

    const indicators = [
        { key: 'subprojects', label: 'Subproj.', color: 'bg-accent' },
        { key: 'ipos', label: 'IPOs', color: 'bg-teal-500' },
        { key: 'trainings', label: 'Trainings', color: 'bg-green-500' },
        { key: 'ads', label: 'ADs', color: 'bg-cyan-500' },
    ];
    

    const MiniBarChart: React.FC<{ data: IndicatorData; maxValue: number; colors: { [key: string]: string } }> = ({ data, maxValue, colors }) => (
        <div className="flex-grow h-full flex justify-around border-l border-b border-gray-200 dark:border-gray-700 relative">
            {Object.entries(data).map(([key, value], index) => {
                 const height = maxValue > 0 ? (value / maxValue) * 100 : 0;
                 return(
                    <div key={key} className="w-full flex flex-col items-center justify-end">
                         <span className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-0.5">{value}</span>
                         <div
                            className={`${colors[key]} w-3/5 rounded-t-sm hover:brightness-110 transition-all`}
                            style={{ height: `${height}%`}}
                            title={`${indicators.find(i => i.key === key)?.label}: ${value}`}
                        ></div>
                    </div>
                 )
            })}
        </div>
    );

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {provinces.map(province => {
                const provinceData = data[province];
                const maxVal = Math.max(1, ...Object.values(provinceData.targets), ...Object.values(provinceData.accomplishments));
                const yAxisMax = Math.ceil(maxVal / 1.1 / 5) * 5;

                const indicatorColors = indicators.reduce((acc, ind) => ({...acc, [ind.key]: ind.color}), {});
                
                return (
                    <div key={province} className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
                        <h5 className="font-semibold text-center text-gray-700 dark:text-gray-300 mb-2">{province}</h5>
                        <div className="grid grid-cols-2 gap-4">
                            {/* Targets */}
                            <div className="h-48 flex flex-col">
                                <h6 className="text-center font-medium text-sm text-gray-600 dark:text-gray-400 mb-2">Targets</h6>
                                <div className="flex-grow flex items-end gap-2">
                                    <div className="h-full flex flex-col justify-between text-xs text-gray-400 pb-6">
                                        <span>{yAxisMax}</span>
                                        <span className="flex-grow"></span>
                                        <span>0</span>
                                    </div>
                                    <MiniBarChart data={provinceData.targets} maxValue={yAxisMax} colors={indicatorColors} />
                                </div>
                            </div>

                            {/* Accomplishments */}
                             <div className="h-48 flex flex-col">
                                <h6 className="text-center font-medium text-sm text-gray-600 dark:text-gray-400 mb-2">Accomplishments</h6>
                                <div className="flex-grow flex items-end gap-2">
                                    <div className="h-full flex flex-col justify-between text-xs text-gray-400 pb-6">
                                        <span>{yAxisMax}</span>
                                        <span className="flex-grow"></span>
                                        <span>0</span>
                                    </div>
                                    <MiniBarChart data={provinceData.accomplishments} maxValue={yAxisMax} colors={indicatorColors} />
                                </div>
                            </div>
                        </div>
                         <div className="flex justify-center gap-x-3 gap-y-1 flex-wrap mt-2 text-xs">
                            {indicators.map(indicator => (
                                <div key={indicator.key} className="flex items-center"><span className={`w-2.5 h-2.5 ${indicator.color} mr-1.5 rounded-sm`}></span>{indicator.label}</div>
                            ))}
                        </div>
                    </div>
                )
            })}
        </div>
    );
};

// --- Physical Dashboard Tab Content ---
const PhysicalDashboard: React.FC<{ data: DashboardsPageProps, setModalData: (data: { title: string; items: ModalItem[] } | null) => void }> = ({ data, setModalData }) => {
    
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
                assistedAds.get(ipo.ancestralDomainNo)!.push(ipo.acronym);
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
        </div>
    );
}

const LevelOfDevelopmentDashboard: React.FC<{ ipos: IPO[] }> = ({ ipos }) => {
    const ipoLodCounts = useMemo(() => {
        return ipos.reduce((acc, ipo) => {
            const level = `Level ${ipo.levelOfDevelopment}`;
            acc[level] = (acc[level] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
    }, [ipos]);

    const lodColors = ['#38761D', '#4ADE80', '#2DD4BF', '#6EE7B7', '#A7F3D0'];

    return (
        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">IPOs by Level of Development</h3>
            <DoughnutChart data={ipoLodCounts} colors={lodColors} />
        </div>
    );
};

interface DashboardsPageProps {
    subprojects: Subproject[];
    ipos: IPO[];
    trainings: Training[];
    otherActivities: OtherActivity[];
}

type DashboardTab = 'Physical' | 'Financial' | 'Level of Development' | 'Gender and Development';

const DashboardsPage: React.FC<DashboardsPageProps> = ({ subprojects, ipos, trainings, otherActivities }) => {
    const [activeTab, setActiveTab] = useState<DashboardTab>('Physical');
    const [selectedYear, setSelectedYear] = useState<string>('All');
    const [selectedRegion, setSelectedRegion] = useState<string>('All');
    const [modalData, setModalData] = useState<{ title: string; items: ModalItem[] } | null>(null);

    const availableYears = useMemo(() => {
        const years = new Set<string>();
        subprojects.forEach(p => years.add(new Date(p.startDate).getFullYear().toString()));
        ipos.forEach(i => years.add(new Date(i.registrationDate).getFullYear().toString()));
        trainings.forEach(t => years.add(new Date(t.date).getFullYear().toString()));
        otherActivities.forEach(a => years.add(new Date(a.date).getFullYear().toString()));
        return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
    }, [subprojects, ipos, trainings, otherActivities]);

    const filteredData = useMemo(() => {
        let yearFiltered = {
            subprojects: selectedYear === 'All' ? subprojects : subprojects.filter(p => new Date(p.startDate).getFullYear() === parseInt(selectedYear)),
            ipos: selectedYear === 'All' ? ipos : ipos.filter(i => new Date(i.registrationDate).getFullYear() === parseInt(selectedYear)),
            trainings: selectedYear === 'All' ? trainings : trainings.filter(t => new Date(t.date).getFullYear() === parseInt(selectedYear)),
            otherActivities: selectedYear === 'All' ? otherActivities : otherActivities.filter(a => new Date(a.date).getFullYear() === parseInt(selectedYear)),
        };

        if (selectedRegion === 'All') {
            return yearFiltered;
        }

        if (selectedRegion === 'Online') {
            return {
                ...yearFiltered,
                subprojects: [],
                ipos: [],
                trainings: yearFiltered.trainings.filter(t => t.location === 'Online'),
                otherActivities: yearFiltered.otherActivities.filter(a => a.location === 'Online'),
            }
        }
        
        const iposInRegionSet = new Set(ipos.filter(i => i.region === selectedRegion).map(i => i.name));
        const regionFilteredSubprojects = yearFiltered.subprojects.filter(p => iposInRegionSet.has(p.indigenousPeopleOrganization));
        const regionFilteredIpos = yearFiltered.ipos.filter(i => i.region === selectedRegion);
        const regionFilteredTrainings = yearFiltered.trainings.filter(t => t.participatingIpos.some(ipoName => iposInRegionSet.has(ipoName)));
        const regionFilteredOtherActivities = yearFiltered.otherActivities.filter(a => a.participatingIpos.some(ipoName => iposInRegionSet.has(ipoName)));

        return {
            subprojects: regionFilteredSubprojects,
            ipos: regionFilteredIpos,
            trainings: regionFilteredTrainings,
            otherActivities: regionFilteredOtherActivities,
        };

    }, [selectedYear, selectedRegion, subprojects, ipos, trainings, otherActivities]);
    
    const TabButton: React.FC<{ tabName: DashboardTab; label: string; }> = ({ tabName, label }) => {
        const isActive = activeTab === tabName;
        return (
            <button
                type="button"
                onClick={() => setActiveTab(tabName)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-200
                    ${isActive
                        ? 'border-accent text-accent dark:text-green-400 dark:border-green-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
            >
                {label}
            </button>
        );
    }
    
    const renderTabContent = () => {
        switch (activeTab) {
            case 'Physical':
                return <PhysicalDashboard data={filteredData} setModalData={setModalData} />;
            case 'Financial':
                return <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md"><h3 className="text-xl font-semibold">Financial Dashboard</h3><p className="mt-2 text-gray-600 dark:text-gray-400">Content for financial data will be displayed here.</p></div>;
            case 'Level of Development':
                return <LevelOfDevelopmentDashboard ipos={filteredData.ipos} />;
            case 'Gender and Development':
                return <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md"><h3 className="text-xl font-semibold">Gender and Development (GAD) Dashboard</h3><p className="mt-2 text-gray-600 dark:text-gray-400">Content for GAD-related data will be displayed here.</p></div>;
            default:
                return null;
        }
    };

    return (
        <div className="dashboard-page">
             {modalData && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4"
                    onClick={() => setModalData(null)}
                >
                    <div 
                        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="text-xl font-semibold text-gray-800 dark:text-white">{modalData.title}</h3>
                            <button 
                                onClick={() => setModalData(null)}
                                className="text-gray-400 hover:text-gray-700 dark:hover:text-white text-2xl"
                                aria-label="Close modal"
                            >&times;</button>
                        </div>
                        <div className="p-4 overflow-y-auto">
                            {modalData.items.length > 0 ? (
                                <table className="min-w-full text-sm text-left">
                                    <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase">
                                        <tr>
                                            <th className="px-4 py-2">Name</th>
                                            <th className="px-4 py-2">Details</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                        {modalData.items.map(item => (
                                            <tr key={item.id}>
                                                <td className="px-4 py-2 font-medium">{item.name}</td>
                                                <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{item.details}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <p className="text-center text-gray-500 dark:text-gray-400 py-8">No items to display.</p>
                            )}
                        </div>
                         <div className="p-4 border-t border-gray-200 dark:border-gray-700 text-right">
                            <button 
                                onClick={() => setModalData(null)}
                                className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                            >Close</button>
                        </div>
                    </div>
                </div>
            )}
            <div className="space-y-6 print-hidden">
                <div className="flex flex-wrap justify-between items-center gap-4">
                    <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Dashboard</h2>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                         <div className="flex items-center gap-2">
                            <label htmlFor="region-filter" className="text-sm font-medium text-gray-600 dark:text-gray-300">Region:</label>
                            <select 
                                id="region-filter"
                                value={selectedRegion}
                                onChange={(e) => setSelectedRegion(e.target.value)}
                                className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-10 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
                            >
                                <option value="All">All Regions</option>
                                <option value="Online">Online</option>
                                {philippineRegions.map(region => (
                                    <option key={region} value={region}>{region}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <label htmlFor="year-filter" className="text-sm font-medium text-gray-600 dark:text-gray-300">Year:</label>
                            <select 
                                id="year-filter"
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(e.target.value)}
                                className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-10 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
                            >
                                <option value="All">All Years</option>
                                {availableYears.map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md">
                    <div className="border-b border-gray-200 dark:border-gray-700">
                        <nav className="-mb-px flex space-x-4 px-4 overflow-x-auto" aria-label="Tabs">
                            <TabButton tabName="Physical" label="Physical" />
                            <TabButton tabName="Financial" label="Financial" />
                            <TabButton tabName="Level of Development" label="Level of Development" />
                            <TabButton tabName="Gender and Development" label="Gender & Development" />
                        </nav>
                    </div>
                </div>
            </div>

            <div className="mt-4">
                {renderTabContent()}
            </div>
        </div>
    );
};

export default DashboardsPage;