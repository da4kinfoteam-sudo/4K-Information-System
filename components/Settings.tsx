// Author: AI
// OS support: Any
// Description: User settings page component

import React, { useState } from 'react';

interface SettingsProps {
    isDarkMode: boolean;
    toggleDarkMode: () => void;
}

const Settings: React.FC<SettingsProps> = ({ isDarkMode, toggleDarkMode }) => {
    const [name, setName] = useState("Admin User");
    const [email, setEmail] = useState("admin@da.gov.ph");
    
    const handleResetData = () => {
        if (window.confirm("Are you sure you want to reset all application data to default samples? This cannot be undone.")) {
            localStorage.removeItem('subprojects');
            localStorage.removeItem('ipos');
            localStorage.removeItem('trainings');
            localStorage.removeItem('otherActivities');
            localStorage.removeItem('referenceUacsList');
            localStorage.removeItem('referenceParticularList');
            window.location.reload();
        }
    };

    return (
        <div className="max-w-4xl mx-auto animate-fadeIn">
            <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">User Settings</h2>
            
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg mb-6 p-6">
                <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">Profile Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Full Name</label>
                        <input 
                            type="text" 
                            value={name} 
                            onChange={(e) => setName(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email Address</label>
                         <input 
                            type="email" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent focus:border-accent sm:text-sm"
                        />
                    </div>
                    <div>
                         <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
                         <input 
                            type="text" 
                            value="Administrator" 
                            disabled
                            className="mt-1 block w-full px-3 py-2 bg-gray-100 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md shadow-sm text-gray-500 dark:text-gray-400 sm:text-sm cursor-not-allowed"
                        />
                    </div>
                </div>
            </div>

             <div className="bg-white dark:bg-gray-800 shadow rounded-lg mb-6 p-6">
                <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">Appearance</h3>
                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-medium text-gray-700 dark:text-gray-300">Dark Mode</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Toggle dark mode theme for the application.</p>
                    </div>
                    <button 
                        onClick={toggleDarkMode}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 ${isDarkMode ? 'bg-accent' : 'bg-gray-200'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out ${isDarkMode ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
            </div>

             <div className="bg-white dark:bg-gray-800 shadow rounded-lg mb-6 p-6">
                <h3 className="text-xl font-semibold text-gray-800 dark:text-white mb-4 text-red-600">Danger Zone</h3>
                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-medium text-gray-700 dark:text-gray-300">Reset Application Data</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">This will clear all your local changes and restore the sample data. This action cannot be undone.</p>
                    </div>
                    <button 
                        onClick={handleResetData}
                        className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                        Reset Data
                    </button>
                </div>
            </div>

            <div className="text-center text-gray-500 text-sm">
                <p>4K Information System v1.0.0</p>
                <p>&copy; 2024 Department of Agriculture</p>
            </div>
        </div>
    );
};

export default Settings;
