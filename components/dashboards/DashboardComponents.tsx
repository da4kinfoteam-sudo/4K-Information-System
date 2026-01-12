
import React from 'react';

export interface ModalItem {
    id: string | number;
    name: string;
    details?: string;
}

export const AccomplishmentCard: React.FC<{ label: string; value: number; onClick?: () => void; }> = ({ label, value, onClick }) => (
    <div 
        className={`bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md text-center ${onClick ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors' : ''}`}
        onClick={onClick}
    >
        <p className="text-3xl font-bold text-accent dark:text-green-400">{value.toLocaleString()}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{label}</p>
    </div>
);

export const QuarterlyBarChart: React.FC<{
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

export const IpoEngagementChart: React.FC<{
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

export type IndicatorData = { subprojects: number; ipos: number; trainings: number; ads: number; };

export const ProvincialComparisonChart: React.FC<{ data: { [province: string]: { targets: IndicatorData; accomplishments: IndicatorData } } }> = ({ data }) => {
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

export const RankingList: React.FC<{ 
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
