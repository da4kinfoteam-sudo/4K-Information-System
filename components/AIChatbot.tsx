
// Author: 4K
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Subproject, IPO, Activity, MarketingPartner, OfficeRequirement, StaffingRequirement, OtherProgramExpense } from '../constants';

interface AIChatbotProps {
    subprojects: Subproject[];
    ipos: IPO[];
    activities: Activity[];
    marketingPartners: MarketingPartner[];
    officeReqs: OfficeRequirement[];
    staffingReqs: StaffingRequirement[];
    otherProgramExpenses: OtherProgramExpense[];
    onNavigate: (path: string) => void;
    onSelectSubproject: (sp: Subproject) => void;
    onSelectIpo: (ipo: IPO) => void;
    onSelectActivity: (act: Activity) => void;
    onSelectMarketingPartner: (mp: MarketingPartner) => void;
}

// Helper to retrieve API Key
const getApiKey = () => {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
        if ((import.meta as any).env.API_KEY) return (import.meta as any).env.API_KEY;
        if ((import.meta as any).env.VITE_API_KEY) return (import.meta as any).env.VITE_API_KEY;
        if ((import.meta as any).env.VITE_GEMINI_API_KEY) return (import.meta as any).env.VITE_GEMINI_API_KEY;
    }
    if (typeof process !== 'undefined' && process.env) {
        if (process.env.API_KEY) return process.env.API_KEY;
        if (process.env.VITE_API_KEY) return process.env.VITE_API_KEY;
        if (process.env.REACT_APP_API_KEY) return process.env.REACT_APP_API_KEY;
    }
    return '';
};

const BASE_SYSTEM_INSTRUCTION = `You are the AI Assistant for the 4K Information System.
Your goal is to help users navigate the app and understand the data.

**Response Style:**
1. **Be Concise**: Do NOT provide long lists unless specifically asked. If asked "How many IPOs?", answer "There are 25 IPOs." do not list them all.
2. **Data Driven**: Use the provided JSON context to answer questions about budgets, counts, and specific items.
3. **Navigation**: You can guide the user to specific pages or items. 
   - To link to a page, use Markdown format: [Page Name](/route).
     Available Routes: /dashboards, /subprojects, /activities, /ipo, /marketing-database, /program-management, /reports.
   - To link to a specific item detail, use: [Item Name](/type/identifier).
     - Subprojects: [Project Name](/subproject/UID)  (Use the 'uid' field)
     - IPOs: [IPO Name](/ipo/Name) (Use the 'name' field)
     - Activities: [Activity Name](/activity/UID) (Use the 'uid' field)
     - Marketing Partners: [Partner Name](/marketing/UID) (Use the 'uid' field)

**Data Definitions:**
- **Subprojects**: Livelihood interventions.
- **IPOs**: Indigenous Peoples Organizations.
- **Marketing**: Buyers and partners.
- **Program Management**: Office/Staffing requirements.
`;

