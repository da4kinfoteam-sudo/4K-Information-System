
import React, { useMemo } from 'react';
import { ArrowLeft, CheckCircle2, Edit3 } from 'lucide-react';
import { Activity, IPO } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useUserAccess } from './mainfunctions/TableHooks';

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
    switch (status) {
        case 'Completed': return 'status-badge status-badge--compact status-badge--completed';
        case 'Ongoing': return 'status-badge status-badge--compact status-badge--ongoing';
        case 'Proposed': return 'status-badge status-badge--compact status-badge--proposed';
        case 'Cancelled': return 'status-badge status-badge--compact status-badge--cancelled';
        default: return 'status-badge status-badge--compact status-badge--neutral';
    }
}

const DetailItem: React.FC<{ label: string; value?: string | number | React.ReactNode }> = ({ label, value }) => (
    <div className="detail-item">
        <dt className="detail-label">{label}</dt>
        <dd className="detail-value font-semibold">{value || 'N/A'}</dd>
    </div>
);

export const ActivityDetail: React.FC<ActivityDetailProps> = ({ activity, ipos, onBack, previousPageName, onSelectIpo, onEdit, uacsCodes }) => {
    const { currentUser } = useAuth();
    const { canEdit } = useUserAccess('Activities');
    const { canEdit: canEditFinancial } = useUserAccess('Accomplishment - Financial');
    const { canEdit: canEditPhysical } = useUserAccess('Accomplishment - Physical');

    const isAdmin = currentUser?.role === 'Administrator';
    
    // Helper to get UACS Description
    const getUacsDescription = (ot: string, ep: string, code: string) => {
        if (uacsCodes[ot] && uacsCodes[ot][ep] && uacsCodes[ot][ep][code]) {
            return uacsCodes[ot][ep][code];
        }
        return '';
    };
    
    // Status Logic for Edit Button Visibility
    const isCompleted = activity.status === 'Completed';
    const isCancelled = activity.status === 'Cancelled';
    const isOngoing = activity.status === 'Ongoing';
    
    // User Role Permission Logic
    // Details & Expenses: Editable if Proposed. Read-only if Ongoing/Completed/Cancelled (unless Admin).
    const canEditDetails = canEdit;
    const canEditExpenses = canEdit;
    
    // Accomplishment: Editable based on tracking permissions
    const canEditAccomplishment = canEdit || canEditFinancial || canEditPhysical;

    const totalBudget = useMemo(() => {
       return activity.expenses.reduce((acc, item) => acc + item.amount, 0);
    }, [activity.expenses]);

    return (
        <div className="detail-page animate-fadeIn">
            {/* Header */}
            <header className="detail-header">
                <div className="detail-heading">
                    <h1 className="detail-title">{activity.name}</h1>
                    <p className="detail-meta">
                        {activity.location} | {formatDate(activity.date)}
                        {activity.endDate && activity.endDate !== activity.date ? ` - ${formatDate(activity.endDate)}` : ''}
                    </p>
                </div>
                <div className="detail-actions">
                    {(canEditAccomplishment || isAdmin) && (
                        <button onClick={() => onEdit('accomplishment')} className="btn btn-primary btn-responsive" title="Edit Accomplishment">
                            <CheckCircle2 className="btn-symbol" aria-hidden="true" />
                            <span className="btn-text">Edit Accomplishment</span>
                        </button>
                    )}
                    <button onClick={onBack} className="btn btn-secondary btn-responsive" title={`Back to ${previousPageName}`}>
                        <ArrowLeft className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Back to {previousPageName}</span>
                    </button>
                </div>
            </header>

            {/* Content Grid */}
            <div className="detail-grid">
                {/* Left Column: Info & Expenses */}
                <div className="detail-main">
                    
                    {/* Activity Details Section */}
                    <div className="detail-card">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="detail-card-title mb-0">Activity Details</h3>
                            {(canEditDetails || isAdmin) && (
                                <button onClick={() => onEdit('details')} className="table-action table-action--primary">
                                    <Edit3 className="btn-symbol" aria-hidden="true" />
                                    Edit Details
                                </button>
                            )}
                        </div>
                        <dl className="detail-dl">
                            <DetailItem label="Status" value={<span className={getStatusBadge(activity.status)}>{activity.status}</span>} />
                            <DetailItem label="Operating Unit" value={activity.operatingUnit} />
                            <DetailItem label="UID" value={activity.uid} />
                            <DetailItem label="Type" value={activity.type} />
                            <DetailItem label="Date" value={
                                <>
                                    {formatDate(activity.date)}
                                    {activity.endDate && activity.endDate !== activity.date ? ` to ${formatDate(activity.endDate)}` : ''}
                                </>
                            } />
                            <DetailItem label="Component" value={activity.component} />
                            <DetailItem label="Funding Year" value={activity.fundingYear} />
                            <DetailItem label="Tier" value={activity.tier} />
                            {activity.type === 'Training' && <DetailItem label="Facilitator" value={activity.facilitator} />}
                            <div className="detail-item detail-item--wide">
                                <dt className="detail-label">Description</dt>
                                <dd className="detail-note">{activity.description || 'No description provided.'}</dd>
                            </div>
                            
                            {/* Target Participants integrated here */}
                            <div className="detail-item detail-item--wide">
                                <h4 className="detail-section-title">Target Participants</h4>
                                <div className="detail-metric-grid mb-0">
                                    <div className="detail-metric detail-metric--inline">
                                        <span className="detail-metric-label">Male</span>
                                        <span className="detail-metric-value">{activity.participantsMale}</span>
                                    </div>
                                    <div className="detail-metric detail-metric--inline">
                                        <span className="detail-metric-label">Female</span>
                                        <span className="detail-metric-value">{activity.participantsFemale}</span>
                                    </div>
                                    <div className="detail-metric detail-metric--inline">
                                        <span className="detail-metric-label">Total</span>
                                        <span className="detail-metric-value">{activity.participantsMale + activity.participantsFemale}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="detail-item detail-item--wide">
                                <dt className="detail-label mb-2">Participating IPOs</dt>
                                {activity.participatingIpos.length > 0 ? (
                                    <ul className="flex flex-wrap gap-2">
                                        {activity.participatingIpos.map((ipoName, idx) => {
                                            const ipo = ipos.find(i => i.name === ipoName);
                                            return (
                                                <li key={idx}>
                                                    <button 
                                                        onClick={() => ipo && onSelectIpo(ipo)}
                                                        disabled={!ipo}
                                                        className={`detail-pill-button ${ipo ? 'detail-pill-button--active' : 'detail-pill-button--disabled'}`}
                                                        title={ipo ? 'View IPO Profile' : 'IPO details not found'}
                                                    >
                                                        <span className="detail-pill-button__dot"></span>
                                                        <span>{ipoName}</span>
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                ) : (
                                    <p className="detail-empty">No participating IPOs selected.</p>
                                )}
                            </div>
                        </dl>
                    </div>

                    {/* Expenses Section */}
                    <div className="detail-card">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="detail-card-title mb-0">Expenses & Budget</h3>
                            {(canEditExpenses || isAdmin) && (
                                <button onClick={() => onEdit('expenses')} className="table-action table-action--primary">
                                    <Edit3 className="btn-symbol" aria-hidden="true" />
                                    Edit Expenses
                                </button>
                            )}
                        </div>
                        <div className="data-table-scroll">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Particulars</th>
                                        <th>UACS Code</th>
                                        <th>Obligation</th>
                                        <th>Disbursement</th>
                                        <th className="text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activity.expenses.length > 0 ? (
                                        activity.expenses.map(exp => (
                                            <tr key={exp.id}>
                                                <td className="font-medium">{exp.expenseParticular}</td>
                                                <td>
                                                    {exp.uacsCode}
                                                    {getUacsDescription(exp.objectType, exp.expenseParticular, exp.uacsCode) && (
                                                        <span className="detail-list-copy block">{getUacsDescription(exp.objectType, exp.expenseParticular, exp.uacsCode)}</span>
                                                    )}
                                                </td>
                                                <td>{formatMonthYear(exp.obligationMonth)}</td>
                                                <td>{formatMonthYear(exp.disbursementMonth)}</td>
                                                <td className="text-right font-medium">{formatCurrency(exp.amount)}</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan={5} className="text-center italic">No expenses recorded.</td></tr>
                                    )}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td colSpan={4} className="text-right font-bold">Total Budget</td>
                                        <td className="text-right font-bold">{formatCurrency(totalBudget)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {/* NEW: Accomplishment Report Section */}
                    <div className="detail-card">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="detail-card-title mb-0">Accomplishment Report</h3>
                            {(canEditAccomplishment || isAdmin) && (
                                <button onClick={() => onEdit('accomplishment')} className="table-action table-action--primary">
                                    <CheckCircle2 className="btn-symbol" aria-hidden="true" />
                                    Edit Accomplishment
                                </button>
                            )}
                        </div>
                        <div className="space-y-6">
                            
                            {/* Summary Cards */}
                            <div className="detail-metric-grid">
                                <div className="detail-metric">
                                    <span className="detail-metric-label">Actual Date Conducted</span>
                                    <div className="detail-metric-value">
                                        {formatDate(activity.actualDate)}
                                        {activity.actualEndDate && activity.actualEndDate !== activity.actualDate ? ` - ${formatDate(activity.actualEndDate)}` : ''}
                                    </div>
                                </div>
                                <div className="detail-metric">
                                    <span className="detail-metric-label">Actual Participants</span>
                                    <div className="detail-metric-value">
                                        {(activity.actualParticipantsMale || 0) + (activity.actualParticipantsFemale || 0)} 
                                        <span className="detail-metric-label ml-2">
                                            (M: {activity.actualParticipantsMale || 0}, F: {activity.actualParticipantsFemale || 0})
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Financial Accomplishment Table */}
                            <div>
                                <h4 className="detail-section-title">Financial Performance (Actual)</h4>
                                {activity.expenses.length > 0 ? (
                                    <div className="data-table-scroll">
                                        <table className="data-table">
                                            <thead>
                                                <tr>
                                                    <th>Item</th>
                                                    <th>Actual Obligation Date</th>
                                                    <th>Actual Disbursement Date</th>
                                                    <th className="text-right">Actual Obligated Amount</th>
                                                    <th className="text-right">Actual Disbursed Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {activity.expenses.map(exp => (
                                                    <tr key={exp.id}>
                                                        <td className="font-medium">{exp.expenseParticular}</td>
                                                        <td>{formatMonthYear(exp.actualObligationDate)}</td>
                                                        <td>{formatMonthYear(exp.actualDisbursementDate)}</td>
                                                        <td className="text-right font-medium text-emerald-600 dark:text-emerald-400">
                                                            {exp.actualObligationAmount !== undefined && exp.actualObligationAmount !== null ? formatCurrency(exp.actualObligationAmount) : (exp.actualAmount ? formatCurrency(exp.actualAmount) : '-')}
                                                        </td>
                                                        <td className="text-right font-medium text-emerald-600 dark:text-emerald-400">
                                                            {exp.actualDisbursementAmount !== undefined && exp.actualDisbursementAmount !== null ? formatCurrency(exp.actualDisbursementAmount) : (exp.actualAmount ? formatCurrency(exp.actualAmount) : '-')}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="detail-empty">No expense items to report on.</p>
                                )}
                            </div>

                            {/* Gender and Inclusivity (Read-Only) */}
                            <div>
                                <h4 className="detail-section-title">Gender and Inclusivity</h4>
                                <div className="detail-dl">
                                    <DetailItem label="PWD" value={activity.actualPWD} />
                                    <DetailItem label="Muslim" value={activity.actualMuslim} />
                                    <DetailItem label="LGBTQ+" value={activity.actualLGBTQ} />
                                    <DetailItem label="Solo Parents" value={activity.actualSoloParent} />
                                    <DetailItem label="Senior" value={activity.actualSenior} />
                                    <DetailItem label="Youth" value={activity.actualYouth} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: History */}
                <div className="detail-aside">
                    <div className="detail-card">
                        <h3 className="detail-card-title">History</h3>
                        {activity.history && activity.history.length > 0 ? (
                            <div className="relative border-l-2 border-gray-200 dark:border-gray-700 ml-2 py-2">
                                <ul className="space-y-8">
                                    {activity.history.map((entry, index) => (
                                        <li key={index} className="ml-8 relative">
                                            <span className="absolute flex items-center justify-center w-4 h-4 bg-emerald-500 rounded-full -left-[35px] ring-4 ring-white dark:ring-gray-800"></span>
                                            <time className="mb-1 text-sm font-normal leading-none text-gray-400 dark:text-gray-500">{formatDate(entry.date)}</time>
                                            <p className="detail-list-name">{entry.event}</p>
                                            <p className="text-sm font-normal text-gray-500 dark:text-gray-400">by {entry.user}</p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <p className="detail-empty">No historical data available.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
