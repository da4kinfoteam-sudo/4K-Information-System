
// Author: AI
// OS support: Any
import React from 'react';
import { Subproject, IPO, Training, OtherActivity, tiers, fundTypes, IpoIcon, ProjectsIcon, TrainingIcon, operatingUnits, ouToRegionMap } from '../constants';
import { useState, useMemo, useRef } from 'react';
import { parseLocation } from './LocationPicker';

type ModalItem = {
    id: string | number;
    name: string;
    details?: string;
};

export interface DashboardsPageProps {
    subprojects: Subproject[];
    ipos: IPO[];
    trainings: Training[];
    otherActivities: OtherActivity[];
}

type DashboardTab = 'Physical' | 'Financial' | 'GAD' | 'IPO Level of Development' | 'Nutrition' | 'Farm Productivity and Income';

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
    const total = Object.values(data).reduce((sum: number, value: number) => sum + value, 0);
    if (total === 0) return <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No data available.</p>;

    let cumulativePercentage = 0;
    const gradientStops = Object.entries(data)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .map(([_, value]: [string, number], index) => {
        const percentage = (value / (total as number)) * 100;
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
                    {Object.entries(data).sort(([, a], [, b]) => (b as number) - (a as number)).map(([label, value], index) => (
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

    const indicators: { key: 'subprojects' | 'ipos' | 'trainings'; label: string; color: string }[] = [
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
                                    const value = data[q][indicator.key];
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
    const maxVal = Math.max(...(Object.values(data) as number[]));
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
                 const val = value as number;
                 const height = maxValue > 0 ? (val / maxValue) * 100 : 0;
                 return(
                    <div key={key} className="w-full flex flex-col items-center justify-end">
                         <span className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-0.5">{val}</span>
                         <div
                            className={`${colors[key]} w-3/5 rounded-t-sm hover:brightness-110 transition-all`}
                            style={{ height: `${height}%`}}
                            title={`${indicators.find(i => i.key === key)?.label}: ${val}`}
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
                const maxVal = Math.max(1, ...(Object.values(provinceData.targets) as number[]), ...(Object.values(provinceData.accomplishments) as number[]));
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

const RankingList: React.FC<{ 
    title: string; 
    items: { name: string; count: number }[]; 
    icon?: React.ReactNode;
    colorClass?: string;
}> = ({ title, items, icon, colorClass = "text-gray-900" }) => {
    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md h-full flex flex-col">
            <div className="flex items-center gap-3 mb-4 border-b border-gray-100 dark:border-gray-700 pb-3">
                <div className={`p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 ${colorClass}`}>
                    {icon}
                </div>
                <h4 className="font-semibold text-gray-800 dark:text-white">{title}</h4>
            </div>
            <div className="overflow-y-auto max-h-96 pr-2 flex-1 custom-scrollbar">
                 <ul className="space-y-2">
                    {items.map((item, index) => (
                        <li key={item.name} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                            <div className="flex items-center gap-3">
                                <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                                    index === 0 ? 'bg-yellow-100 text-yellow-700 ring-1 ring-yellow-400' : 
                                    index === 1 ? 'bg-gray-200 text-gray-700 ring-1 ring-gray-400' : 
                                    index === 2 ? 'bg-orange-100 text-orange-800 ring-1 ring-orange-400' : 
                                    'bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
                                }`}>
                                    {index + 1}
                                </span>
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{item.name}</span>
                            </div>
                            <span className={`text-sm font-bold ${colorClass}`}>{item.count}</span>
                        </li>
                    ))}
                    {items.length === 0 && <li className="text-sm text-gray-500 text-center italic py-4">No data available</li>}
                </ul>
            </div>
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

const DashboardsPage: React.FC<DashboardsPageProps> = (props) => {
    const [activeTab, setActiveTab] = useState<DashboardTab>('Physical');
    const [modalData, setModalData] = useState<{ title: string; items: ModalItem[] } | null>(null);
    const [selectedYear, setSelectedYear] = useState<string>('All');
    const [selectedOu, setSelectedOu] = useState<string>('All');
    const [selectedTier, setSelectedTier] = useState<string>('All');
    const [selectedFundType, setSelectedFundType] = useState<string>('All');

    const availableYears = useMemo(() => {
        const years = new Set<string>();
        props.subprojects.forEach(p => p.fundingYear && years.add(p.fundingYear.toString()));
        props.trainings.forEach(t => t.fundingYear && years.add(t.fundingYear.toString()));
        props.ipos.forEach(i => years.add(new Date(i.registrationDate).getFullYear().toString()));
        props.otherActivities.forEach(a => years.add(new Date(a.date).getFullYear().toString()));
        return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
    }, [props.subprojects, props.trainings, props.ipos, props.otherActivities]);

    const filteredData = useMemo(() => {
        let data = {
            subprojects: [...props.subprojects],
            ipos: [...props.ipos],
            trainings: [...props.trainings],
            otherActivities: [...props.otherActivities]
        };

        // Filter by Year
        if (selectedYear !== 'All') {
            data.subprojects = data.subprojects.filter(p => p.fundingYear?.toString() === selectedYear);
            data.ipos = data.ipos.filter(i => new Date(i.registrationDate).getFullYear().toString() === selectedYear);
            data.trainings = data.trainings.filter(t => t.fundingYear?.toString() === selectedYear);
            data.otherActivities = data.otherActivities.filter(a => new Date(a.date).getFullYear().toString() === selectedYear);
        }

        // Filter by Tier
        if (selectedTier !== 'All') {
            data.subprojects = data.subprojects.filter(p => p.tier === selectedTier);
            data.trainings = data.trainings.filter(t => t.tier === selectedTier);
            data.otherActivities = data.otherActivities.filter(a => a.tier === selectedTier);
        }

        // Filter by Fund Type
        if (selectedFundType !== 'All') {
            data.subprojects = data.subprojects.filter(p => p.fundType === selectedFundType);
            data.trainings = data.trainings.filter(t => t.fundType === selectedFundType);
            data.otherActivities = data.otherActivities.filter(a => a.fundType === selectedFundType);
        }

        // Filter by OU
        if (selectedOu !== 'All') {
            const targetRegion = ouToRegionMap[selectedOu];
            data.subprojects = data.subprojects.filter(p => p.operatingUnit === selectedOu);
            data.trainings = data.trainings.filter(t => t.operatingUnit === selectedOu);
            data.otherActivities = data.otherActivities.filter(a => a.operatingUnit === selectedOu);
            data.ipos = data.ipos.filter(i => i.region === targetRegion);
        }

        return data;
    }, [selectedYear, selectedOu, selectedTier, selectedFundType, props]);

    const TabButton: React.FC<{ tabName: DashboardTab; label: string }> = ({ tabName, label }) => {
        const isActive = activeTab === tabName;
        return (
            <button
                type="button"
                onClick={() => setActiveTab(tabName)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-200 whitespace-nowrap
                    ${isActive
                        ? 'border-accent text-accent dark:text-green-400 dark:border-green-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
            >
                {label}
            </button>
        );
    };

    return (
        <div className="relative">
            <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Strategic Dashboard</h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                     <div className="flex items-center gap-2">
                        <label htmlFor="ou-filter" className="text-sm font-medium text-gray-600 dark:text-gray-300">OU:</label>
                        <select 
                            id="ou-filter"
                            value={selectedOu}
                            onChange={(e) => setSelectedOu(e.target.value)}
                            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-10 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
                        >
                            <option value="All">All OUs</option>
                            {operatingUnits.map(ou => (
                                <option key={ou} value={ou}>{ou}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <label htmlFor="tier-filter" className="text-sm font-medium text-gray-600 dark:text-gray-300">Tier:</label>
                        <select 
                            id="tier-filter"
                            value={selectedTier}
                            onChange={(e) => setSelectedTier(e.target.value)}
                            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-10 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
                        >
                            <option value="All">All Tiers</option>
                            {tiers.map(tier => (
                                <option key={tier} value={tier}>{tier}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <label htmlFor="fund-type-filter" className="text-sm font-medium text-gray-600 dark:text-gray-300">Fund Type:</label>
                        <select 
                            id="fund-type-filter"
                            value={selectedFundType}
                            onChange={(e) => setSelectedFundType(e.target.value)}
                            className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 pl-3 pr-10 focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
                        >
                            <option value="All">All Fund Types</option>
                            {fundTypes.map(ft => (
                                <option key={ft} value={ft}>{ft}</option>
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

            {/* Tabs Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md mb-6">
                <div className="border-b border-gray-200 dark:border-gray-700">
                    <nav className="-mb-px flex space-x-4 px-4 overflow-x-auto" aria-label="Tabs">
                        <TabButton tabName="Physical" label="Physical" />
                        <TabButton tabName="Financial" label="Financial" />
                        <TabButton tabName="GAD" label="GAD" />
                        <TabButton tabName="IPO Level of Development" label="IPO Level of Development" />
                        <TabButton tabName="Nutrition" label="Nutrition" />
                        <TabButton tabName="Farm Productivity and Income" label="Farm Productivity and Income" />
                    </nav>
                </div>
            </div>

            {/* Tab Content */}
            {activeTab === 'Physical' ? (
                <PhysicalDashboard data={filteredData} setModalData={setModalData} />
            ) : (
                <div className="bg-white dark:bg-gray-800 p-12 rounded-lg shadow-md flex flex-col items-center justify-center text-center min-h-[400px]">
                    <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-full mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                    </div>
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">{activeTab} Dashboard</h3>
                    <p className="text-gray-500 dark:text-gray-400 max-w-md">
                        This section is currently under construction. Please check back later for updates on {activeTab.toLowerCase()} metrics.
                    </p>
                </div>
            )}
            
            {modalData && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setModalData(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white">{modalData.title}</h3>
                            <button onClick={() => setModalData(null)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto custom-scrollbar">
                            {modalData.items.length > 0 ? (
                                <ul className="space-y-3">
                                    {modalData.items.map((item, index) => (
                                        <li key={index} className="border-b border-gray-100 dark:border-gray-700 last:border-0 pb-2 last:pb-0">
                                            <p className="font-semibold text-sm text-gray-800 dark:text-gray-200">{item.name}</p>
                                            {item.details && <p className="text-xs text-gray-500 dark:text-gray-400">{item.details}</p>}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-gray-500 text-center">No items found.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DashboardsPage;
