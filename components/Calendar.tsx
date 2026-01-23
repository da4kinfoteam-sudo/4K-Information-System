
// Author: 4K
import React, { useState, useMemo } from 'react';
import { Subproject, Activity, SystemSettings } from '../constants';

export interface CalendarEvent {
    id: string;
    title: string;
    type: 'Training' | 'Subproject Start' | 'Subproject End' | 'Deadline' | 'Planning';
    color: string;
    originalData?: any;
    dataId?: number; // ID for opening detail modal
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

        // 1. Subprojects
        subprojects.forEach(sp => {
            if (sp.startDate) {
                addEvent(sp.startDate, {
                    id: `sp-start-${sp.id}`,
                    title: `Start: ${sp.name}`,
                    type: 'Subproject Start',
                    color: 'bg-blue-500',
                    originalData: sp,
                    dataId: sp.id,
                    dataType: 'Subproject'
                });
            }
            if (sp.estimatedCompletionDate) {
                addEvent(sp.estimatedCompletionDate, {
                    id: `sp-end-${sp.id}`,
                    title: `Target End: ${sp.name}`,
                    type: 'Subproject End',
                    color: 'bg-red-500',
                    originalData: sp,
                    dataId: sp.id,
                    dataType: 'Subproject'
                });
            }
        });

        // 2. Activities (Trainings & Others)
        activities.forEach(act => {
            if (act.date) {
                addEvent(act.date, {
                    id: `act-${act.id}`,
                    title: act.name,
                    type: 'Training',
                    color: 'bg-green-500',
                    originalData: act,
                    dataId: act.id,
                    dataType: act.type === 'Training' ? 'Training' : 'Activity'
                });
            }
        });

        // 3. Deadlines
        systemSettings.deadlines.forEach(dl => {
            if (dl.date) {
                addEvent(dl.date, {
                    id: `dl-${dl.id}`,
                    title: `Deadline: ${dl.name}`,
                    type: 'Deadline',
                    color: 'bg-orange-500'
                });
            }
        });

        // 4. Planning Schedules (Mark each day in range)
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
                        color: 'bg-purple-400'
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

            cells.push(
                <div 
                    key={day} 
                    onClick={() => onDateClick(new Date(year, month, day), dayEvents)}
                    className={`h-24 md:h-32 border border-gray-200 dark:border-gray-700 relative group hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer flex flex-col p-1 ${isToday ? 'bg-blue-50 dark:bg-blue-900/10' : 'bg-white dark:bg-gray-800'}`}
                >
                    <span className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full mb-1 ${isToday ? 'bg-accent text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                        {day}
                    </span>
                    
                    <div className="flex-1 overflow-y-hidden space-y-1">
                        {dayEvents.slice(0, 3).map((evt, idx) => (
                            <div key={idx} className="flex items-center gap-1 text-[10px] md:text-xs text-gray-600 dark:text-gray-300 truncate">
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${evt.color}`}></span>
                                <span className="truncate">{evt.title}</span>
                            </div>
                        ))}
                        {dayEvents.length > 3 && (
                            <div className="text-[10px] text-gray-400 pl-3">
                                + {dayEvents.length - 3} more
                            </div>
                        )}
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
                    <button onClick={goToToday} className="text-sm font-medium text-accent hover:underline">Today</button>
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
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-4 text-xs text-gray-600 dark:text-gray-400 justify-center">
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-500"></span>Subproject Start</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500"></span>Target Completion</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-500"></span>Training/Activity</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-orange-500"></span>Deadline</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-purple-400"></span>Planning Schedule</div>
            </div>
        </div>
    );
};

export default Calendar;
