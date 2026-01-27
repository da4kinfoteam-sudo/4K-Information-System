
import React from 'react';

interface StatCardProps {
    title: string;
    value: string;
    icon: React.ReactNode;
    color: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color }) => {
    return (
        <div className="bg-white dark:bg-gray-800 p-4 lg:p-5 rounded-xl shadow-lg flex items-center space-x-4 hover:shadow-xl hover:scale-105 transform transition-all duration-300 ease-in-out min-w-0">
            <div className={`p-3 lg:p-4 rounded-full bg-gray-100 dark:bg-gray-700 flex-shrink-0 ${color}`}>
                {icon}
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-gray-500 dark:text-gray-400 font-medium text-xs lg:text-sm truncate" title={title}>{title}</p>
                <p className="text-xl lg:text-2xl font-bold text-gray-800 dark:text-white truncate" title={value}>{value}</p>
            </div>
        </div>
    );
};

export default StatCard;
