
// Author: 4K 
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Deadline, PlanningSchedule } from '../constants';
import SystemHealthCard from './settings/SystemHealthCard';
import UserProfileTab from './settings/UserProfileTab';
import UserManagementTab from './settings/UserManagementTab';
import SystemManagementTab from './settings/SystemManagementTab';
import UserLogsTab from './settings/UserLogsTab';

interface SettingsProps {
    isDarkMode: boolean;
    toggleDarkMode: () => void;
    deadlines: Deadline[];
    setDeadlines: React.Dispatch<React.SetStateAction<Deadline[]>>;
    planningSchedules: PlanningSchedule[];
    setPlanningSchedules: React.Dispatch<React.SetStateAction<PlanningSchedule[]>>;
}

const Settings: React.FC<SettingsProps> = ({ 
    isDarkMode, toggleDarkMode, 
    deadlines, setDeadlines,
    planningSchedules, setPlanningSchedules
}) => {
    const { currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState<'profile' | 'management' | 'system' | 'logs'>('profile');
    
    if (!currentUser) return null;

    const isAdmin = currentUser?.role === 'Administrator';
    const canAccessSystem = isAdmin || currentUser?.role === 'Management';

    return (
        <div className="max-w-6xl mx-auto animate-fadeIn pb-10">
             <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">Settings</h2>

             <SystemHealthCard />

             <div className="bg-white dark:bg-gray-800 shadow rounded-lg mb-6">
                <div className="border-b border-gray-200 dark:border-gray-700">
                    <nav className="-mb-px flex space-x-8 px-6 overflow-x-auto" aria-label="Tabs">
                         <button
                            onClick={() => setActiveTab('profile')}
                            className={`${activeTab === 'profile' ? 'border-accent text-accent' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                        >
                            User Profile
                        </button>
                        {isAdmin && (
                            <button
                                onClick={() => setActiveTab('management')}
                                className={`${activeTab === 'management' ? 'border-accent text-accent' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                            >
                                Users Management
                            </button>
                        )}
                        {canAccessSystem && (
                            <button
                                onClick={() => setActiveTab('system')}
                                className={`${activeTab === 'system' ? 'border-accent text-accent' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                            >
                                System Management
                            </button>
                        )}
                        {isAdmin && (
                            <button
                                onClick={() => setActiveTab('logs')}
                                className={`${activeTab === 'logs' ? 'border-accent text-accent' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                            >
                                User Logs
                            </button>
                        )}
                    </nav>
                </div>

                <div className="p-6">
                    {activeTab === 'profile' && (
                        <UserProfileTab isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode} />
                    )}
                    
                    {activeTab === 'management' && isAdmin && (
                        <UserManagementTab />
                    )}

                    {activeTab === 'system' && canAccessSystem && (
                        <SystemManagementTab 
                            deadlines={deadlines}
                            setDeadlines={setDeadlines}
                            planningSchedules={planningSchedules}
                            setPlanningSchedules={setPlanningSchedules}
                        />
                    )}

                    {activeTab === 'logs' && isAdmin && (
                        <UserLogsTab />
                    )}
                </div>
             </div>
        </div>
    );
};

export default Settings;
