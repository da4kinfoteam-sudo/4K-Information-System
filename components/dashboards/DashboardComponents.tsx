
import React from 'react';

export interface ModalItem {
    id: string | number;
    name: string;
    details?: string;
}

export const AccomplishmentCard: React.FC<{ label: string; value: number; onClick?: () => void; }> = ({ label, value, onClick }) => (
    <div 
        className={`dashboard-accomplishment-card ${onClick ? 'dashboard-accomplishment-card--clickable' : ''}`}
        onClick={onClick}
    >
        <p className="dashboard-accomplishment-card__value">{value.toLocaleString()}</p>
        <p className="dashboard-accomplishment-card__label">{label}</p>
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
        { key: 'subprojects', label: 'Subprojects', color: 'bg-emerald-500' },
        { key: 'ipos', label: 'IPOs', color: 'bg-teal-500' },
        { key: 'trainings', label: 'Trainings', color: 'bg-green-500' }
    ];

    return (
        <div className="dashboard-chart-card">
            <h4 className="dashboard-chart-title">{title}</h4>
            <div className="dashboard-chart-area" aria-label={title}>
                {/* Y Axis */}
                <div className="dashboard-chart-axis">
                    <span>{yAxisMax}</span>
                    <span>{yAxisMax > 1 ? Math.round(yAxisMax / 2) : ''}</span>
                    <span>0</span>
                </div>

                {/* Bars container */}
                <div className="dashboard-chart-frame dashboard-chart-frame--quarters">
                    {quarters.map(q => (
                        <div key={q} className="dashboard-chart-quarter">
                            <div className="dashboard-chart-bars">
                                {indicators.map(indicator => {
                                    const value = data[q][indicator.key];
                                    const height = yAxisMax > 0 ? (value / yAxisMax) * 100 : 0;
                                    return (
                                        <div 
                                            key={indicator.key}
                                            title={`${indicator.label}: ${value}`}
                                            className={`${indicator.color} dashboard-bar dashboard-bar--quarter`}
                                            style={{ height: `${height}%` }}
                                        ></div>
                                    );
                                })}
                            </div>
                            <span className="dashboard-chart-label">{q}</span>
                        </div>
                    ))}
                </div>
            </div>
             <div className="dashboard-chart-legend">
                {indicators.map(indicator => (
                     <div key={indicator.key} className="dashboard-chart-legend__item"><span className={`dashboard-chart-swatch ${indicator.color.split(' ')[0]}`}></span>{indicator.label}</div>
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
    const colors = ['bg-emerald-500', 'bg-teal-500', 'bg-green-500', 'bg-lime-500'];

    return (
         <div className="dashboard-chart-card">
            <h4 className="dashboard-chart-title">IPO Engagement Breakdown</h4>
            <div className="dashboard-chart-area" aria-label="IPO Engagement Breakdown Chart">
                {/* Y Axis */}
                <div className="dashboard-chart-axis">
                    <span>{yAxisMax}</span>
                    <span>{yAxisMax > 1 ? Math.round(yAxisMax / 2) : ''}</span>
                    <span>0</span>
                </div>
                 {/* Bars */}
                <div className="dashboard-chart-frame dashboard-chart-frame--categories" style={{ gridTemplateColumns: `repeat(${categories.length}, minmax(0, 1fr))` }}>
                    {categories.map((cat, index) => {
                        const value = data[cat];
                        const height = yAxisMax > 0 ? (value / yAxisMax) * 100 : 0;
                        return (
                            <div key={cat} className="dashboard-chart-category">
                                <span className="dashboard-chart-value">{value}</span>
                                <div 
                                    title={`${cat}: ${value}`} 
                                    className={`${colors[index % colors.length]} dashboard-bar dashboard-bar--category`} 
                                    style={{ height: `${height}%` }}
                                ></div>
                                <span className="dashboard-chart-label dashboard-chart-label--category">{cat}</span>
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
        { key: 'subprojects', label: 'Subproj.', color: 'bg-emerald-500' },
        { key: 'ipos', label: 'IPOs', color: 'bg-teal-500' },
        { key: 'trainings', label: 'Trainings', color: 'bg-green-500' },
        { key: 'ads', label: 'ADs', color: 'bg-lime-500' },
    ];
    

    const MiniBarChart: React.FC<{ data: IndicatorData; maxValue: number; colors: { [key: string]: string } }> = ({ data, maxValue, colors }) => (
        <div className="dashboard-chart-frame dashboard-chart-frame--mini">
            {Object.entries(data).map(([key, value], index) => {
                 const val = value as number;
                 const height = maxValue > 0 ? (val / maxValue) * 100 : 0;
                 return(
                    <div key={key} className="dashboard-chart-category">
                         <span className="dashboard-chart-value dashboard-chart-value--mini">{val}</span>
                         <div
                            className={`${colors[key]} dashboard-bar dashboard-bar--mini`}
                            style={{ height: `${height}%`}}
                            title={`${indicators.find(i => i.key === key)?.label}: ${val}`}
                        ></div>
                    </div>
                 )
            })}
        </div>
    );

    return (
        <div className="dashboard-province-grid">
            {provinces.map(province => {
                const provinceData = data[province];
                const maxVal = Math.max(1, ...(Object.values(provinceData.targets) as number[]), ...(Object.values(provinceData.accomplishments) as number[]));
                const yAxisMax = Math.ceil(maxVal / 1.1 / 5) * 5;

                const indicatorColors = indicators.reduce((acc, ind) => ({...acc, [ind.key]: ind.color}), {});
                
                return (
                    <div key={province} className="dashboard-province-card">
                        <h5 className="dashboard-province-card__title">{province}</h5>
                        <div className="dashboard-province-card__grid">
                            {/* Targets */}
                            <div className="dashboard-mini-chart">
                                <h6 className="dashboard-mini-chart__title">Targets</h6>
                                <div className="dashboard-mini-chart__body">
                                    <div className="dashboard-chart-axis dashboard-chart-axis--mini">
                                        <span>{yAxisMax}</span>
                                        <span></span>
                                        <span>0</span>
                                    </div>
                                    <MiniBarChart data={provinceData.targets} maxValue={yAxisMax} colors={indicatorColors} />
                                </div>
                            </div>

                            {/* Accomplishments */}
                             <div className="dashboard-mini-chart">
                                <h6 className="dashboard-mini-chart__title">Accomplishments</h6>
                                <div className="dashboard-mini-chart__body">
                                    <div className="dashboard-chart-axis dashboard-chart-axis--mini">
                                        <span>{yAxisMax}</span>
                                        <span></span>
                                        <span>0</span>
                                    </div>
                                    <MiniBarChart data={provinceData.accomplishments} maxValue={yAxisMax} colors={indicatorColors} />
                                </div>
                            </div>
                        </div>
                         <div className="dashboard-chart-legend dashboard-chart-legend--compact">
                            {indicators.map(indicator => (
                                <div key={indicator.key} className="dashboard-chart-legend__item"><span className={`dashboard-chart-swatch dashboard-chart-swatch--small ${indicator.color}`}></span>{indicator.label}</div>
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
        <div className="dashboard-ranking-card">
            <div className="dashboard-ranking-card__header">
                <div className={`dashboard-ranking-card__icon ${colorClass}`}>
                    {icon}
                </div>
                <h4>{title}</h4>
            </div>
            <div className="dashboard-ranking-card__body custom-scrollbar">
                 <ul className="dashboard-ranking-list">
                    {items.map((item, index) => (
                        <li key={item.name} className="dashboard-ranking-list__item">
                            <div className="dashboard-ranking-list__name">
                                <span className={`dashboard-ranking-list__rank dashboard-ranking-list__rank--${index < 3 ? index + 1 : 'default'}`}>
                                    {index + 1}
                                </span>
                                <span>{item.name}</span>
                            </div>
                            <span className={`dashboard-ranking-list__count ${colorClass}`}>{item.count}</span>
                        </li>
                    ))}
                    {items.length === 0 && <li className="dashboard-empty">No data available</li>}
                </ul>
            </div>
        </div>
    );
};
