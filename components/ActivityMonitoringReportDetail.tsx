import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Edit3, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { Activity, ActivityMonitoringAction, ActivityMonitoringReport, ActivityMonitoringStatus, IPO } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { useUserAccess } from './mainfunctions/TableHooks';
import { supabase } from '../supabaseClient';

interface ActivityMonitoringReportDetailProps {
    activity: Activity;
    ipo: IPO;
    initialReport?: ActivityMonitoringReport | null;
    onBack: () => void;
}

const statusOptions: ActivityMonitoringStatus[] = ['Pending', 'Ongoing', 'Completed'];

const formatDateTime = (value?: string | null) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const displayUserName = (user: ReturnType<typeof useAuth>['currentUser']) =>
    user?.fullName || user?.username || 'System';

const ActivityMonitoringReportDetail: React.FC<ActivityMonitoringReportDetailProps> = ({
    activity,
    ipo,
    initialReport,
    onBack
}) => {
    const { currentUser } = useAuth();
    const { canEdit } = useUserAccess('Activities');
    const isAdmin = currentUser?.role === 'Super Admin' || currentUser?.role === 'Administrator';
    const [report, setReport] = useState<ActivityMonitoringReport | null>(initialReport || null);
    const [status, setStatus] = useState<ActivityMonitoringStatus>(initialReport?.status || 'Pending');
    const [findings, setFindings] = useState(initialReport?.findings || '');
    const [issues, setIssues] = useState(initialReport?.issues || '');
    const [recommendations, setRecommendations] = useState(initialReport?.recommendations || '');
    const [actions, setActions] = useState<ActivityMonitoringAction[]>([]);
    const [newAction, setNewAction] = useState('');
    const [message, setMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isAddingAction, setIsAddingAction] = useState(false);

    const canEditReport = canEdit || isAdmin;

    const loadReport = useCallback(async () => {
        if (!supabase || !activity.id || !ipo.id) return;
        setIsLoading(true);
        setMessage(null);
        try {
            let activeReport = report;
            if (!activeReport) {
                const { data, error } = await supabase
                    .from('activity_monitoring_reports')
                    .select('*')
                    .eq('activity_id', activity.id)
                    .eq('ipo_id', ipo.id)
                    .is('deleted_at', null)
                    .maybeSingle();
                if (error) throw error;
                activeReport = data as ActivityMonitoringReport | null;
                setReport(activeReport);
                if (activeReport) {
                    setStatus(activeReport.status);
                    setFindings(activeReport.findings || '');
                    setIssues(activeReport.issues || '');
                    setRecommendations(activeReport.recommendations || '');
                }
            }

            if (!activeReport?.id) {
                setActions([]);
                return;
            }

            const { data: actionRows, error: actionError } = await supabase
                .from('activity_monitoring_actions')
                .select('*')
                .eq('monitoring_report_id', activeReport.id)
                .is('deleted_at', null)
                .order('created_at', { ascending: false });
            if (actionError) throw actionError;
            setActions((actionRows || []) as ActivityMonitoringAction[]);
        } catch (error: any) {
            setMessage(error.message || 'Unable to load monitoring report.');
        } finally {
            setIsLoading(false);
        }
    }, [activity.id, ipo.id, report]);

    useEffect(() => {
        loadReport();
    }, [loadReport]);

    const reportPayload = useMemo(() => ({
        activity_id: activity.id,
        ipo_id: ipo.id,
        status,
        findings: findings.trim() || null,
        issues: issues.trim() || null,
        recommendations: recommendations.trim() || null,
        reported_by: currentUser?.id || null,
        reported_by_name: displayUserName(currentUser),
        updated_at: new Date().toISOString()
    }), [activity.id, currentUser, findings, ipo.id, issues, recommendations, status]);

    const handleSave = async (event: FormEvent) => {
        event.preventDefault();
        if (!supabase || !canEditReport) return;
        setIsSaving(true);
        setMessage(null);
        try {
            if (report?.id) {
                const { data, error } = await supabase
                    .from('activity_monitoring_reports')
                    .update(reportPayload)
                    .eq('id', report.id)
                    .select('*')
                    .single();
                if (error) throw error;
                setReport(data as ActivityMonitoringReport);
            } else {
                const { data, error } = await supabase
                    .from('activity_monitoring_reports')
                    .insert({
                        ...reportPayload,
                        created_at: new Date().toISOString()
                    })
                    .select('*')
                    .single();
                if (error) throw error;
                setReport(data as ActivityMonitoringReport);
            }
            setMessage('Monitoring report saved.');
        } catch (error: any) {
            setMessage(error.message || 'Unable to save monitoring report.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddAction = async () => {
        if (!supabase || !canEditReport || !newAction.trim()) return;
        if (!report?.id) {
            setMessage('Save the monitoring report before adding action updates.');
            return;
        }
        setIsAddingAction(true);
        setMessage(null);
        try {
            const { data, error } = await supabase
                .from('activity_monitoring_actions')
                .insert({
                    monitoring_report_id: report.id,
                    action_taken: newAction.trim(),
                    created_by: currentUser?.id || null,
                    created_by_name: displayUserName(currentUser),
                    created_at: new Date().toISOString()
                })
                .select('*')
                .single();
            if (error) throw error;
            setActions(prev => [data as ActivityMonitoringAction, ...prev]);
            setNewAction('');
            setMessage('Action update added.');
        } catch (error: any) {
            setMessage(error.message || 'Unable to add action update.');
        } finally {
            setIsAddingAction(false);
        }
    };

    const handleEditAction = async (action: ActivityMonitoringAction) => {
        if (!supabase || !isAdmin) return;
        const nextValue = window.prompt('Update action taken:', action.action_taken);
        if (nextValue === null || !nextValue.trim()) return;
        try {
            const editedAt = new Date().toISOString();
            const { data, error } = await supabase
                .from('activity_monitoring_actions')
                .update({
                    action_taken: nextValue.trim(),
                    edited_by: currentUser?.id || null,
                    edited_by_name: displayUserName(currentUser),
                    edited_at: editedAt,
                    updated_at: editedAt
                })
                .eq('id', action.id)
                .select('*')
                .single();
            if (error) throw error;
            setActions(prev => prev.map(item => item.id === action.id ? data as ActivityMonitoringAction : item));
        } catch (error: any) {
            setMessage(error.message || 'Unable to edit action update.');
        }
    };

    const handleDeleteAction = async (action: ActivityMonitoringAction) => {
        if (!supabase || !isAdmin) return;
        if (!confirm('Delete this action update?')) return;
        try {
            const deletedAt = new Date().toISOString();
            const { error } = await supabase
                .from('activity_monitoring_actions')
                .update({
                    deleted_at: deletedAt,
                    deleted_by: currentUser?.id || null,
                    deleted_by_name: displayUserName(currentUser)
                })
                .eq('id', action.id);
            if (error) throw error;
            setActions(prev => prev.filter(item => item.id !== action.id));
        } catch (error: any) {
            setMessage(error.message || 'Unable to delete action update.');
        }
    };

    return (
        <div className="detail-page animate-fadeIn">
            <header className="detail-header">
                <div className="detail-heading">
                    <h1 className="detail-title">Monitoring Report</h1>
                    <p className="detail-meta">{activity.name} | {ipo.name}</p>
                </div>
                <div className="detail-actions">
                    <button type="button" onClick={onBack} className="btn btn-secondary btn-responsive">
                        <ArrowLeft className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Back</span>
                    </button>
                </div>
            </header>

            <div className="detail-grid">
                <main className="detail-main">
                    <form className="detail-card" onSubmit={handleSave}>
                        <div className="flex items-center justify-between gap-3 mb-4">
                            <h3 className="detail-card-title mb-0">Report Details</h3>
                            <span className={`status-badge status-badge--compact ${status === 'Completed' ? 'status-badge--completed' : status === 'Ongoing' ? 'status-badge--ongoing' : 'status-badge--pending'}`}>
                                {status}
                            </span>
                        </div>

                        {message && <p className="drive-file-card__message" role="status">{message}</p>}
                        {isLoading ? (
                            <div className="drive-file-card__loading">
                                <Loader2 className="animate-spin" aria-hidden="true" />
                                <span>Loading monitoring report...</span>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <label className="form-label">Status</label>
                                    <select value={status} onChange={event => setStatus(event.target.value as ActivityMonitoringStatus)} className="form-control" disabled={!canEditReport}>
                                        {statusOptions.map(option => <option key={option} value={option}>{option}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label">Findings</label>
                                    <textarea value={findings} onChange={event => setFindings(event.target.value)} className="form-control" rows={4} disabled={!canEditReport} />
                                </div>
                                <div>
                                    <label className="form-label">Issues</label>
                                    <textarea value={issues} onChange={event => setIssues(event.target.value)} className="form-control" rows={4} disabled={!canEditReport} />
                                </div>
                                <div>
                                    <label className="form-label">Recommendations</label>
                                    <textarea value={recommendations} onChange={event => setRecommendations(event.target.value)} className="form-control" rows={4} disabled={!canEditReport} />
                                </div>
                                {canEditReport && (
                                    <div className="flex justify-end">
                                        <button type="submit" className="btn btn-primary" disabled={isSaving}>
                                            {isSaving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
                                            {isSaving ? 'Saving...' : 'Save Report'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </form>
                </main>

                <aside className="detail-aside">
                    <section className="detail-card">
                        <h3 className="detail-card-title">Action Timeline</h3>
                        {canEditReport && (
                            <div className="space-y-3 mb-4">
                                <textarea
                                    value={newAction}
                                    onChange={event => setNewAction(event.target.value)}
                                    className="form-control"
                                    rows={3}
                                    placeholder="Add action taken..."
                                />
                                <button type="button" className="btn btn-primary w-full" onClick={handleAddAction} disabled={isAddingAction || !newAction.trim()}>
                                    {isAddingAction ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
                                    Add Action
                                </button>
                            </div>
                        )}

                        {actions.length > 0 ? (
                            <ul className="detail-list">
                                {actions.map(action => (
                                    <li key={action.id} className="detail-list-item">
                                        <p className="detail-list-title">{action.action_taken}</p>
                                        <p className="detail-list-copy">
                                            {formatDateTime(action.created_at)} by {action.created_by_name || 'Unknown user'}
                                            {action.edited_at ? ` - edited ${formatDateTime(action.edited_at)}` : ''}
                                        </p>
                                        {isAdmin && (
                                            <div className="drive-file-card__actions mt-2">
                                                <button type="button" className="table-action table-action--primary" onClick={() => handleEditAction(action)}>
                                                    <Edit3 aria-hidden="true" />
                                                    Edit
                                                </button>
                                                <button type="button" className="table-action table-action--danger" onClick={() => handleDeleteAction(action)}>
                                                    <Trash2 aria-hidden="true" />
                                                    Delete
                                                </button>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="detail-empty">No action updates yet.</p>
                        )}
                    </section>
                </aside>
            </div>
        </div>
    );
};

export default ActivityMonitoringReportDetail;
