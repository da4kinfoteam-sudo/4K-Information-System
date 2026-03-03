// Author: 4K
import React, { useMemo, useState, useEffect } from 'react';
import { IPO, LodAssessment } from '../../constants';
import { supabase } from '../../supabaseClient';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface IPOLevelDashboardProps {
    ipos: IPO[];
    selectedYear: string;
}

const IPOLevelDashboard: React.FC<IPOLevelDashboardProps> = ({ ipos, selectedYear }) => {
    const [assessments, setAssessments] = useState<LodAssessment[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAssessments = async () => {
            if (!supabase) return;
            
            const { data, error } = await supabase
                .from('lod_assessments')
                .select('*');
            
            if (error) {
                console.error('Error fetching LOD assessments:', error);
            } else {
                setAssessments(data || []);
            }
            setLoading(false);
        };

        fetchAssessments();
    }, []);

    // Filter assessments based on the visible IPOs (which are already filtered by OU in parent)
    const filteredAssessments = useMemo(() => {
        const ipoIds = new Set(ipos.map(i => i.id));
        return assessments.filter(a => ipoIds.has(a.ipo_id));
    }, [assessments, ipos]);

    // Top Section Data: Filter by Selected Year
    const currentYearCounts = useMemo(() => {
        const c = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        
        // If "All" years selected, maybe show latest? 
        // The requirement says: "The year filter will now affect the data in this report where it identify what year of LOD information is displayed on the 1st 2 sections."
        // If "All" is selected, it's ambiguous. I'll assume we show the latest available assessment for each IPO if "All" is selected, or maybe just aggregate all?
        // Usually "All" in this context might mean "Latest" for status, or "All History". 
        // Given the phrasing "what year of LOD information is displayed", if "All" is selected, it might be confusing. 
        // Let's default to current year if "All" is selected, or handle "All" as "Latest".
        // Let's assume "All" means "Latest" for the distribution cards.
        
        const targetYear = selectedYear === 'All' ? null : parseInt(selectedYear);

        const relevantAssessments = filteredAssessments.filter(a => {
            if (targetYear) return a.year === targetYear;
            return true; 
        });

        // If "All", we need to deduplicate to get the LATEST for each IPO
        const finalAssessments = targetYear 
            ? relevantAssessments 
            : Object.values(relevantAssessments.reduce((acc, curr) => {
                if (!acc[curr.ipo_id] || acc[curr.ipo_id].year < curr.year) {
                    acc[curr.ipo_id] = curr;
                }
                return acc;
            }, {} as Record<number, LodAssessment>));

        finalAssessments.forEach(a => {
            const level = a.manual_level || a.computed_level;
            if (level >= 1 && level <= 5) {
                // @ts-ignore
                c[level]++;
            }
        });

        return c;
    }, [filteredAssessments, selectedYear]);

    // Bottom Section Data: Trend over years
    const trendData = useMemo(() => {
        // Group by Year and Count Levels
        const yearGroups: Record<number, { year: number, level1: number, level2: number, level3: number, level4: number, level5: number }> = {};

        filteredAssessments.forEach(a => {
            if (!yearGroups[a.year]) {
                yearGroups[a.year] = { year: a.year, level1: 0, level2: 0, level3: 0, level4: 0, level5: 0 };
            }
            const level = a.manual_level || a.computed_level;
            if (level >= 1 && level <= 5) {
                // @ts-ignore
                yearGroups[a.year][`level${level}`]++;
            }
        });

        return Object.values(yearGroups).sort((a, b) => a.year - b.year);
    }, [filteredAssessments]);

    const levels = [
        { 
            level: 1, 
            title: 'Level 1', 
            description: 'Organizational Formation & Registration', 
            color: 'from-gray-500 to-gray-700',
            barColor: 'bg-gray-500',
            stroke: '#6b7280'
        },
        { 
            level: 2, 
            title: 'Level 2', 
            description: 'Organizational Strengthening & Capacity Building', 
            color: 'from-orange-500 to-orange-700',
            barColor: 'bg-orange-500',
            stroke: '#f97316'
        },
        { 
            level: 3, 
            title: 'Level 3', 
            description: 'Micro-Enterprise Development', 
            color: 'from-yellow-500 to-yellow-700',
            barColor: 'bg-yellow-500',
            stroke: '#eab308'
        },
        { 
            level: 4, 
            title: 'Level 4', 
            description: 'Scaling Up, Alliances & Federations', 
            color: 'from-blue-500 to-blue-700',
            barColor: 'bg-blue-500',
            stroke: '#3b82f6'
        },
        { 
            level: 5, 
            title: 'Level 5', 
            description: 'Sustainability & Self-Governance', 
            color: 'from-green-600 to-green-800',
            barColor: 'bg-green-600',
            stroke: '#16a34a'
        },
    ];

    if (loading) return <div className="p-4 text-center">Loading LOD data...</div>;

    const totalDisplayed = Object.values(currentYearCounts).reduce((a, b) => a + b, 0);

    return (
        <div className="space-y-8 animate-fadeIn">
             <section aria-labelledby="ipo-levels">
                <div className="flex justify-between items-center mb-6">
                    <h3 id="ipo-levels" className="text-xl font-bold text-gray-800 dark:text-white">
                        IPO Distribution by Development Level {selectedYear !== 'All' ? `(${selectedYear})` : '(Latest)'}
                    </h3>
                </div>
                
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
                                    {(currentYearCounts as any)[l.level]}
                                </span>
                                <p className="text-xs uppercase tracking-widest mt-1 opacity-80">IPOs</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
            
             <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                <h4 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Development Progress Overview {selectedYear !== 'All' ? `(${selectedYear})` : '(Latest)'}</h4>
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                    <span>Total IPOs with Assessment</span>
                    <span className="font-bold">{totalDisplayed}</span>
                </div>
                <div className="w-full h-6 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
                    {levels.map(l => {
                        const count = (currentYearCounts as any)[l.level];
                        const pct = totalDisplayed > 0 ? (count / totalDisplayed) * 100 : 0;
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
                        const count = (currentYearCounts as any)[l.level];
                        const pct = totalDisplayed > 0 ? (count / totalDisplayed) * 100 : 0;
                        return (
                            <div key={l.level} className="flex items-center gap-2">
                                <span className={`w-3 h-3 rounded-full ${l.barColor}`}></span>
                                <span>Level {l.level}: <span className="font-bold text-gray-700 dark:text-gray-300">{count}</span> ({pct.toFixed(0)}%)</span>
                            </div>
                        )
                     })}
                </div>
            </div>

            {/* New Section: Level of Development by Year Graph */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                <h4 className="text-lg font-semibold text-gray-800 dark:text-white mb-6">Level of Development by Year</h4>
                <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="year" stroke="#9ca3af" />
                            <YAxis stroke="#9ca3af" />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                itemStyle={{ fontSize: '12px' }}
                            />
                            <Legend />
                            {levels.map(l => (
                                <Line 
                                    key={l.level}
                                    type="monotone" 
                                    dataKey={`level${l.level}`} 
                                    name={l.title} 
                                    stroke={l.stroke} 
                                    strokeWidth={3}
                                    dot={{ r: 4 }}
                                    activeDot={{ r: 6 }}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default IPOLevelDashboard;
