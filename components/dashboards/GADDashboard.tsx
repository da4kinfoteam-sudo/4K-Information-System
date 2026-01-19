
// Author: 4K 
import React, { useMemo } from 'react';
import { Training, OtherActivity, IPO, Subproject } from '../../constants';

interface GADDashboardProps {
    trainings: Training[];
    otherActivities: OtherActivity[];
    ipos: IPO[];
    subprojects: Subproject[];
}

const GADDashboard: React.FC<GADDashboardProps> = ({ trainings, ipos, subprojects }) => {
    
    const stats = useMemo(() => {
        let targetMale = 0;
        let targetFemale = 0;
        let actualMale = 0;
        let actualFemale = 0;

        trainings.forEach(t => {
            targetMale += (t.participantsMale || 0);
            targetFemale += (t.participantsFemale || 0);
            actualMale += (t.actualParticipantsMale || 0);
            actualFemale += (t.actualParticipantsFemale || 0);
        });

        return {
            targetMale,
            targetFemale,
            actualMale,
            actualFemale,
            totalTarget: targetMale + targetFemale,
            totalActual: actualMale + actualFemale
        };
    }, [trainings]);

    const womenLedStats = useMemo(() => {
        const womenLedIpos = ipos.filter(ipo => ipo.isWomenLed);
        const womenLedNames = new Set(womenLedIpos.map(ipo => ipo.name));

        const relevantSubprojects = subprojects.filter(sp => womenLedNames.has(sp.indigenousPeopleOrganization));
        
        const totalAllocation = relevantSubprojects.reduce((acc, sp) => {
            const spBudget = sp.details.reduce((dAcc, detail) => dAcc + (detail.pricePerUnit * detail.numberOfUnits), 0);
            return acc + spBudget;
        }, 0);

        const relevantTrainings = trainings.filter(t => 
            t.participatingIpos.some(ipoName => womenLedNames.has(ipoName))
        );

        return {
            totalIpos: womenLedIpos.length,
            totalAllocation,
            totalSubprojects: relevantSubprojects.length,
            totalTrainings: relevantTrainings.length
        };
    }, [ipos, subprojects, trainings]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
    };

    // Simple Bar Chart Component
    const SimpleComparisonChart = ({ label, male, female, type }: { label: string, male: number, female: number, type: 'Target' | 'Accomplishment' }) => {
        const total = male + female;
        const malePercent = total > 0 ? (male / total) * 100 : 0;
        const femalePercent = total > 0 ? (female / total) * 100 : 0;

        return (
            <div className="flex flex-col gap-1 w-full">
                <div className="flex justify-between text-xs font-semibold mb-1">
                    <span className="text-blue-600 dark:text-blue-400">Male: {male.toLocaleString()} ({malePercent.toFixed(1)}%)</span>
                    <span className="text-pink-600 dark:text-pink-400">Female: {female.toLocaleString()} ({femalePercent.toFixed(1)}%)</span>
                </div>
                <div className="w-full h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
                    <div 
                        className="h-full bg-blue-500" 
                        style={{ width: `${malePercent}%` }} 
                        title={`Male ${type}: ${male}`}
                    ></div>
                    <div 
                        className="h-full bg-pink-500" 
                        style={{ width: `${femalePercent}%` }} 
                        title={`Female ${type}: ${female}`}
                    ></div>
                </div>
                <p className="text-xs text-center mt-1 text-gray-500 dark:text-gray-400">{label}: {total.toLocaleString()}</p>
            </div>
        );
    };

    const WomenLedCard = ({ title, value, icon, colorClass }: { title: string, value: string, icon: React.ReactNode, colorClass: string }) => (
        <div className={`bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md border-l-4 ${colorClass} flex items-center justify-between transition hover:-translate-y-1`}>
            <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
                <p className="text-2xl font-bold text-gray-800 dark:text-white mt-1">{value}</p>
            </div>
            <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300">
                {icon}
            </div>
        </div>
    );

    return (
        <div className="space-y-8 animate-fadeIn">
            {/* Header Section */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md flex items-center justify-between">
                <div>
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-white">Gender and Development (GAD) Dashboard</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Monitoring sex-disaggregated data and support for women-led organizations.</p>
                </div>
                <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                </div>
            </div>

            {/* Women-Led IPOs Section */}
            <section aria-labelledby="women-led-ipos">
                <h3 id="women-led-ipos" className="text-xl font-semibold text-gray-800 dark:text-white mb-4">Women-Led IPOs Overview</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <WomenLedCard 
                        title="Total Women-Led IPOs" 
                        value={womenLedStats.totalIpos.toLocaleString()} 
                        colorClass="border-purple-500"
                        icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.184-1.268-.5-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.653.184-1.268.5-1.857m0 0a5.002 5.002 0 019 0m-4.5 5.002v-10a4.5 4.5 0 00-9 0v10m9 0a4.5 4.5 0 00-9 0" /></svg>}
                    />
                    <WomenLedCard 
                        title="Total Allocation" 
                        value={formatCurrency(womenLedStats.totalAllocation)} 
                        colorClass="border-pink-500"
                        icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                    />
                    <WomenLedCard 
                        title="Subprojects Granted" 
                        value={womenLedStats.totalSubprojects.toLocaleString()} 
                        colorClass="border-indigo-500"
                        icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
                    />
                    <WomenLedCard 
                        title="Trainings Participated" 
                        value={womenLedStats.totalTrainings.toLocaleString()} 
                        colorClass="border-violet-500"
                        icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>}
                    />
                </div>
            </section>

            {/* Sex Disaggregated Data Section */}
            <section aria-labelledby="sex-disaggregated-data">
                <h3 id="sex-disaggregated-data" className="text-xl font-semibold text-gray-800 dark:text-white mb-4">Sex Disaggregated Data - Trainings</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    {/* Stat Cards */}
                    <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow border-l-4 border-blue-500">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Male Target</p>
                        <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.targetMale.toLocaleString()}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow border-l-4 border-pink-500">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Female Target</p>
                        <p className="text-3xl font-bold text-pink-600 dark:text-pink-400">{stats.targetFemale.toLocaleString()}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow border-l-4 border-blue-700">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Actual Male Participants</p>
                        <p className="text-3xl font-bold text-blue-800 dark:text-blue-300">{stats.actualMale.toLocaleString()}</p>
                        <p className="text-xs text-gray-400 mt-1">
                            {stats.targetMale > 0 ? `${Math.round((stats.actualMale / stats.targetMale) * 100)}% of Target` : 'No Target'}
                        </p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow border-l-4 border-pink-700">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Actual Female Participants</p>
                        <p className="text-3xl font-bold text-pink-800 dark:text-pink-300">{stats.actualFemale.toLocaleString()}</p>
                        <p className="text-xs text-gray-400 mt-1">
                            {stats.targetFemale > 0 ? `${Math.round((stats.actualFemale / stats.targetFemale) * 100)}% of Target` : 'No Target'}
                        </p>
                    </div>
                </div>

                {/* Comparative Charts */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                        <h4 className="font-bold text-gray-700 dark:text-gray-200 mb-4 text-center">Target Distribution by Sex</h4>
                        <div className="flex items-center justify-center h-40">
                            <SimpleComparisonChart 
                                label="Total Targets" 
                                male={stats.targetMale} 
                                female={stats.targetFemale} 
                                type="Target" 
                            />
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                        <h4 className="font-bold text-gray-700 dark:text-gray-200 mb-4 text-center">Accomplishment Distribution by Sex</h4>
                        <div className="flex items-center justify-center h-40">
                            <SimpleComparisonChart 
                                label="Total Accomplishment" 
                                male={stats.actualMale} 
                                female={stats.actualFemale} 
                                type="Accomplishment" 
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* Comparison Bar Chart: Target vs Actual per Sex */}
            <section className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                <h4 className="font-bold text-gray-700 dark:text-gray-200 mb-6">Target vs Accomplishment Comparison</h4>
                <div className="space-y-6">
                    <div>
                        <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium text-blue-600 dark:text-blue-400">Male</span>
                            <span className="text-gray-500 dark:text-gray-400">
                                {stats.actualMale.toLocaleString()} / {stats.targetMale.toLocaleString()}
                            </span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-4 overflow-hidden relative">
                            {/* Target Bar (Background/Basis) */}
                            <div className="absolute top-0 left-0 h-full w-full bg-gray-200 dark:bg-gray-600"></div>
                            {/* Actual Bar */}
                            <div 
                                className="absolute top-0 left-0 h-full bg-blue-500 rounded-full transition-all duration-500" 
                                style={{ width: `${stats.targetMale > 0 ? Math.min((stats.actualMale / stats.targetMale) * 100, 100) : 0}%` }}
                            ></div>
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium text-pink-600 dark:text-pink-400">Female</span>
                            <span className="text-gray-500 dark:text-gray-400">
                                {stats.actualFemale.toLocaleString()} / {stats.targetFemale.toLocaleString()}
                            </span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-4 overflow-hidden relative">
                            {/* Target Bar (Background/Basis) */}
                            <div className="absolute top-0 left-0 h-full w-full bg-gray-200 dark:bg-gray-600"></div>
                            {/* Actual Bar */}
                            <div 
                                className="absolute top-0 left-0 h-full bg-pink-500 rounded-full transition-all duration-500" 
                                style={{ width: `${stats.targetFemale > 0 ? Math.min((stats.actualFemale / stats.targetFemale) * 100, 100) : 0}%` }}
                            ></div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default GADDashboard;
