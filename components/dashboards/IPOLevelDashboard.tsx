
import React from 'react';

const IPOLevelDashboard: React.FC = () => {
    return (
        <div className="bg-white dark:bg-gray-800 p-12 rounded-lg shadow-md flex flex-col items-center justify-center text-center min-h-[400px]">
            <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-full mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">IPO Level of Development</h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-md">
                This section tracks the progression of IPOs through different development levels (Level 1 to 5).
            </p>
        </div>
    );
};

export default IPOLevelDashboard;
