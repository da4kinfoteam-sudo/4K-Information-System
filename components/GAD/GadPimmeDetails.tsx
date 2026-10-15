import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, FileText, Gauge, Paperclip, Trash2, Upload, X } from 'lucide-react';
import { filterYears } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { useLogAction } from '../../hooks/useLogAction';
import { APP_BEFORE_NAVIGATION_EVENT, type AppBeforeNavigationDetail } from '../../lib/navigationGuards';
import {
    GAD_PIMME_CHECKLIST,
    GAD_PIMME_CHECKLIST_VERSION,
    GAD_PIMME_QUESTION_COUNT,
    GAD_PIMME_QUESTIONS,
    GadPimmeResponse,
} from '../../lib/gadPimmeChecklist';
import { calculateGadPimmeScore } from '../../lib/gadPimmeScoring';
import { GAD_PIMME_SIGNATORY_ROLES, getGadPimmeSignatories, getGadPimmeSignatoryPayload, type GadPimmeSignatories } from '../../lib/gadPimmeSignatories';
import {
    deleteGadPimmeEvidence,
    formatGadPimmeFileSize,
    GadPimmeEvidenceFile,
    GAD_PIMME_EVIDENCE_ACCEPT,
    isAllowedGadPimmeEvidence,
    listGadPimmeEvidence,
    listGadPimmeAssessmentMovs,
    uploadGadPimmeEvidence,
} from '../../lib/gadPimmeDrive';
import { supabase } from '../../supabaseClient';
import { ConfirmDialog, LoadingState } from '../ui/enterprise';
import { GadPimmeAssessmentRecord } from './GadPimmePage';

interface Props {
    operatingUnit: string;
    initialYear: number;
    canEdit: boolean;
    onBack: () => void;
    onSelectYear: (year: number) => void;
}

interface StoredAnswer {
    question_key: string;
    response: GadPimmeResponse | null;
    points_earned: number;
    remarks: string | null;
}

interface LocalAnswer {
    response: GadPimmeResponse | null;
    remarks: string;
}

const emptyAnswers = () => Object.fromEntries(GAD_PIMME_QUESTIONS.map(question => [question.key, { response: null, remarks: '' }])) as Record<string, LocalAnswer>;
const snapshot = (answers: Record<string, LocalAnswer>, signatories: GadPimmeSignatories) => JSON.stringify({ answers, signatories });
const formatSavedAt = (value: string) => new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
}).format(new Date(value));

