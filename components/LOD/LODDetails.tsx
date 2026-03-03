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

    // Local Answers State (Map<QuestionId, ChoiceId>)
    const [localAnswers, setLocalAnswers] = useState<Record<number, number>>({});

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

            // Fetch Answers
            const { data: ansData } = await supabase
                .from('lod_answers')
                .select('*')
                .eq('assessment_id', aData.id);

            if (ansData) {
                setAnswers(ansData);
                const initialAnswers: Record<number, number> = {};
                ansData.forEach(a => {
                    initialAnswers[a.question_id] = a.choice_id;
                });
                setLocalAnswers(initialAnswers);
            }
        } else {
            // Reset for new year
            setAssessment(null);
            setAnswers([]);
            setLocalAnswers({});
            setManualLevel('');
            setRemarks('');
        }
        setLoading(false);
    };

    const handleAnswerChange = (questionId: number, choiceId: number) => {
        setLocalAnswers(prev => ({
            ...prev,
            [questionId]: choiceId
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
            remarks: remarks,
            updated_at: new Date().toISOString()
        };

        // Check if exists to determine insert or update (though upsert handles it, we need ID for answers)
        let assessmentId = assessment?.id;

        const { data: savedAssessment, error: aError } = await supabase
            .from('lod_assessments')
            .upsert(assessmentId ? { ...assessmentPayload, id: assessmentId } : assessmentPayload)
            .select()
            .single();

        if (aError || !savedAssessment) {
            alert('Error saving assessment: ' + aError?.message);
            setSaving(false);
            return;
        }

        assessmentId = savedAssessment.id;

        // 2. Upsert Answers
        const answersPayload = Object.entries(localAnswers).map(([qId, cId]) => {
            const question = questions.find(q => q.id === Number(qId));
            const choice = choices.find(c => c.id === cId);
            const points = choice ? choice.points : 0;
            const weight = question ? question.weight : 1;
            
            // Find existing answer id if any
            const existingAnswer = answers.find(a => a.question_id === Number(qId));

            return {
                id: existingAnswer?.id, // Include ID if updating
                assessment_id: assessmentId,
                question_id: Number(qId),
                choice_id: cId,
                points_earned: points * weight, // Note: This stores raw points earned, not section-weighted.
                updated_at: new Date().toISOString()
            };
        });

        if (answersPayload.length > 0) {
            const { error: ansError } = await supabase
                .from('lod_answers')
                .upsert(answersPayload);
            
            if (ansError) {
                console.error('Error saving answers:', ansError);
                alert('Assessment saved but error saving detailed answers.');
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

                            return (
                                <div key={section.id} className="p-6">
                                    <div className="flex justify-between items-center mb-4">
                                        <h4 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                            <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm">{section.order}</span>
                                            {section.title}
                                        </h4>
                                        <span className="text-xs font-medium bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-500">
                                            Weight: {section.weight}%
                                        </span>
                                    </div>
                                    
                                    <div className="space-y-6 pl-10">
                                        {sectionQuestions.map(question => {
                                            const qChoices = choices.filter(c => c.question_id === question.id);
                                            return (
                                                <div key={question.id} className="space-y-3">
                                                    <p className="font-medium text-gray-900 dark:text-gray-200">
                                                        {question.text} 
                                                        <span className="text-xs text-gray-400 font-normal ml-2">(Weight: {question.weight})</span>
                                                    </p>
                                                    <div className="space-y-2">
                                                        {qChoices.map(choice => (
                                                            <label key={choice.id} className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors
                                                                ${localAnswers[question.id] === choice.id 
                                                                    ? 'bg-emerald-50 border-emerald-500 dark:bg-emerald-900/20 dark:border-emerald-500' 
                                                                    : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700'
                                                                }
                                                            `}>
                                                                <input 
                                                                    type="radio" 
                                                                    name={`q-${question.id}`} 
                                                                    value={choice.id}
                                                                    checked={localAnswers[question.id] === choice.id}
                                                                    onChange={() => handleAnswerChange(question.id, choice.id)}
                                                                    className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300"
                                                                />
                                                                <span className="ml-3 text-sm text-gray-700 dark:text-gray-300 flex-1">{choice.text}</span>
                                                                <span className="text-xs font-bold text-gray-400 bg-gray-100 dark:bg-gray-600 px-2 py-1 rounded">{choice.points} pts</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Admin Overrides & Actions */}
                <div className="p-6 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Remarks / Notes</label>
                            <textarea 
                                value={remarks}
                                onChange={(e) => setRemarks(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white h-24"
                                placeholder="Enter any observations or notes..."
                            />
                        </div>
                        {isAdmin && (
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
