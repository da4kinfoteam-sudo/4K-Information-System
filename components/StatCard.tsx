
import React from 'react';

interface StatCardProps {
    title: string;
    value: string;
    icon: React.ReactNode;
    color: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color }) => {
    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg flex items-center space-x-6 hover:shadow-xl hover:scale-105 transform transition-all duration-300 ease-in-out">
            <div className={`p-4 rounded-full bg-gray-100 dark:bg-gray-700 ${color}`}>
                {icon}
            </div>
            <div>
                <p className="text-gray-500 dark:text-gray-400 font-medium">{title}</p>
                <p className="text-3xl font-bold text-gray-800 dark:text-white">{value}</p>
            </div>
        </div>
    );
};

export default StatCard;
