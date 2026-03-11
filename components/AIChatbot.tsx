
// Author: 4K
import React, { useState, useRef, useEffect, useMemo } from 'react';
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
    onApplyFilter?: (filters: { region?: string; year?: string; search?: string; status?: string }) => void;
}

const BASE_SYSTEM_INSTRUCTION = `You are the AI Assistant for the 4K Information System.

**CRITICAL: Data Usage Rule**
- The system has **ALREADY computed** the answers for you.
- DO NOT calculate anything yourself.
- DO NOT assume data is missing if you don't see a list.
- Look specifically at the \`system_stats\` object in the context.
- If the user asks "How many", use \`filtered_results.<category>_count\`.
- If the user asks "How much" (budget/financial), use \`financial_summary.<category>_allocation\`.

**Response Style:**
1. **Direct Answer**: Start with the number or amount. "There are 163 IPOs in Region 2."
2. **Context**: Mention the filter applied (e.g., "in Region II" or "in Pampanga").
3. **No Fluff**: Do not say "Based on the provided data". Just give the answer.
4. **Currency**: Format PHP (e.g., ₱1.5M or PHP 1,500,000).

**Smart Navigation**
- To show MIMAROPA IPOs: \`[View MIMAROPA IPOs](/ipo?region=MIMAROPA Region)\`
- To show 2024 Subprojects: \`[View 2024 Subprojects](/subprojects?year=2024)\`
- To show Completed Subprojects: \`[View Completed Subprojects](/subprojects?status=Completed)\`
- To show Ongoing Trainings: \`[View Ongoing Trainings](/trainings?status=Ongoing)\`
- To show items in a location (e.g. Pampanga): \`[View Pampanga Items](/subprojects?search=Pampanga)\`
`;

