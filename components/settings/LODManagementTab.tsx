// Author: 4K
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { LodSection, LodQuestion, LodChoice } from '../../constants';
import { useLogAction } from '../../hooks/useLogAction';

const LODManagementTab: React.FC = () => {
    const { logAction } = useLogAction();
    const [sections, setSections] = useState<LodSection[]>([]);
    const [questions, setQuestions] = useState<LodQuestion[]>([]);
    const [choices, setChoices] = useState<LodChoice[]>([]);
    const [loading, setLoading] = useState(true);

    // Editing States
    const [editingSection, setEditingSection] = useState<LodSection | null>(null);
    const [editingQuestion, setEditingQuestion] = useState<LodQuestion | null>(null);
    const [editingChoice, setEditingChoice] = useState<LodChoice | null>(null);

    // New Item States
    const [newSectionTitle, setNewSectionTitle] = useState('');
    const [newQuestionText, setNewQuestionText] = useState('');
    const [newQuestionWeight, setNewQuestionWeight] = useState(1);
    const [newChoiceText, setNewChoiceText] = useState('');
    const [newChoicePoints, setNewChoicePoints] = useState(0);

    // UI State
    const [expandedSectionId, setExpandedSectionId] = useState<number | null>(null);
    const [expandedQuestionId, setExpandedQuestionId] = useState<number | null>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        if (!supabase) return;

        const { data: sData } = await supabase.from('lod_sections').select('*').order('order', { ascending: true });
        const { data: qData } = await supabase.from('lod_questions').select('*').order('order', { ascending: true });
        const { data: cData } = await supabase.from('lod_choices').select('*').order('order', { ascending: true });

        if (sData) setSections(sData);
        if (qData) setQuestions(qData);
        if (cData) setChoices(cData);
        setLoading(false);
    };

    // --- SECTIONS ---
    const handleAddSection = async () => {
        if (!newSectionTitle.trim()) return;
        if (!supabase) return;

        const maxOrder = sections.length > 0 ? Math.max(...sections.map(s => s.order)) : 0;
        const newSection = {
            title: newSectionTitle,
            order: maxOrder + 1
        };

        const { data, error } = await supabase.from('lod_sections').insert(newSection).select().single();
        if (error) {
            alert('Error adding section: ' + error.message);
        } else if (data) {
            setSections([...sections, data]);
            setNewSectionTitle('');
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
            setSections(sections.filter(s => s.id !== id));
            setQuestions(questions.filter(q => q.section_id !== id)); // Local cleanup
            logAction('Deleted LOD Section', id.toString());
        }
    };

    // --- QUESTIONS ---
    const handleAddQuestion = async (sectionId: number) => {
        if (!newQuestionText.trim()) return;
        if (!supabase) return;

        const sectionQuestions = questions.filter(q => q.section_id === sectionId);
        const maxOrder = sectionQuestions.length > 0 ? Math.max(...sectionQuestions.map(q => q.order)) : 0;

        const newQuestion = {
            section_id: sectionId,
            text: newQuestionText,
            weight: newQuestionWeight,
            order: maxOrder + 1
        };

        const { data, error } = await supabase.from('lod_questions').insert(newQuestion).select().single();
        if (error) {
            alert('Error adding question: ' + error.message);
        } else if (data) {
            setQuestions([...questions, data]);
            setNewQuestionText('');
            setNewQuestionWeight(1);
            logAction('Added LOD Question', data.text);
        }
    };

    const handleDeleteQuestion = async (id: number) => {
        if (!confirm('Delete this question?')) return;
        if (!supabase) return;

        const { error } = await supabase.from('lod_questions').delete().eq('id', id);
        if (error) {
            alert('Error deleting question: ' + error.message);
        } else {
            setQuestions(questions.filter(q => q.id !== id));
            setChoices(choices.filter(c => c.question_id !== id));
            logAction('Deleted LOD Question', id.toString());
        }
    };

    // --- CHOICES ---
    const handleAddChoice = async (questionId: number) => {
        if (!newChoiceText.trim()) return;
        if (!supabase) return;

        const questionChoices = choices.filter(c => c.question_id === questionId);
        const maxOrder = questionChoices.length > 0 ? Math.max(...questionChoices.map(c => c.order)) : 0;

        const newChoice = {
            question_id: questionId,
            text: newChoiceText,
            points: newChoicePoints,
            order: maxOrder + 1
        };

        const { data, error } = await supabase.from('lod_choices').insert(newChoice).select().single();
        if (error) {
            alert('Error adding choice: ' + error.message);
        } else if (data) {
            setChoices([...choices, data]);
            setNewChoiceText('');
            setNewChoicePoints(0);
            logAction('Added LOD Choice', data.text);
        }
    };

    const handleDeleteChoice = async (id: number) => {
        if (!supabase) return;
        const { error } = await supabase.from('lod_choices').delete().eq('id', id);
        if (error) {
            alert('Error deleting choice: ' + error.message);
        } else {
            setChoices(choices.filter(c => c.id !== id));
        }
    };

    if (loading) return <div>Loading LOD Settings...</div>;

    return (
        <div className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <h3 className="font-bold text-blue-800 dark:text-blue-200 mb-2">LOD Questionnaire Management</h3>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                    Define the structure of the Level of Development assessment here. 
                    Changes will affect how LOD is calculated for IPOs.
                </p>
            </div>

            {/* Add Section */}
            <div className="flex gap-2 items-end bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Section Title</label>
                    <input 
                        type="text" 
                        value={newSectionTitle}
                        onChange={(e) => setNewSectionTitle(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                        placeholder="e.g., Organizational Management"
                    />
                </div>
                <button 
                    onClick={handleAddSection}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 font-medium"
                >
                    Add Section
                </button>
            </div>

            {/* Sections List */}
            <div className="space-y-4">
                {sections.map(section => (
                    <div key={section.id} className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                        <div className="bg-gray-100 dark:bg-gray-700 p-3 flex justify-between items-center">
                            <h4 className="font-bold text-lg text-gray-800 dark:text-white flex items-center gap-2 cursor-pointer" onClick={() => setExpandedSectionId(expandedSectionId === section.id ? null : section.id)}>
                                <span className={`transform transition-transform ${expandedSectionId === section.id ? 'rotate-90' : ''}`}>▶</span>
                                {section.title}
                            </h4>
                            <button onClick={() => handleDeleteSection(section.id)} className="text-red-500 hover:text-red-700 text-sm">Delete Section</button>
                        </div>

                        {expandedSectionId === section.id && (
                            <div className="p-4 space-y-4">
                                {/* Questions List */}
                                {questions.filter(q => q.section_id === section.id).map(question => (
                                    <div key={question.id} className="pl-4 border-l-4 border-emerald-500 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-r-md">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <p className="font-medium text-gray-900 dark:text-white">{question.text}</p>
                                                <p className="text-xs text-gray-500">Weight: {question.weight}</p>
                                            </div>
                                            <button onClick={() => handleDeleteQuestion(question.id)} className="text-red-400 hover:text-red-600 text-xs">Delete Question</button>
                                        </div>

                                        {/* Choices */}
                                        <div className="ml-4 space-y-1 mt-2">
                                            {choices.filter(c => c.question_id === question.id).map(choice => (
                                                <div key={choice.id} className="flex items-center gap-2 text-sm">
                                                    <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                                                    <span className="flex-1 text-gray-700 dark:text-gray-300">{choice.text} ({choice.points} pts)</span>
                                                    <button onClick={() => handleDeleteChoice(choice.id)} className="text-gray-400 hover:text-red-500">×</button>
                                                </div>
                                            ))}
                                            
                                            {/* Add Choice */}
                                            <div className="flex gap-2 mt-2 items-center">
                                                <input 
                                                    type="text" 
                                                    placeholder="Choice text"
                                                    className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                                                    id={`new-choice-text-${question.id}`}
                                                />
                                                <input 
                                                    type="number" 
                                                    placeholder="Pts"
                                                    className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                                                    id={`new-choice-points-${question.id}`}
                                                />
                                                <button 
                                                    onClick={() => {
                                                        const textInput = document.getElementById(`new-choice-text-${question.id}`) as HTMLInputElement;
                                                        const pointsInput = document.getElementById(`new-choice-points-${question.id}`) as HTMLInputElement;
                                                        if (textInput.value) {
                                                            setNewChoiceText(textInput.value);
                                                            setNewChoicePoints(Number(pointsInput.value));
                                                            // Hacky state update to trigger the actual add in next render cycle or call directly
                                                            // Better: refactor to not rely on state for per-row inputs or use a separate component
                                                            // For now, let's just call a direct function with values
                                                            const addChoiceDirect = async (qid: number, text: string, pts: number) => {
                                                                if (!supabase) return;
                                                                const questionChoices = choices.filter(c => c.question_id === qid);
                                                                const maxOrder = questionChoices.length > 0 ? Math.max(...questionChoices.map(c => c.order)) : 0;
                                                                const newChoice = { question_id: qid, text, points: pts, order: maxOrder + 1 };
                                                                const { data } = await supabase.from('lod_choices').insert(newChoice).select().single();
                                                                if (data) setChoices(prev => [...prev, data]);
                                                            };
                                                            addChoiceDirect(question.id, textInput.value, Number(pointsInput.value));
                                                            textInput.value = '';
                                                            pointsInput.value = '';
                                                        }
                                                    }}
                                                    className="px-2 py-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded text-xs hover:bg-gray-300"
                                                >
                                                    Add
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {/* Add Question */}
                                <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-700/50 rounded-md border border-dashed border-gray-300 dark:border-gray-600">
                                    <h5 className="text-sm font-bold text-gray-600 dark:text-gray-300 mb-2">Add New Question</h5>
                                    <div className="flex gap-2 flex-col sm:flex-row">
                                        <input 
                                            type="text" 
                                            placeholder="Question Text"
                                            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                                            id={`new-question-text-${section.id}`}
                                        />
                                        <input 
                                            type="number" 
                                            placeholder="Weight"
                                            defaultValue={1}
                                            className="w-20 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                                            id={`new-question-weight-${section.id}`}
                                        />
                                        <button 
                                            onClick={() => {
                                                const textInput = document.getElementById(`new-question-text-${section.id}`) as HTMLInputElement;
                                                const weightInput = document.getElementById(`new-question-weight-${section.id}`) as HTMLInputElement;
                                                if (textInput.value) {
                                                    const addQuestionDirect = async (sid: number, text: string, weight: number) => {
                                                        if (!supabase) return;
                                                        const sectionQuestions = questions.filter(q => q.section_id === sid);
                                                        const maxOrder = sectionQuestions.length > 0 ? Math.max(...sectionQuestions.map(q => q.order)) : 0;
                                                        const newQuestion = { section_id: sid, text, weight, order: maxOrder + 1 };
                                                        const { data } = await supabase.from('lod_questions').insert(newQuestion).select().single();
                                                        if (data) setQuestions(prev => [...prev, data]);
                                                    };
                                                    addQuestionDirect(section.id, textInput.value, Number(weightInput.value));
                                                    textInput.value = '';
                                                    weightInput.value = '1';
                                                }
                                            }}
                                            className="px-3 py-2 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700"
                                        >
                                            Add Question
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default LODManagementTab;
