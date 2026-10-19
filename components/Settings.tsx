
// Author: 4K 
import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
    Deadline, PlanningSchedule, Subproject, Activity, IPO,
    OfficeRequirement, StaffingRequirement, OtherProgramExpense, RefFundSource
} from '../constants';
import SystemHealthCard from './settings/SystemHealthCard';
import UserProfileTab from './settings/UserProfileTab';
import UserManagementTab from './settings/UserManagementTab';
import SystemManagementTab from './settings/SystemManagementTab';
import UserLogsTab from './settings/UserLogsTab';
import DCFManagementTab from './settings/DCFManagementTab';
import LODManagementTab from './settings/LODManagementTab';
import ArchiveManagementTab from './settings/ArchiveManagementTab';
import { ThemePreference } from '../lib/theme';
import UserControlCenterTab from './settings/UserControlCenterTab';
import GoogleDriveStorageTab from './settings/GoogleDriveStorageTab';
import { PageHeader } from './ui/enterprise';
import SystemInformationTab from './settings/SystemInformationTab';

interface SettingsProps {
    onNavigate: (path: string) => void;
    currentRoute?: string;
    isDarkMode: boolean;
    themePreference: ThemePreference;
    onThemePreferenceChange: (preference: ThemePreference) => void;
    deadlines: Deadline[];
    setDeadlines: React.Dispatch<React.SetStateAction<Deadline[]>>;
    
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
    fundSources: RefFundSource[];
    onSelectSubproject: (project: Subproject) => void;
    onSelectActivity: (activity: Activity) => void;
    onSelectIpo: (ipo: IPO) => void;
}

type TabName = 'profile' | 'system_information' | 'management' | 'control_center' | 'drive' | 'system' | 'logs' | 'dcf' | 'lod' | 'archive';

const getInitialSettingsTab = (): TabName => {
    const hashPath = window.location.hash.replace(/^#/, '');
    const [, query = ''] = hashPath.split('?');
    const requestedTab = new URLSearchParams(query).get('tab') as TabName | null;
    const validTabs: TabName[] = ['profile', 'system_information', 'management', 'control_center', 'drive', 'system', 'logs', 'dcf', 'lod', 'archive'];
    if (requestedTab && validTabs.includes(requestedTab)) return requestedTab;
    return hashPath.includes('drive=') ? 'drive' : 'profile';
};

const Settings: React.FC<SettingsProps> = ({ 
    onNavigate,
    currentRoute,
    isDarkMode, themePreference, onThemePreferenceChange,
    deadlines, setDeadlines,
    subprojects, setSubprojects,
    activities, setActivities,
    ipos, setIpos,
    officeReqs, setOfficeReqs,
    staffingReqs, setStaffingReqs,
    otherProgramExpenses, setOtherProgramExpenses,
    fundSources,
    onSelectSubproject,
    onSelectActivity,
    onSelectIpo
}) => {
    const { currentUser, hasAccess } = useAuth();
    const [activeTab, setActiveTab] = useState<TabName>(getInitialSettingsTab);
    useEffect(() => { setActiveTab(getInitialSettingsTab()); }, [currentRoute]);
    useEffect(() => {
        const syncTab = () => setActiveTab(getInitialSettingsTab());
        window.addEventListener('popstate', syncTab);
        window.addEventListener('hashchange', syncTab);
        return () => { window.removeEventListener('popstate', syncTab); window.removeEventListener('hashchange', syncTab); };
    }, []);

    // We keep these legacy admin checks as absolute fallbacks for settings only
    const isAdmin = currentUser?.role === 'Administrator' || currentUser?.role === 'Super Admin';
    const isSuperAdmin = currentUser?.role === 'Super Admin';
    const isGuest = currentUser?.role === 'Guest';

    useEffect(() => {
        if (isSuperAdmin && window.location.hash.includes('drive=')) {
            setActiveTab('drive');
        }
    }, [isSuperAdmin]);

    // Use granular rules from user overrides/roles config where applicable
    const canAccessSystem = !isGuest && (hasAccess('System Management', 'view') || isAdmin);

    const isTabAllowed = (name: TabName): boolean => {
        if (name === 'profile' || name === 'system_information') return true;
        if (isGuest) return false;

        switch (name) {
            case 'management':
            case 'dcf':
            case 'lod':
            case 'logs':
            case 'archive':
                return isAdmin;
            case 'control_center':
            case 'drive':
                return isSuperAdmin;
            case 'system':
                return canAccessSystem;
            default:
                return false;
        }
    };

    useEffect(() => {
        if (!isTabAllowed(activeTab)) {
            setActiveTab('profile');
        }
    }, [activeTab, isAdmin, isSuperAdmin, isGuest, canAccessSystem]);

    if (!currentUser) return null;

    const tabButton = (name: TabName, label: string) => {
        const isActive = activeTab === name;
        return (
            <button
                type="button"
                onClick={() => {
                    if (!isTabAllowed(name)) return;
                    onNavigate(`/settings?tab=${name}`);
                    if (getInitialSettingsTab() === name) setActiveTab(name);
                }}
                className={`settings-tabs__button ${isActive ? 'is-active' : ''}`}
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                role="tab"
                id={`settings-tab-${name}`}
                aria-controls="settings-active-panel"
            >
                {label}
            </button>
        );
    };

    return (
        <div className="settings-page animate-fadeIn">
             <PageHeader title="Settings" metadata="Manage your profile, access controls, integrations, and system preferences." />

             {!isGuest && activeTab !== 'system_information' && <SystemHealthCard />}

             <section className="settings-panel">
                <div className="settings-tabs">
                    <nav className="settings-tabs__list" aria-label="Settings sections" role="tablist" onKeyDown={(event: React.KeyboardEvent<HTMLElement>) => {
                        const buttons = Array.from(event.currentTarget.querySelectorAll('[role="tab"]')) as HTMLButtonElement[];
                        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                        if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                        event.preventDefault();
                        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
                        buttons[next].click(); buttons[next].focus();
                    }}>
                        {tabButton('profile', 'User Profile')}
                        {tabButton('system_information', 'System Information')}
                        {isAdmin && tabButton('management', 'Users Management')}
                        {isSuperAdmin && tabButton('control_center', 'User Control Center')}
                        {isSuperAdmin && tabButton('drive', 'Google Drive Storage')}
                        {isAdmin && tabButton('dcf', 'DCF Management')}
                        {isAdmin && tabButton('lod', 'LOD Management')}
                        {canAccessSystem && tabButton('system', 'System Management')}
                        {isAdmin && tabButton('logs', 'User Logs')}
                        {isAdmin && tabButton('archive', 'Archive Management')}
                    </nav>
                </div>

                <div className="settings-panel__content" role="tabpanel" id="settings-active-panel" aria-labelledby={`settings-tab-${activeTab}`}>
                    {activeTab === 'system_information' && <SystemInformationTab />}
                    {activeTab === 'profile' && (
                        <UserProfileTab
                            isDarkMode={isDarkMode}
                            themePreference={themePreference}
                            onThemePreferenceChange={onThemePreferenceChange}
                        />
                    )}
                    
                    {activeTab === 'control_center' && isSuperAdmin && (
                        <UserControlCenterTab />
                    )}

                    {activeTab === 'drive' && isSuperAdmin && (
                        <GoogleDriveStorageTab />
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

                    {activeTab === 'archive' && isAdmin && (
                        <ArchiveManagementTab fundSources={fundSources} />
                    )}
                </div>
             </section>
        </div>
    );
};

export default Settings;
