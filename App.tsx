// Author: 4K 
import React, { useState, useEffect, useMemo, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import DashboardsPage from './components/DashboardsPage';
import Subprojects from './components/Subprojects';
import { ActivitiesComponent } from './components/Activities';
import IPOs from './components/IPO';
import References, { ReferenceUacs, ReferenceParticular, ReferenceCommodity } from './components/References';
import Reports from './components/Reports';
import SubprojectDetail from './components/SubprojectDetail';
import IPODetail from './components/IPODetail';
import ActivityDetail from './components/ActivityDetail';
import Settings from './components/Settings';
import Login from './components/Login';
import ProgramManagement from './components/ProgramManagement';
import OfficeRequirementDetail from './components/program_management/OfficeRequirementDetail';
import StaffingRequirementDetail from './components/program_management/StaffingRequirementDetail';
import OtherExpenseDetail from './components/program_management/OtherExpenseDetail';
import useLocalStorageState from './hooks/useLocalStorageState';
import { useSupabaseTable, fetchAll } from './hooks/useSupabaseTable'; 
import { supabase } from './supabaseClient'; // Import supabase client
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { 
    initialUacsCodes, initialParticularTypes, Subproject, IPO, Activity, User,
    OfficeRequirement, StaffingRequirement, OtherProgramExpense, SystemSettings, defaultSystemSettings,
    Deadline, PlanningSchedule, ReferenceActivity
} from './constants';
import {
    sampleReferenceUacsList, sampleReferenceParticularList, sampleReferenceCommodityList
} from './samples';

// Helper to format page names for "Back to..." buttons
const getPageName = (path: string) => {
    if (path === '/') return 'Dashboard';
    if (path === '/ipo-detail') return 'IPO Details';
    if (path === '/ipo') return 'IPO List';
    if (path === '/activity-detail') return 'Activity Details';
    if (path === '/program-management') return 'Program Management';
    
    // Generic formatter: remove slash, replace hyphens with spaces, capitalize words
    return path.substring(1)
        .replace(/-/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
};

const AppContent: React.FC = () => {
    const { currentUser } = useAuth();
    // Initialize Sidebar state based on screen width (Open on Desktop by default)
    const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth >= 768);
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [currentPage, setCurrentPage] = useState('/');

    // --- DATA STATE MANAGEMENT ---
    
    // Subprojects, IPOs, Activities use the sync hook
    const [subprojects, setSubprojects] = useSupabaseTable<Subproject>('subprojects', []);
    const [ipos, setIpos] = useSupabaseTable<IPO>('ipos', []);
    const [activities, setActivities] = useSupabaseTable<Activity>('activities', []);
    
    // Program Management States - Managed manually to support direct CRUD with generated IDs
    const [officeReqs, setOfficeReqs] = useState<OfficeRequirement[]>([]);
    const [staffingReqs, setStaffingReqs] = useState<StaffingRequirement[]>([]);
    const [otherProgramExpenses, setOtherProgramExpenses] = useState<OtherProgramExpense[]>([]);

    // System Settings States (Deadlines and Schedules)
    // Managed manually to support direct DB operations
    const [deadlines, setDeadlines] = useState<Deadline[]>([]);
    const [planningSchedules, setPlanningSchedules] = useState<PlanningSchedule[]>([]);

    // Fetch Program Management & System Settings Data on mount
    useEffect(() => {
        if (!supabase) return;
        const fetchAllData = async () => {
            const or = await fetchAll('office_requirements', 'id', false);
            setOfficeReqs(or as OfficeRequirement[]);

            const sr = await fetchAll('staffing_requirements', 'id', false);
            setStaffingReqs(sr as StaffingRequirement[]);

            const oe = await fetchAll('other_program_expenses', 'id', false);
            setOtherProgramExpenses(oe as OtherProgramExpense[]);

            // Fetch System Settings
            const dl = await fetchAll('deadlines', 'date', true);
            setDeadlines(dl as Deadline[]);

            const ps = await fetchAll('planning_schedules', 'startDate', true);
            setPlanningSchedules(ps as PlanningSchedule[]);
        };
        fetchAllData();
    }, [currentUser]);

    // Reference States
    const [referenceUacsList, setReferenceUacsList] = useSupabaseTable<ReferenceUacs>('reference_uacs', sampleReferenceUacsList);
    const [referenceParticularList, setReferenceParticularList] = useSupabaseTable<ReferenceParticular>('reference_particulars', sampleReferenceParticularList);
    const [referenceCommodityList, setReferenceCommodityList] = useSupabaseTable<ReferenceCommodity>('reference_commodities', sampleReferenceCommodityList);
    const [referenceActivities, setReferenceActivities] = useSupabaseTable<ReferenceActivity>('reference_activities', []);

    // Construct systemSettings object for child components that expect it
    const systemSettings = useMemo(() => ({
        deadlines,
        planningSchedules
    }), [deadlines, planningSchedules]);

    // Selection States
    const [selectedSubproject, setSelectedSubproject] = useState<Subproject | null>(null);
    const [selectedIpo, setSelectedIpo] = useState<IPO | null>(null);
    const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
    const [selectedOfficeReq, setSelectedOfficeReq] = useState<OfficeRequirement | null>(null);
    const [selectedStaffingReq, setSelectedStaffingReq] = useState<StaffingRequirement | null>(null);
    const [selectedOtherExpense, setSelectedOtherExpense] = useState<OtherProgramExpense | null>(null);
    
    // Navigation History Stack
    const [historyStack, setHistoryStack] = useState<string[]>([]);
    const previousPage = historyStack.length > 0 ? historyStack[historyStack.length - 1] : '/';

    // Track previous user to redirect to home on login
    const prevUserRef = useRef<User | null>(null);

    useEffect(() => {
        if (currentUser && !prevUserRef.current) {
            setCurrentPage('/');
            setHistoryStack([]);
        }
        prevUserRef.current = currentUser;
    }, [currentUser]);

    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
    const toggleDarkMode = () => {
        setIsDarkMode(!isDarkMode);
        document.documentElement.classList.toggle('dark');
    };

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

    const derivedCommodityCategories = useMemo(() => {
        const categories: { [key: string]: string[] } = {
            'Animal Commodity': [],
            'Crop Commodity': [],
            'Industrial Commodity': []
        };
        referenceCommodityList.forEach(item => {
            if (categories[item.type]) {
                if (!categories[item.type].includes(item.particular)) {
                    categories[item.type].push(item.particular);
                }
            }
        });
        // Sort items
        Object.keys(categories).forEach(key => categories[key].sort());
        return categories;
    }, [referenceCommodityList]);

    // Derived Activities
    const trainings = useMemo(() => activities.filter(a => a.type === 'Training'), [activities]);
    const otherActivities = useMemo(() => activities.filter(a => a.type === 'Activity'), [activities]);

    // Navigation Handlers
    const handleSelectSubproject = (project: Subproject) => {
        setSelectedSubproject(project);
        setHistoryStack(prev => [...prev, currentPage]);
        setCurrentPage('/subproject-detail');
    };

    const handleSelectIpo = (ipo: IPO) => {
        setSelectedIpo(ipo);
        setHistoryStack(prev => [...prev, currentPage]);
        setCurrentPage('/ipo-detail');
    };

    const handleSelectActivity = (activity: Activity) => {
        setSelectedActivity(activity);
        setHistoryStack(prev => [...prev, currentPage]);
        setCurrentPage('/activity-detail');
    };

    const handleSelectOfficeReq = (req: OfficeRequirement) => {
        setSelectedOfficeReq(req);
        setHistoryStack(prev => [...prev, currentPage]);
        setCurrentPage('/program-management/office-detail');
    };

    const handleSelectStaffingReq = (req: StaffingRequirement) => {
        setSelectedStaffingReq(req);
        setHistoryStack(prev => [...prev, currentPage]);
        setCurrentPage('/program-management/staffing-detail');
    };

    const handleSelectOtherExpense = (req: OtherProgramExpense) => {
        setSelectedOtherExpense(req);
        setHistoryStack(prev => [...prev, currentPage]);
        setCurrentPage('/program-management/other-expense-detail');
    };

    const handleBack = () => {
        if (historyStack.length === 0) return;
        
        const prev = historyStack[historyStack.length - 1];
        setHistoryStack(prevStack => prevStack.slice(0, -1));
        setCurrentPage(prev);

        // Cleanup selection states if we are leaving their detail views
        // We check the page we are *leaving* (currentPage)
        if (currentPage === '/subproject-detail') setSelectedSubproject(null);
        if (currentPage === '/activity-detail') setSelectedActivity(null);
        if (currentPage === '/ipo-detail') setSelectedIpo(null);
        if (currentPage === '/program-management/office-detail') setSelectedOfficeReq(null);
        if (currentPage === '/program-management/staffing-detail') setSelectedStaffingReq(null);
        if (currentPage === '/program-management/other-expense-detail') setSelectedOtherExpense(null);
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
                            officeReqs={officeReqs}
                            staffingReqs={staffingReqs}
                            otherProgramExpenses={otherProgramExpenses}
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
                            commodityCategories={derivedCommodityCategories}
                        />;
            case '/trainings':
                return <ActivitiesComponent 
                            ipos={ipos} 
                            activities={activities}
                            setActivities={setActivities}
                            onSelectIpo={handleSelectIpo}
                            onSelectActivity={handleSelectActivity}
                            uacsCodes={derivedUacsCodes}
                            referenceActivities={referenceActivities}
                            forcedType="Training"
                        />;
            case '/other-activities':
                return <ActivitiesComponent 
                            ipos={ipos} 
                            activities={activities}
                            setActivities={setActivities}
                            onSelectIpo={handleSelectIpo}
                            onSelectActivity={handleSelectActivity}
                            uacsCodes={derivedUacsCodes}
                            referenceActivities={referenceActivities}
                            forcedType="Activity"
                        />;
            case '/activities': 
                return <ActivitiesComponent 
                            ipos={ipos} 
                            activities={activities}
                            setActivities={setActivities}
                            onSelectIpo={handleSelectIpo}
                            onSelectActivity={handleSelectActivity}
                            uacsCodes={derivedUacsCodes}
                            referenceActivities={referenceActivities}
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
                            onSelectOfficeReq={handleSelectOfficeReq}
                            onSelectStaffingReq={handleSelectStaffingReq}
                            onSelectOtherExpense={handleSelectOtherExpense}
                        />;
            case '/program-management/office-detail':
                if (!selectedOfficeReq) return <div>Select an item</div>;
                return <OfficeRequirementDetail 
                            item={selectedOfficeReq}
                            onBack={handleBack}
                            uacsCodes={derivedUacsCodes}
                            onUpdate={(updatedItem) => {
                                setOfficeReqs(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
                                setSelectedOfficeReq(updatedItem);
                            }}
                        />;
            case '/program-management/staffing-detail':
                if (!selectedStaffingReq) return <div>Select an item</div>;
                return <StaffingRequirementDetail 
                            item={selectedStaffingReq}
                            onBack={handleBack}
                            uacsCodes={derivedUacsCodes}
                            onUpdate={(updatedItem) => {
                                setStaffingReqs(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
                                setSelectedStaffingReq(updatedItem);
                            }}
                        />;
            case '/program-management/other-expense-detail':
                if (!selectedOtherExpense) return <div>Select an item</div>;
                return <OtherExpenseDetail 
                            item={selectedOtherExpense}
                            onBack={handleBack}
                            uacsCodes={derivedUacsCodes}
                            onUpdate={(updatedItem) => {
                                setOtherProgramExpenses(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
                                setSelectedOtherExpense(updatedItem);
                            }}
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
                            commodityCategories={derivedCommodityCategories}
                        />;
            case '/references':
                return <References 
                            uacsList={referenceUacsList} 
                            setUacsList={setReferenceUacsList}
                            particularList={referenceParticularList}
                            setParticularList={setReferenceParticularList}
                            commodityList={referenceCommodityList}
                            setCommodityList={setReferenceCommodityList}
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
                            previousPageName={getPageName(previousPage)}
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
                            commodityCategories={derivedCommodityCategories}
                        />;
            case '/ipo-detail':
                if (!selectedIpo) return <div>Select an IPO</div>;
                return <IPODetail 
                            ipo={selectedIpo} 
                            subprojects={subprojects.filter(s => s.indigenousPeopleOrganization === selectedIpo.name)}
                            trainings={trainings.filter(t => t.participatingIpos.includes(selectedIpo.name))}
                            onBack={handleBack}
                            previousPageName={getPageName(previousPage)}
                            onUpdateIpo={(updated) => {
                                setIpos(prev => prev.map(i => i.id === updated.id ? updated : i));
                                setSelectedIpo(updated);
                            }}
                            onSelectSubproject={handleSelectSubproject}
                            onSelectActivity={handleSelectActivity}
                            particularTypes={derivedParticularTypes}
                            commodityCategories={derivedCommodityCategories}
                        />;
            case '/activity-detail':
                if (!selectedActivity) return <div>Select an activity</div>;
                return <ActivityDetail
                            activity={selectedActivity}
                            ipos={ipos}
                            onBack={handleBack} 
                            previousPageName={getPageName(previousPage)}
                            onUpdateActivity={(updated) => {
                                setActivities(prev => prev.map(a => a.id === updated.id ? updated : a));
                                setSelectedActivity(updated);
                            }}
                            uacsCodes={derivedUacsCodes}
                            referenceActivities={referenceActivities}
                            onSelectIpo={handleSelectIpo}
                        />;
            case '/settings':
                return <Settings 
                            isDarkMode={isDarkMode} 
                            toggleDarkMode={toggleDarkMode}
                            deadlines={deadlines}
                            setDeadlines={setDeadlines}
                            planningSchedules={planningSchedules}
                            setPlanningSchedules={setPlanningSchedules}
                        />;
            // New Page Placeholders
            case '/marketing-database':
                return <div className="p-10 text-center text-gray-500 dark:text-gray-400 italic">Marketing Database Module - Coming Soon</div>;
            case '/level-of-development':
                return <div className="p-10 text-center text-gray-500 dark:text-gray-400 italic">Level of Development Module - Coming Soon</div>;
            case '/commodity-mapping':
                return <div className="p-10 text-center text-gray-500 dark:text-gray-400 italic">Commodity Mapping Module - Coming Soon</div>;
            default:
                return <div className="p-6">Page not found</div>;
        }
    };

    return (
        <div className={`flex h-screen bg-gray-100 dark:bg-gray-900 transition-colors duration-200 ${isDarkMode ? 'dark' : ''}`}>
            <Sidebar 
                isOpen={isSidebarOpen} 
                toggleSidebar={toggleSidebar}
                closeSidebar={() => setIsSidebarOpen(false)} 
                currentPage={currentPage} 
                setCurrentPage={(page) => {
                    setHistoryStack(prev => [...prev, currentPage]);
                    setCurrentPage(page);
                }} 
            />
            <div className="flex-1 flex flex-col overflow-hidden">
                <Header 
                    toggleSidebar={toggleSidebar} 
                    toggleDarkMode={toggleDarkMode} 
                    isDarkMode={isDarkMode} 
                    setCurrentPage={(page) => {
                        setHistoryStack(prev => [...prev, currentPage]);
                        setCurrentPage(page);
                    }}
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