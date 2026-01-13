
// Author: 4K 
import React, { useState, useEffect, useMemo, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import DashboardsPage from './components/DashboardsPage';
import Subprojects from './components/Subprojects';
import { ActivitiesComponent } from './components/Activities';
import IPOs from './components/IPO';
import References, { ReferenceUacs, ReferenceParticular } from './components/References';
import Reports from './components/Reports';
import SubprojectDetail from './components/SubprojectDetail';
import IPODetail from './components/IPODetail';
import Settings from './components/Settings';
import Login from './components/Login';
import ProgramManagement from './components/ProgramManagement';
import useLocalStorageState from './hooks/useLocalStorageState';
import { useSupabaseTable } from './hooks/useSupabaseTable'; // Import the new hook
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { 
    initialUacsCodes, initialParticularTypes, Subproject, IPO, Activity, User,
    OfficeRequirement, StaffingRequirement, OtherProgramExpense, SystemSettings, defaultSystemSettings
} from './constants';
import { sampleIPOs } from './sampleIPOs';
import {
    sampleSubprojects, sampleActivities, 
    sampleReferenceUacsList, sampleReferenceParticularList,
    sampleOfficeRequirements, sampleStaffingRequirements, sampleOtherProgramExpenses
} from './samples';

const AppContent: React.FC = () => {
    const { currentUser } = useAuth();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [currentPage, setCurrentPage] = useState('/');

    // --- DATA STATE MANAGEMENT ---
    // Switched from useLocalStorageState to useSupabaseTable for database synchronization.
    // 'tableName' must match your Supabase table names exactly.
    
    const [subprojects, setSubprojects] = useSupabaseTable<Subproject>('subprojects', sampleSubprojects);
    const [ipos, setIpos] = useSupabaseTable<IPO>('ipos', sampleIPOs);
    const [activities, setActivities] = useSupabaseTable<Activity>('activities', sampleActivities);
    
    // Program Management States
    const [officeReqs, setOfficeReqs] = useSupabaseTable<OfficeRequirement>('office_requirements', sampleOfficeRequirements);
    const [staffingReqs, setStaffingReqs] = useSupabaseTable<StaffingRequirement>('staffing_requirements', sampleStaffingRequirements);
    const [otherProgramExpenses, setOtherProgramExpenses] = useSupabaseTable<OtherProgramExpense>('other_program_expenses', sampleOtherProgramExpenses);

    // Reference States
    const [referenceUacsList, setReferenceUacsList] = useSupabaseTable<ReferenceUacs>('reference_uacs', sampleReferenceUacsList);
    const [referenceParticularList, setReferenceParticularList] = useSupabaseTable<ReferenceParticular>('reference_particulars', sampleReferenceParticularList);

    // System Settings State (Keep local for now, usually requires a specific table structure)
    const [systemSettings, setSystemSettings] = useLocalStorageState<SystemSettings>('systemSettings', defaultSystemSettings);

    // Selection States
    const [selectedSubproject, setSelectedSubproject] = useState<Subproject | null>(null);
    const [selectedIpo, setSelectedIpo] = useState<IPO | null>(null);
    const [previousPage, setPreviousPage] = useState('/');

    // Track previous user to redirect to home on login
    const prevUserRef = useRef<User | null>(null);

    useEffect(() => {
        // If user just logged in (was null, now is set), reset to homepage
        if (currentUser && !prevUserRef.current) {
            setCurrentPage('/');
        }
        prevUserRef.current = currentUser;
    }, [currentUser]);

    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
    const toggleDarkMode = () => {
        setIsDarkMode(!isDarkMode);
        document.documentElement.classList.toggle('dark');
    };

    // Initialize dark mode class
    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDarkMode]);

    // Derived References
    const derivedUacsCodes = useMemo(() => {
        const tree: { [key: string]: { [key: string]: { [key: string]: string } } } = {};

        referenceUacsList.forEach(item => {
            if (!tree[item.objectType]) tree[item.objectType] = {};
            if (!tree[item.objectType][item.particular]) tree[item.objectType][item.particular] = {};
            tree[item.objectType][item.particular][item.uacsCode] = item.description;
        });
        return tree;
    }, [referenceUacsList]);

    const derivedParticularTypes = useMemo(() => {
        const newTypes: { [key: string]: string[] } = {};
        referenceParticularList.forEach(item => {
            if (!newTypes[item.type]) newTypes[item.type] = [];
            if (!newTypes[item.type].includes(item.particular)) {
                newTypes[item.type].push(item.particular);
            }
        });
        return newTypes;
    }, [referenceParticularList]);

    // Derived Activities
    const trainings = useMemo(() => activities.filter(a => a.type === 'Training'), [activities]);
    const otherActivities = useMemo(() => activities.filter(a => a.type === 'Activity'), [activities]);

    // Navigation Handlers
    const handleSelectSubproject = (project: Subproject) => {
        setSelectedSubproject(project);
        setPreviousPage(currentPage);
        setCurrentPage('/subproject-detail');
    };

    const handleSelectIpo = (ipo: IPO) => {
        setSelectedIpo(ipo);
        setPreviousPage(currentPage);
        setCurrentPage('/ipo-detail');
    };

    const handleBack = () => {
        setCurrentPage(previousPage);
        setSelectedSubproject(null);
        setSelectedIpo(null);
    };

    if (!currentUser) {
        return <Login />;
    }

    const renderPage = () => {
        switch (currentPage) {
            case '/':
                return <Dashboard 
                            subprojects={subprojects} 
                            ipos={ipos} 
                            activities={activities}
                            systemSettings={systemSettings}
                            officeReqs={officeReqs}
                            staffingReqs={staffingReqs}
                            otherProgramExpenses={otherProgramExpenses}
                        />;
            case '/dashboards':
                 return <DashboardsPage 
                            subprojects={subprojects} 
                            ipos={ipos} 
                            trainings={trainings}
                            otherActivities={otherActivities}
                        />;
            case '/subprojects':
                return <Subprojects 
                            ipos={ipos} 
                            subprojects={subprojects} 
                            setSubprojects={setSubprojects}
                            setIpos={setIpos} 
                            onSelectIpo={handleSelectIpo}
                            onSelectSubproject={handleSelectSubproject}
                            uacsCodes={derivedUacsCodes}
                            particularTypes={derivedParticularTypes}
                        />;
            case '/activities':
                return <ActivitiesComponent 
                            ipos={ipos} 
                            activities={activities}
                            setActivities={setActivities}
                            onSelectIpo={handleSelectIpo}
                            uacsCodes={derivedUacsCodes}
                        />;
            case '/program-management':
                return <ProgramManagement
                            officeReqs={officeReqs}
                            setOfficeReqs={setOfficeReqs}
                            staffingReqs={staffingReqs}
                            setStaffingReqs={setStaffingReqs}
                            otherProgramExpenses={otherProgramExpenses}
                            setOtherProgramExpenses={setOtherProgramExpenses}
                            uacsCodes={derivedUacsCodes}
                        />;
            case '/ipo':
                return <IPOs 
                            ipos={ipos} 
                            setIpos={setIpos} 
                            subprojects={subprojects} 
                            activities={activities}
                            onSelectIpo={handleSelectIpo}
                            onSelectSubproject={handleSelectSubproject}
                            particularTypes={derivedParticularTypes}
                        />;
            case '/references':
                return <References 
                            uacsList={referenceUacsList} 
                            setUacsList={setReferenceUacsList}
                            particularList={referenceParticularList}
                            setParticularList={setReferenceParticularList}
                        />;
            case '/reports':
                return <Reports 
                            ipos={ipos} 
                            subprojects={subprojects} 
                            trainings={trainings}
                            otherActivities={otherActivities}
                            officeReqs={officeReqs}
                            staffingReqs={staffingReqs}
                            otherProgramExpenses={otherProgramExpenses}
                            uacsCodes={derivedUacsCodes}
                        />;
            case '/subproject-detail':
                if (!selectedSubproject) return <div>Select a subproject</div>;
                return <SubprojectDetail 
                            subproject={selectedSubproject} 
                            ipos={ipos}
                            onBack={handleBack} 
                            previousPageName={previousPage === '/' ? 'Dashboard' : previousPage.slice(1)}
                            onUpdateSubproject={(updated) => {
                                setSubprojects(prev => prev.map(p => p.id === updated.id ? updated : p));
                                setSelectedSubproject(updated);

                                // Sync commodities to IPO
                                if (updated.subprojectCommodities && updated.subprojectCommodities.length > 0) {
                                    setIpos(prev => prev.map(ipo => {
                                        if (ipo.name === updated.indigenousPeopleOrganization) {
                                            const newCommodities = [...ipo.commodities];
                                            let changed = false;
                                            updated.subprojectCommodities?.forEach(sc => {
                                                const exists = newCommodities.some(c => c.particular === sc.name && c.type === sc.typeName);
                                                if (!exists) {
                                                    newCommodities.push({
                                                        type: sc.typeName,
                                                        particular: sc.name,
                                                        value: sc.area,
                                                        isScad: false
                                                    });
                                                    changed = true;
                                                }
                                            });
                                            if (changed) return { ...ipo, commodities: newCommodities };
                                        }
                                        return ipo;
                                    }));
                                }
                            }}
                            particularTypes={derivedParticularTypes}
                            uacsCodes={derivedUacsCodes}
                        />;
            case '/ipo-detail':
                if (!selectedIpo) return <div>Select an IPO</div>;
                return <IPODetail 
                            ipo={selectedIpo} 
                            subprojects={subprojects.filter(s => s.indigenousPeopleOrganization === selectedIpo.name)}
                            trainings={trainings.filter(t => t.participatingIpos.includes(selectedIpo.name))}
                            onBack={handleBack}
                            previousPageName={previousPage === '/' ? 'Dashboard' : previousPage.slice(1)}
                            onUpdateIpo={(updated) => {
                                setIpos(prev => prev.map(i => i.id === updated.id ? updated : i));
                                setSelectedIpo(updated);
                            }}
                            onSelectSubproject={handleSelectSubproject}
                            particularTypes={derivedParticularTypes}
                        />;
            case '/settings':
                return <Settings 
                            isDarkMode={isDarkMode} 
                            toggleDarkMode={toggleDarkMode}
                            systemSettings={systemSettings}
                            setSystemSettings={setSystemSettings}
                        />;
            default:
                return <div className="p-6">Page not found</div>;
        }
    };

    return (
        <div className={`flex h-screen bg-gray-100 dark:bg-gray-900 transition-colors duration-200 ${isDarkMode ? 'dark' : ''}`}>
            <Sidebar 
                isOpen={isSidebarOpen} 
                closeSidebar={() => setIsSidebarOpen(false)} 
                currentPage={currentPage} 
                setCurrentPage={setCurrentPage} 
            />
            <div className="flex-1 flex flex-col overflow-hidden">
                <Header 
                    toggleSidebar={toggleSidebar} 
                    toggleDarkMode={toggleDarkMode} 
                    isDarkMode={isDarkMode} 
                    setCurrentPage={setCurrentPage}
                />
                <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 dark:bg-gray-900 p-4 md:p-6">
                    {renderPage()}
                </main>
            </div>
        </div>
    );
};

export const App: React.FC = () => {
    return (
        <AuthProvider>
            <AppContent />
        </AuthProvider>
    );
};
// --- End of App.tsx ---
