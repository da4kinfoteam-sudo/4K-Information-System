
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

        ipos.forEach(ipo => {
            if (!ipo.commodities) return;

            // IPOs have a specific region field selected during encoding
            const region = ipo.region; 
            const island = getIsland(region);

            ipo.commodities.forEach(comm => {
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
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md border-l-4 border-emerald-500 dark:border-emerald-600 transform transition hover:-translate-y-1">
            <div className="flex justify-between items-start">
                <div>
                    <span className="text-xs font-bold uppercase text-gray-400 tracking-wider">Top {rank} SCAD Commodity</span>
                    <h4 className="text-xl font-bold text-gray-800 dark:text-white mt-1">{name}</h4>
                </div>
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                </div>
            </div>
            <div className="mt-4">
                <span className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{total.toLocaleString()}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">Target (ha/heads)</span>
            </div>
        </div>
    );

    const IslandSection: React.FC<{ title: string; data: { name: string; total: number }[]; color: string; badgeColor: string; rankColor: string }> = ({ title, data, color, badgeColor, rankColor }) => (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md h-full border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
                <div className={`w-3 h-8 rounded-full ${color}`}></div>
                <h4 className="text-lg font-bold text-gray-800 dark:text-white">{title} Island Group</h4>
            </div>
            {data.length > 0 ? (
                <ul className="space-y-3">
                    {data.map((item, idx) => (
                        <li key={item.name} className="flex justify-between items-center p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                            <div className="flex items-center gap-3">
                                <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white ${idx === 0 ? badgeColor : rankColor}`}>
                                    {idx + 1}
                                </span>
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{item.name}</span>
                            </div>
                            <span className="text-sm font-bold text-gray-900 dark:text-white">{item.total.toLocaleString()}</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-sm text-gray-500 italic">No SCAD commodities recorded.</p>
            )}
        </div>
    );

    return (
        <div className="space-y-8 animate-fadeIn">
            
            {/* Top Cards Section */}
            <section aria-labelledby="top-scad-commodities">
                <h3 id="top-scad-commodities" className="text-xl font-bold text-gray-800 dark:text-white mb-4">Top National SCAD Commodities</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {scadStats.topGlobal.length > 0 ? (
                        scadStats.topGlobal.map((item, idx) => (
                            <ScadCard key={item.name} name={item.name} total={item.total} rank={idx + 1} />
                        ))
                    ) : (
                        <div className="col-span-4 text-center py-10 bg-white dark:bg-gray-800 rounded-lg text-gray-500 italic border border-dashed border-gray-300 dark:border-gray-700">
                            No commodities tagged as SCAD found in the system.
                        </div>
                    )}
                </div>
            </section>

            {/* Island Groups Section */}
            <section aria-labelledby="island-scad-commodities">
                <h3 id="island-scad-commodities" className="text-xl font-bold text-gray-800 dark:text-white mb-4">Top SCAD per Island Group</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <IslandSection 
                        title="Luzon" 
                        data={scadStats.topLuzon} 
                        color="bg-emerald-500" 
                        badgeColor="bg-emerald-600"
                        rankColor="bg-emerald-400"
                    />
                    <IslandSection 
                        title="Visayas" 
                        data={scadStats.topVisayas} 
                        color="bg-teal-500" 
                        badgeColor="bg-teal-600"
                        rankColor="bg-teal-400"
                    />
                    <IslandSection 
                        title="Mindanao" 
                        data={scadStats.topMindanao} 
                        color="bg-green-500" 
                        badgeColor="bg-green-600"
                        rankColor="bg-green-400"
                    />
                </div>
            </section>

            {/* RFO Breakdown Section */}
            <section aria-labelledby="rfo-scad-commodities">
                <h3 id="rfo-scad-commodities" className="text-xl font-bold text-gray-800 dark:text-white mb-4">SCAD Commodities per RFO</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {scadStats.regions.map(r => (
                        <div key={r.region} className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 flex flex-col h-full hover:shadow-lg transition-shadow">
                            <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 rounded-t-lg">
                                <h5 className="font-bold text-gray-800 dark:text-white truncate" title={r.region}>
                                    {r.region}
                                </h5>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    {r.commodities.length} Commodities
                                </p>
                            </div>
                            <div className="p-4 flex-1 overflow-y-auto max-h-[300px] custom-scrollbar">
                                {r.commodities.length > 0 ? (
                                    <ul className="space-y-3">
                                        {r.commodities.map((comm, idx) => (
                                            <li key={comm.name} className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <span className={`flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white ${idx < 3 ? 'bg-emerald-500' : 'bg-gray-400'}`}>
                                                        {idx + 1}
                                                    </span>
                                                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate" title={comm.name}>{comm.name}</span>
                                                </div>
                                                <span className="text-sm font-bold text-gray-900 dark:text-white pl-2">{comm.total.toLocaleString()}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <div className="text-center py-4">
                                        <span className="text-sm italic text-gray-400">None</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {scadStats.regions.length === 0 && (
                        <div className="col-span-full text-center text-gray-500 italic bg-white dark:bg-gray-800 p-8 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
                            No regional data available to display.
                        </div>
                    )}
                </div>
            </section>

        </div>
    );
};

export default SCADDashboard;
