
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

**CRITICAL: Hyperlink Formatting**
You MUST use Markdown format for all links: \`[Link Text](URL)\`.
- **CORRECT:** "You can view the [IPO List](/ipo)."
- **INCORRECT:** "You can view the list at [/ipo]." or "Go to /ipo".

**Response Style:**
1. **Be Concise**: Summarize data. Do not list more than 5 items unless asked.
2. **Data Driven**: Use the provided context 'system_stats' and 'filtered_results' to answer specific counting questions.
3. **Navigation Routes**:
   - Lists: \`/dashboards\`, \`/subprojects\`, \`/activities\`, \`/ipo\`, \`/marketing-database\`, \`/program-management\`, \`/reports\`
   - Details: \`/subproject/UID\`, \`/ipo/Name\`, \`/activity/UID\`

**Context Handling:**
If the user asks about a specific year (e.g., 2026) or region (e.g., Region 7), verify the data in the context matches that criteria before answering. If no data matches, explicitly state: "I found no records for [Region/Year] in the current database."
`;

const AIChatbot: React.FC<AIChatbotProps> = ({ 
    subprojects, ipos, activities, marketingPartners, 
    officeReqs, staffingReqs, otherProgramExpenses,
    onNavigate, onSelectSubproject, onSelectIpo, onSelectActivity, onSelectMarketingPartner
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string }[]>([
        { role: 'model', text: "Hello! I'm the 4K Assistant. Ask me about subprojects, IPOs, or reports." }
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

    // Handle Link Clicks
    const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
        e.preventDefault();
        
        if (href.startsWith('/') && !href.split('/')[2]) {
            onNavigate(href);
            return;
        }

        const parts = href.split('/');
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
            onNavigate(href);
        }
    };

    // Render markdown links
    const renderMessage = (text: string) => {
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

    /**
     * DYNAMIC CONTEXT BUILDER
     * Intelligent filtering to handle "Region 7" -> "Region VII" and specific years.
     */
    const getDynamicContext = (query: string) => {
        const q = query.toLowerCase();
        
        // 1. Identify Year
        const yearMatch = q.match(/\b(20\d{2})\b/);
        const targetYear = yearMatch ? yearMatch[1] : null;

        // 2. Identify Region (Arabic to Roman normalization)
        const arabicToRoman: {[key: string]: string} = {
            '1': 'I', '2': 'II', '3': 'III', '4a': 'IV-A', '4b': 'IV-B',
            '5': 'V', '6': 'VI', '7': 'VII', '8': 'VIII', '9': 'IX', '10': 'X',
            '11': 'XI', '12': 'XII', '13': 'XIII'
        };
        
        // Detect "Region X" or just "Region"
        let targetRegion: string | null = null;
        
        // Check for "Region <number/letter>" pattern
        const regionPattern = /region\s*(\d+[ab]?)/i;
        const regionMatch = q.match(regionPattern);
        
        if (regionMatch) {
            const num = regionMatch[1].toLowerCase();
            const roman = arabicToRoman[num];
            if (roman) targetRegion = `Region ${roman}`;
        } else {
            // Fallback: check exact strings in philippineRegions
            const found = philippineRegions.find(r => q.includes(r.toLowerCase()) || q.includes(r.split(' ')[0].toLowerCase()));
            if (found) targetRegion = found;
        }

        // Helper: Generic Filter
        const filterItem = (item: any) => {
            let match = true;
            
            // Year Filter
            if (targetYear) {
                const y = item.fundingYear || item.fundYear || (item.date ? new Date(item.date).getFullYear() : null) || (item.registrationDate ? new Date(item.registrationDate).getFullYear() : null);
                if (y && y.toString() !== targetYear) match = false;
            }

            // Region Filter
            if (targetRegion) {
                // Build a searchable string that includes direct location AND mapped OU region
                let locationStr = (item.region || item.location || item.operatingUnit || '').toLowerCase();
                
                // Map OU to Region if available (e.g. RPMO 7 -> Region VII)
                if (item.operatingUnit && ouToRegionMap[item.operatingUnit]) {
                    locationStr += ' ' + ouToRegionMap[item.operatingUnit].toLowerCase();
                }

                // Simple fuzzy check against targetRegion (e.g. "region vii") or its numeral part "vii"
                const tr = targetRegion.toLowerCase();
                const trShort = targetRegion.split(' ')[1]?.toLowerCase();
                
                if (!locationStr.includes(tr) && (!trShort || !locationStr.includes(trShort))) {
                    match = false;
                }
            }

            return match;
        };

        // 3. Pre-calculate Intersections (Fix for "how many IPOs with subprojects...")
        const filteredSubprojects = subprojects.filter(filterItem);
        const filteredTrainings = activities.filter(a => a.type === 'Training').filter(filterItem);
        
        const iposWithFilteredSP = new Set(filteredSubprojects.map(s => s.indigenousPeopleOrganization));
        const iposWithFilteredTrainings = new Set(filteredTrainings.flatMap(t => t.participatingIpos));

        // 4. Build Stats (Always Included)
        const stats = {
            counts: {
                total_subprojects: subprojects.length,
                total_ipos: ipos.length,
                total_trainings: activities.filter(a => a.type === 'Training').length,
            },
            filters_applied: { year: targetYear, region: targetRegion },
            filtered_results: {
                subprojects_count: filteredSubprojects.length,
                trainings_count: filteredTrainings.length,
                // These are critical for the user's specific questions
                unique_ipos_with_matching_subprojects: iposWithFilteredSP.size,
                unique_ipos_with_matching_trainings: iposWithFilteredTrainings.size
            }
        };

        const context: any = { system_stats: stats };

        // 5. Filter & Slice Data Lists for detailed view
        const maxItems = 20;

        // If asking about IPOs
        if (q.includes('ipo') || q.includes('organization') || q.includes('farmer')) {
            let filtered = ipos.filter(filterItem);
            context.ipos = filtered.slice(0, maxItems).map(i => ({
                name: i.name, region: i.region, members: i.totalMembers, regDate: i.registrationDate
            }));
        }

        // If asking about Subprojects
        if (q.includes('subproject') || q.includes('project') || q.includes('livelihood')) {
            context.subprojects = filteredSubprojects.slice(0, maxItems).map(s => ({
                uid: s.uid, name: s.name, status: s.status, location: s.location, year: s.fundingYear, ipo: s.indigenousPeopleOrganization
            }));
        }

        // If asking about Activities / Trainings
        if (q.includes('training') || q.includes('activity')) {
            let filtered = activities.filter(filterItem);
            context.activities = filtered.slice(0, maxItems).map(a => ({
                uid: a.uid, name: a.name, type: a.type, date: a.date, location: a.location, participants: (a.participantsMale + a.participantsFemale)
            }));
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
             setMessages(prev => [...prev, { role: 'model', text: "Error: API Key is missing. Please check system configuration." }]);
             setIsLoading(false);
             return;
        }

        try {
            // Build minimized context based on query
            const dynamicContext = getDynamicContext(userMessage);
            const systemPrompt = `${BASE_SYSTEM_INSTRUCTION}\n\n[RELEVANT DATA CONTEXT]\n${dynamicContext}`;

            const ai = new GoogleGenAI({ apiKey });
            
            // Use 'gemini-flash-lite-latest' for speed and cost efficiency
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
            
            let friendlyMessage = "I'm currently overwhelmed. Please try asking again in a moment.";
            if (error.message && (error.message.includes('429') || error.message.includes('Quota'))) {
                friendlyMessage = "I'm receiving too many requests right now. Please wait a few seconds.";
            } else if (error.message && error.message.includes('API key')) {
                friendlyMessage = "Configuration Error: Invalid AI Key.";
            }

            setMessages(prev => [...prev, { role: 'model', text: `⚠️ ${friendlyMessage}` }]);
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
