
import React from 'react';

const FinancialDashboard: React.FC = () => {
    return (
        <div className="bg-white dark:bg-gray-800 p-12 rounded-lg shadow-md flex flex-col items-center justify-center text-center min-h-[400px]">
            <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-full mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Financial Dashboard</h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-md">
                This section contains financial performance metrics including obligation and disbursement rates.
            </p>
        </div>
    );
};

export default FinancialDashboard;
