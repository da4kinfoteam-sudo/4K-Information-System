
// Author: 4K
import React, { useState, useMemo, useEffect } from 'react';
import { Subproject, Activity, SystemSettings } from '../constants';

export interface CalendarEvent {
    id: string;
    title: string;
    type: 'Training' | 'Subproject Start' | 'Subproject End' | 'Deadline' | 'Planning' | 'Activity' | 'Holiday';
    borderColor: string;
    bgColor: string;
    textColor: string;
    originalData?: any;
    dataId?: number;
    dataType?: 'Subproject' | 'Training' | 'Activity';
}

interface CalendarProps {
    activities: Activity[];
    systemSettings: SystemSettings;
    onDateClick: (date: Date, events: CalendarEvent[]) => void;
    onEventClick: (event: CalendarEvent) => void;
}

const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Holiday {
    date: string;
    localName: string;
    name: string;
    countryCode: string;
    fixed: boolean;
    global: boolean;
    counties: string[] | null;
    launchYear: number | null;
    types: string[];
}

const Calendar: React.FC<CalendarProps> = ({ activities, systemSettings, onDateClick, onEventClick }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [holidays, setHolidays] = useState<Holiday[]>([]);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
    
    // Sunday is 0, Monday is 1, etc. No adjustment needed for Sunday start.
    const getFirstDayOfMonth = (y: number, m: number) => {
        return new Date(y, m, 1).getDay();
    };

    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);

    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
    const goToToday = () => setCurrentDate(new Date());

    useEffect(() => {
        const fetchHolidays = async () => {
            try {
                const response = await fetch(`https://date.nager.at/api/v3/publicholidays/${year}/PH`);
                if (response.ok) {
                    const data = await response.json();
                    setHolidays(data);
                }
            } catch (error) {
                console.error("Failed to fetch holidays", error);
            }
        };
        fetchHolidays();
    }, [year]);

    const getStatusStyles = (isCompleted: boolean, dateToCheck: string, defaultBorder: string) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const [y, m, d] = dateToCheck.split('-').map(Number);
        const targetDate = new Date(y, m - 1, d);

        if (isCompleted) {
            return {
                bgColor: 'bg-emerald-100 dark:bg-emerald-900/60',
                borderColor: 'border-emerald-600',
                textColor: 'text-emerald-900 dark:text-emerald-100'
            };
        } else if (targetDate < today) {
            return {
                bgColor: 'bg-red-100 dark:bg-red-900/60',
                borderColor: 'border-red-600',
                textColor: 'text-red-900 dark:text-red-100'
            };
        } else {
            return {
                bgColor: 'bg-white dark:bg-gray-700/50',
                borderColor: defaultBorder,
                textColor: 'text-gray-800 dark:text-gray-200'
            };
        }
    };

    const eventsByDate = useMemo(() => {
        const events: Record<string, CalendarEvent[]> = {};

        const addEvent = (dateStr: string, event: CalendarEvent) => {
            if (!dateStr) return;
            const [y, m, d] = dateStr.split('-').map(Number);
            const key = `${y}-${m - 1}-${d}`;
            
            if (!events[key]) events[key] = [];
            events[key].push(event);
        };

        (activities || []).forEach(act => {
            if (act.date) {
                const isCompleted = act.status === 'Completed' || !!act.actualDate;
                
                const [startY, startM, startD] = act.date.split('-').map(Number);
                let currentLoopDate = new Date(startY, startM - 1, startD);
                
                let endLoopDate = new Date(startY, startM - 1, startD);
                if (act.endDate && act.endDate !== act.date) {
                     const [endY, endM, endD] = act.endDate.split('-').map(Number);
                     endLoopDate = new Date(endY, endM - 1, endD);
                }

                const effectiveEndDateStr = act.endDate || act.date;
                const styles = getStatusStyles(isCompleted, effectiveEndDateStr, 'border-green-500');

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

                    currentLoopDate.setDate(currentLoopDate.getDate() + 1);
                }
            }
        });

        (systemSettings?.deadlines || []).forEach(dl => {
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

        (systemSettings?.planningSchedules || []).forEach(ps => {
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

        (holidays || []).forEach(h => {
            addEvent(h.date, {
                id: `hol-${h.date}`,
                title: h.localName,
                type: 'Holiday',
                borderColor: 'border-pink-500',
                bgColor: 'bg-pink-50 dark:bg-pink-900/30',
                textColor: 'text-pink-800 dark:text-pink-200'
            });
        });

        return events;
    }, [activities, systemSettings, holidays]);

    const renderCells = () => {
        const cells = [];
        for (let i = 0; i < firstDay; i++) {
            cells.push(<div key={`empty-${i}`} className="h-24 md:h-32 bg-gray-50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700"></div>);
        }

        const today = new Date();
        const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

        for (let day = 1; day <= daysInMonth; day++) {
            const key = `${year}-${month}-${day}`;
            const dayEvents = eventsByDate[key] || [];
            const isToday = isCurrentMonth && today.getDate() === day;

            const boxClass = isToday 
                ? 'bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-500 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.5)]' 
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50';

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
                                onClick={(e) => { e.stopPropagation(); onEventClick(evt); }}
                                className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] md:text-xs border-l-4 truncate shadow-sm cursor-pointer hover:brightness-95 ${evt.bgColor} ${evt.borderColor} ${evt.textColor}`}
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

            <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                {daysOfWeek.map(day => (
                    <div key={day} className="py-2 text-center text-sm font-semibold text-gray-500 dark:text-gray-400">
                        {day}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-7 flex-1">
                {renderCells()}
            </div>
            
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-x-6 gap-y-2 text-xs text-gray-600 dark:text-gray-400 justify-center">
                <div className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-pink-100 border-l-4 border-pink-500 rounded-sm"></span>
                    <span>Holiday</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-emerald-100 border-l-4 border-emerald-600 rounded-sm"></span>
                    <span>Completed</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-red-100 border-l-4 border-red-600 rounded-sm"></span>
                    <span>Past Due / Incomplete</span>
                </div>
                 <div className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-white border border-gray-200 border-l-4 border-green-500 rounded-sm"></span>
                    <span>Activity</span>
                </div>
            </div>
        </div>
    );
};

export default Calendar;