const EvidencePanel: React.FC<{
    operatingUnit: string;
    year: number;
    questionKey: string;
    canEdit: boolean;
}> = ({ operatingUnit, year, questionKey, canEdit }) => {
    const { currentUser } = useAuth();
    const { logAction } = useLogAction();
    const [open, setOpen] = useState(false);
    const [files, setFiles] = useState<GadPimmeEvidenceFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [error, setError] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const load = async () => {
        setLoading(true);
        setError('');
        try { setFiles(await listGadPimmeEvidence(currentUser, operatingUnit, year, questionKey)); }
        catch (loadError: any) { setError(loadError?.message || 'Unable to load MOVs.'); }
        finally { setLoading(false); }
    };
    useEffect(() => { if (open) load(); }, [open, operatingUnit, year, questionKey]);

    const uploadFiles = async (selected: FileList | File[]) => {
        const nextFiles = Array.from(selected);
        const invalid = nextFiles.find(file => !isAllowedGadPimmeEvidence(file));
        if (invalid) { setError(`${invalid.name} is not a supported MOV file.`); return; }
        setUploading(true);
        setError('');
        try {
            for (const file of nextFiles) {
                const uploaded = await uploadGadPimmeEvidence(currentUser, operatingUnit, year, questionKey, file);
                await logAction('Uploaded GAD PIMME MOVs', `${operatingUnit} / ${year} / ${questionKey} / ${uploaded.file_name}`, undefined, 'GAD PIMME Evidence', String(uploaded.id), {
                    assessment_id: uploaded.assessment_id,
                    operating_unit: operatingUnit,
                    year,
                    question_key: questionKey,
                    drive_file_id: uploaded.file_id,
                });
            }
            await load();
            setUploadOpen(false);
        } catch (uploadError: any) { setError(uploadError?.message || 'Unable to upload MOVs.'); }
        finally { setUploading(false); if (inputRef.current) inputRef.current.value = ''; }
    };

    const remove = async (file: GadPimmeEvidenceFile) => {
        setError('');
        try {
            const deleted = await deleteGadPimmeEvidence(currentUser, file.id);
            setFiles(previous => previous.filter(item => item.id !== file.id));
            await logAction('Deleted GAD PIMME MOV', `${operatingUnit} / ${year} / ${questionKey} / ${file.file_name}`, undefined, 'GAD PIMME Evidence', String(file.id), {
                assessment_id: deleted.assessment_id,
                operating_unit: operatingUnit,
                year,
                question_key: questionKey,
                drive_file_id: deleted.file_id,
            });
        }
        catch (deleteError: any) { setError(deleteError?.message || 'Unable to delete MOV.'); }
    };

    return <div className="gad-pimme-evidence">
        <button type="button" className="gad-pimme-evidence__trigger" onClick={() => setOpen(value => !value)}>
            <Paperclip aria-hidden="true" /> MOVs {files.length ? `(${files.length})` : ''}
        </button>
        {open && <div className="gad-pimme-evidence__body">
            {canEdit && <button type="button" className="btn btn-secondary btn-compact gad-pimme-evidence__upload" onClick={() => setUploadOpen(true)}><Upload aria-hidden="true" /> Upload MOVs</button>}
            {error && <p className="form-error" role="alert">{error}</p>}
            {loading ? <span className="text-muted">Loading MOVs...</span> : files.map(file => <div className="gad-pimme-evidence__file" key={file.id}>
                <FileText aria-hidden="true" />
                <span><strong>{file.file_name}</strong><small>{file.mime_type || 'File'} · {formatGadPimmeFileSize(file.file_size)} · {file.uploaded_by_name || 'Unknown uploader'} · {new Date(file.uploaded_at).toLocaleDateString()}</small></span>
                <a className="icon-btn" href={file.web_content_link || file.web_view_link || '#'} target="_blank" rel="noreferrer" aria-label={`Download ${file.file_name}`}><Download aria-hidden="true" /></a>
                {canEdit && <button type="button" className="icon-btn icon-btn--danger" onClick={() => remove(file)} aria-label={`Delete ${file.file_name}`}><Trash2 aria-hidden="true" /></button>}
            </div>)}
            {!loading && !files.length && <span className="text-muted">No MOVs uploaded.</span>}
        </div>}
        {uploadOpen && canEdit && <div className="modal-backdrop" role="presentation" onMouseDown={() => !uploading && setUploadOpen(false)}>
            <section className="modal-card gad-pimme-upload-modal" role="dialog" aria-modal="true" aria-labelledby={`evidence-upload-${questionKey}`} onMouseDown={event => event.stopPropagation()}>
                <header className="modal-card__header"><div><h3 id={`evidence-upload-${questionKey}`}>Upload MOVs</h3><p>{operatingUnit} · {year} · Question {questionKey.replace(/^box\d+-/, '')}</p></div><button type="button" className="modal-card__close" disabled={uploading} onClick={() => setUploadOpen(false)} aria-label="Close MOVs upload"><X aria-hidden="true" /></button></header>
                <div className="modal-card__body">
                    <div className="gad-pimme-evidence__dropzone" onClick={() => inputRef.current?.click()}
                        onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); uploadFiles(event.dataTransfer.files); }}>
                        <Upload aria-hidden="true" /><span>{uploading ? 'Uploading selected files...' : 'Drop images, PDF, DOC/DOCX, or PPT/PPTX here, or browse'}</span>
                        <input ref={inputRef} type="file" multiple hidden accept={GAD_PIMME_EVIDENCE_ACCEPT} disabled={uploading} onChange={event => event.target.files && uploadFiles(event.target.files)} />
                    </div>
                    {error && <p className="form-error" role="alert">{error}</p>}
                </div>
                <footer className="modal-card__footer"><button type="button" className="btn btn-secondary" disabled={uploading} onClick={() => setUploadOpen(false)}>Cancel</button><button type="button" className="btn btn-primary" disabled={uploading} onClick={() => inputRef.current?.click()}><Upload aria-hidden="true" /> {uploading ? 'Uploading...' : 'Choose files'}</button></footer>
            </section>
        </div>}
    </div>;
};

