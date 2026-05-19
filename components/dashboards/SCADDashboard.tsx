
// Author: 4K
import React, { useMemo } from 'react';
import { IPO } from '../../constants';

interface SCADDashboardProps {
    ipos: IPO[];
}

// Region to Island Group Mapping including aliases for robustness
const islandGroups: { [key: string]: string[] } = {
    'Luzon': [
        'National Capital Region (NCR)', 'NCR',
        'Cordillera Administrative Region (CAR)', 'CAR',
        'Region I (Ilocos Region)', 'Region I',
        'Region II (Cagayan Valley)', 'Region II',
        'Region III (Central Luzon)', 'Region III',
        'Region IV-A (CALABARZON)', 'Region IV-A',
        'MIMAROPA Region', 'MIMAROPA', 'Region IV-B (MIMAROPA)',
        'Region V (Bicol Region)', 'Region V'
    ],
    'Visayas': [
        'Region VI (Western Visayas)', 'Region VI',
        'Region VII (Central Visayas)', 'Region VII',
        'Region VIII (Eastern Visayas)', 'Region VIII',
        'Negros Island Region (NIR)', 'NIR'
    ],
    'Mindanao': [
        'Region IX (Zamboanga Peninsula)', 'Region IX',
        'Region X (Northern Mindanao)', 'Region X',
        'Region XI (Davao Region)', 'Region XI',
        'Region XII (SOCCSKSARGEN)', 'Region XII',
        'Region XIII (Caraga)', 'Region XIII', 'Caraga',
        'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)', 'BARMM'
    ]
};

