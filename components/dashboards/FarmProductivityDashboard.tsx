
import React from 'react';

const FarmProductivityDashboard: React.FC = () => {
    return (
        <div className="bg-white dark:bg-gray-800 p-12 rounded-lg shadow-md flex flex-col items-center justify-center text-center min-h-[400px]">
            <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-full mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Farm Productivity and Income</h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-md">
                This section tracks yield improvements and income generation from livelihood projects.
            </p>
        </div>
    );
};

export default FarmProductivityDashboard;
