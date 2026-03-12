
// Author: 4K 
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
    Deadline, PlanningSchedule, Subproject, Activity, IPO,
    OfficeRequirement, StaffingRequirement, OtherProgramExpense
} from '../constants';
import SystemHealthCard from './settings/SystemHealthCard';
import UserProfileTab from './settings/UserProfileTab';
import UserManagementTab from './settings/UserManagementTab';
import SystemManagementTab from './settings/SystemManagementTab';
import UserLogsTab from './settings/UserLogsTab';
import DCFManagementTab from './settings/DCFManagementTab';
import LODManagementTab from './settings/LODManagementTab';

interface SettingsProps {
    isDarkMode: boolean;
    toggleDarkMode: () => void;
    deadlines: Deadline[];
    setDeadlines: React.Dispatch<React.SetStateAction<Deadline[]>>;
    planningSchedules: PlanningSchedule[];
    setPlanningSchedules: React.Dispatch<React.SetStateAction<PlanningSchedule[]>>;
    
    // Props for DCF Management
    subprojects: Subproject[];
    setSubprojects: React.Dispatch<React.SetStateAction<Subproject[]>>;
    activities: Activity[];
    setActivities: React.Dispatch<React.SetStateAction<Activity[]>>;
    ipos: IPO[];
    setIpos: React.Dispatch<React.SetStateAction<IPO[]>>;
    officeReqs: OfficeRequirement[];
    setOfficeReqs: React.Dispatch<React.SetStateAction<OfficeRequirement[]>>;
    staffingReqs: StaffingRequirement[];
    setStaffingReqs: React.Dispatch<React.SetStateAction<StaffingRequirement[]>>;
    otherProgramExpenses: OtherProgramExpense[];
    setOtherProgramExpenses: React.Dispatch<React.SetStateAction<OtherProgramExpense[]>>;
    onSelectSubproject: (project: Subproject) => void;
    onSelectActivity: (activity: Activity) => void;
    onSelectIpo: (ipo: IPO) => void;
}

type TabName = 'profile' | 'management' | 'system' | 'logs' | 'dcf' | 'lod';

const Settings: React.FC<SettingsProps> = ({ 
    isDarkMode, toggleDarkMode, 
    deadlines, setDeadlines,
    planningSchedules, setPlanningSchedules,
    subprojects, setSubprojects,
    activities, setActivities,
    ipos, setIpos,
    officeReqs, setOfficeReqs,
    staffingReqs, setStaffingReqs,
    otherProgramExpenses, setOtherProgramExpenses,
    onSelectSubproject,
    onSelectActivity,
    onSelectIpo
}) => {
    const { currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState<TabName>('profile');
    
    if (!currentUser) return null;

    const isAdmin = currentUser?.role === 'Administrator';
    const canAccessSystem = isAdmin || currentUser?.role === 'Management';

    const TabButton: React.FC<{ name: TabName; label: string }> = ({ name, label }) => {
        const isActive = activeTab === name;
        return (
            <button
                onClick={() => setActiveTab(name)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors duration-200 whitespace-nowrap
                    ${isActive
                        ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 dark:border-emerald-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
            >
                {label}
            </button>
        );
    };

    return (
        <div className="max-w-7xl mx-auto animate-fadeIn pb-10">
             <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-6">Settings</h2>

             <SystemHealthCard />

             <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg mb-6 overflow-hidden">
                <div className="border-b border-gray-200 dark:border-gray-700">
                    <nav className="-mb-px flex space-x-2 px-4 overflow-x-auto" aria-label="Tabs">
                        <TabButton name="profile" label="User Profile" />
                        {isAdmin && <TabButton name="management" label="Users Management" />}
                        {isAdmin && <TabButton name="dcf" label="DCF Management" />}
                        {isAdmin && <TabButton name="lod" label="LOD Management" />}
                        {canAccessSystem && <TabButton name="system" label="System Management" />}
                        {isAdmin && <TabButton name="logs" label="User Logs" />}
                    </nav>
                </div>

                <div className="p-6">
                    {activeTab === 'profile' && (
                        <UserProfileTab isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode} />
                    )}
                    
                    {activeTab === 'management' && isAdmin && (
                        <UserManagementTab />
                    )}

                    {activeTab === 'dcf' && isAdmin && (
                        <DCFManagementTab 
                            subprojects={subprojects} setSubprojects={setSubprojects}
                            activities={activities} setActivities={setActivities}
                            officeReqs={officeReqs} setOfficeReqs={setOfficeReqs}
                            staffingReqs={staffingReqs} setStaffingReqs={setStaffingReqs}
                            otherProgramExpenses={otherProgramExpenses}
                            setOtherProgramExpenses={setOtherProgramExpenses}
                            onSelectSubproject={onSelectSubproject}
                            onSelectActivity={onSelectActivity}
                        />
                    )}

                    {activeTab === 'lod' && isAdmin && (
                        <LODManagementTab />
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
                        <UserLogsTab 
                            subprojects={subprojects}
                            activities={activities}
                            ipos={ipos}
                            onSelectSubproject={onSelectSubproject}
                            onSelectActivity={onSelectActivity}
                            onSelectIpo={onSelectIpo}
                        />
                    )}
                </div>
             </div>
        </div>
    );
};

export default Settings;
