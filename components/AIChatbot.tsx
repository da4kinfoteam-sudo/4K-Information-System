
// Author: 4K
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Subproject, IPO, Activity, MarketingPartner, OfficeRequirement, StaffingRequirement, OtherProgramExpense, philippineRegions, ouToRegionMap } from '../constants';

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
    onApplyFilter?: (filters: { region?: string; year?: string; search?: string }) => void;
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

**CRITICAL: Financial & Data Queries**
- The system has **ALREADY calculated** the totals for you. Look at the \`financial_summary\` and \`filtered_results\` objects in the context.
- If asked "How much", return the exact value from \`financial_summary\`. Do NOT attempt to sum items yourself.
- If asked "How many", return the exact count from \`filtered_results\`.
- All monetary values are in PHP. Format them nicely (e.g., PHP 1,500,000.00).

**Smart Navigation**
You can control the app view by adding query parameters to links.
- To show MIMAROPA IPOs: \`[View MIMAROPA IPOs](/ipo?region=MIMAROPA Region)\`
- To show 2024 Subprojects: \`[View 2024 Subprojects](/subprojects?year=2024)\`

**Response Style:**
1. **Be Concise**: Give the answer directly.
2. **Context Aware**: If the user asks about a region, verify the data in \`filters_applied\` matches.
3. **Hyperlinks**: ALWAYS use Markdown links \`[Text](URL)\`.
`;

