import React from 'react';
import { Subproject } from '../constants';

interface GanttChartProps {
    subprojects: Subproject[];
}

const GanttChart: React.FC<GanttChartProps> = ({ subprojects }) => {
    if (subprojects.length === 0) {
        return (
            <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                No subproject data available for the selected period.
            </div>
        );
    }

    const parseDate = (dateString: string): Date | null => {
        if (!dateString) return null;
        // Handles YYYY-MM-DD to avoid timezone issues that new Date('YYYY-MM-DD') can have
        const [year, month, day] = dateString.split('-').map(Number);
        return new Date(year, month - 1, day);
    };

    const allDates = subprojects.flatMap(p => [
        parseDate(p.startDate),
        parseDate(p.estimatedCompletionDate),
        p.actualCompletionDate ? parseDate(p.actualCompletionDate) : null
    ]).filter((d): d is Date => d !== null);

    if (allDates.length === 0) {
        return <div className="text-center py-10 text-gray-500 dark:text-gray-400">No valid dates found in subprojects.</div>;
    }

    let chartStartDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    let chartEndDate = new Date(Math.max(...allDates.map(d => d.getTime())));
    
    // Add padding (1 month before and after)
    chartStartDate = new Date(chartStartDate.getFullYear(), chartStartDate.getMonth() - 1, 1);
    chartEndDate = new Date(chartEndDate.getFullYear(), chartEndDate.getMonth() + 2, 0);

    const totalDays = (chartEndDate.getTime() - chartStartDate.getTime()) / (1000 * 3600 * 24);

    const months = [];
    let currentDate = new Date(chartStartDate);
    while (currentDate <= chartEndDate) {
        months.push(new Date(currentDate));
        currentDate.setMonth(currentDate.getMonth() + 1);
    }

    const getDaysFromStart = (date: Date | null) => {
        if (!date) return 0;
        return (date.getTime() - chartStartDate.getTime()) / (1000 * 3600 * 24);
    };

    return (
        <div className="space-y-4">
            <div className="overflow-x-auto p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <div className="min-w-[900px]">
                    {/* Timeline Header */}
                    <div className="flex relative border-b border-gray-200 dark:border-gray-700 h-10">
                         {/* Month grid lines and labels */}
                         {months.map((month, index) => {
                             const daysFromStart = getDaysFromStart(month);
                             const leftPosition = (daysFromStart / totalDays) * 100;
                            return (
                                <div key={`line-${index}`} className="absolute top-0 h-full w-px bg-gray-200 dark:bg-gray-700" style={{ left: `${leftPosition}%` }}>
                                    <span className="absolute top-0 -ml-4 mt-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                                        {month.toLocaleString('default', { month: 'short' })} '{month.getFullYear().toString().slice(-2)}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                    
                    {/* Project Rows */}
                    <div className="space-y-3 py-2">
                         {subprojects.map(project => {
                            const startDate = parseDate(project.startDate);
                            const estimatedEndDate = parseDate(project.estimatedCompletionDate);
                            const actualEndDate = parseDate(project.actualCompletionDate);

                            if (!startDate || !estimatedEndDate) return null;

                            // Planned Bar
                            const plannedStartDays = getDaysFromStart(startDate);
                            const plannedEndDays = getDaysFromStart(estimatedEndDate);
                            const plannedDurationDays = Math.max(0, plannedEndDays - plannedStartDays);
                            const plannedLeft = (plannedStartDays / totalDays) * 100;
                            const plannedWidth = (plannedDurationDays / totalDays) * 100;
                            
                            // Actual Bar
                            let actualLeft = 0, actualWidth = 0;
                            if (actualEndDate) {
                                const actualEndDays = getDaysFromStart(actualEndDate);
                                const actualDurationDays = Math.max(0, actualEndDays - plannedStartDays);
                                actualLeft = plannedLeft;
                                actualWidth = (actualDurationDays / totalDays) * 100;
                            }

                            return (
                                <div key={project.id} className="flex items-center group text-sm h-10">
                                    <div className="w-52 pr-4 pl-2 font-medium text-gray-800 dark:text-gray-200 truncate" title={project.name}>{project.name}</div>
                                    <div className="flex-1 h-full relative">
                                         {/* Planned Bar */}
                                         <div 
                                            className="absolute h-6 top-1/2 -translate-y-1/2 bg-blue-300 dark:bg-blue-700 rounded-md transition-all duration-300 hover:brightness-110"
                                            style={{ left: `${plannedLeft}%`, width: `${plannedWidth}%` }}
                                            title={`Planned: ${project.startDate} to ${project.estimatedCompletionDate}`}
                                        ></div>
                                         {/* Actual Bar */}
                                        {actualEndDate && (
                                            <div 
                                                className="absolute h-4 top-1/2 -translate-y-1/2 bg-green-500 dark:bg-green-400 rounded-sm shadow-md transition-all duration-300 hover:brightness-110"
                                                style={{ left: `${actualLeft}%`, width: `${actualWidth}%` }}
                                                title={`Actual: ${project.startDate} to ${project.actualCompletionDate}`}
                                            ></div>
                                        )}
                                    </div>
                                </div>
                            )
                         })}
                    </div>
                </div>
            </div>
            {/* Legend */}
            <div className="flex items-center justify-end space-x-4 text-xs text-gray-600 dark:text-gray-400">
                <div className="flex items-center">
                    <span className="h-3 w-3 rounded-sm bg-blue-300 dark:bg-blue-700 mr-2"></span>
                    <span>Planned Duration</span>
                </div>
                <div className="flex items-center">
                    <span className="h-3 w-3 rounded-sm bg-green-500 dark:bg-green-400 mr-2"></span>
                    <span>Actual Duration</span>
                </div>
            </div>
        </div>
    );
};

export default GanttChart;