const SCADDashboard: React.FC<SCADDashboardProps> = ({ ipos }) => {

    const scadStats = useMemo(() => {
        const globalStats: { [commodity: string]: number } = {};
        const islandStats: { [island: string]: { [commodity: string]: number } } = {
            'Luzon': {}, 'Visayas': {}, 'Mindanao': {}
        };
        const regionStats: { [region: string]: { [commodity: string]: number } } = {};

        // Helper to find Island Group
        const getIsland = (region: string) => {
            if (!region) return 'Others';
            const r = region.trim();
            if (islandGroups['Luzon'].includes(r)) return 'Luzon';
            if (islandGroups['Visayas'].includes(r)) return 'Visayas';
            if (islandGroups['Mindanao'].includes(r)) return 'Mindanao';
            
            // Substring fallback for robustness
            if (r.includes('NCR') || r.includes('CAR') || r.includes('Region I') || r.includes('Region II') || r.includes('Region III') || r.includes('Region IV') || r.includes('MIMAROPA') || r.includes('Region V')) return 'Luzon';
            if (r.includes('Region VI') || r.includes('Region VII') || r.includes('Region VIII') || r.includes('NIR') || r.includes('Negros')) return 'Visayas';
            if (r.includes('Region IX') || r.includes('Region X') || r.includes('Region XI') || r.includes('Region XII') || r.includes('Region XIII') || r.includes('Caraga') || r.includes('BARMM') || r.includes('Bangsamoro')) return 'Mindanao';

            return 'Others';
        };

        (ipos || []).forEach(ipo => {
            if (!ipo.commodities) return;

            // IPOs have a specific region field selected during encoding
            const region = ipo.region; 
            const island = getIsland(region);

            (ipo.commodities || []).forEach(comm => {
                if (comm.isScad) {
                    const name = comm.particular;
                    // value is Area (ha) for crops or Heads for livestock
                    const value = comm.value || 0;

                    // 1. Global Aggregation
                    globalStats[name] = (globalStats[name] || 0) + value;

                    // 2. Island Aggregation
                    if (island !== 'Others') {
                        islandStats[island][name] = (islandStats[island][name] || 0) + value;
                    }

                    // 3. Region Aggregation
                    if (region) {
                        if (!regionStats[region]) regionStats[region] = {};
                        regionStats[region][name] = (regionStats[region][name] || 0) + value;
                    }
                }
            });
        });

        // Helper to sort and get top items
        const getTop = (obj: { [key: string]: number }, limit?: number) => {
            const sorted = Object.entries(obj)
                .sort(([, a], [, b]) => b - a) // Sort descending by value
                .map(([name, total]) => ({ name, total }));
            return limit ? sorted.slice(0, limit) : sorted;
        };

        return {
            topGlobal: getTop(globalStats, 4),
            topLuzon: getTop(islandStats['Luzon'], 5),
            topVisayas: getTop(islandStats['Visayas'], 5),
            topMindanao: getTop(islandStats['Mindanao'], 5),
            regions: Object.keys(regionStats).sort().map(region => ({
                region,
                commodities: getTop(regionStats[region]) // Return all items sorted
            }))
        };
    }, [ipos]);

    const ScadCard: React.FC<{ name: string; total: number; rank: number }> = ({ name, total, rank }) => (
        <div className="scad-stat-card">
            <div className="scad-stat-card__header">
                <div className="scad-stat-card__content">
                    <span className="scad-stat-card__eyebrow">Top {rank} SCAD Commodity</span>
                    <h4 className="scad-stat-card__title">{name}</h4>
                </div>
                <div className="scad-stat-card__icon">
                    <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                </div>
            </div>
            <div className="scad-stat-card__metric">
                <span>{total.toLocaleString()}</span>
                <small>Target (ha/heads)</small>
            </div>
        </div>
    );

    const IslandSection: React.FC<{ title: string; data: { name: string; total: number }[]; tone: 'emerald' | 'teal' | 'green' }> = ({ title, data, tone }) => (
        <div className={`scad-island-card scad-island-card--${tone}`}>
            <div className="scad-island-card__header">
                <div className="scad-island-card__marker"></div>
                <h4>{title} Island Group</h4>
            </div>
            {data.length > 0 ? (
                <ul className="scad-list">
                    {data.map((item, idx) => (
                        <li key={item.name} className="scad-list__item">
                            <div className="scad-list__name">
                                <span className={`scad-list__rank ${idx === 0 ? 'scad-list__rank--primary' : 'scad-list__rank--secondary'}`}>
                                    {idx + 1}
                                </span>
                                <span>{item.name}</span>
                            </div>
                            <span className="scad-list__value">{item.total.toLocaleString()}</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="dashboard-empty dashboard-empty--center">No SCAD commodities recorded.</p>
            )}
        </div>
    );

    return (
        <div className="scad-dashboard dashboard-view animate-fadeIn">
            
            {/* Top Cards Section */}
            <section className="dashboard-section" aria-labelledby="top-scad-commodities">
                <h3 id="top-scad-commodities" className="dashboard-section__title">Top National SCAD Commodities</h3>
                <div className="scad-stat-grid">
                    {scadStats.topGlobal.length > 0 ? (
                        scadStats.topGlobal.map((item, idx) => (
                            <ScadCard key={item.name} name={item.name} total={item.total} rank={idx + 1} />
                        ))
                    ) : (
                        <div className="dashboard-empty dashboard-empty--center scad-empty">
                            No commodities tagged as SCAD found in the system.
                        </div>
                    )}
                </div>
            </section>

            {/* Island Groups Section */}
            <section className="dashboard-section" aria-labelledby="island-scad-commodities">
                <h3 id="island-scad-commodities" className="dashboard-section__title">Top SCAD per Island Group</h3>
                <div className="scad-island-grid">
                    <IslandSection 
                        title="Luzon" 
                        data={scadStats.topLuzon} 
                        tone="emerald"
                    />
                    <IslandSection 
                        title="Visayas" 
                        data={scadStats.topVisayas} 
                        tone="teal"
                    />
                    <IslandSection 
                        title="Mindanao" 
                        data={scadStats.topMindanao} 
                        tone="green"
                    />
                </div>
            </section>

            {/* RFO Breakdown Section */}
            <section className="dashboard-section" aria-labelledby="rfo-scad-commodities">
                <h3 id="rfo-scad-commodities" className="dashboard-section__title">SCAD Commodities per RFO</h3>
                <div className="scad-region-grid">
                    {scadStats.regions.map(r => (
                        <div key={r.region} className="scad-region-card">
                            <div className="scad-region-card__header">
                                <h5 title={r.region}>
                                    {r.region}
                                </h5>
                                <p>
                                    {r.commodities.length} Commodities
                                </p>
                            </div>
                            <div className="scad-region-card__body custom-scrollbar">
                                {r.commodities.length > 0 ? (
                                    <ul className="scad-list scad-list--compact">
                                        {r.commodities.map((comm, idx) => (
                                            <li key={comm.name} className="scad-list__item">
                                                <div className="scad-list__name">
                                                    <span className={`scad-list__rank scad-list__rank--small ${idx < 3 ? 'scad-list__rank--primary' : 'scad-list__rank--muted'}`}>
                                                        {idx + 1}
                                                    </span>
                                                    <span title={comm.name}>{comm.name}</span>
                                                </div>
                                                <span className="scad-list__value">{comm.total.toLocaleString()}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <div className="dashboard-empty dashboard-empty--center">None</div>
                                )}
                            </div>
                        </div>
                    ))}
                    {scadStats.regions.length === 0 && (
                        <div className="dashboard-empty dashboard-empty--center scad-empty">
                            No regional data available to display.
                        </div>
                    )}
                </div>
            </section>

        </div>
    );
};

export default SCADDashboard;
