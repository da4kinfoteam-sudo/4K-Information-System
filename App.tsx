
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
import SubprojectEdit from './components/SubprojectEdit';
import IPODetail from './components/IPODetail';
import { ActivityDetail } from './components/ActivityDetail';
import ActivityEdit from './components/ActivityEdit';
import Settings from './components/Settings';
import Login from './components/Login';
import ProgramManagement from './components/ProgramManagement';
import OfficeRequirementDetail from './components/program_management/OfficeRequirementDetail';
import StaffingRequirementDetail from './components/program_management/StaffingRequirementDetail';
import OtherExpenseDetail from './components/program_management/OtherExpenseDetail';
import FinancialAccomplishment from './components/accomplishment/FinancialAccomplishment'; 
import PhysicalAccomplishment from './components/accomplishment/PhysicalAccomplishment'; // Import new component
// Resources Folder Components
import MarketingDatabase from './components/resources/MarketingDatabase';
import MarketProfileDetail from './components/resources/MarketProfileDetail';
import MarketProfileEdit from './components/resources/MarketProfileEdit';
import MarketLinkageEdit from './components/resources/MarketLinkageEdit';
import CommodityMappingPage from './components/resources/CommodityMappingPage';
import LODPage from './components/LOD/LODPage';
import LODDetails from './components/LOD/LODDetails';
import AIChatbot from './components/AIChatbot'; // Import Chatbot

import useLocalStorageState from './hooks/useLocalStorageState';
import { useSupabaseTable, fetchAll } from './hooks/useSupabaseTable'; 
import { supabase } from './supabaseClient'; // Import supabase client
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { 
    initialUacsCodes, initialParticularTypes, Subproject, IPO, Activity, User,
    OfficeRequirement, StaffingRequirement, OtherProgramExpense, SystemSettings, defaultSystemSettings,
    Deadline, PlanningSchedule, ReferenceActivity, MarketingPartner, GidaArea, ElcacArea, RefCommodity, RefLivestock, RefEquipment,
    RefInput, RefInfrastructure, RefTrainingReference
} from './constants';
import {
    sampleReferenceUacsList, sampleReferenceParticularList
} from './samples';