const AIChatbot: React.FC<AIChatbotProps> = ({ 
    subprojects, ipos, activities, marketingPartners, 
    officeReqs, staffingReqs, otherProgramExpenses,
    onNavigate, onSelectSubproject, onSelectIpo, onSelectActivity, onSelectMarketingPartner
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string }[]>([
        { role: 'model', text: "Hello! I can help you find data or navigate the system. Try asking 'Show me the dashboard' or 'How many subprojects are completed?'" }
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

    // Handle Link Clicks from AI Responses
    const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
        e.preventDefault();
        
        // Handle generic page navigation
        if (href.startsWith('/') && !href.split('/')[2]) {
            onNavigate(href);
            return;
        }

        // Handle Item Detail Navigation
        const parts = href.split('/');
        const type = parts[1];
        const id = parts[2]; // UID or Name

        if (type === 'subproject') {
            const item = subprojects.find(s => s.uid === id || s.name === id);
            if (item) onSelectSubproject(item);
        } else if (type === 'ipo') {
            const item = ipos.find(i => i.name === decodeURIComponent(id));
            if (item) onSelectIpo(item);
        } else if (type === 'activity') {
            const item = activities.find(a => a.uid === id || a.name === id);
            if (item) onSelectActivity(item);
        } else if (type === 'marketing') {
            const item = marketingPartners.find(m => m.uid === id || m.companyName === id);
            if (item) onSelectMarketingPartner(item);
        } else {
            // Fallback for simple routes
            onNavigate(href);
        }
    };

    // Render text with clickable markdown links
    const renderMessage = (text: string) => {
        // Regex to match [Text](url)
        const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
        const parts = [];
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                parts.push(text.substring(lastIndex, match.index));
            }
            const linkText = match[1];
            const linkUrl = match[2];
            parts.push(
                <a 
                    key={match.index} 
                    href={linkUrl} 
                    onClick={(e) => handleLinkClick(e, linkUrl)}
                    className="text-emerald-200 hover:text-white underline font-medium cursor-pointer"
                >
                    {linkText}
                </a>
            );
            lastIndex = regex.lastIndex;
        }
        if (lastIndex < text.length) {
            parts.push(text.substring(lastIndex));
        }
        return <>{parts}</>;
    };

    const handleSend = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!inputText.trim() || isLoading) return;

        const userMessage = inputText;
        setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
        setInputText('');
        setIsLoading(true);

        const apiKey = getApiKey();
        if (!apiKey) {
             setMessages(prev => [...prev, { role: 'model', text: "Error: API Key is missing. Please check system configuration." }]);
             setIsLoading(false);
             return;
        }

        try {
            // Prepare Data Context (Optimized)
            const MAX_ITEMS = 50; // Strict limit to avoid token overflow
            
            const dataContext = {
                metrics: {
                    subprojects_total: subprojects.length,
                    subprojects_completed: subprojects.filter(s => s.status === 'Completed').length,
                    subprojects_budget: subprojects.reduce((sum, s) => sum + s.details.reduce((dSum, d) => dSum + (d.pricePerUnit * d.numberOfUnits), 0), 0),
                    ipos_total: ipos.length,
                    ipos_women_led: ipos.filter(i => i.isWomenLed).length,
                    trainings_total: activities.filter(a => a.type === 'Training').length,
                    marketing_partners: marketingPartners.length,
                },
                recent_subprojects: subprojects.slice(0, MAX_ITEMS).map(s => ({
                    uid: s.uid, name: s.name, status: s.status, location: s.location, ipo: s.indigenousPeopleOrganization
                })),
                recent_activities: activities.slice(0, MAX_ITEMS).map(a => ({
                    uid: a.uid, name: a.name, type: a.type, date: a.date
                })),
                recent_ipos: ipos.slice(0, MAX_ITEMS).map(i => ({
                    name: i.name, region: i.region, level: i.levelOfDevelopment
                })),
                marketing_partners: marketingPartners.slice(0, 30).map(m => ({
                    uid: m.uid, name: m.companyName, needs: m.commodityNeeds.map(c => c.name).join(', ')
                }))
            };

            const fullSystemInstruction = `${BASE_SYSTEM_INSTRUCTION}\n\n[SYSTEM DATA CONTEXT]\n${JSON.stringify(dataContext)}`;

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
                 setMessages(prev => [...prev, { role: 'model', text: "I couldn't generate a response at the moment." }]);
            }
        } catch (error: any) {
            console.error("AI Chat Error:", error);
            let errMsg = "I'm currently experiencing high traffic. Please try again in a moment.";
            
            // Handle specific API key errors distinctly if needed, but generic "busy" is better for UX as requested
            if (error.message && error.message.includes('API key')) {
                errMsg = "Configuration Error: Unable to access AI service.";
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
                    <div className="bg-emerald-600 p-4 text-white flex items-center gap-2 shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                        <h3 className="font-bold">4K Assistant</h3>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 p-4 overflow-y-auto bg-gray-50 dark:bg-gray-900 custom-scrollbar space-y-3">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] p-3 rounded-lg text-sm leading-relaxed ${
                                    msg.role === 'user' 
                                        ? 'bg-emerald-600 text-white rounded-tr-none shadow-md' 
                                        : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-tl-none shadow-sm'
                                }`}>
                                    {msg.role === 'model' ? renderMessage(msg.text) : msg.text}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-white dark:bg-gray-700 p-3 rounded-lg rounded-tl-none border border-gray-200 dark:border-gray-600 shadow-sm flex gap-1 items-center">
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
                            className="p-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
