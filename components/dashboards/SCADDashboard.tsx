
// Author: 4K
import React, { useMemo } from 'react';
import { IPO } from '../../constants';

interface SCADDashboardProps {
    ipos: IPO[];
}

// Region to Island Group Mapping based on constants.tsx philippineRegions
const islandGroups: { [key: string]: string[] } = {
    'Luzon': [
        'National Capital Region (NCR)',
        'Cordillera Administrative Region (CAR)',
        'Region I (Ilocos Region)',
        'Region II (Cagayan Valley)',
        'Region III (Central Luzon)',
        'Region IV-A (CALABARZON)',
        'MIMAROPA Region',
        'Region V (Bicol Region)'
    ],
    'Visayas': [
        'Region VI (Western Visayas)',
        'Region VII (Central Visayas)',
        'Region VIII (Eastern Visayas)',
        'Negros Island Region (NIR)'
    ],
    'Mindanao': [
        'Region IX (Zamboanga Peninsula)',
        'Region X (Northern Mindanao)',
        'Region XI (Davao Region)',
        'Region XII (SOCCSKSARGEN)',
        'Region XIII (Caraga)',
        'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)'
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
            if (islandGroups['Luzon'].includes(region)) return 'Luzon';
            if (islandGroups['Visayas'].includes(region)) return 'Visayas';
            if (islandGroups['Mindanao'].includes(region)) return 'Mindanao';
            return 'Others';
        };

        ipos.forEach(ipo => {
            if (!ipo.commodities) return;

            const region = ipo.region;
            const island = getIsland(region);

            ipo.commodities.forEach(comm => {
                if (comm.isScad) {
                    const name = comm.particular;
                    // For calculations, we assume 'value' is Area (ha) for crops. 
                    // If it's livestock (heads), we still sum it up as "Target" generically, 
                    // though the prompt specifically asked for Hectares. 
                    // We will sum the raw value.
                    const value = comm.value || 0;

                    // 1. Global Aggregation
                    globalStats[name] = (globalStats[name] || 0) + value;

                    // 2. Island Aggregation
                    if (island !== 'Others') {
                        islandStats[island][name] = (islandStats[island][name] || 0) + value;
                    }

                    // 3. Region Aggregation
                    if (!regionStats[region]) regionStats[region] = {};
                    regionStats[region][name] = (regionStats[region][name] || 0) + value;
                }
            });
        });

        // Helper to sort and get top items
        const getTop = (obj: { [key: string]: number }, limit?: number) => {
            const sorted = Object.entries(obj)
                .sort(([, a], [, b]) => b - a)
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
                topCommodity: getTop(regionStats[region], 1)[0]
            }))
        };
    }, [ipos]);

    const ScadCard: React.FC<{ name: string; total: number; rank: number }> = ({ name, total, rank }) => (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md border-l-4 border-orange-500 dark:border-orange-600 transform transition hover:-translate-y-1">
            <div className="flex justify-between items-start">
                <div>
                    <span className="text-xs font-bold uppercase text-gray-400 tracking-wider">Top {rank} SCAD Commodity</span>
                    <h4 className="text-xl font-bold text-gray-800 dark:text-white mt-1">{name}</h4>
                </div>
                <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                </div>
            </div>
            <div className="mt-4">
                <span className="text-3xl font-bold text-orange-600 dark:text-orange-400">{total.toLocaleString()}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">Target (ha/heads)</span>
            </div>
        </div>
    );

    const IslandSection: React.FC<{ title: string; data: { name: string; total: number }[]; color: string }> = ({ title, data, color }) => (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md h-full">
            <div className="flex items-center gap-3 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
                <div className={`w-3 h-8 rounded-full ${color}`}></div>
                <h4 className="text-lg font-bold text-gray-800 dark:text-white">{title}</h4>
            </div>
            {data.length > 0 ? (
                <ul className="space-y-3">
                    {data.map((item, idx) => (
                        <li key={item.name} className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white ${idx === 0 ? 'bg-yellow-500' : 'bg-gray-400'}`}>
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
                        <div className="col-span-4 text-center py-10 bg-white dark:bg-gray-800 rounded-lg text-gray-500 italic">
                            No commodities tagged as SCAD found in the system.
                        </div>
                    )}
                </div>
            </section>

            {/* Island Groups Section */}
            <section aria-labelledby="island-scad-commodities">
                <h3 id="island-scad-commodities" className="text-xl font-bold text-gray-800 dark:text-white mb-4">Top SCAD per Island Group</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <IslandSection title="Luzon" data={scadStats.topLuzon} color="bg-blue-500" />
                    <IslandSection title="Visayas" data={scadStats.topVisayas} color="bg-yellow-500" />
                    <IslandSection title="Mindanao" data={scadStats.topMindanao} color="bg-red-500" />
                </div>
            </section>

            {/* RFO Breakdown Section */}
            <section aria-labelledby="rfo-scad-commodities">
                <h3 id="rfo-scad-commodities" className="text-xl font-bold text-gray-800 dark:text-white mb-4">Top SCAD Commodity per RFO</h3>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-6">
                        {scadStats.regions.map(r => (
                            <div key={r.region} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow">
                                <h5 className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400 mb-2 truncate" title={r.region}>
                                    {r.region.split('(')[0].trim()}
                                </h5>
                                {r.topCommodity ? (
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-gray-800 dark:text-white truncate pr-2" title={r.topCommodity.name}>{r.topCommodity.name}</span>
                                        <span className="text-sm font-medium text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 rounded-full">
                                            {r.topCommodity.total.toLocaleString()}
                                        </span>
                                    </div>
                                ) : (
                                    <span className="text-sm italic text-gray-400">None</span>
                                )}
                            </div>
                        ))}
                        {scadStats.regions.length === 0 && (
                            <div className="col-span-full text-center text-gray-500 italic">No regional data available.</div>
                        )}
                    </div>
                </div>
            </section>

        </div>
    );
};

export default SCADDashboard;
