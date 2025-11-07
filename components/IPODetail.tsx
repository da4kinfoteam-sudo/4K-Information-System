
import React from 'react';
import { IPO, Subproject, Training } from '../constants';

interface IPODetailProps {
    ipo: IPO;
    subprojects: Subproject[];
    trainings: Training[];
    onBack: () => void;
}

const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
}

const getStatusBadge = (status: Subproject['status']) => {
    const baseClasses = "px-2 py-0.5 text-xs font-medium rounded-full";
    switch (status) {
        case 'Completed': return `${baseClasses} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`;
        case 'Ongoing': return `${baseClasses} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`;
        case 'Proposed': return `${baseClasses} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`;
        case 'Cancelled': return `${baseClasses} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`;
        default: return `${baseClasses} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200`;
    }
}

const DetailItem: React.FC<{ label: string; value?: string | number | React.ReactNode; half?: boolean }> = ({ label, value, half }) => (
    <div className={half ? 'sm:col-span-1' : 'sm:col-span-2'}>
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm text-gray-900 dark:text-white">{value || 'N/A'}</dd>
    </div>
);

const IPODetail: React.FC<IPODetailProps> = ({ ipo, subprojects, trainings, onBack }) => {

    const calculateTotalBudget = (details: Subproject['details']) => {
        return details.reduce((total, item) => total + (item.pricePerUnit * item.numberOfUnits), 0);
    }

    return (
        <div className="space-y-8">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">{ipo.name} ({ipo.acronym})</h1>
                    <p className="text-md text-gray-500 dark:text-gray-400">{ipo.location}</p>
                </div>
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    Back to IPO List
                </button>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Subprojects Card */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Subprojects</h3>
                        {subprojects.length > 0 ? (
                            <ul className="space-y-4">
                                {subprojects.map(p => (
                                    <li key={p.id} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-bold text-gray-800 dark:text-gray-100">{p.name}</p>
                                                <p className="text-sm text-gray-500 dark:text-gray-400">{p.location}</p>
                                            </div>
                                            <span className={getStatusBadge(p.status)}>{p.status}</span>
                                        </div>
                                        <div className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                                            <span className="font-semibold">Budget:</span> {formatCurrency(calculateTotalBudget(p.details))}
                                            <span className="mx-2">|</span>
                                            <span className="font-semibold">Timeline:</span> {formatDate(p.startDate)} to {formatDate(p.estimatedCompletionDate)}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400 italic">No subprojects linked to this IPO.</p>
                        )}
                    </div>

                    {/* Trainings Card */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Trainings Attended</h3>
                        {trainings.length > 0 ? (
                             <ul className="space-y-4">
                                {trainings.map(t => (
                                    <li key={t.id} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-bold text-gray-800 dark:text-gray-100">{t.name}</p>
                                                <p className="text-sm text-gray-500 dark:text-gray-400">{t.component}</p>
                                            </div>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">{formatDate(t.date)}</p>
                                        </div>
                                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">{t.description}</p>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400 italic">This IPO has not attended any recorded trainings.</p>
                        )}
                    </div>
                </div>

                {/* Right Column */}
                <div className="space-y-8">
                    {/* Profile Card */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">IPO Profile</h3>
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
                            <DetailItem label="Indigenous Cultural Community" value={ipo.indigenousCulturalCommunity} />
                            <DetailItem label="Ancestral Domain No." value={ipo.ancestralDomainNo} />
                            <DetailItem label="Registering Body" value={ipo.registeringBody} half />
                            <DetailItem label="Registration Date" value={formatDate(ipo.registrationDate)} half />
                            <DetailItem label="Contact Person" value={ipo.contactPerson} half />
                            <DetailItem label="Contact Number" value={ipo.contactNumber} half />
                            <DetailItem label="Flags" value={
                                <div className="flex flex-wrap gap-2 mt-1">
                                    {ipo.isWomenLed && <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300">Women-Led</span>}
                                    {ipo.isWithinGida && <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300">Within GIDA</span>}
                                </div>
                            } />
                        </dl>
                    </div>

                     {/* Commodities Card */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">Commodities & Development</h3>
                        <div className="mb-4">
                            <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Level of Development</h4>
                            <p className="text-sm font-semibold text-accent dark:text-green-400 bg-gray-100 dark:bg-gray-900/50 px-3 py-1 rounded-full inline-block">Level {ipo.levelOfDevelopment}</p>
                        </div>
                         <div>
                            <h4 className="font-semibold text-md mb-2 text-gray-700 dark:text-gray-200">Commodities</h4>
                            {ipo.commodities && ipo.commodities.length > 0 ? (
                                <ul className="space-y-2 text-sm">
                                    {ipo.commodities.map((c, i) => (
                                        <li key={i} className="flex justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded">
                                            <span>{c.particular} <span className="text-xs text-gray-400">({c.type})</span></span>
                                            <span className="font-medium">{c.value.toLocaleString()} {c.type === 'Livestock' ? 'heads' : 'ha'}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : <p className="text-sm text-gray-500 dark:text-gray-400 italic">No commodities listed.</p>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default IPODetail;
