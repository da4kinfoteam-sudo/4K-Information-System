// Author: 4K
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { LodSection, LodQuestion, LodChoice, LodLevelConfig } from '../../constants';
import { useLogAction } from '../../hooks/useLogAction';

const LODManagementTab: React.FC = () => {
    const { logAction } = useLogAction();
    const [sections, setSections] = useState<LodSection[]>([]);
    const [questions, setQuestions] = useState<LodQuestion[]>([]);
    const [choices, setChoices] = useState<LodChoice[]>([]);
    const [levelConfigs, setLevelConfigs] = useState<LodLevelConfig[]>([]);
    const [loading, setLoading] = useState(true);

    // --- LOD Score Computation State ---
    const [editingLevels, setEditingLevels] = useState<LodLevelConfig[]>([]);
    const [isEditingLevels, setIsEditingLevels] = useState(false);

    // --- Questionnaire Management State ---
    // We will use local state for edits and only save on "Save Changes"
    // However, for structure (Add/Delete), we might need to be careful.
    // Given the complexity of nested updates, we'll keep Add/Delete immediate but allow batch updates for values.
    const [editingSections, setEditingSections] = useState<LodSection[]>([]);
    const [editingQuestions, setEditingQuestions] = useState<LodQuestion[]>([]);
    const [editingChoices, setEditingChoices] = useState<LodChoice[]>([]);
    const [isEditingQuestionnaire, setIsEditingQuestionnaire] = useState(false);

    // New Item States
    const [newSectionTitle, setNewSectionTitle] = useState('');
    const [newSectionWeight, setNewSectionWeight] = useState(0);

    // UI State
    const [expandedSectionId, setExpandedSectionId] = useState<number | null>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        if (!supabase) return;

        const { data: sData } = await supabase.from('lod_sections').select('*').order('order', { ascending: true });
        const { data: qData } = await supabase.from('lod_questions').select('*').order('order', { ascending: true });
        const { data: cData } = await supabase.from('lod_choices').select('*').order('order', { ascending: true });
        const { data: lData } = await supabase.from('lod_level_configs').select('*').order('level', { ascending: true });

        if (sData) {
            setSections(sData);
            setEditingSections(sData);
        }
        if (qData) {
            setQuestions(qData);
            setEditingQuestions(qData);
        }
        if (cData) {
            setChoices(cData);
            setEditingChoices(cData);
        }
        if (lData) {
            setLevelConfigs(lData);
            setEditingLevels(lData);
        }
        setLoading(false);
    };

    // --- LEVEL CONFIGURATION HANDLERS ---

    const handleLevelChange = (index: number, field: 'min_score' | 'max_score', value: number) => {
        const newLevels = [...editingLevels];
        newLevels[index] = { ...newLevels[index], [field]: value };
        setEditingLevels(newLevels);
    };

    const handleSaveLevels = async () => {
        if (!supabase) return;
        
        // Validate ranges overlap? For now, trust admin.
        // Upsert all
        const { error } = await supabase.from('lod_level_configs').upsert(editingLevels);
        
        if (error) {
            alert('Error saving levels: ' + error.message);
        } else {
            setLevelConfigs(editingLevels);
            setIsEditingLevels(false);
            logAction('Updated LOD Level Ranges', '');
            alert('Level ranges saved successfully!');
        }
    };

    const handleCancelLevels = () => {
        setEditingLevels(levelConfigs);
        setIsEditingLevels(false);
    };

    // --- QUESTIONNAIRE HANDLERS ---

    // Section Edits
    const handleSectionChange = (id: number, field: 'title' | 'weight', value: string | number) => {
        setEditingSections(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
        setIsEditingQuestionnaire(true);
    };

    // Question Edits
    const handleQuestionChange = (id: number, field: 'text' | 'weight', value: string | number) => {
        setEditingQuestions(prev => prev.map(q => q.id === id ? { ...q, [field]: value } : q));
        setIsEditingQuestionnaire(true);
    };

    // Choice Edits
    const handleChoiceChange = (id: number, field: 'text' | 'points', value: string | number) => {
        setEditingChoices(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
        setIsEditingQuestionnaire(true);
    };

    // Save Questionnaire Changes
    const handleSaveQuestionnaire = async () => {
        if (!supabase) return;

        // Batch updates
        // We only update modified items. For simplicity, we can upsert all currently editing items if the list isn't huge.
        // Or we can filter. Let's upsert all for now as lists are likely small (<100 items).
        
        const { error: sError } = await supabase.from('lod_sections').upsert(editingSections);
        if (sError) { alert('Error saving sections: ' + sError.message); return; }

        const { error: qError } = await supabase.from('lod_questions').upsert(editingQuestions);
        if (qError) { alert('Error saving questions: ' + qError.message); return; }

        const { error: cError } = await supabase.from('lod_choices').upsert(editingChoices);
        if (cError) { alert('Error saving choices: ' + cError.message); return; }

        // Refresh main state
        setSections(editingSections);
        setQuestions(editingQuestions);
        setChoices(editingChoices);
        setIsEditingQuestionnaire(false);
        logAction('Updated LOD Questionnaire Structure', '');
        alert('Questionnaire saved successfully!');
    };

    const handleCancelQuestionnaire = () => {
        setEditingSections(sections);
        setEditingQuestions(questions);
        setEditingChoices(choices);
        setIsEditingQuestionnaire(false);
    };

    // --- ADD / DELETE (Immediate Actions) ---
    // These update both local editing state and DB immediately for simplicity in ID management

    const handleAddSection = async () => {
        if (!newSectionTitle.trim()) return;
        if (!supabase) return;

        const maxOrder = sections.length > 0 ? Math.max(...sections.map(s => s.order)) : 0;
        const newSection = {
            title: newSectionTitle,
            weight: newSectionWeight,
            order: maxOrder + 1
        };

        const { data, error } = await supabase.from('lod_sections').insert(newSection).select().single();
        if (error) {
            alert('Error adding section: ' + error.message);
        } else if (data) {
            const newS = [...sections, data];
            setSections(newS);
            setEditingSections(newS);
            setNewSectionTitle('');
            setNewSectionWeight(0);
            logAction('Added LOD Section', data.title);
        }
    };

    const handleDeleteSection = async (id: number) => {
        if (!confirm('Delete this section and all its questions?')) return;
        if (!supabase) return;

        const { error } = await supabase.from('lod_sections').delete().eq('id', id);
        if (error) {
            alert('Error deleting section: ' + error.message);
        } else {
            const newS = sections.filter(s => s.id !== id);
            setSections(newS);
            setEditingSections(newS);
            // Cascade delete handles questions/choices in DB, but update local state
            const newQ = questions.filter(q => q.section_id !== id);
            setQuestions(newQ);
            setEditingQuestions(newQ);
            // Choices linked to those questions
            const qIds = questions.filter(q => q.section_id === id).map(q => q.id);
            const newC = choices.filter(c => !qIds.includes(c.question_id));
            setChoices(newC);
            setEditingChoices(newC);
            
            logAction('Deleted LOD Section', id.toString());
        }
    };

    const handleAddQuestion = async (sectionId: number) => {
        // Use prompt for quick add or just a default "New Question"
        const text = prompt("Enter Question Text:");
        if (!text) return;
        if (!supabase) return;

        const sectionQuestions = questions.filter(q => q.section_id === sectionId);
        const maxOrder = sectionQuestions.length > 0 ? Math.max(...sectionQuestions.map(q => q.order)) : 0;

        const newQuestion = {
            section_id: sectionId,
            text: text,
            weight: 1,
            order: maxOrder + 1
        };

        const { data, error } = await supabase.from('lod_questions').insert(newQuestion).select().single();
        if (data) {
            const newQ = [...questions, data];
            setQuestions(newQ);
            setEditingQuestions(newQ);
        }
    };

    const handleDeleteQuestion = async (id: number) => {
        if (!confirm('Delete this question?')) return;
        if (!supabase) return;
        const { error } = await supabase.from('lod_questions').delete().eq('id', id);
        if (!error) {
            const newQ = questions.filter(q => q.id !== id);
            setQuestions(newQ);
            setEditingQuestions(newQ);
            const newC = choices.filter(c => c.question_id !== id);
            setChoices(newC);
            setEditingChoices(newC);
        }
    };

    const handleAddChoice = async (questionId: number) => {
        const text = prompt("Enter Choice Text:");
        if (!text) return;
        if (!supabase) return;

        const questionChoices = choices.filter(c => c.question_id === questionId);
        const maxOrder = questionChoices.length > 0 ? Math.max(...questionChoices.map(c => c.order)) : 0;

        const newChoice = {
            question_id: questionId,
            text: text,
            points: 0,
            order: maxOrder + 1
        };

        const { data } = await supabase.from('lod_choices').insert(newChoice).select().single();
        if (data) {
            const newC = [...choices, data];
            setChoices(newC);
            setEditingChoices(newC);
        }
    };

    const handleDeleteChoice = async (id: number) => {
        if (!supabase) return;
        const { error } = await supabase.from('lod_choices').delete().eq('id', id);
        if (!error) {
            const newC = choices.filter(c => c.id !== id);
            setChoices(newC);
            setEditingChoices(newC);
        }
    };

    if (loading) return <div>Loading LOD Settings...</div>;

    return (
        <div className="space-y-8 pb-12">
            
            {/* SECTION 1: LOD SCORE COMPUTATION */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-xl font-bold text-gray-800 dark:text-white">LOD Score Computation</h3>
                        <p className="text-sm text-gray-500">Set the score ranges for each Level of Development (1-5).</p>
                    </div>
                    <div className="flex gap-2">
                        {isEditingLevels ? (
                            <>
                                <button onClick={handleCancelLevels} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md">Cancel</button>
                                <button onClick={handleSaveLevels} className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 shadow-sm">Save Changes</button>
                            </>
                        ) : (
                            <button onClick={() => setIsEditingLevels(true)} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow-sm">Edit Ranges</button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {editingLevels.map((config, index) => (
                        <div key={config.id} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 flex items-center justify-between">
                            <span className="font-bold text-lg text-gray-700 dark:text-gray-200">Level {config.level}</span>
                            <div className="flex items-center gap-2">
                                <input 
                                    type="number" 
                                    value={config.min_score}
                                    onChange={(e) => handleLevelChange(index, 'min_score', Number(e.target.value))}
                                    disabled={!isEditingLevels}
                                    className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-center dark:bg-gray-800 dark:text-white disabled:opacity-60"
                                />
                                <span className="text-gray-400">-</span>
                                <input 
                                    type="number" 
                                    value={config.max_score}
                                    onChange={(e) => handleLevelChange(index, 'max_score', Number(e.target.value))}
                                    disabled={!isEditingLevels}
                                    className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-center dark:bg-gray-800 dark:text-white disabled:opacity-60"
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* SECTION 2: QUESTIONNAIRE MANAGEMENT */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-xl font-bold text-gray-800 dark:text-white">Questionnaire Management</h3>
                        <p className="text-sm text-gray-500">Manage sections, questions, choices, and weights.</p>
                    </div>
                    <div className="flex gap-2">
                        {isEditingQuestionnaire && (
                            <>
                                <button onClick={handleCancelQuestionnaire} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md">Cancel</button>
                                <button onClick={handleSaveQuestionnaire} className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 shadow-sm">Save Changes</button>
                            </>
                        )}
                    </div>
                </div>

                {/* Add Section */}
                <div className="flex gap-2 items-end bg-gray-50 dark:bg-gray-900/30 p-4 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 mb-6">
                    <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-500 uppercase mb-1">New Section Title</label>
                        <input 
                            type="text" 
                            value={newSectionTitle}
                            onChange={(e) => setNewSectionTitle(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                            placeholder="e.g., Organizational Management"
                        />
                    </div>
                    <div className="w-24">
                        <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Weight (%)</label>
                        <input 
                            type="number" 
                            value={newSectionWeight}
                            onChange={(e) => setNewSectionWeight(Number(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                        />
                    </div>
                    <button 
                        onClick={handleAddSection}
                        className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 font-medium"
                    >
                        Add
                    </button>
                </div>

                {/* Sections List */}
                <div className="space-y-4">
                    {editingSections.map(section => (
                        <div key={section.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 shadow-sm">
                            <div className="bg-gray-50 dark:bg-gray-700/50 p-4 flex justify-between items-center">
                                <div className="flex items-center gap-4 flex-1">
                                    <button 
                                        onClick={() => setExpandedSectionId(expandedSectionId === section.id ? null : section.id)}
                                        className="text-gray-400 hover:text-gray-600 transition-colors"
                                    >
                                        {/* Subtle Chevron Icon */}
                                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transform transition-transform ${expandedSectionId === section.id ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                    
                                    <input 
                                        type="text" 
                                        value={section.title}
                                        onChange={(e) => handleSectionChange(section.id, 'title', e.target.value)}
                                        className="font-bold text-gray-800 dark:text-white bg-transparent border-b border-transparent hover:border-gray-300 focus:border-emerald-500 focus:outline-none px-1 flex-1"
                                    />
                                    
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-500 uppercase">Weight:</span>
                                        <input 
                                            type="number" 
                                            value={section.weight}
                                            onChange={(e) => handleSectionChange(section.id, 'weight', Number(e.target.value))}
                                            className="w-16 text-right font-mono bg-transparent border-b border-transparent hover:border-gray-300 focus:border-emerald-500 focus:outline-none"
                                        />
                                        <span className="text-gray-500">%</span>
                                    </div>
                                </div>
                                <button onClick={() => handleDeleteSection(section.id)} className="ml-4 text-red-400 hover:text-red-600 p-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </div>

                            {expandedSectionId === section.id && (
                                <div className="p-4 space-y-6 bg-white dark:bg-gray-800">
                                    {/* Questions List */}
                                    {editingQuestions.filter(q => q.section_id === section.id).map(question => (
                                        <div key={question.id} className="pl-4 border-l-2 border-gray-200 dark:border-gray-700">
                                            <div className="flex justify-between items-start mb-3">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-xs font-bold text-gray-400">Q{question.order}</span>
                                                        <input 
                                                            type="text" 
                                                            value={question.text}
                                                            onChange={(e) => handleQuestionChange(question.id, 'text', e.target.value)}
                                                            className="w-full font-medium text-gray-800 dark:text-gray-200 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-emerald-500 focus:outline-none"
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                                        <span>Weight:</span>
                                                        <input 
                                                            type="number" 
                                                            value={question.weight}
                                                            onChange={(e) => handleQuestionChange(question.id, 'weight', Number(e.target.value))}
                                                            className="w-12 bg-transparent border-b border-gray-200 focus:border-emerald-500 focus:outline-none text-center"
                                                        />
                                                    </div>
                                                </div>
                                                <button onClick={() => handleDeleteQuestion(question.id)} className="text-gray-400 hover:text-red-500 ml-2">×</button>
                                            </div>

                                            {/* Choices */}
                                            <div className="ml-6 space-y-2">
                                                {editingChoices.filter(c => c.question_id === question.id).map(choice => (
                                                    <div key={choice.id} className="flex items-center gap-3 text-sm group">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-gray-300 group-hover:bg-emerald-400"></div>
                                                        <input 
                                                            type="text" 
                                                            value={choice.text}
                                                            onChange={(e) => handleChoiceChange(choice.id, 'text', e.target.value)}
                                                            className="flex-1 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-emerald-500 focus:outline-none text-gray-600 dark:text-gray-400"
                                                        />
                                                        <div className="flex items-center gap-1">
                                                            <input 
                                                                type="number" 
                                                                value={choice.points}
                                                                onChange={(e) => handleChoiceChange(choice.id, 'points', Number(e.target.value))}
                                                                className="w-10 text-right bg-transparent border-b border-transparent hover:border-gray-200 focus:border-emerald-500 focus:outline-none text-gray-500"
                                                            />
                                                            <span className="text-xs text-gray-400">pts</span>
                                                        </div>
                                                        <button onClick={() => handleDeleteChoice(choice.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500">×</button>
                                                    </div>
                                                ))}
                                                <button 
                                                    onClick={() => handleAddChoice(question.id)}
                                                    className="text-xs text-emerald-600 hover:text-emerald-700 font-medium mt-1 flex items-center gap-1"
                                                >
                                                    + Add Choice
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    
                                    <button 
                                        onClick={() => handleAddQuestion(section.id)}
                                        className="w-full py-2 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg text-gray-500 hover:border-emerald-500 hover:text-emerald-600 transition-colors text-sm font-medium"
                                    >
                                        + Add Question to Section
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default LODManagementTab;
