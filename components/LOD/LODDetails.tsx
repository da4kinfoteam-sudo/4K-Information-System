// Author: 4K
import React, { useState, useEffect } from 'react';
import { Eraser, RotateCcw } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { IPO, LodSection, LodQuestion, LodChoice, LodAssessment, LodAnswer, LodLevelConfig } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { useLogAction } from '../../hooks/useLogAction';
import { useUserAccess } from '../mainfunctions/TableHooks';
import { calculateLodScore, getLodEffectiveState, resolveManualLevelForSave } from '../../lib/lodScoring';
import { notifyLodDataChanged } from '../../lib/lodDataSync';
import { ConfirmDialog } from '../ui/enterprise';

interface LODDetailsProps {
    ipo: IPO;
    onBack: () => void;
    initialYear?: number | null;
}

const LODDetails: React.FC<LODDetailsProps> = ({ ipo, onBack, initialYear }) => {
    const { currentUser } = useAuth();
    const { logAction } = useLogAction();
    const { canEdit } = useUserAccess('Level of Development');
    const isLodAdmin = currentUser?.role === 'Super Admin' || currentUser?.role === 'Administrator';
    const isLocked = !canEdit;

    const [selectedYear, setSelectedYear] = useState<number>(initialYear ?? new Date().getFullYear());

    // Structure
    const [sections, setSections] = useState<LodSection[]>([]);
    const [questions, setQuestions] = useState<LodQuestion[]>([]);
    const [choices, setChoices] = useState<LodChoice[]>([]);
    const [levelConfigs, setLevelConfigs] = useState<LodLevelConfig[]>([]);

    // Data
    const [assessment, setAssessment] = useState<LodAssessment | null>(null);
    const [answers, setAnswers] = useState<LodAnswer[]>([]);

    // UI State
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [manualLevel, setManualLevel] = useState<number | ''>('');
    const [manualOverrideReason, setManualOverrideReason] = useState('');
    const [retainManualOverride, setRetainManualOverride] = useState(false);
    const [remarks, setRemarks] = useState('');
    const [isCarriedOver, setIsCarriedOver] = useState<boolean>(false);
    const [isDropped, setIsDropped] = useState<boolean>(false);
    const [expandedSections, setExpandedSections] = useState<Record<number, boolean>>({});
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
    const [saveError, setSaveError] = useState('');

    // Local Answers State (Map<QuestionId, ChoiceId>)
    const [localAnswers, setLocalAnswers] = useState<Record<number, number>>({});
    const [localAnswerRemarks, setLocalAnswerRemarks] = useState<Record<number, string>>({});
    const [localActualValues, setLocalActualValues] = useState<Record<number, number | ''>>({});
    const [localTotalValues, setLocalTotalValues] = useState<Record<number, number | ''>>({});
    const [localSpecificValues, setLocalSpecificValues] = useState<Record<number, string>>({});

    useEffect(() => {
        fetchStructure();
    }, []);

    useEffect(() => {
        if (initialYear) setSelectedYear(initialYear);
    }, [initialYear]);

    useEffect(() => {
        if (ipo) {
            fetchAssessmentData();
        }
    }, [ipo, selectedYear]);

    const fetchStructure = async () => {
        if (!supabase) return;
        const { data: sData } = await supabase.from('lod_sections').select('*').order('order');
        const { data: qData } = await supabase.from('lod_questions').select('*').order('order');
        const { data: cData } = await supabase.from('lod_choices').select('*').order('order');
        const { data: lData } = await supabase.from('lod_level_configs').select('*').order('level');

        if (sData) setSections(sData);
        if (qData) setQuestions(qData);
        if (cData) setChoices(cData);
        if (lData) setLevelConfigs(lData);
    };

    const fetchAssessmentData = async () => {
        setLoading(true);
        if (!supabase || !ipo) return;

        // Fetch Assessment
        const { data: aData, error } = await supabase
            .from('lod_assessments')
            .select('*')
            .eq('ipo_id', ipo.id)
            .eq('year', selectedYear)
            .single();

        if (aData) {
            setAssessment(aData);
            setManualLevel(aData.manual_level ?? '');
            setManualOverrideReason(aData.manual_override_reason ?? '');
            setRetainManualOverride(aData.manual_level !== null && aData.manual_level !== undefined);
            setRemarks(aData.remarks ?? '');
            setIsCarriedOver(aData.is_carried_over || false);
            setIsDropped(aData.is_dropped || false);

            // Fetch Answers
            const { data: ansData } = await supabase
                .from('lod_answers')
                .select('*')
                .eq('assessment_id', aData.id);

            if (ansData) {
                setAnswers(ansData);
                const initialAnswers: Record<number, number> = {};
                const initialRemarks: Record<number, string> = {};
                const initialActuals: Record<number, number | ''> = {};
                const initialTotals: Record<number, number | ''> = {};
                const initialSpecifics: Record<number, string> = {};
                ansData.forEach(a => {
                    const qId = Number(a.question_id);
                    const cId = a.choice_id ? Number(a.choice_id) : null;

                    if (cId !== null) initialAnswers[qId] = cId;
                    if (a.remarks) initialRemarks[qId] = a.remarks;
                    initialActuals[qId] = a.actual_value ?? '';
                    initialTotals[qId] = a.total_value ?? '';
                    initialSpecifics[qId] = a.specific_answer_value ?? '';
                });
                setLocalAnswers(initialAnswers);
                setLocalAnswerRemarks(initialRemarks);
                setLocalActualValues(initialActuals);
                setLocalTotalValues(initialTotals);
                setLocalSpecificValues(initialSpecifics);
            }
        } else {
            // Reset for new year
            setAssessment(null);
            setAnswers([]);
            setLocalAnswers({});
            setLocalAnswerRemarks({});
            setLocalActualValues({});
            setLocalTotalValues({});
            setLocalSpecificValues({});
            setManualLevel('');
            setManualOverrideReason('');
            setRetainManualOverride(false);
            setRemarks('');
            setIsCarriedOver(false);
            setIsDropped(false);

            // Check if there's any previous LOD value for this IPO to default carry_over
            const { data: prevAssessments } = await supabase
                .from('lod_assessments')
                .select('id')
                .eq('ipo_id', ipo.id)
                .limit(1);

            if (prevAssessments && prevAssessments.length > 0) {
                setIsCarriedOver(true);
            }
        }
        setLoading(false);
    };

    const handleAnswerChange = (questionId: number, choiceId: number) => {
        if (isLocked) return;
        const qId = Number(questionId);
        const cId = Number(choiceId);
        setLocalAnswers(prev => ({
            ...prev,
            [qId]: cId
        }));
        if (assessment?.manual_level) setRetainManualOverride(false);
    };

    const handleAnswerRemarkChange = (questionId: number, remark: string) => {
        if (isLocked) return;
        setLocalAnswerRemarks(prev => ({
            ...prev,
            [questionId]: remark
        }));
    };

    const calculateScore = () => calculateLodScore({
        sections,
        questions,
        choices,
        answers: Object.entries(localAnswers).map(([questionId, choiceId]) => ({
            question_id: Number(questionId),
            choice_id: Number(choiceId),
        })),
        levelConfigs,
    });

    const removeLocalValue = <T,>(values: Record<number, T>, questionId: number) => {
        const next = { ...values };
        delete next[questionId];
        return next;
    };

    const handleClearAnswer = (questionId: number) => {
        if (isLocked) return;
        setLocalAnswers(previous => removeLocalValue(previous, questionId));
        setLocalAnswerRemarks(previous => removeLocalValue(previous, questionId));
        setLocalActualValues(previous => removeLocalValue(previous, questionId));
        setLocalTotalValues(previous => removeLocalValue(previous, questionId));
        setLocalSpecificValues(previous => removeLocalValue(previous, questionId));
        if (assessment?.manual_level) setRetainManualOverride(false);
    };

    const handleClearAllAnswers = () => {
        if (isLocked) return;
        setLocalAnswers({});
        setLocalAnswerRemarks({});
        setLocalActualValues({});
        setLocalTotalValues({});
        setLocalSpecificValues({});
        if (assessment?.manual_level) setRetainManualOverride(false);
        setShowClearAllConfirm(false);
    };

    const handleSave = async () => {
        if (isLocked) return;
        if (!ipo || !supabase) return;
        setSaveError('');
        setSaving(true);

        const score = calculateScore();
        const validQuestionIds = new Set(questions.map(question => Number(question.id)));
        const validChoiceIds = new Set(choices.map(choice => Number(choice.id)));
        const answersPayload = Object.entries(localAnswers)
            .filter(([qIdStr, cId]) => {
                const qId = Number(qIdStr);
                const choiceId = Number(cId);
                return Number.isFinite(qId)
                    && Number.isFinite(choiceId)
                    && validQuestionIds.has(qId)
                    && validChoiceIds.has(choiceId);
            })
            .map(([qIdStr, cId]) => {
                const qId = Number(qIdStr);
                const choiceId = Number(cId);
                const remark = localAnswerRemarks[qId] || null;
                const actual = localActualValues[qId];
                const total = localTotalValues[qId];
                const safeNum = (val: number | '' | undefined) => {
                    if (val === '' || val === undefined || val === null) return null;
                    const n = Number(val);
                    return Number.isFinite(n) ? n : null;
                };

                return {
                    question_id: qId,
                    choice_id: choiceId,
                    remarks: remark,
                    actual_value: safeNum(actual),
                    total_value: safeNum(total),
                    specific_answer_value: localSpecificValues[qId] || null,
                };
            });

        const existingManualLevel = assessment?.manual_level ?? null;
        const manualLevelToSave = resolveManualLevelForSave({
            canManageOverride: isLodAdmin,
            retainManualOverride,
            enteredManualLevel: manualLevel === '' ? null : Number(manualLevel),
            existingManualLevel,
            existingAssessmentComplete: Boolean(assessment?.is_complete),
            nextAssessmentComplete: score.isComplete,
        });
        const manualReasonToSave = manualLevelToSave !== null
            ? (manualOverrideReason || assessment?.manual_override_reason || '')
            : null;

        if (manualLevelToSave !== null && !manualReasonToSave?.trim()) {
            setSaveError('Enter a reason before retaining or applying a manual level override.');
            setSaving(false);
            return;
        }

        const { data: savedAssessment, error } = await supabase.rpc('save_lod_assessment', {
            p_ipo_id: ipo.id,
            p_year: selectedYear,
            p_answers: answersPayload,
            p_manual_level: manualLevelToSave,
            p_manual_override_reason: manualReasonToSave,
            p_is_carried_over: isLodAdmin ? isCarriedOver : (assessment?.is_carried_over ?? false),
            p_is_dropped: isLodAdmin ? isDropped : (assessment?.is_dropped ?? false),
            p_remarks: remarks || null,
            p_assessed_by: currentUser?.id ?? null,
            p_assessor_name: currentUser?.fullName || currentUser?.email || null,
        });

        if (error || !savedAssessment) {
            setSaveError(error?.message || 'The assessment could not be saved.');
            setSaving(false);
            return;
        }

        const saved = savedAssessment as LodAssessment;
        setAssessment(saved);
        logAction(
            'Updated LOD Assessment',
            `IPO: ${ipo.name}, Year: ${selectedYear}, State: ${getLodEffectiveState(saved).label}`
        );
        notifyLodDataChanged({
            ipoId: ipo.id,
            year: selectedYear,
            reason: isDropped ? 'drop' : manualLevelToSave !== null ? 'override' : answersPayload.length === 0 ? 'clear' : 'save',
        });
        await fetchAssessmentData();
        setSaving(false);
        setShowSuccessModal(true);
    };

    if (!ipo) return <div>Loading IPO...</div>;

    const score = calculateScore();
    const previewManualLevel = score.isComplete && !retainManualOverride
        ? null
        : manualLevel === '' ? null : Number(manualLevel);
    const effectiveState = getLodEffectiveState({
        manual_level: previewManualLevel,
        computed_level: score.computedLevel,
        is_complete: score.isComplete,
        is_dropped: isDropped,
    });

    const toggleSection = (sectionId: number) => {
        setExpandedSections(prev => ({
            ...prev,
            [sectionId]: !prev[sectionId]
        }));
    };

    const calculateSectionScore = (sectionId: number) => {
        return score.sectionScores.find(section => section.sectionId === sectionId)?.weightedScore ?? 0;
    };

    return (
        <div className="lod-assessment detail-page">
            {/* Header */}
            <div className="detail-header">
                <div className="detail-heading">
                    <button onClick={onBack} className="btn btn-link">← Back to List</button>
                    <h2 className="detail-title">{ipo.name}</h2>
                    <p className="detail-meta">{ipo.location}</p>
                </div>
                <div className="form-check-group">
                    <label className="form-label form-label--inline">Assessment Year:</label>
                    <select
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(Number(e.target.value))}
                        className="form-control lod-assessment__year"
                    >
                        {Array.from(new Set([selectedYear, ...Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i + 1)]))
                            .sort((a, b) => b - a)
                            .map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Score Card */}
            <div className="detail-metric-grid">
                <div className="detail-metric lod-assessment-metric lod-assessment-metric--primary">
                    <h4 className="detail-metric-label">Effective LOD</h4>
                    <div className="lod-assessment-metric__value">
                        <span>{effectiveState.label}</span>
                    </div>
                    <p className="form-help">
                        Computed: {score.computedLevel ? `Level ${score.computedLevel}` : 'Not published'}
                        {manualLevel !== '' ? ` · Manual: Level ${manualLevel}` : ''}
                    </p>
                </div>
                <div className="detail-metric lod-assessment-metric lod-assessment-metric--info">
                    <h4 className="detail-metric-label">{score.isComplete ? 'Total Score' : 'Score Preview'}</h4>
                    <div className="lod-assessment-metric__value">
                        <span>{score.totalScore.toFixed(1)}</span>
                        <small>/ {score.maxPossibleScore.toFixed(1)}</small>
                    </div>
                    {!score.isComplete && <p className="form-help">Incomplete scores are not published.</p>}
                </div>
                <div className="detail-metric lod-assessment-metric lod-assessment-metric--status">
                    <h4 className="detail-metric-label">Answer Coverage</h4>
                    <div className="lod-assessment-metric__value">
                        <span>{score.answeredQuestionCount}</span>
                        <small>/ {score.requiredQuestionCount}</small>
                    </div>
                    <div className="mt-2 space-y-1">
                        <p className="detail-meta">{score.coveragePercent.toFixed(0)}% answered</p>
                        {assessment?.updated_at && <span className="detail-meta">Updated {new Date(assessment.updated_at).toLocaleDateString()}</span>}
                        {assessment?.assessor_name && (
                            <p className="lod-assessment-metric__assessor">
                                <span className="detail-label">Assessed By:</span>
                                {assessment.assessor_name}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Questionnaire */}
            <div className="detail-card lod-questionnaire">
                <div className="lod-questionnaire__header">
                    <div>
                        <h3 className="detail-card-title">Assessment Questionnaire</h3>
                        <p className="detail-meta">Complete all scored questions to publish the computed LOD.</p>
                    </div>
                    {!isLocked && Object.keys(localAnswers).length > 0 && (
                        <button type="button" className="btn btn-secondary" onClick={() => setShowClearAllConfirm(true)}>
                            <RotateCcw aria-hidden="true" />
                            Clear all answers
                        </button>
                    )}
                </div>

                {loading ? (
                    <div className="detail-empty">Loading assessment data...</div>
                ) : (
                    <div className="lod-questionnaire__sections">
                        {sections.map(section => {
                            const sectionQuestions = questions.filter(q => q.section_id === section.id);
                            if (sectionQuestions.length === 0) return null;

                            const isExpanded = !!expandedSections[section.id];
                            const sectionScore = calculateSectionScore(section.id);

                            return (
                                <div key={section.id} className="lod-questionnaire__section">
                                    <button
                                        onClick={() => toggleSection(section.id)}
                                        className="lod-questionnaire__toggle"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="lod-questionnaire__section-number">
                                                {section.order}
                                            </div>
                                            <h4 className="lod-questionnaire__section-title">{section.title}</h4>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="lod-questionnaire__score">
                                                Section Score: <strong>{sectionScore.toFixed(2)}</strong>
                                                <span className="lod-questionnaire__weight-total">/ {section.weight}</span>
                                            </div>
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                className={`lod-questionnaire__chevron ${isExpanded ? 'is-open' : ''}`}
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </button>

                                    {isExpanded && (
                                        <div className="p-6 pt-2 space-y-6">
                                            {sectionQuestions.map(question => {
                                                const qChoices = choices.filter(c => c.question_id === question.id);
                                                const hasQuestionData = localAnswers[question.id] !== undefined
                                                    || Boolean(localAnswerRemarks[question.id])
                                                    || localActualValues[question.id] !== undefined
                                                    || localTotalValues[question.id] !== undefined
                                                    || Boolean(localSpecificValues[question.id]);
                                                return (
                                                    <div key={question.id} className="lod-questionnaire__question-block">
                                                        <div className="flex gap-3 mb-2">
                                                            <div className="flex-1">
                                                                <p className="lod-questionnaire__question">
                                                                    {question.text}
                                                                    <span className="lod-questionnaire__weight">(Weight: {question.weight})</span>
                                                                </p>
                                                                {question.description && (
                                                                    <p className="lod-questionnaire__description">
                                                                        {question.description}
                                                                    </p>
                                                                )}

                                                                {/* Calculation Fields */}
                                                                {question.is_calculation_mode && (
                                                                    <div className="lod-questionnaire__calculation">
                                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                                            <div>
                                                                                <label className="form-label form-label--compact">{question.actual_label || 'Actual Value'}</label>
                                                                                <input
                                                                                    type="number"
                                                                                    value={localActualValues[question.id] ?? ''}
                                                                                    onChange={(e) => setLocalActualValues(prev => ({ ...prev, [question.id]: e.target.value === '' ? '' : Number(e.target.value) }))}
                                                                                    className="form-control form-control--compact"
                                                                                    placeholder="Enter actual number"
                                                                                    disabled={isLocked}
                                                                                />
                                                                            </div>
                                                                            <div>
                                                                                <label className="form-label form-label--compact">{question.total_label || 'Total Value'}</label>
                                                                                <input
                                                                                    type="number"
                                                                                    value={localTotalValues[question.id] ?? ''}
                                                                                    onChange={(e) => setLocalTotalValues(prev => ({ ...prev, [question.id]: e.target.value === '' ? '' : Number(e.target.value) }))}
                                                                                    className="form-control form-control--compact"
                                                                                    placeholder="Enter total number"
                                                                                    disabled={isLocked}
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                        {Number(localActualValues[question.id]) >= 0 && Number(localTotalValues[question.id]) > 0 && (
                                                                            <div className="lod-questionnaire__result">
                                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                                                </svg>
                                                                                Computed Result: {((Number(localActualValues[question.id]) / Number(localTotalValues[question.id])) * 100).toFixed(2)}%
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}

                                                                {/* Specific Answer Field */}
                                                                {question.is_specific_answer_mode && (
                                                                    <div className="lod-questionnaire__calculation lod-questionnaire__calculation--specific">
                                                                        <label className="form-label form-label--compact">{question.specific_answer_label || 'Specific Answer'}</label>
                                                                        <input
                                                                            type="text"
                                                                            value={localSpecificValues[question.id] || ''}
                                                                            onChange={(e) => {
                                                                                if (isLocked) return;
                                                                                setLocalSpecificValues(prev => ({ ...prev, [question.id]: e.target.value }));
                                                                            }}
                                                                            className="form-control form-control--compact"
                                                                            placeholder="Enter specific answer"
                                                                            disabled={isLocked}
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {!isLocked && hasQuestionData && (
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-link lod-questionnaire__clear-answer"
                                                                    onClick={() => handleClearAnswer(question.id)}
                                                                    aria-label={`Clear answer for ${question.text}`}
                                                                >
                                                                    <Eraser aria-hidden="true" />
                                                                    Clear answer
                                                                </button>
                                                            )}
                                                        </div>

                                                        <div className="lod-choice-grid">
                                                            {qChoices.map(choice => (
                                                                <label key={choice.id} className={`lod-choice ${Number(localAnswers[question.id]) === Number(choice.id) ? 'is-selected' : ''}`}>
                                                                    <input
                                                                        type="radio"
                                                                        name={`q-${question.id}`}
                                                                        value={choice.id}
                                                                        checked={Number(localAnswers[question.id]) === Number(choice.id)}
                                                                        onChange={() => handleAnswerChange(question.id, choice.id)}
                                                                        className="form-checkbox"
                                                                        disabled={isLocked}
                                                                    />
                                                                    <span className="lod-choice__text">{choice.text}</span>
                                                                    <span className="status-badge status-badge--neutral status-badge--compact">{Number(choice.points.toFixed(1))} pts</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                        <div className="ml-8">
                                                            <textarea
                                                                value={localAnswerRemarks[question.id] || ''}
                                                                onChange={(e) => handleAnswerRemarkChange(question.id, e.target.value)}
                                                                className="form-control lod-questionnaire__remarks"
                                                                placeholder="Add remarks (optional)..."
                                                                disabled={isLocked}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Admin Overrides & Actions */}
                {isLocked && (
                    <div className="notice notice--warning">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                        <p>
                            You have view-only access to this assessment. Request Level of Development edit permission to modify LOD records.
                        </p>
                    </div>
                )}
                <div className="form-section lod-questionnaire__footer">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div>
                            <label className="form-label">Overall Remarks / Notes</label>
                            <textarea
                                value={remarks}
                                onChange={(e) => setRemarks(e.target.value)}
                                className="form-control lod-questionnaire__overall-remarks"
                                placeholder="Enter any observations or notes..."
                                disabled={isLocked}
                            />
                        </div>
                        {isLodAdmin && (
                            <div className="space-y-4">
                                <div>
                                    <label className="form-label">Manual Level Override (Admin Only)</label>
                                    <div className="lod-manual-override-grid">
                                        <input
                                            type="number"
                                            min="1" max="5"
                                            value={manualLevel}
                                            onChange={(e) => {
                                                const value = e.target.value === '' ? '' : Number(e.target.value);
                                                setManualLevel(value);
                                                setRetainManualOverride(value !== '');
                                            }}
                                            className="form-control lod-assessment__manual-level"
                                            placeholder="Auto"
                                        />
                                        <input
                                            type="text"
                                            value={manualOverrideReason}
                                            onChange={(event) => setManualOverrideReason(event.target.value)}
                                            className="form-control"
                                            placeholder="Required reason for manual override"
                                            disabled={manualLevel === '' || !retainManualOverride}
                                        />
                                    </div>
                                    {manualLevel !== '' && (
                                        <label className="form-check lod-manual-override-retain">
                                            <input
                                                type="checkbox"
                                                checked={retainManualOverride}
                                                onChange={(event) => setRetainManualOverride(event.target.checked)}
                                                className="form-checkbox"
                                            />
                                            <span>Publish the manual level instead of the completed computed assessment</span>
                                        </label>
                                    )}
                                    <span className="form-help">
                                        A completed questionnaire uses its computed level unless this override is explicitly retained.
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-4">
                                    <label className="form-check">
                                        <input
                                            type="checkbox"
                                            checked={isCarriedOver}
                                            onChange={(e) => setIsCarriedOver(e.target.checked)}
                                            className="form-checkbox"
                                        />
                                        <span>Carried over from previous year</span>
                                    </label>
                                    <label className="form-check">
                                        <input
                                            type="checkbox"
                                            checked={isDropped}
                                            onChange={(e) => setIsDropped(e.target.checked)}
                                            className="form-checkbox"
                                        />
                                        <span>IPO is Dropped</span>
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>

                    {saveError && (
                        <div className="notice notice--error" role="alert">
                            <p>{saveError}</p>
                        </div>
                    )}
                    <div className="form-footer">
                        <button
                            onClick={onBack}
                            className="btn btn-secondary"
                        >
                            Cancel
                        </button>
                        {!isLocked && (
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="btn btn-primary"
                            >
                                {saving ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Saving...
                                    </>
                                ) : 'Save Assessment'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {showClearAllConfirm && (
                <ConfirmDialog
                    title="Clear all LOD answers?"
                    description="All selected answers and their remarks, calculation values, and specific-answer values will be removed when you save the assessment."
                    confirmLabel="Clear all answers"
                    onConfirm={handleClearAllAnswers}
                    onCancel={() => setShowClearAllConfirm(false)}
                />
            )}

            {/* Success Modal */}
            {showSuccessModal && (
                <div className="modal-backdrop" role="presentation">
                    <section className="modal-card lod-success-modal animate-in fade-in zoom-in duration-300" role="dialog" aria-modal="true" aria-labelledby="lod-success-title">
                        <div className="lod-success-modal__icon">
                            <svg xmlns="http://www.w3.org/2000/svg" className="lod-success-modal__check" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h3 id="lod-success-title">Success!</h3>
                        <p>The LOD assessment for {ipo.name} has been saved successfully.</p>
                        <button
                            onClick={() => setShowSuccessModal(false)}
                            className="btn btn-primary btn-block"
                        >
                            Great, thanks!
                        </button>
                    </section>
                </div>
            )}
        </div>
    );
};

export default LODDetails;
