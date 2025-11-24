
import React, { useState } from 'react';
import { SystemSettings } from '../constants';

export interface GanttItem {
    id: number;
    name: string;
    startDate: string;
    endDate: string;
    actualEndDate?: string;
    type: 'Subproject' | 'Training';
    status?: string;
}

interface GanttChartProps {
    items: GanttItem[];
    systemSettings: SystemSettings;
}

const GanttChart: React.FC<GanttChartProps> = ({ items, systemSettings }) => {
    const [zoomedMonth, setZoomedMonth] = useState<Date | null>(null);
    
    const parseDate = (dateString: string): Date | null => {
        if (!dateString) return null;
        const [year, month, day] = dateString.split('-').map(Number);
        return new Date(year, month - 1, day);
    };

    // Combine item dates with system setting dates to determine chart range
    const allDates = [
        ...items.flatMap(item => [
            parseDate(item.startDate),
            parseDate(item.endDate),
            item.actualEndDate ? parseDate(item.actualEndDate) : null
        ]),
        ...systemSettings.deadlines.map(d => parseDate(d.date)),
        ...systemSettings.planningSchedules.flatMap(s => [parseDate(s.startDate), parseDate(s.endDate)])
    ].filter((d): d is Date => d !== null);

    if (allDates.length === 0) {
        return (
            <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                No timeline data available.
            </div>
        );
    }

    let chartStartDate: Date;
    let chartEndDate: Date;

    if (zoomedMonth) {
        // Zoomed View: First day to Last day of the selected month
        chartStartDate = new Date(zoomedMonth.getFullYear(), zoomedMonth.getMonth(), 1);
        chartEndDate = new Date(zoomedMonth.getFullYear(), zoomedMonth.getMonth() + 1, 0);
    } else {
        // Overview View: Auto-range with padding
        const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
        
        chartStartDate = new Date(minDate.getFullYear(), minDate.getMonth() - 1, 1);
        chartEndDate = new Date(maxDate.getFullYear(), maxDate.getMonth() + 2, 0);
    }

    const totalDays = (chartEndDate.getTime() - chartStartDate.getTime()) / (1000 * 3600 * 24) + 1;

    const getDaysFromStart = (date: Date | null) => {
        if (!date) return 0;
        // Calculate difference in days
        return (date.getTime() - chartStartDate.getTime()) / (1000 * 3600 * 24);
    };

    // Helper to render bars with clamping for the current view range
    const renderBar = (start: Date, end: Date, className: string, title: string, isLine: boolean = false) => {
        // Clamp dates to visible range
        const effectiveStart = start < chartStartDate ? chartStartDate : start;
        let effectiveEnd = end > chartEndDate ? chartEndDate : end;
        
        // If looking at a specific deadline (point in time), don't clamp end if it's the same as start
        if (start.getTime() === end.getTime()) {
             effectiveEnd = effectiveStart;
        }

        // If the item is completely out of view
        if (start > chartEndDate || end < chartStartDate) return null;

        const left = (getDaysFromStart(effectiveStart) / totalDays) * 100;
        
        if (isLine) {
             return (
                <div 
                    key={title} 
                    className={className}
                    style={{ left: `${left}%` }}
                >
                    {/* Tooltip/Label for the line */}
                    <div className="absolute -top-6 -left-16 w-32 text-center text-xs font-bold text-red-600 bg-white dark:bg-gray-800 px-1 rounded shadow-sm whitespace-nowrap overflow-hidden text-ellipsis">
                        {title}
                    </div>
                </div>
            );
        }

        const durationDays = Math.max(0.5, (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 3600 * 24)); 
        const width = (durationDays / totalDays) * 100;

        return (
            <div 
                className={className}
                style={{ left: `${left}%`, width: `${width}%` }}
                title={title}
            ></div>
        );
    };

    // Headers Generation
    const headers = [];
    if (zoomedMonth) {
        // Generate Days headers
        const daysInMonth = new Date(zoomedMonth.getFullYear(), zoomedMonth.getMonth() + 1, 0).getDate();
        for (let i = 1; i <= daysInMonth; i++) {
            const date = new Date(zoomedMonth.getFullYear(), zoomedMonth.getMonth(), i);
            const left = (getDaysFromStart(date) / totalDays) * 100;
            headers.push(
                <div key={i} className="absolute top-0 h-full w-px bg-gray-200 dark:bg-gray-700" style={{ left: `${left}%` }}>
                    <span className="absolute top-0 -ml-1 mt-2 text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                        {i}
                    </span>
                </div>
            );
        }
    } else {
        // Generate Months headers
        let currentDate = new Date(chartStartDate);
        while (currentDate <= chartEndDate) {
            const monthDate = new Date(currentDate);
            const daysFromStart = getDaysFromStart(monthDate);
            const leftPosition = (daysFromStart / totalDays) * 100;
            
            headers.push(
                <div key={monthDate.getTime()} className="absolute top-0 h-full w-px bg-gray-200 dark:bg-gray-700" style={{ left: `${leftPosition}%` }}>
                    <button 
                        onClick={() => setZoomedMonth(monthDate)}
                        className="absolute top-0 left-1 mt-2 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-accent dark:hover:text-green-400 hover:underline transition-colors text-left whitespace-nowrap z-30"
                    >
                        {monthDate.toLocaleString('default', { month: 'short' })} '{monthDate.getFullYear().toString().slice(-2)}
                    </button>
                </div>
            );
            currentDate.setMonth(currentDate.getMonth() + 1);
        }
    }

    return (
        <div className="space-y-4">
            {zoomedMonth && (
                <div className="flex justify-between items-center bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg border border-blue-100 dark:border-blue-800/30">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-800 dark:text-white">
                            {zoomedMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">(Day View)</span>
                    </div>
                    <button 
                        onClick={() => setZoomedMonth(null)} 
                        className="px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-300 bg-white dark:bg-gray-800 rounded border border-blue-200 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        Back to Year View
                    </button>
                </div>
            )}

            <div className="overflow-x-auto p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg relative">
                <div className="min-w-[900px] relative">
                    
                    {/* Planning Schedule Backgrounds */}
                    {systemSettings.planningSchedules.map(schedule => {
                        const start = parseDate(schedule.startDate);
                        let end = parseDate(schedule.endDate);
                        if (!start || !end) return null;
                        const endDateInclusive = new Date(end);
                        endDateInclusive.setDate(endDateInclusive.getDate() + 1); // Inclusive
                        
                        return (
                            <React.Fragment key={`schedule-${schedule.id}`}>
                                {renderBar(start, endDateInclusive, "absolute top-0 bottom-0 bg-gray-300 dark:bg-gray-500 opacity-30 pointer-events-none z-0", `${schedule.name} (${schedule.startDate} - ${schedule.endDate})`)}
                            </React.Fragment>
                        );
                    })}

                    {/* Deadlines Vertical Lines */}
                    {systemSettings.deadlines.map(deadline => {
                        const date = parseDate(deadline.date);
                        if (!date) return null;
                        return renderBar(date, date, "absolute top-10 bottom-0 w-0.5 border-l-2 border-dashed border-red-500 z-10 pointer-events-none", deadline.name, true);
                    })}

                    {/* Timeline Header */}
                    <div className="flex relative border-b border-gray-200 dark:border-gray-700 h-10 z-20">
                         {headers}
                    </div>
                    
                    {/* Rows */}
                    <div className="space-y-3 py-2 z-20 relative">
                         {items.length === 0 && <div className="text-center py-4 text-gray-500 italic">No items to display.</div>}
                         {items.map(item => {
                            const startDate = parseDate(item.startDate);
                            const estimatedEndDate = parseDate(item.endDate);
                            const actualEndDate = parseDate(item.actualEndDate ? item.actualEndDate : '');

                            if (!startDate || !estimatedEndDate) return null;

                            // Skip items that don't overlap with the zoomed month
                            if (startDate > chartEndDate || estimatedEndDate < chartStartDate) {
                                if (actualEndDate && (actualEndDate > chartStartDate && startDate < chartEndDate)) {
                                    // Keep if actual duration overlaps
                                } else {
                                    return null;
                                }
                            }

                            const plannedBar = renderBar(
                                startDate, 
                                estimatedEndDate, 
                                `absolute h-6 top-1/2 -translate-y-1/2 rounded-md transition-all duration-300 hover:brightness-110 ${item.type === 'Training' ? 'bg-green-300 dark:bg-green-700' : 'bg-blue-300 dark:bg-blue-700'}`,
                                `Planned: ${item.startDate}${item.type === 'Subproject' ? ` to ${item.endDate}` : ''}`
                            );

                            const actualBar = actualEndDate && item.type === 'Subproject' ? renderBar(
                                startDate,
                                actualEndDate,
                                "absolute h-4 top-1/2 -translate-y-1/2 bg-green-500 dark:bg-green-400 rounded-sm shadow-md transition-all duration-300 hover:brightness-110",
                                `Actual: ${item.startDate} to ${item.actualEndDate}`
                            ) : null;

                            if (!plannedBar && !actualBar) return null;

                            return (
                                <div key={`${item.type}-${item.id}`} className="flex items-center group text-sm h-10 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded transition-colors">
                                    <div className="w-52 pr-4 pl-2 font-medium text-gray-800 dark:text-gray-200 truncate flex items-center gap-2 flex-shrink-0" title={item.name}>
                                        <span className={`w-2 h-2 rounded-full ${item.type === 'Training' ? 'bg-green-500' : 'bg-blue-500'}`}></span>
                                        {item.name}
                                    </div>
                                    <div className="flex-1 h-full relative">
                                         {plannedBar}
                                         {actualBar}
                                    </div>
                                </div>
                            )
                         })}
                         {/* Message if filtered to empty in Zoomed View */}
                         {zoomedMonth && items.length > 0 && items.every(item => {
                             const s = parseDate(item.startDate);
                             const e = parseDate(item.endDate);
                             if(!s || !e) return true;
                             return (s > chartEndDate || e < chartStartDate);
                         }) && (
                             <div className="text-center py-8 text-gray-400 italic">
                                 No activities scheduled for {zoomedMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}.
                             </div>
                         )}
                    </div>
                </div>
            </div>
            {/* Legend */}
            <div className="flex items-center justify-end space-x-4 text-xs text-gray-600 dark:text-gray-400 flex-wrap gap-y-2">
                {!zoomedMonth && <span className="mr-auto italic text-gray-400">* Click on a month label to expand details.</span>}
                <div className="flex items-center">
                    <span className="h-3 w-3 rounded-sm bg-blue-300 dark:bg-blue-700 mr-2"></span>
                    <span>Subproject</span>
                </div>
                <div className="flex items-center">
                    <span className="h-3 w-3 rounded-sm bg-green-300 dark:bg-green-700 mr-2"></span>
                    <span>Training</span>
                </div>
                <div className="flex items-center">
                    <span className="h-3 w-3 rounded-sm bg-green-500 dark:bg-green-400 mr-2"></span>
                    <span>Actual Duration</span>
                </div>
                <div className="flex items-center">
                    <span className="h-4 w-0.5 border-l-2 border-dashed border-red-500 mr-2"></span>
                    <span>Deadline</span>
                </div>
                <div className="flex items-center">
                    <span className="h-3 w-3 rounded-sm bg-gray-300 dark:bg-gray-500 opacity-50 mr-2"></span>
                    <span>Planning Schedule</span>
                </div>
            </div>
        </div>
    );
};

export default GanttChart;
