import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, FileText, Paperclip, Trash2, Upload, X } from 'lucide-react';
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
import {
    deleteGadPimmeEvidence,
    formatGadPimmeFileSize,
    GadPimmeEvidenceFile,
    GAD_PIMME_EVIDENCE_ACCEPT,
    isAllowedGadPimmeEvidence,
    listGadPimmeEvidence,
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
const snapshot = (answers: Record<string, LocalAnswer>) => JSON.stringify(answers);

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
        catch (loadError: any) { setError(loadError?.message || 'Unable to load evidence files.'); }
        finally { setLoading(false); }
    };
    useEffect(() => { if (open) load(); }, [open, operatingUnit, year, questionKey]);

    const uploadFiles = async (selected: FileList | File[]) => {
        const nextFiles = Array.from(selected);
        const invalid = nextFiles.find(file => !isAllowedGadPimmeEvidence(file));
        if (invalid) { setError(`${invalid.name} is not a supported evidence file.`); return; }
        setUploading(true);
        setError('');
        try {
            for (const file of nextFiles) {
                const uploaded = await uploadGadPimmeEvidence(currentUser, operatingUnit, year, questionKey, file);
                await logAction('Uploaded GAD PIMME Evidence', `${operatingUnit} / ${year} / ${questionKey} / ${uploaded.file_name}`, undefined, 'GAD PIMME Evidence', String(uploaded.id), {
                    assessment_id: uploaded.assessment_id,
                    operating_unit: operatingUnit,
                    year,
                    question_key: questionKey,
                    drive_file_id: uploaded.file_id,
                });
            }
            await load();
            setUploadOpen(false);
        } catch (uploadError: any) { setError(uploadError?.message || 'Unable to upload evidence.'); }
        finally { setUploading(false); if (inputRef.current) inputRef.current.value = ''; }
    };

    const remove = async (file: GadPimmeEvidenceFile) => {
        setError('');
        try {
            const deleted = await deleteGadPimmeEvidence(currentUser, file.id);
            setFiles(previous => previous.filter(item => item.id !== file.id));
            await logAction('Deleted GAD PIMME Evidence', `${operatingUnit} / ${year} / ${questionKey} / ${file.file_name}`, undefined, 'GAD PIMME Evidence', String(file.id), {
                assessment_id: deleted.assessment_id,
                operating_unit: operatingUnit,
                year,
                question_key: questionKey,
                drive_file_id: deleted.file_id,
            });
        }
        catch (deleteError: any) { setError(deleteError?.message || 'Unable to delete evidence.'); }
    };

    return <div className="gad-pimme-evidence">
        <button type="button" className="btn btn-ghost btn-compact" onClick={() => setOpen(value => !value)}>
            <Paperclip aria-hidden="true" /> Evidence {files.length ? `(${files.length})` : ''}
        </button>
        {open && <div className="gad-pimme-evidence__body">
            {canEdit && <button type="button" className="btn btn-secondary btn-compact gad-pimme-evidence__upload" onClick={() => setUploadOpen(true)}><Upload aria-hidden="true" /> Upload evidence</button>}
            {error && <p className="form-error" role="alert">{error}</p>}
            {loading ? <span className="text-muted">Loading evidence...</span> : files.map(file => <div className="gad-pimme-evidence__file" key={file.id}>
                <FileText aria-hidden="true" />
                <span><strong>{file.file_name}</strong><small>{file.mime_type || 'File'} · {formatGadPimmeFileSize(file.file_size)} · {file.uploaded_by_name || 'Unknown uploader'} · {new Date(file.uploaded_at).toLocaleDateString()}</small></span>
                <a className="icon-btn" href={file.web_content_link || file.web_view_link || '#'} target="_blank" rel="noreferrer" aria-label={`Download ${file.file_name}`}><Download aria-hidden="true" /></a>
                {canEdit && <button type="button" className="icon-btn icon-btn--danger" onClick={() => remove(file)} aria-label={`Delete ${file.file_name}`}><Trash2 aria-hidden="true" /></button>}
            </div>)}
            {!loading && !files.length && <span className="text-muted">No evidence files uploaded.</span>}
        </div>}
        {uploadOpen && canEdit && <div className="modal-backdrop" role="presentation" onMouseDown={() => !uploading && setUploadOpen(false)}>
            <section className="modal-card gad-pimme-upload-modal" role="dialog" aria-modal="true" aria-labelledby={`evidence-upload-${questionKey}`} onMouseDown={event => event.stopPropagation()}>
                <header className="modal-card__header"><div><h3 id={`evidence-upload-${questionKey}`}>Upload evidence</h3><p>{operatingUnit} · {year} · Question {questionKey.replace(/^box\d+-/, '')}</p></div><button type="button" className="modal-card__close" disabled={uploading} onClick={() => setUploadOpen(false)} aria-label="Close evidence upload"><X aria-hidden="true" /></button></header>
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

const GadPimmeDetails: React.FC<Props> = ({ operatingUnit, initialYear, canEdit, onBack }) => {
    const { currentUser } = useAuth();
    const { logAction } = useLogAction();
    const [assessment, setAssessment] = useState<GadPimmeAssessmentRecord | null>(null);
    const [answers, setAnswers] = useState<Record<string, LocalAnswer>>(emptyAnswers);
    const [savedSnapshot, setSavedSnapshot] = useState(snapshot(emptyAnswers()));
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [clearAllOpen, setClearAllOpen] = useState(false);
    const score = useMemo(() => calculateGadPimmeScore((Object.entries(answers) as [string, LocalAnswer][]).map(([questionKey, answer]) => ({ questionKey, response: answer.response, remarks: answer.remarks }))), [answers]);
    const dirty = snapshot(answers) !== savedSnapshot;

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
            setLoading(true); setError(''); setSuccess('');
            if (!supabase) { setError('Database connection is unavailable.'); setLoading(false); return; }
            const assessmentResult = await supabase.from('gad_pimme_assessments').select('*')
                .eq('operating_unit', operatingUnit).eq('year', initialYear).maybeSingle();
            if (cancelled) return;
            if (assessmentResult.error) { setError(assessmentResult.error.message); setLoading(false); return; }
            const current = assessmentResult.data as GadPimmeAssessmentRecord | null;
            const answerResult = current
                ? await supabase.from('gad_pimme_answers').select('question_key,response,points_earned,remarks').eq('assessment_id', current.id)
                : { data: [], error: null };
            if (cancelled) return;
            if (answerResult.error) setError(answerResult.error.message);
            const next = emptyAnswers();
            ((answerResult.data || []) as StoredAnswer[]).forEach(answer => {
                if (next[answer.question_key]) next[answer.question_key] = { response: answer.response, remarks: answer.remarks || '' };
            });
            setAssessment(current); setAnswers(next); setSavedSnapshot(snapshot(next)); setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, [operatingUnit, initialYear]);

    const updateAnswer = (questionKey: string, patch: Partial<LocalAnswer>) => {
        if (!canEdit) return;
        setAnswers(previous => ({ ...previous, [questionKey]: { ...previous[questionKey], ...patch } }));
        setSuccess('');
    };

    const save = async () => {
        if (!supabase || !currentUser || !canEdit) return;
        setSaving(true); setError(''); setSuccess('');
        try {
            const payload = (Object.entries(answers) as [string, LocalAnswer][]).filter(([, answer]) => answer.response || answer.remarks.trim()).map(([questionKey, answer]) => ({
                question_key: questionKey, response: answer.response, remarks: answer.remarks.trim() || null,
            }));
            const result = await supabase.rpc('save_gad_pimme_assessment', {
                p_operating_unit: operatingUnit, p_year: initialYear, p_answers: payload,
                p_actor_id: currentUser.id, p_actor_name: currentUser.fullName,
            });
            if (result.error) throw result.error;
            const saved = result.data as GadPimmeAssessmentRecord;
            setAssessment(saved); setSavedSnapshot(snapshot(answers)); setSuccess('GAD PIMME assessment saved.');
            window.dispatchEvent(new CustomEvent('gad-pimme-data-changed'));
            await logAction('Saved GAD PIMME Assessment', `${operatingUnit} / ${initialYear} / ${saved.status} / ${Number(saved.total_score).toFixed(2)} of 20`, undefined, 'GAD PIMME Assessment', String(saved.id), {
                operating_unit: operatingUnit, year: initialYear, checklist_version: GAD_PIMME_CHECKLIST_VERSION,
                answered_count: saved.answered_count, total_score: saved.total_score,
            });
        } catch (saveError: any) { setError(saveError?.message || 'Unable to save the GAD PIMME assessment.'); }
        finally { setSaving(false); }
    };

    const handleBack = () => onBack();

    if (loading) return <LoadingState title="Loading GAD PIMME assessment" message={`Preparing ${operatingUnit} for ${initialYear}.`} />;
    const status = !assessment && score.answeredCount === 0 ? 'For Assessment' : score.status;

    return <div className="lod-assessment gad-pimme-assessment">
        <header className="detail-header">
            <button type="button" className="btn btn-ghost lod-assessment__back" onClick={handleBack}><ArrowLeft aria-hidden="true" /> Back</button>
            <div className="detail-header__main"><h2>{operatingUnit}</h2><p>Gender and Development PIMME Assessment · {initialYear}</p></div>
        </header>
        <section className="detail-metric-grid gad-pimme-metrics">
            <article className="detail-metric"><span>Status</span><strong>{status}</strong></article>
            <article className="detail-metric"><span>Overall PIMME</span><strong>{score.totalScore.toFixed(2)} / 20</strong></article>
            <article className="detail-metric"><span>Box 16</span><strong>{score.box16Score.toFixed(2)} / 8</strong></article>
            <article className="detail-metric"><span>Box 17</span><strong>{score.box17Score.toFixed(2)} / 12</strong></article>
            <article className="detail-metric"><span>Answered</span><strong>{score.answeredCount} / {GAD_PIMME_QUESTION_COUNT}</strong></article>
        </section>
        {error && <div className="notice notice--error" role="alert"><p>{error}</p></div>}
        {success && <div className="notice notice--success" role="status"><p>{success}</p></div>}
        {!canEdit && <div className="notice notice--info"><p>This assessment is read-only under your configured module permissions.</p></div>}
        <section className="lod-questionnaire gad-pimme-questionnaire">
            <header className="lod-questionnaire__header"><div><h3 className="detail-card-title">PIMME Checklist</h3></div>{canEdit && <button type="button" className="btn btn-secondary" onClick={() => setClearAllOpen(true)}>Clear All</button>}</header>
            <div className="lod-questionnaire__sections">
                {GAD_PIMME_CHECKLIST.map(box => {
                    const boxScore = box.key === 'box16' ? score.box16Score : score.box17Score;
                    const boxAnswered = box.elements.flatMap(element => element.questions).filter(question => answers[question.key].response).length;
                    const boxTotal = box.elements.flatMap(element => element.questions).length;
                    return <section className="gad-pimme-box" key={box.key}>
                        <header className="gad-pimme-box__header"><h3>{box.title}</h3><span>{boxAnswered} / {boxTotal} answered · {boxScore.toFixed(2)} / {box.maxScore}</span></header>
                        {box.elements.map(element => {
                            const answered = element.questions.filter(question => answers[question.key].response).length;
                            return <section className="lod-questionnaire__section gad-pimme-element" key={element.key}>
                                <header className="lod-questionnaire__toggle gad-pimme-element__header">
                                    <div className="lod-questionnaire__section-heading"><span className="lod-questionnaire__section-number">{element.label}</span><strong className="lod-questionnaire__section-title">{element.title}</strong></div>
                                    <div className="lod-questionnaire__section-summary"><span className={`lod-questionnaire__completion ${answered === element.questions.length ? 'is-complete' : ''}`}>{answered} / {element.questions.length} answered</span><span className="lod-questionnaire__score">{score.elementScores[element.key].toFixed(2)} / {element.maxScore}</span></div>
                                </header>
                                <div className="lod-questionnaire__question-list">
                                    {element.questions.map(question => {
                                        const local = answers[question.key];
                                        return <article className={`lod-questionnaire__question-block ${local.response ? '' : 'is-unanswered'}`} key={question.key}>
                                            <div className="lod-questionnaire__question-header"><div className="lod-questionnaire__question-heading"><strong>{question.label}</strong><p className="lod-questionnaire__question">{question.text}</p></div>{canEdit && local.response && <button type="button" className="lod-questionnaire__clear-answer" onClick={() => updateAnswer(question.key, { response: null })}>Clear</button>}</div>
                                            <div className="lod-choice-grid">
                                                {question.choices.map(choice => <label className={`lod-choice ${local.response === choice.response ? 'is-selected' : ''}`} key={choice.response}>
                                                    <input type="radio" name={question.key} value={choice.response} checked={local.response === choice.response} disabled={!canEdit} onChange={() => updateAnswer(question.key, { response: choice.response })} />
                                                    <span className="lod-choice__text">{choice.response}</span><span className="lod-choice__points">{choice.points.toFixed(2)} pts</span>
                                                </label>)}
                                            </div>
                                            <textarea className="form-control lod-questionnaire__remarks" rows={3} disabled={!canEdit} value={local.remarks} onChange={event => updateAnswer(question.key, { remarks: event.target.value })} placeholder="Add remarks (optional)..." />
                                            <EvidencePanel operatingUnit={operatingUnit} year={initialYear} questionKey={question.key} canEdit={canEdit} />
                                        </article>;
                                    })}
                                </div>
                            </section>;
                        })}
                    </section>;
                })}
            </div>
        </section>
        <section className="lod-assessment-actions"><div className="form-footer"><span>{dirty ? 'Unsaved changes' : assessment?.updated_at ? `Last saved ${new Date(assessment.updated_at).toLocaleString()}` : 'Not yet saved'}</span><div><button type="button" className="btn btn-secondary" onClick={handleBack}>Cancel</button>{canEdit && <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save assessment'}</button>}</div></div></section>
        {clearAllOpen && <ConfirmDialog title="Clear all answers?" description="Responses and remarks will be cleared locally. Existing evidence files will remain attached. Save the assessment to persist the changes." confirmLabel="Clear all" tone="danger" onCancel={() => setClearAllOpen(false)} onConfirm={() => { setAnswers(emptyAnswers()); setClearAllOpen(false); }} />}
    </div>;
};

export default GadPimmeDetails;
