// Author: 4K
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { IPO, LodSection, LodQuestion, LodChoice, LodAssessment, LodAnswer, LodLevelConfig } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { useLogAction } from '../../hooks/useLogAction';

interface LODDetailsProps {
    ipo: IPO;
    onBack: () => void;
}

const LODDetails: React.FC<LODDetailsProps> = ({ ipo, onBack }) => {
    const { currentUser } = useAuth();
    const { logAction } = useLogAction();

    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    
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
    const [remarks, setRemarks] = useState('');
    const [isCarriedOver, setIsCarriedOver] = useState<boolean>(false);
    const [isDropped, setIsDropped] = useState<boolean>(false);
    const [expandedSections, setExpandedSections] = useState<Record<number, boolean>>({});

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
        const qId = Number(questionId);
        const cId = Number(choiceId);
        console.log(`Answer changed: Q:${qId} -> C:${cId}`);
        setLocalAnswers(prev => ({
            ...prev,
            [qId]: cId
        }));
    };

    const handleAnswerRemarkChange = (questionId: number, remark: string) => {
        setLocalAnswerRemarks(prev => ({
            ...prev,
            [questionId]: remark
        }));
    };

    const calculateScore = () => {
        let totalWeightedScore = 0;
        let totalMaxWeightedScore = 0;

        // Calculate per section
        sections.forEach(section => {
            const sectionQuestions = questions.filter(q => q.section_id === section.id);
            if (sectionQuestions.length === 0) return;

            let sectionScore = 0;
            let sectionMaxScore = 0;

            sectionQuestions.forEach(q => {
                const qChoices = choices.filter(c => c.question_id === q.id);
                if (qChoices.length === 0) return;

                // Max points for this question
                const maxPoints = Math.max(...qChoices.map(c => c.points));
                sectionMaxScore += (maxPoints * q.weight);

                // Selected points
                const selectedChoiceId = localAnswers[q.id];
                if (selectedChoiceId) {
                    const selectedChoice = qChoices.find(c => c.id === selectedChoiceId);
                    if (selectedChoice) {
                        sectionScore += (selectedChoice.points * q.weight);
                    }
                }
            });

            // Apply Section Weight
            // If section weight is 0 or undefined, treat as raw sum? Or skip?
            // Let's assume section.weight is a percentage (e.g., 40 for 40%) or raw weight.
            // If all section weights sum to 100, we can treat them as percentages.
            // Formula: (SectionScore / SectionMaxScore) * SectionWeight
            
            if (sectionMaxScore > 0) {
                const sectionPercentage = sectionScore / sectionMaxScore;
                totalWeightedScore += (sectionPercentage * section.weight);
                totalMaxWeightedScore += section.weight; 
            }
        });

        // If no weights defined or total max weight is 0, fallback to raw sum?
        // Or if totalMaxWeightedScore is e.g. 100, then totalWeightedScore is the final score (0-100).
        // If totalMaxWeightedScore is e.g. 1 (0.4 + 0.6), then totalWeightedScore is 0-1.
        // Let's normalize to 0-100 scale for level comparison.
        
        let finalScore = 0;
        if (totalMaxWeightedScore > 0) {
            // Normalize to 100 if weights are like 40, 60 (sum=100) -> score is already 0-100
            // If weights are 0.4, 0.6 (sum=1) -> score is 0-1 -> multiply by 100?
            // Actually, let's just use the sum of weights as the denominator if we want a percentage.
            // But the user sets "ranges" like 30-40. This implies the final score is an absolute number.
            // If the user sets weights as 40 and 60, the max score is 100.
            // If the user sets weights as 10 and 10, max score is 20.
            // So finalScore = totalWeightedScore.
            finalScore = totalWeightedScore;
        } else {
            // Fallback to raw sum if no section weights?
            // Or just 0.
            // Let's assume user sets weights correctly.
            finalScore = totalWeightedScore;
        }

        // Compute Level based on Configs
        let level = 1;
        // Find matching range
        // If score is 35, and Level 2 is 30-40.
        const matchedConfig = levelConfigs.find(c => finalScore >= c.min_score && finalScore <= c.max_score);
        if (matchedConfig) {
            level = matchedConfig.level;
        } else {
            // Fallback logic if gaps?
            // If score > max of Level 5, level 5.
            // If score < min of Level 1, level 1.
            if (levelConfigs.length > 0) {
                const maxLevel = levelConfigs[levelConfigs.length - 1];
                if (finalScore > maxLevel.max_score) level = maxLevel.level;
                else level = 1; // Default
            }
        }

        return { totalScore: finalScore, level, maxPossibleScore: totalMaxWeightedScore };
    };

    const handleSave = async () => {
        if (!ipo || !supabase) return;
        setSaving(true);

        const { totalScore, level } = calculateScore();

        // 1. Upsert Assessment
        const assessmentPayload = {
            ipo_id: ipo.id,
            year: selectedYear,
            total_score: totalScore,
            computed_level: level,
            manual_level: manualLevel === '' ? null : Number(manualLevel),
            is_carried_over: isCarriedOver,
            is_dropped: isDropped,
            remarks: remarks,
            updated_at: new Date().toISOString()
        };

        // Check if exists to determine insert or update (though upsert handles it, we need ID for answers)
        let assessmentId = assessment?.id;

        const { data: savedAssessment, error: aError } = await supabase
            .from('lod_assessments')
            .upsert(assessmentPayload, { onConflict: 'ipo_id, year' })
            .select()
            .single();

        if (aError || !savedAssessment) {
            alert('Error saving assessment: ' + aError?.message);
            setSaving(false);
            return;
        }

        setAssessment(savedAssessment);
        assessmentId = savedAssessment.id;

        // 2. Upsert Answers
        const validQuestionIds = new Set(questions.map(q => q.id));
        const validChoiceIds = new Set(choices.map(c => c.id));

        const answersPayload = Object.entries(localAnswers)
            .filter(([qIdStr, cId]) => {
                const qId = Number(qIdStr);
                const choiceId = Number(cId);
                // Ensure both are valid numbers and the question exists
                return !isNaN(qId) && !isNaN(choiceId) && validQuestionIds.has(qId);
            })
            .map(([qIdStr, cId]) => {
                const qId = Number(qIdStr);
                const choiceId = Number(cId);
                const question = questions.find(q => q.id === qId);
                const choice = choices.find(c => c.id === choiceId);
                
                const points = choice ? (Number(choice.points) || 0) : 0;
                const weight = question ? (Number(question.weight) || 1) : 1;
                const remark = localAnswerRemarks[qId] || null;
                
                const actual = localActualValues[qId];
                const total = localTotalValues[qId];

                const safeNum = (val: any) => {
                    if (val === '' || val === undefined || val === null) return null;
                    const n = Number(val);
                    return isNaN(n) ? null : n;
                };

                const pointsEarned = Number((points * weight).toFixed(4));

                return {
                    assessment_id: assessmentId,
                    question_id: qId,
                    choice_id: choiceId,
                    points_earned: isNaN(pointsEarned) ? 0 : pointsEarned,
                    remarks: remark,
                    actual_value: safeNum(actual),
                    total_value: safeNum(total),
                    specific_answer_value: localSpecificValues[qId] || null,
                    updated_at: new Date().toISOString()
                };
            });

        console.log('Saving LOD Answers Payload:', answersPayload);

        if (answersPayload.length > 0) {
            const { error: ansError } = await supabase
                .from('lod_answers')
                .upsert(answersPayload, { onConflict: 'assessment_id,question_id' });
            
            if (ansError) {
                console.error('Error saving answers:', ansError);
                alert(`Assessment saved but error saving detailed answers: ${ansError.message || JSON.stringify(ansError)}`);
            }
        }

        logAction('Updated LOD Assessment', `IPO: ${ipo.name}, Year: ${selectedYear}, Level: ${manualLevel || level}`);
        
        // Refresh
        await fetchAssessmentData();
        setSaving(false);
        alert('Assessment saved successfully!');
    };

    if (!ipo) return <div>Loading IPO...</div>;

    const { totalScore, level, maxPossibleScore } = calculateScore();
    const currentLevel = manualLevel !== '' ? manualLevel : level;
    const isAdmin = currentUser?.role === 'Administrator';

    const toggleSection = (sectionId: number) => {
        setExpandedSections(prev => ({
            ...prev,
            [sectionId]: !prev[sectionId]
        }));
    };

    const calculateSectionScore = (sectionId: number) => {
        const sectionQuestions = questions.filter(q => q.section_id === sectionId);
        let score = 0;
        let maxScore = 0;

        sectionQuestions.forEach(q => {
            const qChoices = choices.filter(c => c.question_id === q.id);
            if (qChoices.length === 0) return;

            const maxPoints = Math.max(...qChoices.map(c => c.points));
            maxScore += (maxPoints * q.weight);

            const selectedChoiceId = localAnswers[q.id];
            if (selectedChoiceId) {
                const selectedChoice = qChoices.find(c => c.id === selectedChoiceId);
                if (selectedChoice) {
                    score += (selectedChoice.points * q.weight);
                }
            }
        });

        const sectionData = sections.find(s => s.id === sectionId);
        if (sectionData && maxScore > 0) {
            return (score / maxScore) * sectionData.weight;
        }
        return 0;
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700 mb-2">← Back to List</button>
                    <h2 className="text-3xl font-bold text-gray-800 dark:text-white">{ipo.name}</h2>
                    <p className="text-gray-500">{ipo.location}</p>
                </div>
                <div className="flex items-center gap-2">
                    <label className="font-medium text-gray-700 dark:text-gray-300">Assessment Year:</label>
                    <select 
                        value={selectedYear} 
                        onChange={(e) => setSelectedYear(Number(e.target.value))}
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white font-bold"
                    >
                        {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i + 1).map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Score Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border-l-4 border-emerald-500">
                    <h4 className="text-sm font-bold text-gray-500 uppercase">Level of Development</h4>
                    <div className="flex items-end gap-2 mt-2">
                        <span className="text-5xl font-bold text-emerald-600 dark:text-emerald-400">{currentLevel}</span>
                        <span className="text-sm text-gray-400 mb-2">/ 5</span>
                    </div>
                    {manualLevel !== '' && <p className="text-xs text-orange-500 mt-1 font-medium">(Manually Overridden)</p>}
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border-l-4 border-blue-500">
                    <h4 className="text-sm font-bold text-gray-500 uppercase">Total Score</h4>
                    <div className="flex items-end gap-2 mt-2">
                        <span className="text-4xl font-bold text-blue-600 dark:text-blue-400">{totalScore.toFixed(1)}</span>
                        <span className="text-sm text-gray-400 mb-2">/ {maxPossibleScore.toFixed(1)}</span>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md border-l-4 border-purple-500">
                    <h4 className="text-sm font-bold text-gray-500 uppercase">Status</h4>
                    <div className="mt-2">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${assessment ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                            {assessment ? `Assessed on ${new Date(assessment.updated_at!).toLocaleDateString()}` : 'Not Assessed'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Questionnaire */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
                <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white">Assessment Questionnaire</h3>
                    <p className="text-sm text-gray-500">Complete the following sections to determine the LOD.</p>
                </div>

                {loading ? (
                    <div className="p-12 text-center text-gray-500">Loading assessment data...</div>
                ) : (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                        {sections.map(section => {
                            const sectionQuestions = questions.filter(q => q.section_id === section.id);
                            if (sectionQuestions.length === 0) return null;

                            const isExpanded = expandedSections[section.id] !== false; // Default to expanded
                            const sectionScore = calculateSectionScore(section.id);

                            return (
                                <div key={section.id} className="overflow-hidden">
                                    <button 
                                        onClick={() => toggleSection(section.id)}
                                        className="w-full px-6 py-4 flex items-center justify-between bg-gray-50/30 dark:bg-gray-900/20 hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-bold text-sm">
                                                {section.order}
                                            </div>
                                            <h4 className="text-lg font-bold text-gray-800 dark:text-white">{section.title}</h4>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
                                                Section Score: <span className="text-emerald-600 dark:text-emerald-400 font-bold">{sectionScore.toFixed(2)}</span>
                                                <span className="text-gray-400 ml-1">/ {section.weight}</span>
                                            </div>
                                            <svg 
                                                xmlns="http://www.w3.org/2000/svg" 
                                                className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} 
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
                                                return (
                                                    <div key={question.id} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0 pb-4 last:pb-0">
                                                        <div className="flex gap-3 mb-2">
                                                            <div className="flex-1">
                                                                <p className="text-gray-900 dark:text-white font-medium leading-tight">
                                                                    {question.text} 
                                                                    <span className="text-xs text-gray-400 font-normal ml-2">(Weight: {question.weight})</span>
                                                                </p>
                                                                {question.description && (
                                                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 whitespace-pre-wrap leading-relaxed italic">
                                                                        {question.description}
                                                                    </p>
                                                                )}

                                                                {/* Calculation Fields */}
                                                                {question.is_calculation_mode && (
                                                                    <div className="mt-3 bg-blue-50/50 dark:bg-blue-900/10 p-3 rounded-lg border border-blue-100 dark:border-blue-900/30">
                                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                                            <div>
                                                                                <label className="block text-xs font-bold text-blue-700 dark:text-blue-400 uppercase mb-1">{question.actual_label || 'Actual Value'}</label>
                                                                                <input 
                                                                                    type="number"
                                                                                    value={localActualValues[question.id] ?? ''}
                                                                                    onChange={(e) => setLocalActualValues(prev => ({ ...prev, [question.id]: e.target.value === '' ? '' : Number(e.target.value) }))}
                                                                                    className="w-full px-3 py-1.5 text-sm border border-blue-200 dark:border-blue-800 rounded bg-white dark:bg-gray-800 focus:ring-1 focus:ring-blue-500 outline-none"
                                                                                    placeholder="Enter actual number"
                                                                                />
                                                                            </div>
                                                                            <div>
                                                                                <label className="block text-xs font-bold text-blue-700 dark:text-blue-400 uppercase mb-1">{question.total_label || 'Total Value'}</label>
                                                                                <input 
                                                                                    type="number"
                                                                                    value={localTotalValues[question.id] ?? ''}
                                                                                    onChange={(e) => setLocalTotalValues(prev => ({ ...prev, [question.id]: e.target.value === '' ? '' : Number(e.target.value) }))}
                                                                                    className="w-full px-3 py-1.5 text-sm border border-blue-200 dark:border-blue-800 rounded bg-white dark:bg-gray-800 focus:ring-1 focus:ring-blue-500 outline-none"
                                                                                    placeholder="Enter total number"
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                        {Number(localActualValues[question.id]) >= 0 && Number(localTotalValues[question.id]) > 0 && (
                                                                            <div className="mt-2 text-sm font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2">
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
                                                                    <div className="mt-3 bg-purple-50/50 dark:bg-purple-900/10 p-3 rounded-lg border border-purple-100 dark:border-purple-900/30">
                                                                        <label className="block text-xs font-bold text-purple-700 dark:text-purple-400 uppercase mb-1">{question.specific_answer_label || 'Specific Answer'}</label>
                                                                        <input 
                                                                            type="text"
                                                                            value={localSpecificValues[question.id] || ''}
                                                                            onChange={(e) => setLocalSpecificValues(prev => ({ ...prev, [question.id]: e.target.value }))}
                                                                            className="w-full px-3 py-1.5 text-sm border border-purple-200 dark:border-purple-800 rounded bg-white dark:bg-gray-800 focus:ring-1 focus:ring-purple-500 outline-none"
                                                                            placeholder="Enter specific answer"
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="ml-8 grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                                                            {qChoices.map(choice => (
                                                                <label key={choice.id} className={`flex items-center p-2 rounded-lg border cursor-pointer transition-colors
                                                                    ${Number(localAnswers[question.id]) === Number(choice.id) 
                                                                        ? 'bg-emerald-50 border-emerald-500 dark:bg-emerald-900/20 dark:border-emerald-500' 
                                                                        : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700'
                                                                    }
                                                                `}>
                                                                    <input 
                                                                        type="radio" 
                                                                        name={`q-${question.id}`} 
                                                                        value={choice.id}
                                                                        checked={Number(localAnswers[question.id]) === Number(choice.id)}
                                                                        onChange={() => handleAnswerChange(question.id, choice.id)}
                                                                        className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300"
                                                                    />
                                                                    <span className="ml-3 text-sm text-gray-700 dark:text-gray-300 flex-1">{choice.text}</span>
                                                                    <span className="text-[10px] font-bold text-gray-400 bg-gray-100 dark:bg-gray-600 px-1.5 py-0.5 rounded">{Number(choice.points.toFixed(1))} pts</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                        <div className="ml-8">
                                                            <textarea 
                                                                value={localAnswerRemarks[question.id] || ''}
                                                                onChange={(e) => handleAnswerRemarkChange(question.id, e.target.value)}
                                                                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-transparent focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 dark:text-gray-300 resize-none h-12"
                                                                placeholder="Add remarks (optional)..."
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
                <div className="p-6 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Overall Remarks / Notes</label>
                            <textarea 
                                value={remarks}
                                onChange={(e) => setRemarks(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white h-24"
                                placeholder="Enter any observations or notes..."
                            />
                        </div>
                        {isAdmin && (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Manual Level Override (Admin Only)</label>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="number" 
                                            min="1" max="5"
                                            value={manualLevel}
                                            onChange={(e) => setManualLevel(e.target.value === '' ? '' : Number(e.target.value))}
                                            className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                                            placeholder="Auto"
                                        />
                                        <span className="text-xs text-gray-500">Leave empty to use computed level.</span>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <input 
                                            type="checkbox" 
                                            checked={isCarriedOver} 
                                            onChange={(e) => setIsCarriedOver(e.target.checked)}
                                            className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                                        />
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Carried over from previous year</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <input 
                                            type="checkbox" 
                                            checked={isDropped} 
                                            onChange={(e) => setIsDropped(e.target.checked)}
                                            className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                                        />
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">IPO is Dropped</span>
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-4">
                        <button 
                            onClick={onBack}
                            className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleSave}
                            disabled={saving}
                            className="px-6 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {saving ? 'Saving...' : 'Save Assessment'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LODDetails;