const AIChatbot: React.FC<AIChatbotProps> = ({ 
    subprojects, ipos, activities, marketingPartners, 
    officeReqs, staffingReqs, otherProgramExpenses,
    onNavigate, onSelectSubproject, onSelectIpo, onSelectActivity, onSelectMarketingPartner,
    onApplyFilter
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string }[]>([
        { role: 'model', text: "Hello! I'm ready to help. Ask me 'How many Completed Subprojects in Region 2?' or 'How much is the budget for 2024?'" }
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
            const status = params.get('status') || undefined;
            
            // Apply filter globally
            onApplyFilter({ region, year, search, status });
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

    // Extract all unique locations from data for dynamic filtering
    const uniqueLocations = useMemo(() => {
        const locs = new Set<string>();
        const collect = (items: any[]) => {
            items.forEach(item => {
                if (item.location) {
                    // 1. Split by comma for major parts
                    const parts = item.location.split(',').map((p:string) => p.trim().toLowerCase());
                    parts.forEach((p: string) => {
                        // Add individual parts (e.g., "Porac", "Pampanga")
                        // Also strip common prefixes for better matching
                        const cleanPart = p.replace(/\b(brgy\.?|barangay|city|mun\.?|municipality|prov\.?|province|region|sitio|poblacion)\b/g, '').trim();
                        
                        if (cleanPart.length > 2) {
                            locs.add(cleanPart);
                            // Also split cleanPart by space to get individual words (e.g. "Antipolo" from "Antipolo City")
                            cleanPart.split(/\s+/).forEach(word => {
                                if (word.length > 3) locs.add(word);
                            });
                        }
                        
                        if (p.length > 2 && !['region', 'province', 'city', 'municipality', 'barangay', 'sitio', 'poblacion'].includes(p)) {
                            locs.add(p);
                        }
                    });
                }
            });
        };
        collect(subprojects);
        collect(ipos);
        collect(activities);
        return Array.from(locs).sort((a, b) => b.length - a.length); // Longest match first
    }, [subprojects, ipos, activities]);

    const normalizeText = (text: string) => {
        return text.toLowerCase()
            .replace(/\bbrgy\.?\b/g, 'barangay')
            .replace(/\bmun\.?\b/g, 'municipality')
            .replace(/\bprov\.?\b/g, 'province')
            .replace(/\breg\.?\b/g, 'region')
            .replace(/\b(city|municipality|province|barangay|region|sitio|poblacion)\b/g, '') // Strip for comparison
            .replace(/\s+/g, ' ')
            .trim();
    };

    /**
     * DYNAMIC QUERY ENGINE
     * Pre-calculates the exact answer locally to save AI tokens and quota.
     */
    const getDynamicContext = (query: string) => {
        const q = query.toLowerCase();
        
        // 1. Identify Year
        const yearMatch = q.match(/\b(20\d{2})\b/);
        const targetYear = yearMatch ? yearMatch[1] : null;

        // 2a. Identify Region Aliases
        const regionAliases: {[key: string]: string} = {
            'ilocos': 'Region I (Ilocos Region)', 'region 1': 'Region I (Ilocos Region)', 'region I': 'Region I (Ilocos Region)',
            'cagayan': 'Region II (Cagayan Valley)', 'region 2': 'Region II (Cagayan Valley)', 'region II': 'Region II (Cagayan Valley)',
            'central luzon': 'Region III (Central Luzon)', 'region 3': 'Region III (Central Luzon)', 'region III': 'Region III (Central Luzon)',
            'calabarzon': 'Region IV-A (CALABARZON)', '4a': 'Region IV-A (CALABARZON)', 'region 4a': 'Region IV-A (CALABARZON)',
            'mimaropa': 'MIMAROPA Region', '4b': 'MIMAROPA Region', 'region 4b': 'MIMAROPA Region',
            'bicol': 'Region V (Bicol Region)', 'region 5': 'Region V (Bicol Region)', 'region V': 'Region V (Bicol Region)',
            'western visayas': 'Region VI (Western Visayas)', 'region 6': 'Region VI (Western Visayas)', 'region VI': 'Region VI (Western Visayas)',
            'central visayas': 'Region VII (Central Visayas)', 'region 7': 'Region VII (Central Visayas)', 'region VII': 'Region VII (Central Visayas)',
            'eastern visayas': 'Region VIII (Eastern Visayas)', 'region 8': 'Region VIII (Eastern Visayas)', 'region VIII': 'Region VIII (Eastern Visayas)',
            'zamboanga': 'Region IX (Zamboanga Peninsula)', 'region 9': 'Region IX (Zamboanga Peninsula)', 'region IX': 'Region IX (Zamboanga Peninsula)',
            'northern mindanao': 'Region X (Northern Mindanao)', 'region 10': 'Region X (Northern Mindanao)', 'region X': 'Region X (Northern Mindanao)',
            'davao': 'Region XI (Davao Region)', 'region 11': 'Region XI (Davao Region)', 'region XI': 'Region XI (Davao Region)',
            'soccsksargen': 'Region XII (SOCCSKSARGEN)', 'region 12': 'Region XII (SOCCSKSARGEN)', 'region XII': 'Region XII (SOCCSKSARGEN)',
            'caraga': 'Region XIII (Caraga)', 'region 13': 'Region XIII (Caraga)', 'region XIII': 'Region XIII (Caraga)',
            'ncr': 'National Capital Region (NCR)', 'metro manila': 'National Capital Region (NCR)',
            'car': 'Cordillera Administrative Region (CAR)', 'cordillera': 'Cordillera Administrative Region (CAR)',
            'barmm': 'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)', 'bangsamoro': 'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)',
            'nir': 'Negros Island Region (NIR)', 'negros': 'Negros Island Region (NIR)'
        };
        
        let targetRegion: string | null = null;
        const sortedAliases = Object.keys(regionAliases).sort((a,b) => b.length - a.length);
        
        for (const alias of sortedAliases) {
            if (q.includes(alias)) {
                targetRegion = regionAliases[alias];
                break;
            }
        }

        // 2b. Identify Status
        const statusKeywords = ['proposed', 'ongoing', 'completed', 'cancelled'];
        let targetStatus: string | null = null;
        for (const s of statusKeywords) {
            if (q.includes(s)) {
                targetStatus = s.charAt(0).toUpperCase() + s.slice(1);
                break;
            }
        }

        // 2c. Identify Location Aliases (Province/City)
        const locationAliases: {[key: string]: string} = {
            'cam sur': 'Camarines Sur',
            'cam norte': 'Camarines Norte',
            'gen san': 'General Santos',
            'zambo sur': 'Zamboanga del Sur',
            'zambo norte': 'Zamboanga del Norte',
            'zambo sibugay': 'Zamboanga Sibugay',
            'occ mindoro': 'Occidental Mindoro',
            'or mindoro': 'Oriental Mindoro',
            'mis occ': 'Misamis Occidental',
            'mis or': 'Misamis Oriental',
            'neg occ': 'Negros Occidental',
            'neg or': 'Negros Oriental',
            'davao occ': 'Davao Occidental',
            'surigao sur': 'Surigao del Sur',
            'surigao norte': 'Surigao del Norte',
            'agusan sur': 'Agusan del Sur',
            'agusan norte': 'Agusan del Norte',
            'lanao sur': 'Lanao del Sur',
            'lanao norte': 'Lanao del Norte',
            'north cot': 'North Cotabato',
            'south cot': 'South Cotabato',
            'samar': 'Samar', // Could be Western, Northern, Eastern, but 'Samar' usually refers to Western Samar or the island. 
                              // However, strict matching might fail if data says "Western Samar". 
                              // Leaving generic ones out to avoid over-matching unless specific.
        };

        const targetLocations: string[] = [];
        const sortedLocationAliases = Object.keys(locationAliases).sort((a,b) => b.length - a.length);

        // Check aliases first
        for (const alias of sortedLocationAliases) {
            if (q.includes(alias)) {
                targetLocations.push(locationAliases[alias].toLowerCase()); // Push the full name
                // We will remove the alias from cleanQuery later
            }
        }

        // 2d. Identify Locations (Province/Municipality/Barangay) from data - Support Multiple
        const normalizedQuery = normalizeText(q);
        
        for (const loc of uniqueLocations) {
            const locLower = loc.toLowerCase();
            const normalizedLoc = normalizeText(locLower);
            
            // Check if normalized query contains normalized location
            if (normalizedQuery.includes(normalizedLoc) && normalizedLoc.length > 1) {
                if (!targetLocations.some(l => normalizeText(l).includes(normalizedLoc) || normalizedLoc.includes(normalizeText(l)))) {
                    targetLocations.push(locLower);
                }
            }
        }

        // 2e. Identify Tier and Fund Type
        const tierMatch = q.match(/tier\s*([12])/i);
        const targetTier = tierMatch ? `Tier ${tierMatch[1]}` : null;

        const fundTypeKeywords = ['current', 'continuing', 'unprogrammed'];
        let targetFundType: string | null = null;
        for (const ft of fundTypeKeywords) {
            if (q.includes(ft)) {
                targetFundType = ft.charAt(0).toUpperCase() + ft.slice(1);
                break;
            }
        }

        // 2f. Identify Topic Keywords (Commodities, Types, etc.)
        // Remove known entities from query to isolate topics
        let cleanQuery = q;
        if (targetYear) cleanQuery = cleanQuery.replace(targetYear, '');
        if (targetTier) cleanQuery = cleanQuery.replace(new RegExp(`tier\\s*${tierMatch?.[1]}`, 'i'), '');
        if (targetFundType) cleanQuery = cleanQuery.replace(targetFundType.toLowerCase(), '');
        if (targetRegion) {
             // Remove the alias that matched
             for (const alias of sortedAliases) {
                if (q.includes(alias)) {
                    cleanQuery = cleanQuery.replace(alias, '');
                    break;
                }
             }
        }
        if (targetStatus) cleanQuery = cleanQuery.replace(targetStatus.toLowerCase(), '');
        
        // Remove location aliases
        for (const alias of sortedLocationAliases) {
            if (q.includes(alias)) {
                cleanQuery = cleanQuery.replace(alias, '');
            }
        }
        
        targetLocations.forEach(l => {
            // Remove the full location name if present
            cleanQuery = cleanQuery.replace(l, '');
        });
        
        // Remove original unique locations from query just in case
        for (const loc of uniqueLocations) {
            if (q.includes(loc)) cleanQuery = cleanQuery.replace(loc, '');
        }

        const stopWords = [
            'how', 'many', 'much', 'is', 'the', 'in', 'at', 'of', 'with', 'for', 'on', 'by',
            'projects', 'project', 'subprojects', 'subproject', 'ipos', 'ipo', 
            'activities', 'activity', 'trainings', 'training', 
            'budget', 'cost', 'total', 'list', 'show', 'me', 'are', 'there', 'allocation', 'fund', 'funding',
            'type', 'types', 'kind', 'kinds', 'category', 'categories',
            'district', 'districts', 'province', 'provinces', 'municipality', 'municipalities', 'city', 'cities', 'barangay', 'barangays', 'region', 'regions',
            'have', 'has'
        ];
        
        const potentialKeywords = cleanQuery.split(/[\s,?.!]+/).filter(w => w.length > 2 && !stopWords.includes(w));
        const targetKeywords = [...new Set(potentialKeywords)]; // Unique keywords

        // 3. Filter Data based on detected Intent (Backend Query Logic)
        const filterItem = (item: any) => {
            let match = true;
            // Year Filter
            if (targetYear) {
                const y = item.fundingYear || item.fundYear || (item.date ? new Date(item.date).getFullYear() : null);
                if (y && y.toString() !== targetYear) match = false;
            }
            // Tier Filter
            if (targetTier) {
                if (item.tier && item.tier !== targetTier) match = false;
            }
            // Fund Type Filter
            if (targetFundType) {
                if (item.fundType && item.fundType !== targetFundType) match = false;
            }
            // Region Filter
            if (targetRegion) {
                let itemRegion = item.region || '';
                if (!itemRegion && item.operatingUnit && ouToRegionMap[item.operatingUnit]) {
                    itemRegion = ouToRegionMap[item.operatingUnit];
                }
                if (!itemRegion && item.location) {
                    if (item.location.toLowerCase().includes(targetRegion.toLowerCase())) itemRegion = targetRegion;
                }

                if (itemRegion !== targetRegion) {
                    match = false;
                }
            }
            // Location Filter (Province/City/Barangay) - MUST MATCH ALL TARGET LOCATIONS
            if (targetLocations.length > 0) {
                const loc = normalizeText(item.location || '');
                // Check if ALL target locations are present in the item's location string
                const allLocationsMatch = targetLocations.every(target => loc.includes(normalizeText(target)));
                if (!allLocationsMatch) {
                    match = false;
                }
            }
            // Status Filter
            if (targetStatus) {
                if (item.status && item.status !== targetStatus) match = false;
                if (!item.status && (q.includes('subproject') || q.includes('training') || q.includes('activity'))) match = false;
            }

            // Keyword Filter (Commodities, Types, etc.)
            if (targetKeywords.length > 0) {
                const itemString = JSON.stringify(item).toLowerCase();
                
                let searchableText = (item.name || '') + ' ' + 
                                     (item.description || '') + ' ' + 
                                     (item.location || '') + ' ' + 
                                     (item.packageType || '') + ' ' + 
                                     (item.particulars || '') + ' ' + 
                                     (item.component || '') + ' ' + // Added component for activities
                                     (item.type || '');              // Added type
                
                // Add commodities/details
                if (item.subprojectCommodities) {
                    searchableText += ' ' + item.subprojectCommodities.map((c: any) => c.name + ' ' + c.typeName).join(' ');
                }
                if (item.details) {
                    searchableText += ' ' + item.details.map((d: any) => d.particulars + ' ' + d.type).join(' ');
                }
                if (item.commodities) { // IPO commodities
                    searchableText += ' ' + item.commodities.map((c: any) => c.particular + ' ' + c.type).join(' ');
                }

                searchableText = searchableText.toLowerCase();
                
                const allKeywordsMatch = targetKeywords.every(kw => searchableText.includes(kw));
                if (!allKeywordsMatch) match = false;
            }

            return match;
        };

        const filteredSubprojects = subprojects.filter(filterItem);
        const filteredTrainings = activities.filter(a => a.type === 'Training').filter(filterItem);
        const filteredActivities = activities.filter(a => a.type === 'Activity').filter(filterItem);
        
        const filteredIPOs = ipos.filter(i => {
            // Apply year filter for IPOs (based on registration)
            if (targetYear && new Date(i.registrationDate).getFullYear().toString() !== targetYear) return false;
            if (targetRegion && i.region !== targetRegion) return false;
            
            // Location Filter for IPOs
            if (targetLocations.length > 0) {
                const loc = normalizeText(i.location || '');
                const allLocationsMatch = targetLocations.every(target => loc.includes(normalizeText(target)));
                if (!allLocationsMatch) return false;
            }

            // Keyword Filter for IPOs
            if (targetKeywords.length > 0) {
                 let searchableText = (i.name || '') + ' ' + (i.indigenousCulturalCommunity || '') + ' ' + (i.location || '');
                 if (i.commodities) {
                    searchableText += ' ' + i.commodities.map((c: any) => c.particular + ' ' + c.type).join(' ');
                 }
                 searchableText = searchableText.toLowerCase();
                 const selfMatch = targetKeywords.every(kw => searchableText.includes(kw));
                 
                 // Joint Query Logic: Check if this IPO has any matching subprojects
                 // If the IPO itself doesn't match the keywords (e.g. "Coffee"), check if it has a subproject that does.
                 // We use filteredSubprojects because it already contains subprojects matching the keywords (and other filters).
                 const hasMatchingSubproject = filteredSubprojects.some(sp => sp.indigenousPeopleOrganization === i.name);

                 if (!selfMatch && !hasMatchingSubproject) return false;
            }

            return true;
        });
        
        // 4. PRE-CALCULATE FINANCIALS (The "Formula")
        const calculateBudget = (items: any[], type: 'sp' | 'act') => {
            if (type === 'sp') {
                return items.reduce((sum, sp) => sum + (sp.amount || 0), 0);
            } else {
                return items.reduce((sum, act) => 
                    sum + (act.expenses?.reduce((eSum: number, e: any) => eSum + (e.amount || 0), 0) || 0), 0);
            }
        };

        const subprojectBudget = calculateBudget(filteredSubprojects, 'sp');
        const trainingBudget = calculateBudget(filteredTrainings, 'act');
        const activityBudget = calculateBudget(filteredActivities, 'act');
        const totalAllocation = subprojectBudget + trainingBudget + activityBudget;

        // 5. Build Minimized Context (Payload Optimization)
        const stats = {
            filters_applied: { 
                year: targetYear || "All Years", 
                tier: targetTier || "All Tiers",
                fundType: targetFundType || "All Fund Types",
                region: targetRegion || "All Regions (National)",
                location: targetLocations.length > 0 ? targetLocations.join(', ') : "None",
                status: targetStatus || "All Statuses",
                keywords: targetKeywords.length > 0 ? targetKeywords.join(', ') : "None"
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
            }
        };

        const context: any = { system_stats: stats };

        // 6. Conditionally add list data only if NOT an aggregate question
        const isAggregateQuestion = q.includes('how much') || q.includes('how many') || q.includes('total') || q.includes('count') || q.includes('sum') || q.includes('budget');

        if (!isAggregateQuestion) {
            const maxItems = 5; 
            if (q.includes('ipo') || q.includes('organization')) {
                context.ipos_list = filteredIPOs.slice(0, maxItems).map(i => ({ name: i.name, location: i.location }));
            }
            if (q.includes('subproject')) {
                context.subprojects_list = filteredSubprojects.slice(0, maxItems).map(s => ({ name: s.name, budget: calculateBudget([s], 'sp'), status: s.status }));
            }
            if (q.includes('training')) {
                context.trainings_list = filteredTrainings.slice(0, maxItems).map(t => ({ name: t.name, budget: calculateBudget([t], 'act'), status: t.status }));
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

        // Strict API Key Retrieval
        const apiKey = process.env.API_KEY || (import.meta as any).env.VITE_API_KEY;
        
        if (!apiKey) {
             setMessages(prev => [...prev, { role: 'model', text: "Error: API Key is missing. Please check your configuration." }]);
             setIsLoading(false);
             return;
        }

        try {
            // Build minimized context based on query
            const dynamicContext = getDynamicContext(userMessage);
            const systemPrompt = `${BASE_SYSTEM_INSTRUCTION}\n\n[REAL-TIME DATA CONTEXT]\n${dynamicContext}`;

            const ai = new GoogleGenAI({ apiKey });
            
            const chat = ai.chats.create({
                model: 'gemini-3-flash-preview', 
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
            let errorMsg = "I'm having trouble connecting right now.";
            if (error.message?.includes('429')) {
                errorMsg = "I've reached my usage limit for now. Please try again later.";
            } else if (error.message?.includes('400')) {
                errorMsg = "I couldn't process that request. Please try rephrasing.";
            }
            setMessages(prev => [...prev, { role: 'model', text: errorMsg }]);
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
