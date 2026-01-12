
import React from 'react';

const GADDashboard: React.FC = () => {
    return (
        <div className="bg-white dark:bg-gray-800 p-12 rounded-lg shadow-md flex flex-col items-center justify-center text-center min-h-[400px]">
            <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-full mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.184-1.268-.5-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.653.184-1.268.5-1.857m0 0a5.002 5.002 0 019 0m-4.5 5.002v-10a4.5 4.5 0 00-9 0v10m9 0a4.5 4.5 0 00-9 0" />
                </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">GAD Dashboard</h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-md">
                This section monitors Gender and Development (GAD) metrics and compliance.
            </p>
        </div>
    );
};

export default GADDashboard;
