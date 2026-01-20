// Author: 4K
import React, { useMemo } from 'react';
import { IPO } from '../../constants';

interface IPOLevelDashboardProps {
    ipos: IPO[];
}

const IPOLevelDashboard: React.FC<IPOLevelDashboardProps> = ({ ipos }) => {
    const counts = useMemo(() => {
        const c = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        ipos.forEach(ipo => {
            if (ipo.levelOfDevelopment >= 1 && ipo.levelOfDevelopment <= 5) {
                c[ipo.levelOfDevelopment]++;
            }
        });
        return c;
    }, [ipos]);

    const levels = [
        { 
            level: 1, 
            title: 'Level 1', 
            description: 'Organizational Formation & Registration', 
            color: 'from-gray-500 to-gray-700',
            barColor: 'bg-gray-500' 
        },
        { 
            level: 2, 
            title: 'Level 2', 
            description: 'Organizational Strengthening & Capacity Building', 
            color: 'from-orange-500 to-orange-700',
            barColor: 'bg-orange-500' 
        },
        { 
            level: 3, 
            title: 'Level 3', 
            description: 'Micro-Enterprise Development', 
            color: 'from-yellow-500 to-yellow-700',
            barColor: 'bg-yellow-500' 
        },
        { 
            level: 4, 
            title: 'Level 4', 
            description: 'Scaling Up, Alliances & Federations', 
            color: 'from-blue-500 to-blue-700',
            barColor: 'bg-blue-500' 
        },
        { 
            level: 5, 
            title: 'Level 5', 
            description: 'Sustainability & Self-Governance', 
            color: 'from-green-600 to-green-800',
            barColor: 'bg-green-600' 
        },
    ];

    return (
        <div className="space-y-8 animate-fadeIn">
             <section aria-labelledby="ipo-levels">
                <h3 id="ipo-levels" className="text-xl font-bold text-gray-800 dark:text-white mb-6">IPO Distribution by Development Level</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
                    {levels.map((l) => (
                        <div key={l.level} className={`bg-gradient-to-br ${l.color} text-white p-6 rounded-xl shadow-lg transform transition hover:scale-105 flex flex-col justify-between h-48`}>
                            <div>
                                <div className="flex justify-between items-start">
                                    <h4 className="text-lg font-bold opacity-90">{l.title}</h4>
                                    <span className="text-xs font-mono bg-white/20 px-2 py-1 rounded">L{l.level}</span>
                                </div>
                                <p className="text-xs font-medium opacity-75 mt-2 leading-snug">{l.description}</p>
                            </div>
                            <div className="text-center mt-4">
                                <span className="text-5xl font-extrabold drop-shadow-sm">
                                    {(counts as any)[l.level]}
                                </span>
                                <p className="text-xs uppercase tracking-widest mt-1 opacity-80">IPOs</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
            
             <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                <h4 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Development Progress Overview</h4>
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                    <span>Total IPOs Tracked</span>
                    <span className="font-bold">{ipos.length}</span>
                </div>
                <div className="w-full h-6 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
                    {levels.map(l => {
                        const count = (counts as any)[l.level];
                        const pct = ipos.length > 0 ? (count / ipos.length) * 100 : 0;
                        if (pct === 0) return null;
                        
                        return (
                            <div 
                                key={l.level} 
                                className={`h-full ${l.barColor} transition-all duration-500`} 
                                style={{ width: `${pct}%` }} 
                                title={`Level ${l.level}: ${count} (${pct.toFixed(1)}%)`}
                            ></div>
                        );
                    })}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4 text-xs text-gray-500 dark:text-gray-400">
                     {levels.map(l => {
                        const count = (counts as any)[l.level];
                        const pct = ipos.length > 0 ? (count / ipos.length) * 100 : 0;
                        return (
                            <div key={l.level} className="flex items-center gap-2">
                                <span className={`w-3 h-3 rounded-full ${l.barColor}`}></span>
                                <span>Level {l.level}: <span className="font-bold text-gray-700 dark:text-gray-300">{count}</span> ({pct.toFixed(0)}%)</span>
                            </div>
                        )
                     })}
                </div>
            </div>
        </div>
    );
};

export default IPOLevelDashboard;
