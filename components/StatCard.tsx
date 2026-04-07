
import React from 'react';

interface StatCardProps {
    title: string;
    value: string;
    icon: React.ReactNode;
    color: string;
    onClick?: () => void;
    onToggle?: (e: React.MouseEvent) => void;
    toggleIcon?: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color, onClick, onToggle, toggleIcon }) => {
    return (
        <div 
            onClick={onClick}
            className={`bg-white dark:bg-gray-800 p-4 lg:p-5 rounded-xl shadow-lg flex items-center space-x-4 hover:shadow-xl hover:scale-105 transform transition-all duration-300 ease-in-out min-w-0 relative group ${onClick ? 'cursor-pointer ring-2 ring-transparent hover:ring-accent/20' : ''}`}
        >
            <div className={`p-3 lg:p-4 rounded-full bg-gray-100 dark:bg-gray-700 flex-shrink-0 ${color}`}>
                {icon}
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-gray-500 dark:text-gray-400 font-medium text-xs lg:text-sm truncate" title={title}>{title}</p>
                <p className="text-xl lg:text-2xl font-bold text-gray-800 dark:text-white truncate" title={value}>{value}</p>
            </div>
            {onToggle && (
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggle(e);
                    }}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    title="Switch View"
                >
                    {toggleIcon || (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    )}
                </button>
            )}
        </div>
    );
};

export default StatCard;
