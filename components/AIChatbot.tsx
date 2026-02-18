
// Author: 4K
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Subproject, IPO, Activity } from '../constants';

interface AIChatbotProps {
    subprojects: Subproject[];
    ipos: IPO[];
    activities: Activity[];
}

// Helper to retrieve API Key from various environment configurations
const getApiKey = () => {
    // Check Vite / Modern Browsers
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
        if ((import.meta as any).env.API_KEY) return (import.meta as any).env.API_KEY;
        if ((import.meta as any).env.VITE_API_KEY) return (import.meta as any).env.VITE_API_KEY;
        if ((import.meta as any).env.VITE_GEMINI_API_KEY) return (import.meta as any).env.VITE_GEMINI_API_KEY;
    }
    // Check Legacy / Webpack / Node
    if (typeof process !== 'undefined' && process.env) {
        if (process.env.API_KEY) return process.env.API_KEY;
        if (process.env.VITE_API_KEY) return process.env.VITE_API_KEY;
        if (process.env.REACT_APP_API_KEY) return process.env.REACT_APP_API_KEY;
    }
    return '';
};

const BASE_SYSTEM_INSTRUCTION = `You are the AI Assistant for the 4K Information System (Kabuhayan at Kaunlaran ng Kababayang Katutubo). 
Your role is to help users navigate features AND answer questions about the specific data currently in the system.

The 4K Information System is designed to monitor and manage projects for Indigenous Peoples Organizations (IPOs). 

**Capabilities:**
1. **Navigate & Explain**: You can explain features (Dashboard, Subprojects, Activities, Reports, etc.).
2. **Data Analysis**: You have access to the current dataset of Subprojects, IPOs, and Activities (Trainings). You can answer questions like:
   - "How many IPOs are in Region III?"
   - "What is the total budget for subprojects in 2024?"
   - "List the trainings conducted by RPMO 4A."
   - "Which IPOs are women-led?"

**Guidelines for Data Queries:**
- When answering counts or sums, be precise based on the provided JSON context.
- If the user asks for "this year" or "current year", assume they mean the most recent funding year visible in the data unless specified.
- If asked about "OU" (Operating Unit), filter by the 'operatingUnit' field.
- If asked about "Region", filter IPOs by 'region' or Activities/Subprojects by their location/OU mapping.
- Be concise. Do not dump the entire JSON back to the user. Summarize the answer.

If a user asks navigation questions (e.g., "How do I add a subproject?"), guide them to the sidebar menu.

**Important Data Definitions:**
- **Subprojects**: Livelihood interventions. Key fields: name, status, budget (calculated from details), operatingUnit, indigenousPeopleOrganization (IPO).
- **IPOs**: The organizations. Key fields: name, region, levelOfDevelopment, isWomenLed.
- **Activities**: Trainings and other events. Key fields: name, type (Training/Activity), operatingUnit, participatingIpos.
`;

const AIChatbot: React.FC<AIChatbotProps> = ({ subprojects, ipos, activities }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string }[]>([
        { role: 'model', text: "Hello! I'm the 4K System Assistant. I can help you navigate the app or answer questions about your data (e.g., 'How many IPOs are there in CAR?')." }
    ]);
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (isOpen) scrollToBottom();
    }, [messages, isOpen]);

    const handleSend = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!inputText.trim() || isLoading) return;

        const userMessage = inputText;
        setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
        setInputText('');
        setIsLoading(true);

        const apiKey = getApiKey();
        if (!apiKey) {
             setMessages(prev => [...prev, { role: 'model', text: "Error: API Key is missing. Please configure the environment variable (VITE_API_KEY, API_KEY, etc.)." }]);
             setIsLoading(false);
             return;
        }

        try {
            // Prepare Data Context
            // We strip unnecessary fields to save context tokens, keeping only what's needed for analysis.
            const dataContext = {
                summary: {
                    total_subprojects: subprojects.length,
                    total_ipos: ipos.length,
                    total_activities: activities.length
                },
                subprojects: subprojects.map(s => ({
                    name: s.name,
                    status: s.status,
                    operatingUnit: s.operatingUnit,
                    fundYear: s.fundingYear,
                    fundType: s.fundType,
                    ipo: s.indigenousPeopleOrganization,
                    // FIX: Safely handle null/undefined details with (s.details || [])
                    totalBudget: (s.details || []).reduce((acc, d) => acc + (d.pricePerUnit * d.numberOfUnits), 0)
                })),
                ipos: ipos.map(i => ({
                    name: i.name,
                    region: i.region,
                    level: i.levelOfDevelopment,
                    isWomenLed: i.isWomenLed,
                    isGida: i.isWithinGida
                })),
                activities: activities.map(a => ({
                    name: a.name,
                    type: a.type, // Training or Activity
                    component: a.component,
                    operatingUnit: a.operatingUnit,
                    fundYear: a.fundingYear,
                    participatingIPOs: a.participatingIpos
                }))
            };

            const fullSystemInstruction = `${BASE_SYSTEM_INSTRUCTION}\n\n[CURRENT SYSTEM DATA JSON]\n${JSON.stringify(dataContext)}`;

            const ai = new GoogleGenAI({ apiKey });
            
            const chat = ai.chats.create({
                model: 'gemini-3-flash-preview',
                config: {
                    systemInstruction: fullSystemInstruction,
                },
                history: messages.map(m => ({
                    role: m.role,
                    parts: [{ text: m.text }]
                }))
            });

            const result = await chat.sendMessage({ message: userMessage });
            const responseText = result.text;

            if (responseText) {
                setMessages(prev => [...prev, { role: 'model', text: responseText }]);
            } else {
                 setMessages(prev => [...prev, { role: 'model', text: "I'm sorry, I couldn't generate a response." }]);
            }
        } catch (error: any) {
            console.error("AI Chat Error:", error);
            let errMsg = "Sorry, I encountered an error connecting to the AI service.";
            if (error.message && error.message.includes('API key')) {
                errMsg = "The AI service refused the connection. Please check if the API Key is valid and has proper permissions.";
            } else if (error.message) {
                errMsg += ` (${error.message})`;
            }
            setMessages(prev => [...prev, { role: 'model', text: errMsg }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            {/* Chat Bubble Trigger */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="fixed bottom-6 right-6 z-50 p-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                aria-label="Toggle AI Chat"
            >
                {isOpen ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                )}
            </button>

            {/* Chat Window */}
            {isOpen && (
                <div className="fixed bottom-24 right-6 z-50 w-80 md:w-96 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden animate-fadeIn h-[500px]">
                    {/* Header */}
                    <div className="bg-emerald-600 p-4 text-white flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                        <h3 className="font-bold">4K System Assistant</h3>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 p-4 overflow-y-auto bg-gray-50 dark:bg-gray-900 custom-scrollbar space-y-3">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] p-3 rounded-lg text-sm ${
                                    msg.role === 'user' 
                                        ? 'bg-emerald-600 text-white rounded-tr-none' 
                                        : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-tl-none shadow-sm'
                                }`}>
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-white dark:bg-gray-700 p-3 rounded-lg rounded-tl-none border border-gray-200 dark:border-gray-600 shadow-sm flex gap-1">
                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <form onSubmit={handleSend} className="p-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex gap-2">
                        <input
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder="Ask about Subprojects, Reports..."
                            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
                        />
                        <button 
                            type="submit" 
                            disabled={isLoading || !inputText.trim()}
                            className="p-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        </button>
                    </form>
                </div>
            )}
        </>
    );
};

export default AIChatbot;