const GadPimmeDetails: React.FC<Props> = ({ operatingUnit, initialYear, canEdit, onBack, onSelectYear }) => {
    const { currentUser } = useAuth();
    const { logAction } = useLogAction();
    const [assessment, setAssessment] = useState<GadPimmeAssessmentRecord | null>(null);
    const [answers, setAnswers] = useState<Record<string, LocalAnswer>>(emptyAnswers);
    const [signatories, setSignatories] = useState<GadPimmeSignatories>(getGadPimmeSignatories);
    const [savedSnapshot, setSavedSnapshot] = useState(() => snapshot(emptyAnswers(), getGadPimmeSignatories()));
    const savedDraft = useRef({ answers: emptyAnswers(), signatories: getGadPimmeSignatories() });
    const busyRef = useRef(false);
    const identity = `${operatingUnit}:${initialYear}`;
    const identityRef = useRef(identity);
    identityRef.current = identity;
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);
    const [discardExportOpen, setDiscardExportOpen] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [clearAllOpen, setClearAllOpen] = useState(false);
    const score = useMemo(() => calculateGadPimmeScore((Object.entries(answers) as [string, LocalAnswer][]).map(([questionKey, answer]) => ({ questionKey, response: answer.response, remarks: answer.remarks }))), [answers]);
    const dirty = snapshot(answers, signatories) !== savedSnapshot;
    const editable = canEdit && !saving && !exporting && !loadFailed;

    useEffect(() => {
        identityRef.current = identity;
        return () => { identityRef.current = ''; };
    }, [identity]);

    useEffect(() => {
        const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
        window.addEventListener('beforeunload', beforeUnload);
        return () => window.removeEventListener('beforeunload', beforeUnload);
    }, [dirty]);

    useEffect(() => {
        if (!dirty) return;
        const beforeNavigation = (event: Event) => {
            const navigationEvent = event as CustomEvent<AppBeforeNavigationDetail>;
            if (!window.confirm('Leave without saving your GAD PIMME changes?')) navigationEvent.preventDefault();
        };
        window.addEventListener(APP_BEFORE_NAVIGATION_EVENT, beforeNavigation);
        return () => window.removeEventListener(APP_BEFORE_NAVIGATION_EVENT, beforeNavigation);
    }, [dirty]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true); setLoadFailed(false); setError(''); setSuccess(''); setDiscardExportOpen(false);
            if (!supabase) { setError('Database connection is unavailable.'); setLoadFailed(true); setLoading(false); return; }
            const assessmentResult = await supabase.from('gad_pimme_assessments').select('*')
                .eq('operating_unit', operatingUnit).eq('year', initialYear).maybeSingle();
            if (cancelled) return;
            if (assessmentResult.error) { setError(assessmentResult.error.message); setLoadFailed(true); setLoading(false); return; }
            const current = assessmentResult.data as GadPimmeAssessmentRecord | null;
            const answerResult = current
                ? await supabase.from('gad_pimme_answers').select('question_key,response,points_earned,remarks').eq('assessment_id', current.id)
                : { data: [], error: null };
            if (cancelled) return;
            if (answerResult.error) { setError(answerResult.error.message); setLoadFailed(true); setLoading(false); return; }
            const next = emptyAnswers();
            ((answerResult.data || []) as StoredAnswer[]).forEach(answer => {
                if (next[answer.question_key]) next[answer.question_key] = { response: answer.response, remarks: answer.remarks || '' };
            });
            const nextSignatories = getGadPimmeSignatories(current);
            savedDraft.current = { answers: next, signatories: nextSignatories };
            setAssessment(current); setAnswers(next); setSignatories(nextSignatories);
            setSavedSnapshot(snapshot(next, nextSignatories)); setLoading(false);
        };
        load().catch(loadError => {
            if (cancelled) return;
            setError(loadError?.message || 'Unable to load the PIMME assessment.');
            setLoadFailed(true); setLoading(false);
        });
        return () => { cancelled = true; };
    }, [operatingUnit, initialYear]);

    const updateAnswer = (questionKey: string, patch: Partial<LocalAnswer>) => {
        if (!editable) return;
        setAnswers(previous => ({ ...previous, [questionKey]: { ...previous[questionKey], ...patch } }));
        setSuccess('');
    };

    const save = async () => {
        if (!supabase || !currentUser || !editable || busyRef.current) return;
        busyRef.current = true;
        const saveIdentity = identity;
        setSaving(true); setError(''); setSuccess('');
        try {
            const payload = (Object.entries(answers) as [string, LocalAnswer][]).filter(([, answer]) => answer.response || answer.remarks.trim()).map(([questionKey, answer]) => ({
                question_key: questionKey, response: answer.response, remarks: answer.remarks.trim() || null,
            }));
            const result = await supabase.rpc('save_gad_pimme_assessment', {
                p_operating_unit: operatingUnit, p_year: initialYear, p_answers: payload,
                p_actor_id: currentUser.id, p_actor_name: currentUser.fullName,
                p_signatories: getGadPimmeSignatoryPayload(signatories),
            });
            if (result.error) throw result.error;
            const saved = result.data as GadPimmeAssessmentRecord;
            if (!saved?.id) throw new Error('The database did not confirm the saved assessment.');
            const savedSignatories = getGadPimmeSignatories(saved);
            const savedAnswers = Object.fromEntries((Object.entries(answers) as [string, LocalAnswer][]).map(([key, answer]) => [key, { ...answer, remarks: answer.remarks.trim() }]));
            if (identityRef.current === saveIdentity) {
                savedDraft.current = { answers: savedAnswers, signatories: savedSignatories };
                setAssessment(saved); setAnswers(savedAnswers); setSignatories(savedSignatories);
                setSavedSnapshot(snapshot(savedAnswers, savedSignatories)); setSuccess('GAD PIMME assessment saved.');
            }
            window.dispatchEvent(new CustomEvent('gad-pimme-data-changed'));
            await logAction('Saved GAD PIMME Assessment', `${operatingUnit} / ${initialYear} / ${saved.status} / ${Number(saved.total_score).toFixed(2)} of 20`, undefined, 'GAD PIMME Assessment', String(saved.id), {
                operating_unit: operatingUnit, year: initialYear, checklist_version: GAD_PIMME_CHECKLIST_VERSION,
                answered_count: saved.answered_count, total_score: saved.total_score,
            });
        } catch (saveError: any) { if (identityRef.current === saveIdentity) setError(saveError?.message || 'Unable to save the GAD PIMME assessment.'); }
        finally { busyRef.current = false; setSaving(false); }
    };

    const downloadExcel = async (discard = false) => {
        if (busyRef.current || loadFailed || !assessment) return;
        if (dirty && !discard) { setDiscardExportOpen(true); return; }
        const draft = savedDraft.current;
        if (discard) { setAnswers(draft.answers); setSignatories(draft.signatories); setDiscardExportOpen(false); }
        busyRef.current = true;
        const exportIdentity = identity;
        setExporting(true); setError(''); setSuccess('');
        try {
            const movs = await listGadPimmeAssessmentMovs(currentUser, operatingUnit, initialYear);
            if (identityRef.current !== exportIdentity) return;
            const { downloadGadPimmeWorkbook } = await import('../../lib/gadPimmeExcel');
            if (identityRef.current !== exportIdentity) return;
            await downloadGadPimmeWorkbook({
                assessmentId: assessment.id, operatingUnit, year: initialYear,
                answers: (Object.entries(draft.answers) as [string, LocalAnswer][]).map(([questionKey, answer]) => ({ questionKey, ...answer })),
                signatories: draft.signatories, movs,
            });
        } catch (exportError: any) { if (identityRef.current === exportIdentity) setError(exportError?.message || 'Unable to generate the PIMME workbook.'); }
        finally { busyRef.current = false; setExporting(false); }
    };

    if (loading) return <LoadingState title="Loading GAD PIMME assessment" message={`Preparing ${operatingUnit} for ${initialYear}.`} />;
    const status = !assessment && score.answeredCount === 0 ? 'For Assessment' : score.status;
    const availableYears = filterYears.map(Number).filter(year => year >= 2019 && year <= new Date().getFullYear()).sort((a, b) => b - a);
    const encoder = assessment?.updated_by_name || assessment?.created_by_name;
    const answeredPercent = Math.round((score.answeredCount / GAD_PIMME_QUESTION_COUNT) * 100);

    return <div className="gad-pimme-assessment">
        <header className="gad-pimme-detail-header">
            <div className="gad-pimme-detail-heading">
                <div>
                    <h1>{operatingUnit}</h1>
                    <p>Gender and Development PIMME Assessment &middot; {initialYear}</p>
                    <div className="gad-pimme-detail-meta">
                        <span>Status: <strong>{status}</strong></span>
                        {assessment?.updated_at && <><span aria-hidden="true">&bull;</span><span>Last saved {formatSavedAt(assessment.updated_at)}</span></>}
                        {encoder && <><span aria-hidden="true">&bull;</span><span>Encoder: {encoder}</span></>}
                    </div>
                </div>
                <div className="gad-pimme-detail-tools">
                    <button className="btn btn-primary btn-responsive" type="button" onClick={() => downloadExcel()} disabled={saving || exporting || loadFailed || !assessment}
                        title={!assessment ? 'Save the assessment before downloading' : undefined}>
                        <FileSpreadsheet aria-hidden="true" /><span>{exporting ? 'Generating...' : 'Download Excel'}</span>
                    </button>
                <label className="gad-pimme-year-select">
                    <span>Assessment year</span>
                    <select value={initialYear} disabled={saving || exporting} onChange={event => onSelectYear(Number(event.target.value))}>
                        {availableYears.map(year => <option value={year} key={year}>{year}</option>)}
                    </select>
                </label>
                </div>
            </div>
        </header>
        <section className="gad-pimme-metrics" aria-label="PIMME assessment summary">
            <article className="gad-pimme-metric">
                <span>Overall PIMME</span>
                <div><strong>{score.totalScore.toFixed(2)}</strong><small>/ 20</small></div>
                <div className="gad-pimme-metric__progress" aria-hidden="true"><i style={{ width: `${Math.min(100, (score.totalScore / 20) * 100)}%` }} /></div>
            </article>
            <article className="gad-pimme-metric">
                <Gauge aria-hidden="true" /><span>Box 16</span>
                <div><strong>{score.box16Score.toFixed(2)}</strong><small>/ 8</small></div>
                <p>Management and implementation</p>
            </article>
            <article className="gad-pimme-metric">
                <Gauge aria-hidden="true" /><span>Box 17</span>
                <div><strong>{score.box17Score.toFixed(2)}</strong><small>/ 12</small></div>
                <p>Monitoring and evaluation</p>
            </article>
            <article className="gad-pimme-metric">
                <CheckCircle2 aria-hidden="true" /><span>Answered</span>
                <div><strong>{score.answeredCount}</strong><small>/ {GAD_PIMME_QUESTION_COUNT}</small></div>
                <p>{answeredPercent}% coverage</p>
            </article>
        </section>
        {error && <div className="notice notice--error" role="alert"><p>{error}</p></div>}
        {success && <div className="notice notice--success" role="status"><p>{success}</p></div>}
        {!canEdit && <div className="notice notice--info"><p>This assessment is read-only under your configured module permissions.</p></div>}
        <section className="gad-pimme-questionnaire">
            <header className="gad-pimme-questionnaire__header">
                <div><h2>PIMME Checklist</h2></div>
                {canEdit && <button type="button" className="btn btn-secondary btn-compact" disabled={!editable} onClick={() => setClearAllOpen(true)}>Clear all</button>}
            </header>
            <div className="gad-pimme-questionnaire__body">
                {GAD_PIMME_CHECKLIST.map(box => {
                    const boxScore = box.key === 'box16' ? score.box16Score : score.box17Score;
                    const boxAnswered = box.elements.flatMap(element => element.questions).filter(question => answers[question.key].response).length;
                    const boxTotal = box.elements.flatMap(element => element.questions).length;
                    const boxLabel = box.key === 'box16' ? 'Box 16' : 'Box 17';
                    const boxTitle = box.title.replace(/^Box \d+\.\s*/, '');
                    return <section className="gad-pimme-box" key={box.key}>
                        <header className="gad-pimme-box__header">
                            <div><span>{boxLabel}</span><h3>{boxTitle}</h3></div>
                            <strong>{boxAnswered} / {boxTotal} answered &middot; {boxScore.toFixed(2)} / {box.maxScore}</strong>
                        </header>
                        <div className="gad-pimme-checklist-scroll">
                            <table className="gad-pimme-checklist-table">
                                <colgroup><col className="gad-pimme-checklist-table__question" /><col span={3} className="gad-pimme-checklist-table__choice" /><col className="gad-pimme-checklist-table__remarks" /><col className="gad-pimme-checklist-table__evidence" /></colgroup>
                                <thead><tr><th>Question</th><th>No</th><th>Partly Yes</th><th>Yes</th><th>Remarks</th><th>MOVs</th></tr></thead>
                                <tbody>
                                    {box.elements.map(element => {
                                        const answered = element.questions.filter(question => answers[question.key].response).length;
                                        return <React.Fragment key={element.key}>
                                            <tr className="gad-pimme-element-row"><td colSpan={6}>
                                                <div className="gad-pimme-element-row__content">
                                                    <div><span>{element.label}</span><strong>{element.title}</strong></div>
                                                    <p>{answered} / {element.questions.length} answered &middot; <strong>{score.elementScores[element.key].toFixed(2)} / {element.maxScore}</strong></p>
                                                </div>
                                            </td></tr>
                                            {element.questions.map(question => {
                                                const local = answers[question.key];
                                                return <tr className="gad-pimme-question-row" key={question.key}>
                                                    <td className="gad-pimme-question-cell">
                                                        <div><strong>{question.label}</strong><p>{question.text}</p></div>
                                                        {canEdit && local.response && <button type="button" className="gad-pimme-clear-answer" disabled={!editable} onClick={() => updateAnswer(question.key, { response: null })}>Clear answer</button>}
                                                    </td>
                                                    {(['No', 'Partly Yes', 'Yes'] as const).map(response => {
                                                        const choice = question.choices.find(item => item.response === response)!;
                                                        return <td className="gad-pimme-choice-cell" key={response}>
                                                            <label className={local.response === response ? 'is-selected' : ''}>
                                                                <input type="radio" name={question.key} value={response} checked={local.response === response} disabled={!editable} onChange={() => updateAnswer(question.key, { response })} aria-label={`${question.label} ${response}`} />
                                                                <span>{choice.points.toFixed(2)} pts</span>
                                                            </label>
                                                        </td>;
                                                    })}
                                                    <td className="gad-pimme-remarks-cell"><textarea rows={3} disabled={!editable} value={local.remarks} onChange={event => updateAnswer(question.key, { remarks: event.target.value })} placeholder="Add remarks (optional)..." aria-label={`Remarks for ${question.label}`} /></td>
                                                    <td className="gad-pimme-evidence-cell"><EvidencePanel key={`${identity}:${question.key}`} operatingUnit={operatingUnit} year={initialYear} questionKey={question.key} canEdit={editable} /></td>
                                                </tr>;
                                            })}
                                        </React.Fragment>;
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>;
                })}
            </div>
        </section>
        <section className="gad-pimme-signatories" aria-labelledby="gad-pimme-signatories-title">
            <header><h2 id="gad-pimme-signatories-title">Signatories</h2></header>
            <div className="gad-pimme-signatories__fields">
                {GAD_PIMME_SIGNATORY_ROLES.map(role => <fieldset key={role.key}>
                    <legend>{role.label}</legend>
                    {(['name', 'position'] as const).map(field => {
                        const key = `${role.key}_by_${field}` as keyof GadPimmeSignatories;
                        return <label key={field}><span>{field === 'name' ? 'Name' : 'Position'}</span>
                            <input type="text" className="form-control" value={signatories[key]} disabled={!editable}
                                aria-label={`${role.label} ${field}`} onChange={event => { if (!editable) return; setSignatories(previous => ({ ...previous, [key]: event.target.value })); setSuccess(''); }} />
                        </label>;
                    })}
                </fieldset>)}
            </div>
        </section>
        <section className="gad-pimme-assessment-actions"><span>{dirty ? 'Unsaved changes' : assessment?.updated_at ? `Last saved ${formatSavedAt(assessment.updated_at)}` : 'Not yet saved'}</span><div><button type="button" className="btn btn-secondary" disabled={saving || exporting} onClick={onBack}>Cancel</button>{canEdit && <button type="button" className="btn btn-primary" onClick={save} disabled={!editable}>{saving ? 'Saving...' : 'Save assessment'}</button>}</div></section>
        {clearAllOpen && <ConfirmDialog title="Clear all answers?" description="Responses and remarks will be cleared locally. Existing MOVs and signatories will remain. Save the assessment to persist the changes." confirmLabel="Clear all" tone="danger" onCancel={() => setClearAllOpen(false)} onConfirm={() => { if (editable) setAnswers(emptyAnswers()); setClearAllOpen(false); }} />}
        {discardExportOpen && <ConfirmDialog title="Unsaved PIMME changes" description="Save your changes before downloading, or discard them to download the last saved assessment." confirmLabel="Discard and download" tone="danger" onCancel={() => setDiscardExportOpen(false)} onConfirm={() => downloadExcel(true)} />}
    </div>;
};

export default GadPimmeDetails;