const AIChatbot: React.FC<AIChatbotProps> = ({ 
    subprojects, ipos, activities, marketingPartners, 
    officeReqs, staffingReqs, otherProgramExpenses,
    onNavigate, onSelectSubproject, onSelectIpo, onSelectActivity, onSelectMarketingPartner,
    onApplyFilter
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string }[]>([
        { role: 'model', text: "Hello! I'm the 4K Assistant. Ask me 'How much is the budget for Region 2?' or 'Show me subprojects in 2024'." }
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

    // Handle Link Clicks with Query Params
    const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
        e.preventDefault();
        
        // 1. Parse Query Params for Filtering
        const [path, query] = href.split('?');
        if (query && onApplyFilter) {
            const params = new URLSearchParams(query);
            const region = params.get('region') || undefined;
            const year = params.get('year') || undefined;
            const search = params.get('search') || undefined;
            
            // Apply filter globally
            onApplyFilter({ region, year, search });
        }

        // 2. Normal Navigation Logic
        if (path.startsWith('/') && !path.split('/')[2]) {
            onNavigate(path);
            return;
        }

        const parts = path.split('/');
        const type = parts[1];
        const id = decodeURIComponent(parts[2]);

        if (type === 'subproject') {
            const item = subprojects.find(s => s.uid === id || s.name === id);
            if (item) onSelectSubproject(item);
        } else if (type === 'ipo') {
            const item = ipos.find(i => i.name === id);
            if (item) onSelectIpo(item);
        } else if (type === 'activity') {
            const item = activities.find(a => a.uid === id || a.name === id);
            if (item) onSelectActivity(item);
        } else if (type === 'marketing') {
            const item = marketingPartners.find(m => m.uid === id || m.companyName === id);
            if (item) onSelectMarketingPartner(item);
        } else {
            onNavigate(path);
        }
    };

    // Render markdown links and bold text
    const renderMessage = (text: string) => {
        const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
        
        return boldParts.map((part, index) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={index} className="font-bold text-gray-900 dark:text-white">{part.slice(2, -2)}</strong>;
            }
            
            const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
            const linkParts = [];
            let lastIndex = 0;
            let match;

            while ((match = linkRegex.exec(part)) !== null) {
                if (match.index > lastIndex) {
                    linkParts.push(part.substring(lastIndex, match.index));
                }
                const linkText = match[1];
                const linkUrl = match[2];
                linkParts.push(
                    <a 
                        key={`${index}-${match.index}`} 
                        href={linkUrl} 
                        onClick={(e) => handleLinkClick(e, linkUrl)}
                        className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold cursor-pointer"
                    >
                        {linkText}
                    </a>
                );
                lastIndex = linkRegex.lastIndex;
            }
            if (lastIndex < part.length) {
                linkParts.push(part.substring(lastIndex));
            }
            return <span key={index}>{linkParts}</span>;
        });
    };

    /**
     * DYNAMIC CONTEXT BUILDER (The "Query Engine")
     * Filters data first, then computes totals, then sends ONLY the summary to AI.
     */
    const getDynamicContext = (query: string) => {
        const q = query.toLowerCase();
        
        // 1. Identify Year
        const yearMatch = q.match(/\b(20\d{2})\b/);
        const targetYear = yearMatch ? yearMatch[1] : null;

        // 2. Identify Region Aliases
        const regionAliases: {[key: string]: string} = {
            'ilocos': 'Region I', 'region 1': 'Region I',
            'cagayan': 'Region II', 'region 2': 'Region II',
            'central luzon': 'Region III', 'region 3': 'Region III',
            'calabarzon': 'Region IV-A', '4a': 'Region IV-A',
            'mimaropa': 'MIMAROPA Region', '4b': 'MIMAROPA Region',
            'bicol': 'Region V', 'region 5': 'Region V',
            'western visayas': 'Region VI', 'region 6': 'Region VI',
            'central visayas': 'Region VII', 'region 7': 'Region VII',
            'eastern visayas': 'Region VIII', 'region 8': 'Region VIII',
            'zamboanga': 'Region IX', 'region 9': 'Region IX',
            'northern mindanao': 'Region X', 'region 10': 'Region X',
            'davao': 'Region XI', 'region 11': 'Region XI',
            'soccsksargen': 'Region XII', 'region 12': 'Region XII',
            'caraga': 'Region XIII', 'region 13': 'Region XIII',
            'ncr': 'National Capital Region', 'metro manila': 'National Capital Region',
            'car': 'Cordillera Administrative Region', 'cordillera': 'Cordillera Administrative Region',
            'barmm': 'Bangsamoro', 'muslim mindanao': 'Bangsamoro',
            'nir': 'Negros Island Region', 'negros': 'Negros Island Region'
        };
        
        let targetRegion: string | null = null;
        const sortedAliases = Object.keys(regionAliases).sort((a,b) => b.length - a.length);
        for (const alias of sortedAliases) {
            if (q.includes(alias)) {
                const official = philippineRegions.find(r => 
                    r.toLowerCase().includes(regionAliases[alias].toLowerCase()) || 
                    regionAliases[alias].toLowerCase().includes(r.toLowerCase())
                );
                targetRegion = official || regionAliases[alias];
                break;
            }
        }

        // 3. Filter Data based on detected Intent
        const filterItem = (item: any) => {
            let match = true;
            // Year Filter
            if (targetYear) {
                const y = item.fundingYear || item.fundYear || (item.date ? new Date(item.date).getFullYear() : null);
                if (y && y.toString() !== targetYear) match = false;
            }
            // Region Filter
            if (targetRegion) {
                let locationStr = (item.region || item.location || item.operatingUnit || '').toLowerCase();
                // Map OUs to Regions for filtering
                if (item.operatingUnit && ouToRegionMap[item.operatingUnit]) {
                    locationStr += ' ' + ouToRegionMap[item.operatingUnit].toLowerCase();
                }
                const tr = targetRegion.toLowerCase();
                const trShort = targetRegion.split(' ')[1]?.toLowerCase();
                
                if (tr.includes('mimaropa')) {
                     if (!locationStr.includes('mimaropa') && !locationStr.includes('4b')) match = false;
                } else {
                    if (!locationStr.includes(tr) && (!trShort || !locationStr.includes(trShort))) {
                        match = false;
                    }
                }
            }
            return match;
        };

        const filteredSubprojects = subprojects.filter(filterItem);
        const filteredTrainings = activities.filter(a => a.type === 'Training').filter(filterItem);
        const filteredActivities = activities.filter(a => a.type === 'Activity').filter(filterItem);
        const filteredIPOs = ipos.filter(filterItem);
        
        // 4. PRE-CALCULATE FINANCIALS (The Logic Optimization)
        const calculateBudget = (items: any[], type: 'sp' | 'act') => {
            if (type === 'sp') {
                return items.reduce((sum, sp) => 
                    sum + (sp.details?.reduce((dSum: number, d: any) => dSum + (d.pricePerUnit * d.numberOfUnits), 0) || 0), 0);
            } else {
                return items.reduce((sum, act) => 
                    sum + (act.expenses?.reduce((eSum: number, e: any) => eSum + e.amount, 0) || 0), 0);
            }
        };

        const subprojectBudget = calculateBudget(filteredSubprojects, 'sp');
        const trainingBudget = calculateBudget(filteredTrainings, 'act');
        const activityBudget = calculateBudget(filteredActivities, 'act');
        const totalAllocation = subprojectBudget + trainingBudget + activityBudget;

        // 5. Build Compact Context
        const stats = {
            filters_applied: { 
                year: targetYear || "All Years", 
                region: targetRegion || "All Regions" 
            },
            filtered_results: {
                subprojects_count: filteredSubprojects.length,
                trainings_count: filteredTrainings.length,
                other_activities_count: filteredActivities.length,
                ipos_count: filteredIPOs.length
            },
            financial_summary: {
                currency: "PHP",
                subproject_allocation: subprojectBudget,
                training_allocation: trainingBudget,
                other_activity_allocation: activityBudget,
                total_allocation: totalAllocation,
                note: "Use these exact values for 'how much' questions."
            }
        };

        const context: any = { system_stats: stats };

        // 6. Conditionally add list data only if NOT an aggregate question
        // If user asks "how many" or "how much", they don't need the list, just the stats above.
        // This saves massive amounts of tokens.
        const isAggregateQuestion = q.includes('how much') || q.includes('how many') || q.includes('total') || q.includes('count') || q.includes('sum');

        if (!isAggregateQuestion) {
            const maxItems = 10;
            if (q.includes('ipo') || q.includes('organization')) {
                context.ipos_list = filteredIPOs.slice(0, maxItems).map(i => ({ name: i.name, region: i.region }));
            }
            if (q.includes('subproject')) {
                context.subprojects_list = filteredSubprojects.slice(0, maxItems).map(s => ({ name: s.name, budget: calculateBudget([s], 'sp') }));
            }
            if (q.includes('training')) {
                context.trainings_list = filteredTrainings.slice(0, maxItems).map(t => ({ name: t.name, budget: calculateBudget([t], 'act') }));
            }
        }

        return JSON.stringify(context);
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
             setMessages(prev => [...prev, { role: 'model', text: "Error: API Key is missing." }]);
             setIsLoading(false);
             return;
        }

        try {
            // Build minimized context based on query
            const dynamicContext = getDynamicContext(userMessage);
            const systemPrompt = `${BASE_SYSTEM_INSTRUCTION}\n\n[REAL-TIME DATA CONTEXT]\n${dynamicContext}`;

            const ai = new GoogleGenAI({ apiKey });
            
            const chat = ai.chats.create({
                model: 'gemini-flash-lite-latest',
                config: {
                    systemInstruction: systemPrompt,
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
                 setMessages(prev => [...prev, { role: 'model', text: "I couldn't generate a response." }]);
            }
        } catch (error: any) {
            console.error("AI Chat Error:", error);
            setMessages(prev => [...prev, { role: 'model', text: "I'm having trouble connecting right now. Please try again." }]);
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
                            placeholder="Ask about Budget, Subprojects..."
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
