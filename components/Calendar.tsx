
// Author: 4K
import React, { useState, useMemo } from 'react';
import { Subproject, Activity, SystemSettings } from '../constants';

export interface CalendarEvent {
    id: string;
    title: string;
    type: 'Training' | 'Subproject Start' | 'Subproject End' | 'Deadline' | 'Planning' | 'Activity';
    borderColor: string; // Used for the border indicator
    bgColor: string; // Used for the card background
    textColor: string; // Used for text color
    originalData?: any;
    dataId?: number;
    dataType?: 'Subproject' | 'Training' | 'Activity';
}

interface CalendarProps {
    subprojects: Subproject[];
    activities: Activity[]; // Includes Trainings
    systemSettings: SystemSettings;
    onDateClick: (date: Date, events: CalendarEvent[]) => void;
}

const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const Calendar: React.FC<CalendarProps> = ({ subprojects, activities, systemSettings, onDateClick }) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
    const getFirstDayOfMonth = (y: number, m: number) => {
        const day = new Date(y, m, 1).getDay();
        return day === 0 ? 6 : day - 1; // Adjust so 0 = Mon, 6 = Sun
    };

    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);

    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
    const goToToday = () => setCurrentDate(new Date());

    // --- Helper to determine status styles ---
    const getStatusStyles = (isCompleted: boolean, dateToCheck: string, defaultBorder: string) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Parse dateToCheck (YYYY-MM-DD) to local time for comparison
        const [y, m, d] = dateToCheck.split('-').map(Number);
        const targetDate = new Date(y, m - 1, d);

        if (isCompleted) {
            return {
                bgColor: 'bg-emerald-100 dark:bg-emerald-900/60',
                borderColor: 'border-emerald-600',
                textColor: 'text-emerald-900 dark:text-emerald-100'
            };
        } else if (targetDate < today) {
            // Past Due / Uncompleted
            return {
                bgColor: 'bg-red-100 dark:bg-red-900/60',
                borderColor: 'border-red-600',
                textColor: 'text-red-900 dark:text-red-100'
            };
        } else {
            // Future / Planned
            return {
                bgColor: 'bg-white dark:bg-gray-700/50',
                borderColor: defaultBorder,
                textColor: 'text-gray-800 dark:text-gray-200'
            };
        }
    };

    // --- Event Aggregation ---
    const eventsByDate = useMemo(() => {
        const events: Record<string, CalendarEvent[]> = {};

        const addEvent = (dateStr: string, event: CalendarEvent) => {
            if (!dateStr) return;
            // Parse YYYY-MM-DD
            const [y, m, d] = dateStr.split('-').map(Number);
            // Create key as YYYY-M-D (no leading zeros to match grid logic easily)
            const key = `${y}-${m - 1}-${d}`;
            
            if (!events[key]) events[key] = [];
            events[key].push(event);
        };

        // 1. Subprojects (Start and End markers only, as requested)
        subprojects.forEach(sp => {
            const isCompleted = sp.status === 'Completed';
            
            if (sp.startDate) {
                const styles = getStatusStyles(isCompleted, sp.startDate, 'border-blue-500');
                addEvent(sp.startDate, {
                    id: `sp-start-${sp.id}`,
                    title: `Start: ${sp.name}`,
                    type: 'Subproject Start',
                    ...styles,
                    originalData: sp,
                    dataId: sp.id,
                    dataType: 'Subproject'
                });
            }
            if (sp.estimatedCompletionDate) {
                const styles = getStatusStyles(isCompleted, sp.estimatedCompletionDate, 'border-red-500');
                addEvent(sp.estimatedCompletionDate, {
                    id: `sp-end-${sp.id}`,
                    title: `Target: ${sp.name}`,
                    type: 'Subproject End',
                    ...styles,
                    originalData: sp,
                    dataId: sp.id,
                    dataType: 'Subproject'
                });
            }
        });

        // 2. Activities (Trainings & Others) - Multi-day logic
        activities.forEach(act => {
            if (act.date) {
                const isCompleted = act.status === 'Completed' || !!act.actualDate;
                
                // Determine start date components
                const [startY, startM, startD] = act.date.split('-').map(Number);
                let currentLoopDate = new Date(startY, startM - 1, startD);
                
                // Determine end date components (fallback to start date if no end date)
                let endLoopDate = new Date(startY, startM - 1, startD);
                if (act.endDate && act.endDate !== act.date) {
                     const [endY, endM, endD] = act.endDate.split('-').map(Number);
                     endLoopDate = new Date(endY, endM - 1, endD);
                }

                // Check against End Date for Overdue status usually, but we apply style to all blocks
                // We use the 'endDate' (or date) to determine if the whole activity is past due
                const effectiveEndDateStr = act.endDate || act.date;
                const styles = getStatusStyles(isCompleted, effectiveEndDateStr, 'border-green-500');

                // Loop through all days
                while (currentLoopDate <= endLoopDate) {
                    const yearStr = currentLoopDate.getFullYear();
                    const monthStr = currentLoopDate.getMonth() + 1;
                    const dayStr = currentLoopDate.getDate();
                    const dateKey = `${yearStr}-${monthStr.toString().padStart(2, '0')}-${dayStr.toString().padStart(2, '0')}`;

                    addEvent(dateKey, {
                        id: `act-${act.id}-${dateKey}`,
                        title: act.name,
                        type: act.type === 'Training' ? 'Training' : 'Activity',
                        ...styles,
                        originalData: act,
                        dataId: act.id,
                        dataType: act.type === 'Training' ? 'Training' : 'Activity'
                    });

                    // Next day
                    currentLoopDate.setDate(currentLoopDate.getDate() + 1);
                }
            }
        });

        // 3. Deadlines (System Settings) - Treat as Planned always (White)
        systemSettings.deadlines.forEach(dl => {
            if (dl.date) {
                addEvent(dl.date, {
                    id: `dl-${dl.id}`,
                    title: `Deadline: ${dl.name}`,
                    type: 'Deadline',
                    borderColor: 'border-orange-500',
                    bgColor: 'bg-white dark:bg-gray-700/50',
                    textColor: 'text-gray-800 dark:text-gray-200'
                });
            }
        });

        // 4. Planning Schedules (Mark each day in range) - Treat as Planned (White/Purple)
        systemSettings.planningSchedules.forEach(ps => {
            if (ps.startDate && ps.endDate) {
                let current = new Date(ps.startDate);
                const end = new Date(ps.endDate);
                
                while (current <= end) {
                    const dateStr = current.toISOString().split('T')[0];
                    addEvent(dateStr, {
                        id: `ps-${ps.id}-${dateStr}`,
                        title: ps.name,
                        type: 'Planning',
                        borderColor: 'border-purple-400',
                        bgColor: 'bg-white dark:bg-gray-700/50',
                        textColor: 'text-gray-800 dark:text-gray-200'
                    });
                    current.setDate(current.getDate() + 1);
                }
            }
        });

        return events;
    }, [subprojects, activities, systemSettings]);

    // --- Render Grid ---
    const renderCells = () => {
        const cells = [];
        // Empty cells for previous month
        for (let i = 0; i < firstDay; i++) {
            cells.push(<div key={`empty-${i}`} className="h-24 md:h-32 bg-gray-50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700"></div>);
        }

        const today = new Date();
        const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

        for (let day = 1; day <= daysInMonth; day++) {
            const key = `${year}-${month}-${day}`;
            const dayEvents = eventsByDate[key] || [];
            const isToday = isCurrentMonth && today.getDate() === day;

            // Updated styling for Today's box
            const boxClass = isToday 
                ? 'bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-500 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.5)]' 
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50';

            // Updated styling for Today's number
            const numberClass = isToday
                ? 'text-emerald-700 dark:text-emerald-300 font-bold text-lg'
                : 'text-gray-700 dark:text-gray-300 font-semibold';

            cells.push(
                <div 
                    key={day} 
                    onClick={() => onDateClick(new Date(year, month, day), dayEvents)}
                    className={`h-24 md:h-32 relative group transition-colors cursor-pointer flex flex-col p-1 overflow-hidden ${boxClass}`}
                >
                    <span className={`text-sm mb-1 ml-1 ${numberClass}`}>
                        {day}
                    </span>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 pr-0.5">
                        {dayEvents.map((evt, idx) => (
                            <div 
                                key={idx} 
                                className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] md:text-xs border-l-4 truncate shadow-sm ${evt.bgColor} ${evt.borderColor} ${evt.textColor}`}
                                title={evt.title}
                            >
                                <span className="truncate font-medium">{evt.title}</span>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }
        return cells;
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-lg shadow-lg">
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
                <button onClick={prevMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
                    <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                        {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </h2>
                    <button onClick={goToToday} className="text-sm font-medium text-emerald-600 hover:underline">Today</button>
                </div>
                <button onClick={nextMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
                    <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
            </div>

            {/* Days Header */}
            <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                {daysOfWeek.map(day => (
                    <div key={day} className="py-2 text-center text-sm font-semibold text-gray-500 dark:text-gray-400">
                        {day}
                    </div>
                ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-7 flex-1">
                {renderCells()}
            </div>
            
            {/* Legend */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-x-6 gap-y-2 text-xs text-gray-600 dark:text-gray-400 justify-center">
                <div className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-emerald-100 border-l-4 border-emerald-600 rounded-sm"></span>
                    <span>Completed</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-red-100 border-l-4 border-red-600 rounded-sm"></span>
                    <span>Past Due / Incomplete</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-white border border-gray-200 border-l-4 border-blue-500 rounded-sm"></span>
                    <span>Planned SP Start</span>
                </div>
                 <div className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-white border border-gray-200 border-l-4 border-green-500 rounded-sm"></span>
                    <span>Planned Activity</span>
                </div>
                 <div className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-emerald-100 border border-emerald-500 rounded-sm"></span>
                    <span>Current Date</span>
                </div>
            </div>
        </div>
    );
};

export default Calendar;