// Helper to format page names for "Back to..." buttons
const getPageName = (path: string) => {
    if (path === '/') return 'Dashboard';
    if (path === '/ipo-detail') return 'IPO Details';
    if (path === '/ipo') return 'IPO List';
    if (path === '/activity-detail') return 'Activity Details';
    if (path === '/program-management') return 'Program Management';
    if (path === '/marketing-database') return 'Marketing Database';
    if (path === '/marketing-profile-detail') return 'Partner Profile';
    
    // Generic formatter: remove slash, replace hyphens with spaces, capitalize words
    return path.substring(1)
        .replace(/-/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
};

const AccessDenied: React.FC<{ onBackToHome: () => void }> = ({ onBackToHome }) => (
    <div className="flex flex-col items-center justify-center h-full space-y-6 text-center">
        <div className="bg-red-100 dark:bg-red-900/30 p-6 rounded-full">
            <svg className="w-16 h-16 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
        </div>
        <div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">403 Access Denied</h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                You do not have permission to view this specific page or module based on your current role and settings.
            </p>
        </div>
        <button 
            onClick={onBackToHome}
            className="px-6 py-2 bg-accent text-white rounded-md font-medium hover:bg-opacity-90 transition-colors shadow-sm"
        >
            Return to Dashboard
        </button>
    </div>
);

const AppContent: React.FC = () => {
    const { currentUser, hasAccess, isAuthReady } = useAuth();
    // Initialize Sidebar state based on screen width (Open on Desktop by default)
    const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth >= 768);
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [currentPage, setCurrentPage] = useState('/');

    // Global Filter State (Triggered by AI or External links)
    const [externalFilters, setExternalFilters] = useState<{ 
        region?: string; 
        year?: string; 
        search?: string;
        status?: string;
    } | null>(null);

    // Callback to clear external filters after they are consumed by a component
    const clearExternalFilters = () => {
        setExternalFilters(null);
    };

    // --- DATA STATE MANAGEMENT ---
    
    // Subprojects, IPOs, Activities use the sync hook
    const [subprojects, setSubprojects] = useSupabaseTable<Subproject>('subprojects', []);
    const [ipos, setIpos] = useSupabaseTable<IPO>('ipos', []);
    const [activities, setActivities] = useSupabaseTable<Activity>('activities', []);
    const [marketingPartners, setMarketingPartners] = useSupabaseTable<MarketingPartner>('marketing_partners', []);
    
    // Program Management States - Managed manually to support direct CRUD with generated IDs
    const [officeReqs, setOfficeReqs] = useState<OfficeRequirement[]>([]);
    const [staffingReqs, setStaffingReqs] = useState<StaffingRequirement[]>([]);
    const [otherProgramExpenses, setOtherProgramExpenses] = useState<OtherProgramExpense[]>([]);

    // System Settings States (Deadlines)
    // Managed manually to support direct DB operations
    const [deadlines, setDeadlines] = useState<Deadline[]>([]);
    const [budgetCeilings, setBudgetCeilings] = useState<any[]>([]);

    // Fetch Program Management & System Settings Data on mount
    useEffect(() => {
        if (!supabase || !isAuthReady) return;
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

            // Fetch Budget Ceilings
            const { data: bc } = await supabase.from('budget_ceilings').select('*');
            setBudgetCeilings(bc || []);

            // Fetch GIDA Areas
            const ga = await fetchAll('gida_areas', 'id', true);
            setGidaAreas(ga as GidaArea[]);

            // Fetch ELCAC Areas
            const ea = await fetchAll('elcac_areas', 'id', true);
            setElcacAreas(ea as ElcacArea[]);
        };
        fetchAllData();
    }, [currentUser]);

    // Helper to filter data based on visibility scope
    const filterByVisibility = <T extends { operatingUnit?: string }>(data: T[]): T[] => {
        if (!currentUser) return data;
        if (['Super Admin', 'Administrator'].includes(currentUser.role)) return data;
        const scope = currentUser.visibility_scope || 'All OUs';
        if (scope === 'All OUs') return data;
        return data.filter(item => item.operatingUnit === currentUser.operatingUnit);
    };

    const visibleSubprojects = filterByVisibility(subprojects);
    const visibleActivities = filterByVisibility(activities);
    const visibleOfficeReqs = filterByVisibility(officeReqs);
    const visibleStaffingReqs = filterByVisibility(staffingReqs);
    const visibleOtherExpenses = filterByVisibility(otherProgramExpenses);

    // Reference States
    const [referenceUacsList, setReferenceUacsList] = useSupabaseTable<ReferenceUacs>('reference_uacs', sampleReferenceUacsList);
    const [referenceParticularList, setReferenceParticularList] = useSupabaseTable<ReferenceParticular>('reference_particulars', sampleReferenceParticularList);
    const [refCommodities, setRefCommodities] = useSupabaseTable<RefCommodity>('ref_commodities', []);
    const [refLivestock, setRefLivestock] = useSupabaseTable<RefLivestock>('ref_livestock', []);
    const [refEquipment, setRefEquipment] = useSupabaseTable<RefEquipment>('ref_equipment', []);
    const [refInputs, setRefInputs] = useSupabaseTable<RefInput>('ref_inputs', []);
    const [refInfrastructure, setRefInfrastructure] = useSupabaseTable<RefInfrastructure>('ref_infrastructure', []);
    const [refTrainings, setRefTrainings] = useSupabaseTable<RefTrainingReference>('ref_trainings', []);
    const [referenceActivities, setReferenceActivities] = useSupabaseTable<ReferenceActivity>('reference_activities', []);
    const [gidaAreas, setGidaAreas] = useState<GidaArea[]>([]);
    const [elcacAreas, setElcacAreas] = useState<ElcacArea[]>([]);

    if (!isAuthReady && currentUser && !currentUser.email?.endsWith('@offline.local')) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
                <div className="flex flex-col items-center">
                    <div className="relative h-16 w-16">
                        <div className="absolute inset-0 border-4 border-emerald-500/20 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <p className="mt-6 text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-widest text-[10px] animate-pulse text-center max-w-xs leading-relaxed">
                        Empowering Indigenous Peoples towards Self Determination
                    </p>
                </div>
            </div>
        );
    }

    // Construct systemSettings object for child components that expect it
    const systemSettings = useMemo(() => ({
        deadlines
    }), [deadlines]);

    // Selection States
    const [selectedSubproject, setSelectedSubproject] = useState<Subproject | null>(null);
    const [selectedIpo, setSelectedIpo] = useState<IPO | null>(null);
    const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
    const [selectedOfficeReq, setSelectedOfficeReq] = useState<OfficeRequirement | null>(null);
    const [selectedStaffingReq, setSelectedStaffingReq] = useState<StaffingRequirement | null>(null);
    const [selectedOtherExpense, setSelectedOtherExpense] = useState<OtherProgramExpense | null>(null);
    const [selectedMarketingPartner, setSelectedMarketingPartner] = useState<MarketingPartner | null>(null);
    
    // Activity Edit Mode State
    const [activityEditMode, setActivityEditMode] = useState<'create' | 'details' | 'expenses' | 'accomplishment'>('create');
    
    // Navigation History Stack
    const [historyStack, setHistoryStack] = useState<string[]>([]);
    const previousPage = historyStack.length > 0 ? historyStack[historyStack.length - 1] : '/';

    const currentPageRef = useRef(currentPage);
    const historyStackRef = useRef(historyStack);

    useEffect(() => {
        currentPageRef.current = currentPage;
    }, [currentPage]);

    useEffect(() => {
        historyStackRef.current = historyStack;
    }, [historyStack]);

    const navigateTo = (page: string) => {
        const current = currentPageRef.current;
        const stack = historyStackRef.current;
        const newStack = [...stack, current];
        setHistoryStack(newStack);
        setCurrentPage(page);
        // Use hash-based routing to avoid 404 on refresh in static environments
        window.history.pushState({ page, stack: newStack }, '', `/#${page}`);
    };

    useEffect(() => {
        const handlePopState = (event: PopStateEvent) => {
            const leavingPage = currentPageRef.current;
            
            if (leavingPage === '/subproject-detail') setSelectedSubproject(null);
            if (leavingPage === '/activity-detail') setSelectedActivity(null);
            if (leavingPage === '/ipo-detail') setSelectedIpo(null);
            if (leavingPage === '/program-management/office-detail') setSelectedOfficeReq(null);
            if (leavingPage === '/program-management/staffing-detail') setSelectedStaffingReq(null);
            if (leavingPage === '/program-management/other-expense-detail') setSelectedOtherExpense(null);
            if (leavingPage === '/marketing-profile-detail') setSelectedMarketingPartner(null);
            if (leavingPage === '/lod-details') setSelectedIpo(null);

            if (event.state && event.state.page) {
                setCurrentPage(event.state.page);
                setHistoryStack(event.state.stack || []);
            } else {
                // Parse the page from the hash instead of pathname to avoid 404
                const path = window.location.hash.replace('#', '') || '/';
                setCurrentPage(path);
                setHistoryStack([]);
            }
        };

        window.addEventListener('popstate', handlePopState);
        
        // Initial setup: Fix for 404 on refresh
        // To satisfy the requirement of going back to homepage on refresh,
        // we force the page to '/' regardless of the current URL hash/path.
        const initialPath = '/';
        window.history.replaceState({ page: initialPath, stack: [] }, '', `/#${initialPath}`);
        setCurrentPage(initialPath);

        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // Track previous user to redirect to home on login
    const prevUserRef = useRef<User | null>(null);

    useEffect(() => {
        if (currentUser && !prevUserRef.current) {
            setCurrentPage('/');
            setHistoryStack([]);
            window.history.replaceState({ page: '/', stack: [] }, '', '/#/');
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
            'Livestock': [],
            'Crop': []
        };
        refCommodities.forEach(item => {
            if (!categories['Crop'].includes(item.name)) {
                categories['Crop'].push(item.name);
            }
        });
        refLivestock.forEach(item => {
            if (!categories['Livestock'].includes(item.name)) {
                categories['Livestock'].push(item.name);
            }
        });
        // Sort items
        Object.keys(categories).forEach(key => categories[key].sort());
        return categories;
    }, [refCommodities, refLivestock]);

    // Derived Activities
    const trainings = useMemo(() => activities.filter(a => a.type === 'Training'), [activities]);
    const otherActivities = useMemo(() => activities.filter(a => a.type === 'Activity'), [activities]);

    // Navigation Handlers
    const handleSelectSubproject = (project: Subproject) => {
        setSelectedSubproject(project);
        navigateTo('/subproject-detail');
    };

    const handleSelectIpo = (ipo: IPO) => {
        setSelectedIpo(ipo);
        navigateTo('/ipo-detail');
    };

    const handleSelectActivity = (activity: Activity) => {
        setSelectedActivity(activity);
        navigateTo('/activity-detail');
    };

    const handleSelectOfficeReq = (req: OfficeRequirement) => {
        setSelectedOfficeReq(req);
        navigateTo('/program-management/office-detail');
    };

    const handleSelectStaffingReq = (req: StaffingRequirement) => {
        setSelectedStaffingReq(req);
        navigateTo('/program-management/staffing-detail');
    };

    const handleSelectOtherExpense = (req: OtherProgramExpense) => {
        setSelectedOtherExpense(req);
        navigateTo('/program-management/other-expense-detail');
    };

    const handleSelectMarketingPartner = (partner: MarketingPartner) => {
        setSelectedMarketingPartner(partner);
        navigateTo('/marketing-profile-detail');
    }
    
    // New handler for activity creation
    const handleCreateActivity = () => {
        setActivityEditMode('create');
        setSelectedActivity(null);
        navigateTo('/activity-edit');
    };
    
    const handleCreateSubproject = () => {
        setSelectedSubproject(null);
        navigateTo('/subproject-edit');
    };

    const handleBack = () => {
        if (historyStackRef.current.length === 0) {
            navigateTo('/');
            return;
        }
        window.history.back();
    };

    // Generic navigation handler for Chatbot
    const handleNavigate = (path: string) => {
        navigateTo(path);
    };
    
    // Handler for Chatbot-driven filters
    const handleApplyFilter = (filters: { region?: string; year?: string; search?: string; status?: string }) => {
        setExternalFilters(filters);
    };

    if (!currentUser) {
        return <Login />;
    }

    const handleSelectIpoForLod = (ipo: IPO) => {
        setSelectedIpo(ipo);
        navigateTo('/lod-details');
    };

    const renderPage = () => {
        const checkAccess = (module: string) => hasAccess(module, 'view');
        const denied = <AccessDenied onBackToHome={() => navigateTo('/')} />;

        // Phase 6: Guard clauses for module-level access
        if (currentPage === '/dashboards' && !checkAccess('Dashboards')) return denied;
        if (currentPage === '/reports' && !checkAccess('Reports')) return denied;
        
        if (['/subprojects', '/subproject-edit', '/subproject-detail'].includes(currentPage)) {
            if (!checkAccess('Subprojects')) return denied;
        }
        if (['/trainings', '/other-activities', '/activities', '/activity-edit', '/activity-detail'].includes(currentPage)) {
            if (!checkAccess('Activities')) return denied;
        }
        if (['/program-management', '/program-management/office-detail', '/program-management/staffing-detail', '/program-management/other-expense-detail'].includes(currentPage)) {
            if (!checkAccess('Program Management')) return denied;
        }
        if (currentPage === '/accomplishment/financial' && !checkAccess('Accomplishment - Financial')) return denied;
        if (currentPage === '/accomplishment/physical' && !checkAccess('Accomplishment - Physical')) return denied;
        
        if (['/ipo', '/ipo-detail'].includes(currentPage)) {
            if (!checkAccess('IPO Management')) return denied;
        }
        if (['/marketing-database', '/marketing-profile-detail', '/marketing-profile-edit', '/marketing-linkage-edit'].includes(currentPage)) {
            if (!checkAccess('Marketing Database')) return denied;
        }
        if (['/level-of-development', '/lod-details'].includes(currentPage)) {
            if (!checkAccess('Level of Development')) return denied;
        }
        if (currentPage === '/commodity-mapping') {
            if (!checkAccess('Community Mapping')) return denied;
        }
        if (currentPage === '/references' && !checkAccess('References')) return denied;
        if (currentPage === '/settings' && !checkAccess('System Management')) {
             // System Management is for the whole settings tab, but maybe we should allow profiles?
             // Usually settings has profile. Let's see.
        }

        switch (currentPage) {
            case '/':
                return <Dashboard 
                            subprojects={visibleSubprojects} 
                            ipos={ipos} 
                            activities={visibleActivities}
                            systemSettings={systemSettings}
                            officeReqs={visibleOfficeReqs}
                            staffingReqs={visibleStaffingReqs}
                            otherProgramExpenses={visibleOtherExpenses}
                            onSelectSubproject={handleSelectSubproject}
                            onSelectActivity={handleSelectActivity}
                            // @ts-ignore
                            externalFilters={externalFilters}
                        />;
            case '/dashboards':
                 return <DashboardsPage 
                            subprojects={visibleSubprojects} 
                            ipos={ipos} 
                            trainings={visibleActivities.filter(a => a.type === 'Training')}
                            otherActivities={visibleActivities.filter(a => a.type === 'Activity')}
                            officeReqs={visibleOfficeReqs}
                            staffingReqs={visibleStaffingReqs}
                            otherProgramExpenses={visibleOtherExpenses}
                            onSelectIpo={handleSelectIpo}
                            onSelectSubproject={handleSelectSubproject}
                            onSelectActivity={handleSelectActivity}
                            setExternalFilters={setExternalFilters}
                            navigateTo={navigateTo}
                        />;
            case '/subprojects':
                return <Subprojects 
                            ipos={ipos} 
                            subprojects={visibleSubprojects} 
                            setSubprojects={setSubprojects}
                            setIpos={setIpos} 
                            onSelectIpo={handleSelectIpo}
                            onSelectSubproject={handleSelectSubproject}
                            onCreateSubproject={handleCreateSubproject}
                            uacsCodes={derivedUacsCodes}
                            particularTypes={derivedParticularTypes}
                            commodityCategories={derivedCommodityCategories}
                            externalFilters={externalFilters}
                            onClearExternalFilters={clearExternalFilters}
                        />;
            case '/trainings':
                return <ActivitiesComponent 
                            ipos={ipos} 
                            activities={visibleActivities}
                            setActivities={setActivities}
                            onSelectIpo={handleSelectIpo}
                            onSelectActivity={handleSelectActivity}
                            onCreateActivity={handleCreateActivity}
                            uacsCodes={derivedUacsCodes}
                            referenceActivities={referenceActivities}
                            forcedType="Training"
                            externalFilters={externalFilters}
                            onClearExternalFilters={clearExternalFilters}
                        />;
            case '/other-activities':
                return <ActivitiesComponent 
                            ipos={ipos} 
                            activities={visibleActivities}
                            setActivities={setActivities}
                            onSelectIpo={handleSelectIpo}
                            onSelectActivity={handleSelectActivity}
                            onCreateActivity={handleCreateActivity}
                            uacsCodes={derivedUacsCodes}
                            referenceActivities={referenceActivities}
                            forcedType="Activity"
                            externalFilters={externalFilters}
                            onClearExternalFilters={clearExternalFilters}
                        />;
            case '/activities': 
                return <ActivitiesComponent 
                            ipos={ipos} 
                            activities={visibleActivities}
                            setActivities={setActivities}
                            onSelectIpo={handleSelectIpo}
                            onSelectActivity={handleSelectActivity}
                            onCreateActivity={handleCreateActivity}
                            uacsCodes={derivedUacsCodes}
                            referenceActivities={referenceActivities}
                            externalFilters={externalFilters}
                            onClearExternalFilters={clearExternalFilters}
                        />;
            case '/activity-edit':
                return <ActivityEdit 
                            mode={activityEditMode}
                            activity={selectedActivity || undefined}
                            ipos={ipos}
                            onBack={handleBack}
                            onUpdateActivity={(updated) => {
                                if (activityEditMode === 'create') {
                                     setActivities(prev => [...prev, updated]);
                                } else {
                                     setActivities(prev => prev.map(a => a.id === updated.id ? updated : a));
                                     setSelectedActivity(updated);
                                }
                            }}
                            uacsCodes={derivedUacsCodes}
                            referenceActivities={referenceActivities}
                            forcedType={
                                previousPage === '/trainings' ? 'Training' : 
                                previousPage === '/other-activities' ? 'Activity' : 
                                undefined
                            }
                        />;
            case '/subproject-edit':
                return <SubprojectEdit 
                            subproject={selectedSubproject || undefined}
                            ipos={ipos}
                            setIpos={setIpos}
                            onBack={handleBack}
                            onUpdateSubproject={(updated) => {
                                if (selectedSubproject) {
                                     setSubprojects(prev => prev.map(p => p.id === updated.id ? updated : p));
                                     setSelectedSubproject(updated);
                                } else {
                                     setSubprojects(prev => [updated, ...prev]);
                                }
                                
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
                            uacsCodes={derivedUacsCodes}
                            particularTypes={derivedParticularTypes}
                            commodityCategories={derivedCommodityCategories}
                            refCommodities={refCommodities}
                            refLivestock={refLivestock}
                        />;
            case '/program-management':
                return <ProgramManagement
                            officeReqs={visibleOfficeReqs}
                            setOfficeReqs={setOfficeReqs}
                            staffingReqs={visibleStaffingReqs}
                            setStaffingReqs={setStaffingReqs}
                            otherProgramExpenses={visibleOtherExpenses}
                            setOtherProgramExpenses={setOtherProgramExpenses}
                            uacsCodes={derivedUacsCodes}
                            onSelectOfficeReq={handleSelectOfficeReq}
                            onSelectStaffingReq={handleSelectStaffingReq}
                            onSelectOtherExpense={handleSelectOtherExpense}
                            // @ts-ignore
                            externalFilters={externalFilters}
                        />;
            // NEW ACCOMPLISHMENT ROUTES
            case '/accomplishment/financial':
                return <FinancialAccomplishment 
                            subprojects={visibleSubprojects}
                            setSubprojects={setSubprojects}
                            activities={visibleActivities}
                            setActivities={setActivities}
                            officeReqs={visibleOfficeReqs}
                            setOfficeReqs={setOfficeReqs}
                            staffingReqs={visibleStaffingReqs}
                            setStaffingReqs={setStaffingReqs}
                            otherProgramExpenses={visibleOtherExpenses}
                            setOtherProgramExpenses={setOtherProgramExpenses}
                            uacsCodes={derivedUacsCodes}
                            onSelectSubproject={handleSelectSubproject}
                            onSelectActivity={handleSelectActivity}
                            onSelectOfficeReq={handleSelectOfficeReq}
                            onSelectStaffingReq={handleSelectStaffingReq}
                            onSelectOtherExpense={handleSelectOtherExpense}
                        />;
            case '/accomplishment/physical':
                return <PhysicalAccomplishment 
                            subprojects={visibleSubprojects}
                            setSubprojects={setSubprojects}
                            activities={visibleActivities}
                            setActivities={setActivities}
                            officeReqs={visibleOfficeReqs}
                            setOfficeReqs={setOfficeReqs}
                            staffingReqs={visibleStaffingReqs}
                            setStaffingReqs={setStaffingReqs}
                            onSelectSubproject={handleSelectSubproject}
                            onSelectActivity={handleSelectActivity}
                            onSelectOfficeReq={handleSelectOfficeReq}
                            onSelectStaffingReq={handleSelectStaffingReq}
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
                            externalFilters={externalFilters}
                            onClearExternalFilters={clearExternalFilters}
                            gidaAreas={gidaAreas}
                            elcacAreas={elcacAreas}
                        />;
            case '/references':
                return <References 
                            uacsList={referenceUacsList} 
                            setUacsList={setReferenceUacsList}
                            particularList={referenceParticularList}
                            setParticularList={setReferenceParticularList}
                            refCommodities={refCommodities}
                            setRefCommodities={setRefCommodities}
                            refLivestock={refLivestock}
                            setRefLivestock={setRefLivestock}
                            refEquipment={refEquipment}
                            setRefEquipment={setRefEquipment}
                            refInputs={refInputs}
                            setRefInputs={setRefInputs}
                            refInfrastructure={refInfrastructure}
                            setRefInfrastructure={setRefInfrastructure}
                            refTrainings={refTrainings}
                            setRefTrainings={setRefTrainings}
                            gidaList={gidaAreas}
                            setGidaList={setGidaAreas}
                            elcacList={elcacAreas}
                            setElcacList={setElcacAreas}
                            ipos={ipos}
                            setIpos={setIpos}
                        />;
            case '/reports':
                return <Reports 
                            ipos={ipos} 
                            subprojects={visibleSubprojects} 
                            trainings={visibleActivities.filter(a => a.type === 'Training')}
                            otherActivities={visibleActivities.filter(a => a.type === 'Activity')}
                            officeReqs={visibleOfficeReqs}
                            staffingReqs={visibleStaffingReqs}
                            otherProgramExpenses={visibleOtherExpenses}
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
                            refCommodities={refCommodities}
                            refLivestock={refLivestock}
                        />;
            case '/ipo-detail':
                if (!selectedIpo) return <div>Select an IPO</div>;
                return <IPODetail 
                            ipo={selectedIpo} 
                            subprojects={subprojects.filter(s => s.indigenousPeopleOrganization === selectedIpo.name)}
                            trainings={trainings.filter(t => t.participatingIpos.includes(selectedIpo.name))}
                            marketingPartners={marketingPartners}
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
                            onEdit={(mode) => {
                                setActivityEditMode(mode);
                                navigateTo('/activity-edit');
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
                            // Pass data for DCF Management
                            subprojects={subprojects} setSubprojects={setSubprojects}
                            activities={activities} setActivities={setActivities}
                            ipos={ipos} setIpos={setIpos}
                            officeReqs={officeReqs} setOfficeReqs={setOfficeReqs}
                            staffingReqs={staffingReqs} setStaffingReqs={setStaffingReqs}
                            otherProgramExpenses={otherProgramExpenses} setOtherProgramExpenses={setOtherProgramExpenses}
                            onSelectSubproject={handleSelectSubproject}
                            onSelectActivity={handleSelectActivity}
                            onSelectIpo={handleSelectIpo}
                        />;
            // NEW RESOURCE ROUTES
            case '/marketing-database':
                return <MarketingDatabase 
                            partners={marketingPartners}
                            setPartners={setMarketingPartners}
                            onSelectPartner={handleSelectMarketingPartner}
                            commodityCategories={derivedCommodityCategories}
                        />;
            case '/marketing-profile-detail':
                if (!selectedMarketingPartner) return <div>Select a partner</div>;
                return <MarketProfileDetail 
                            partner={selectedMarketingPartner}
                            ipos={ipos}
                            onBack={handleBack}
                            onEditDetails={() => {
                                navigateTo('/marketing-profile-edit');
                            }}
                            onEditLinkages={() => {
                                navigateTo('/marketing-linkage-edit');
                            }}
                            commodityCategories={derivedCommodityCategories}
                        />;
            case '/marketing-profile-edit':
                if (!selectedMarketingPartner) return <div>Select a partner</div>;
                return <MarketProfileEdit 
                            partner={selectedMarketingPartner}
                            onBack={handleBack}
                            onUpdatePartner={(updated) => {
                                setMarketingPartners(prev => prev.map(p => p.id === updated.id ? updated : p));
                                setSelectedMarketingPartner(updated);
                            }}
                            commodityCategories={derivedCommodityCategories}
                        />;
            case '/marketing-linkage-edit':
                if (!selectedMarketingPartner) return <div>Select a partner</div>;
                return <MarketLinkageEdit 
                            partner={selectedMarketingPartner}
                            ipos={ipos}
                            onBack={handleBack}
                            onUpdatePartner={(updated) => {
                                setMarketingPartners(prev => prev.map(p => p.id === updated.id ? updated : p));
                                setSelectedMarketingPartner(updated);
                            }}
                        />;
            case '/level-of-development':
                return <LODPage ipos={ipos} onSelectIpo={handleSelectIpoForLod} />;
            case '/lod-details':
                if (!selectedIpo) return <div>Select an IPO</div>;
                return <LODDetails ipo={selectedIpo} onBack={handleBack} />;
            case '/commodity-mapping':
                return <CommodityMappingPage subprojects={subprojects} ipos={ipos} />;
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
                setCurrentPage={navigateTo} 
            />
            <div className="flex-1 flex flex-col overflow-hidden relative">
                <Header 
                    toggleSidebar={toggleSidebar} 
                    toggleDarkMode={toggleDarkMode} 
                    isDarkMode={isDarkMode} 
                    setCurrentPage={navigateTo}
                />
                <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 dark:bg-gray-900 p-4 md:p-6">
                    {renderPage()}
                </main>
                <AIChatbot 
                    subprojects={subprojects}
                    ipos={ipos}
                    activities={activities}
                    marketingPartners={marketingPartners}
                    officeReqs={officeReqs}
                    staffingReqs={staffingReqs}
                    otherProgramExpenses={otherProgramExpenses}
                    budgetCeilings={budgetCeilings}
                    onNavigate={handleNavigate}
                    onSelectSubproject={handleSelectSubproject}
                    onSelectIpo={handleSelectIpo}
                    onSelectActivity={handleSelectActivity}
                    onSelectMarketingPartner={handleSelectMarketingPartner}
                    onApplyFilter={handleApplyFilter}
                />
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
