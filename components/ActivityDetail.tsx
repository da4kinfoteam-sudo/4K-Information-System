
// Author: 4K 
import React, { useMemo } from 'react';
import { Activity, IPO } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { getUserPermissions } from './mainfunctions/TableHooks';

interface ActivityDetailProps {
    activity: Activity;
    ipos: IPO[];
    onBack: () => void;
    previousPageName: string;
    onUpdateActivity: (updatedActivity: Activity) => void;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    referenceActivities?: any[];
    onSelectIpo: (ipo: IPO) => void;
    onEdit: (mode: 'details' | 'expenses' | 'accomplishment') => void;
}

const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    if (dateString.includes('T')) {
        return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    const date = new Date(dateString + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};

const formatMonthYear = (dateString?: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
}

const getStatusBadge = (status: Activity['status']) => {
    const baseClasses = "px-2 py-0.5 text-xs font-medium rounded-full";
    switch (status) {
        case 'Completed': return `${baseClasses} bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200`;
        case 'Ongoing': return `${baseClasses} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`;
        case 'Proposed': return `${baseClasses} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`;
        case 'Cancelled': return `${baseClasses} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`;
        default: return `${baseClasses} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200`;
    }
}

const DetailItem: React.FC<{ label: string; value?: string | number | React.ReactNode }> = ({ label, value }) => (
    <div>
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{value || 'N/A'}</dd>
    </div>
);

export const ActivityDetail: React.FC<ActivityDetailProps> = ({ activity, ipos, onBack, previousPageName, onSelectIpo, onEdit }) => {
    const { currentUser } = useAuth();
    const { canEdit } = getUserPermissions(currentUser);
    const isAdmin = currentUser?.role === 'Administrator';
    
    // Status Logic for Edit Button Visibility
    const isCompleted = activity.status === 'Completed';
    const isCancelled = activity.status === 'Cancelled';
    const isOngoing = activity.status === 'Ongoing';
    
    // Edit Details/Expenses locked if completed or cancelled for USER, unless Admin
    // Admin can always edit.
    // User can edit if Proposed.
    // User can't edit Details/Expenses if Ongoing, Completed, or Cancelled.
    const canEditDetails = isAdmin || (canEdit && !isCompleted && !isCancelled && !isOngoing);
    const canEditExpenses = isAdmin || (canEdit && !isCompleted && !isCancelled && !isOngoing);
    
    // Accomplishment can be edited if Ongoing (and not cancelled), or by Admin
    // If Completed, User can't edit unless reverted to Ongoing (which they can't do manually for Completed)
    // Actually, User needs to edit accomplishment to Mark as Completed.
    const canEditAccomplishment = isAdmin || (canEdit && !isCancelled && !isCompleted);

    const totalBudget = useMemo(() => {
       return activity.expenses.reduce((acc, item) => acc + item.amount, 0);
    }, [activity.expenses]);

    return (
        <div className="space-y-8 animate-fadeIn">
            {/* Header */}
            <header className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">{activity.name}</h1>
                    <p className="text-md text-gray-500 dark:text-gray-400">
                        {activity.location} | {formatDate(activity.date)}
                        {activity.endDate && activity.endDate !== activity.date ? ` - ${formatDate(activity.endDate)}` : ''}
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        Back to {previousPageName}
                    </button>
                </div>
            </header>

            {/* Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Info & Expenses */}
                <div className="lg:col-span-2 space-y-8">
                    
                    {/* Activity Details Section */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Activity Details</h3>
                            {(canEditDetails || isAdmin) && ( // Allow admin always, or user if allowed state
                                <button onClick={() => onEdit('details')} className="text-sm text-emerald-600 hover:underline flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                    Edit Details
                                </button>
                            )}
                        </div>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                            <DetailItem label="Status" value={<span className={getStatusBadge(activity.status)}>{activity.status}</span>} />
                            <DetailItem label="UID" value={activity.uid} />
                            <DetailItem label="Type" value={activity.type} />
                            <DetailItem label="Date" value={
                                <>
                                    {formatDate(activity.date)}
                                    {activity.endDate && activity.endDate !== activity.date ? ` to ${formatDate(activity.endDate)}` : ''}
                                </>
                            } />
                            <DetailItem label="Component" value={activity.component} />
                            <DetailItem label="Operating Unit" value={activity.operatingUnit} />
                            <DetailItem label="Funding Year" value={activity.fundingYear} />
                            {activity.type === 'Training' && <DetailItem label="Facilitator" value={activity.facilitator} />}
                            <div className="col-span-2">
                                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Description</dt>
                                <dd className="mt-1 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700/50 p-3 rounded-md">{activity.description || 'No description provided.'}</dd>
                            </div>
                            
                            {/* Target Participants integrated here */}
                            <div className="col-span-2 mt-4 bg-blue-50 dark:bg-blue-900/10 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
                                <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-2">Target Participants</h4>
                                <div className="grid grid-cols-3 gap-2 text-sm text-gray-700 dark:text-gray-200">
                                    <div className="flex flex-col">
                                        <span className="text-xs text-gray-500">Male</span>
                                        <span className="font-semibold">{activity.participantsMale}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-xs text-gray-500">Female</span>
                                        <span className="font-semibold">{activity.participantsFemale}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-xs text-gray-500">Total</span>
                                        <span className="font-semibold">{activity.participantsMale + activity.participantsFemale}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="col-span-2 mt-2">
                                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Participating IPOs</dt>
                                {activity.participatingIpos.length > 0 ? (
                                    <ul className="flex flex-wrap gap-2">
                                        {activity.participatingIpos.map((ipoName, idx) => {
                                            const ipo = ipos.find(i => i.name === ipoName);
                                            return (
                                                <li key={idx}>
                                                    <button 
                                                        onClick={() => ipo && onSelectIpo(ipo)}
                                                        disabled={!ipo}
                                                        className={`flex items-center gap-2 text-sm px-3 py-1 rounded-full transition-colors ${ipo ? 'bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/50 dark:hover:bg-emerald-900 text-emerald-800 dark:text-emerald-200 cursor-pointer' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 cursor-default'}`}
                                                        title={ipo ? 'View IPO Profile' : 'IPO details not found'}
                                                    >
                                                        <span className="w-2 h-2 rounded-full bg-current"></span>
                                                        <span>{ipoName}</span>
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-gray-500 italic">No participating IPOs selected.</p>
                                )}
                            </div>
                        </dl>
                    </div>

                    {/* Expenses Section */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Expenses & Budget</h3>
                            {(canEditExpenses || isAdmin) && (
                                <button onClick={() => onEdit('expenses')} className="text-sm text-emerald-600 hover:underline flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L16.732 3.732z" /></svg>
                                    Edit Expenses
                                </button>
                            )}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase">
                                    <tr>
                                        <th className="px-4 py-2 text-left">Particulars</th>
                                        <th className="px-4 py-2 text-left">UACS Code</th>
                                        <th className="px-4 py-2 text-left">Obligation</th>
                                        <th className="px-4 py-2 text-left">Disbursement</th>
                                        <th className="px-4 py-2 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activity.expenses.length > 0 ? (
                                        activity.expenses.map(exp => (
                                            <tr key={exp.id} className="border-b border-gray-200 dark:border-gray-700">
                                                <td className="px-4 py-2 font-medium">{exp.expenseParticular}</td>
                                                <td className="px-4 py-2">{exp.uacsCode}</td>
                                                <td className="px-4 py-2">{formatMonthYear(exp.obligationMonth)}</td>
                                                <td className="px-4 py-2">{formatMonthYear(exp.disbursementMonth)}</td>
                                                <td className="px-4 py-2 text-right font-medium">{formatCurrency(exp.amount)}</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan={5} className="px-4 py-4 text-center text-gray-500 italic">No expenses recorded.</td></tr>
                                    )}
                                </tbody>
                                <tfoot className="font-bold bg-gray-50 dark:bg-gray-700/50">
                                    <tr>
                                        <td colSpan={4} className="px-4 py-2 text-right">Total Budget</td>
                                        <td className="px-4 py-2 text-right">{formatCurrency(totalBudget)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {/* NEW: Accomplishment Report Section */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-semibold text-gray-800 dark:text-white">Accomplishment Report</h3>
                            {(canEditAccomplishment || isAdmin) && (
                                <button onClick={() => onEdit('accomplishment')} className="text-sm text-emerald-600 hover:underline flex items-center gap-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    Edit Accomplishment
                                </button>
                            )}
                        </div>
                        <div className="space-y-6">
                            
                            {/* Summary Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-lg border border-emerald-100 dark:border-emerald-800">
                                    <span className="text-sm text-emerald-800 dark:text-emerald-300 font-medium">Actual Date Conducted</span>
                                    <div className="text-lg font-bold text-emerald-900 dark:text-emerald-100 mt-1">
                                        {formatDate(activity.actualDate)}
                                        {activity.actualEndDate && activity.actualEndDate !== activity.actualDate ? ` - ${formatDate(activity.actualEndDate)}` : ''}
                                    </div>
                                </div>
                                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
                                    <span className="text-sm text-blue-800 dark:text-blue-300 font-medium">Actual Participants</span>
                                    <div className="text-xl font-bold text-blue-900 dark:text-blue-100 mt-1">
                                        {(activity.actualParticipantsMale || 0) + (activity.actualParticipantsFemale || 0)} 
                                        <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
                                            (M: {activity.actualParticipantsMale || 0}, F: {activity.actualParticipantsFemale || 0})
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Financial Accomplishment Table */}
                            <div>
                                <h4 className="text-sm font-bold text-gray-600 dark:text-gray-300 mb-2">Financial Performance (Actual)</h4>
                                {activity.expenses.length > 0 ? (
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full text-sm">
                                            <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase">
                                                <tr>
                                                    <th className="px-4 py-2 text-left">Item</th>
                                                    <th className="px-4 py-2 text-left">Actual Obligation Date</th>
                                                    <th className="px-4 py-2 text-left">Actual Disbursement Date</th>
                                                    <th className="px-4 py-2 text-right">Actual Obligated Amount</th>
                                                    <th className="px-4 py-2 text-right">Actual Disbursed Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {activity.expenses.map(exp => (
                                                    <tr key={exp.id} className="border-b border-gray-100 dark:border-gray-700">
                                                        <td className="px-4 py-2 font-medium">{exp.expenseParticular}</td>
                                                        <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{formatMonthYear(exp.actualObligationDate)}</td>
                                                        <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{formatMonthYear(exp.actualDisbursementDate)}</td>
                                                        <td className="px-4 py-2 text-right font-medium text-emerald-600 dark:text-emerald-400">
                                                            {exp.actualObligationAmount !== undefined && exp.actualObligationAmount !== null ? formatCurrency(exp.actualObligationAmount) : (exp.actualAmount ? formatCurrency(exp.actualAmount) : '-')}
                                                        </td>
                                                        <td className="px-4 py-2 text-right font-medium text-emerald-600 dark:text-emerald-400">
                                                            {exp.actualDisbursementAmount !== undefined && exp.actualDisbursementAmount !== null ? formatCurrency(exp.actualDisbursementAmount) : (exp.actualAmount ? formatCurrency(exp.actualAmount) : '-')}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500 italic">No expense items to report on.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: History */}
                <div className="space-y-8">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border-t-4 border-gray-400">
                        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">History</h3>
                        {activity.history && activity.history.length > 0 ? (
                            <div className="relative border-l-2 border-gray-200 dark:border-gray-700 ml-2 py-2">
                                <ul className="space-y-8">
                                    {activity.history.map((entry, index) => (
                                        <li key={index} className="ml-8 relative">
                                            <span className="absolute flex items-center justify-center w-4 h-4 bg-emerald-500 rounded-full -left-[35px] ring-4 ring-white dark:ring-gray-800"></span>
                                            <time className="mb-1 text-sm font-normal leading-none text-gray-400 dark:text-gray-500">{formatDate(entry.date)}</time>
                                            <p className="font-semibold text-gray-900 dark:text-white">{entry.event}</p>
                                            <p className="text-sm font-normal text-gray-500 dark:text-gray-400">by {entry.user}</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400 italic">No historical data available.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
