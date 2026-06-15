
// Author: 4K 
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
import ActivityMonitoringReportDetail from './components/ActivityMonitoringReportDetail';
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
import MarketLinkageDetail from './components/resources/MarketLinkageDetail';
import CommodityMappingPage from './components/resources/CommodityMappingPage';
import LODPage from './components/LOD/LODPage';
import LODDetails from './components/LOD/LODDetails';
import AIChatbot from './components/AIChatbot'; // Import Chatbot

import useLocalStorageState from './hooks/useLocalStorageState';
import { useSupabaseTable } from './hooks/useSupabaseTable'; 
import { supabase } from './supabaseClient'; // Import supabase client
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DataScope, getDataScopeKey, loadScopedAppData } from './lib/scopedDataFetch';
import { clearUserCache, getScopeCacheMeta, readScopedCache, writeScopedCache } from './lib/localScopedCache';
import { 
    initialUacsCodes, initialParticularTypes, Subproject, IPO, Activity, User,
    OfficeRequirement, StaffingRequirement, OtherProgramExpense, SystemSettings, defaultSystemSettings,
    Deadline, PlanningSchedule, ReferenceActivity, MarketingPartner, GidaArea, ElcacArea, RefCommodity, RefLivestock, RefEquipment,
    RefInput, RefInfrastructure, RefTrainingReference, ActivityMonitoringAction, ActivityMonitoringReport
} from './constants';
import {
    sampleActivities, sampleMarketingPartners, sampleOfficeRequirements, sampleOtherProgramExpenses, sampleReferenceUacsList,
    sampleReferenceParticularList, sampleStaffingRequirements, sampleSubprojects, sampleRefCommodities,
    sampleRefLivestock, sampleRefEquipment, sampleRefInputs, sampleRefInfrastructure, sampleRefTrainings,
    sampleGidaAreas, sampleElcacAreas
} from './samples';
import { sampleIPOs } from './sampleIPOs';
import {
    applyTheme,
    getSavedThemePreference,
    getSystemThemePreference,
    resolveInitialTheme,
    saveThemePreference,
    THEME_STORAGE_KEY,
    ThemeMode
} from './lib/theme';

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
    const { currentUser, hasAccess, getVisibilityScope, isAuthReady, refreshUser, refreshUsersList, refreshPermissions } = useAuth();
    // Initialize Sidebar state based on screen width (Open on Desktop by default)
    const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth >= 768);
    const [themeMode, setThemeMode] = useState<ThemeMode>(() => resolveInitialTheme());
    const [currentPage, setCurrentPage] = useState('/');
    const isDarkMode = themeMode === 'dark';

    // Global Filter State (Triggered by AI or External links)
    const [externalFilters, setExternalFilters] = useState<{ 
        region?: string; 
        year?: string; 
        search?: string;
        status?: string;
        ancestralDomainNo?: string;
    } | null>(null);

    // Callback to clear external filters after they are consumed by a component
    const clearExternalFilters = () => {
        setExternalFilters(null);
    };

    // --- DATA STATE MANAGEMENT ---
    
    // Subprojects, IPOs, Activities use the sync hook
    const scopedTableOptions = { autoFetch: false };
    const [subprojects, setSubprojects, subprojectsSync] = useSupabaseTable<Subproject>('subprojects', sampleSubprojects, scopedTableOptions);
    const [ipos, setIpos, iposSync] = useSupabaseTable<IPO>('ipos', sampleIPOs, scopedTableOptions);
    const [activities, setActivities, activitiesSync] = useSupabaseTable<Activity>('activities', sampleActivities, scopedTableOptions);
    const [marketingPartners, setMarketingPartners, marketingPartnersSync] = useSupabaseTable<MarketingPartner>('marketing_partners', sampleMarketingPartners, scopedTableOptions);
    
    // Program Management States - loaded at startup and refreshed manually
    const [officeReqs, setOfficeReqs, officeReqsSync] = useSupabaseTable<OfficeRequirement>('office_requirements', sampleOfficeRequirements, scopedTableOptions);
    const [staffingReqs, setStaffingReqs, staffingReqsSync] = useSupabaseTable<StaffingRequirement>('staffing_requirements', sampleStaffingRequirements, scopedTableOptions);
    const [otherProgramExpenses, setOtherProgramExpenses, otherProgramExpensesSync] = useSupabaseTable<OtherProgramExpense>('other_program_expenses', sampleOtherProgramExpenses, scopedTableOptions);

    // Financial Records - loaded at startup and refreshed manually
    const [allFinancialObligations, setAllFinancialObligations, financialObligationsSync] = useSupabaseTable<any>('financial_obligations', [], scopedTableOptions);
    const [allFinancialDisbursements, setAllFinancialDisbursements, financialDisbursementsSync] = useSupabaseTable<any>('financial_disbursements', [], scopedTableOptions);

    // Hydration Logic
    const obligationsMap = useMemo(() => {
        const map = new Map<string, any[]>();
        allFinancialObligations.forEach(o => {
            const key = `${o.entity_type}-${o.parent_id}-${o.item_id || 'null'}`;
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push({
                id: o.id,
                date: o.obligation_date,
                amount: o.amount,
                remarks: o.remarks
            });
        });
        return map;
    }, [allFinancialObligations]);

    const disbursementsMap = useMemo(() => {
        const map = new Map<string, any[]>();
        allFinancialDisbursements.forEach(d => {
            const key = `${d.entity_type}-${d.parent_id}-${d.item_id || 'null'}`;
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push({
                id: d.id,
                date: d.disbursement_date,
                amount: d.amount,
                remarks: d.remarks
            });
        });
        return map;
    }, [allFinancialDisbursements]);

    const enrichedSubprojects: Subproject[] = useMemo(() => {
        return subprojects.map(sp => ({
            ...sp,
            details: sp.details?.map(d => {
                const key = `subproject_detail-${sp.id}-${d.id || 'null'}`;
                return { 
                    ...d, 
                    obligations: obligationsMap.get(key) || d.obligations || [],
                    disbursements: disbursementsMap.get(key) || d.disbursements || []
                };
            })
        }));
    }, [subprojects, obligationsMap, disbursementsMap]);

    const enrichedActivities: Activity[] = useMemo(() => {
        return activities.map(act => ({
            ...act,
            expenses: act.expenses?.map(e => {
                const key = `activity_expense-${act.id}-${e.id || 'null'}`;
                return { 
                    ...e, 
                    obligations: obligationsMap.get(key) || e.obligations || [],
                    disbursements: disbursementsMap.get(key) || e.disbursements || []
                };
            })
        }));
    }, [activities, obligationsMap, disbursementsMap]);

    const enrichedOfficeReqs: OfficeRequirement[] = useMemo(() => {
        return officeReqs.map(o => {
            const key = `office_requirement-${o.id}-null`;
            return { 
                ...o, 
                obligations: obligationsMap.get(key) || o.obligations || [],
                disbursements: disbursementsMap.get(key) || o.disbursements || []
            };
        });
    }, [officeReqs, obligationsMap, disbursementsMap]);

    const enrichedStaffingReqs: StaffingRequirement[] = useMemo(() => {
        return staffingReqs.map(s => {
            if (s.expenses && s.expenses.length > 0) {
                return {
                    ...s,
                    expenses: s.expenses.map(e => {
                        const key = `staffing_expense-${s.id}-${e.id}`;
                        return { 
                            ...e, 
                            obligations: obligationsMap.get(key) || e.obligations || [],
                            disbursements: disbursementsMap.get(key) || e.disbursements || []
                        };
                    })
                };
            }
            const key = `staffing_expense-${s.id}-null`;
            return { 
                ...s, 
                obligations: obligationsMap.get(key) || s.obligations || [],
                disbursements: disbursementsMap.get(key) || s.disbursements || []
            };
        });
    }, [staffingReqs, obligationsMap, disbursementsMap]);

    const enrichedOtherExpenses: OtherProgramExpense[] = useMemo(() => {
        return otherProgramExpenses.map(o => {
            const key = `other_program_expense-${o.id}-null`;
            return { 
                ...o, 
                obligations: obligationsMap.get(key) || o.obligations || [],
                disbursements: disbursementsMap.get(key) || o.disbursements || []
            };
        });
    }, [otherProgramExpenses, obligationsMap, disbursementsMap]);

    // System Settings States (Deadlines)
    // Managed manually to support direct DB operations
    const [deadlines, setDeadlines] = useState<Deadline[]>([]);
    const [budgetCeilings, setBudgetCeilings] = useState<any[]>([]);
    const [activityMonitoringReports, setActivityMonitoringReports] = useState<ActivityMonitoringReport[]>([]);
    const [activityMonitoringActions, setActivityMonitoringActions] = useState<ActivityMonitoringAction[]>([]);
    const [isGlobalRefreshing, setIsGlobalRefreshing] = useState(false);
    const [globalLastRefreshedAt, setGlobalLastRefreshedAt] = useState<string | null>(null);
    const [globalRefreshError, setGlobalRefreshError] = useState<string | null>(null);
    const [globalCacheStatus, setGlobalCacheStatus] = useState<string | null>(null);
    const activeDataScopeKeyRef = useRef<string | null>(null);
    const activeDataScopeRef = useRef<DataScope | null>(null);
    const scopeRequestSeqRef = useRef(0);
    const replaceSubprojects = subprojectsSync.replaceLocalData;
    const replaceIpos = iposSync.replaceLocalData;
    const replaceActivities = activitiesSync.replaceLocalData;
    const replaceMarketingPartners = marketingPartnersSync.replaceLocalData;
    const replaceOfficeReqs = officeReqsSync.replaceLocalData;
    const replaceStaffingReqs = staffingReqsSync.replaceLocalData;
    const replaceOtherProgramExpenses = otherProgramExpensesSync.replaceLocalData;
    const replaceFinancialObligations = financialObligationsSync.replaceLocalData;
    const replaceFinancialDisbursements = financialDisbursementsSync.replaceLocalData;

    // Helper to filter data based on visibility scope
    const filterByVisibility = <T extends { operatingUnit?: string }>(data: T[]): T[] => {
        if (!currentUser) return data;
        if (['Super Admin', 'Administrator'].includes(currentUser.role)) return data;
        const scope = currentUser.visibility_scope || 'All OUs';
        if (scope === 'All OUs') return data;
        return data.filter(item => item.operatingUnit === currentUser.operatingUnit);
    };

    const visibleSubprojects = filterByVisibility(enrichedSubprojects);
    const visibleActivities = filterByVisibility(enrichedActivities);
    const visibleOfficeReqs = filterByVisibility(enrichedOfficeReqs);
    const visibleStaffingReqs = filterByVisibility(enrichedStaffingReqs);
    const visibleOtherExpenses = filterByVisibility(enrichedOtherExpenses);

    // Derived Activities
    const trainings = useMemo(() => visibleActivities.filter(a => a.type === 'Training'), [visibleActivities]);
    const otherActivities = useMemo(() => visibleActivities.filter(a => a.type === 'Activity'), [visibleActivities]);

    // Reference States
    const [referenceUacsList, setReferenceUacsList, referenceUacsSync] = useSupabaseTable<ReferenceUacs>('reference_uacs', sampleReferenceUacsList, scopedTableOptions);
    const [referenceParticularList, setReferenceParticularList, referenceParticularsSync] = useSupabaseTable<ReferenceParticular>('reference_particulars', sampleReferenceParticularList, scopedTableOptions);
    const [refCommodities, setRefCommodities, refCommoditiesSync] = useSupabaseTable<RefCommodity>('ref_commodities', sampleRefCommodities, scopedTableOptions);
    const [refLivestock, setRefLivestock, refLivestockSync] = useSupabaseTable<RefLivestock>('ref_livestock', sampleRefLivestock, scopedTableOptions);
    const [refEquipment, setRefEquipment, refEquipmentSync] = useSupabaseTable<RefEquipment>('ref_equipment', sampleRefEquipment, scopedTableOptions);
    const [refInputs, setRefInputs, refInputsSync] = useSupabaseTable<RefInput>('ref_inputs', sampleRefInputs, scopedTableOptions);
    const [refInfrastructure, setRefInfrastructure, refInfrastructureSync] = useSupabaseTable<RefInfrastructure>('ref_infrastructure', sampleRefInfrastructure, scopedTableOptions);
    const [refTrainings, setRefTrainings, refTrainingsSync] = useSupabaseTable<RefTrainingReference>('ref_trainings', sampleRefTrainings, scopedTableOptions);
    const [referenceActivities, setReferenceActivities, referenceActivitiesSync] = useSupabaseTable<ReferenceActivity>('reference_activities', [], scopedTableOptions);
    const replaceReferenceUacs = referenceUacsSync.replaceLocalData;
    const replaceReferenceParticulars = referenceParticularsSync.replaceLocalData;
    const replaceRefCommodities = refCommoditiesSync.replaceLocalData;
    const replaceRefLivestock = refLivestockSync.replaceLocalData;
    const replaceRefEquipment = refEquipmentSync.replaceLocalData;
    const replaceRefInputs = refInputsSync.replaceLocalData;
    const replaceRefInfrastructure = refInfrastructureSync.replaceLocalData;
    const replaceRefTrainings = refTrainingsSync.replaceLocalData;
    const replaceReferenceActivities = referenceActivitiesSync.replaceLocalData;
    const [gidaAreas, setGidaAreas] = useState<GidaArea[]>(sampleGidaAreas);
    const [elcacAreas, setElcacAreas] = useState<ElcacArea[]>(sampleElcacAreas);

    // Construct systemSettings object for child components that expect it
    const systemSettings = useMemo(() => ({
        deadlines
    }), [deadlines]);

    const buildDefaultDataScope = useCallback((overrides: Partial<DataScope> = {}): DataScope => {
        const canViewAllOus = currentUser ? getVisibilityScope('Dashboards') !== 'Own OU' : true;
        return {
            year: overrides.year ?? new Date().getFullYear().toString(),
            operatingUnit: canViewAllOus
                ? (overrides.operatingUnit ?? 'All')
                : (currentUser?.operatingUnit || overrides.operatingUnit || 'All'),
            tier: overrides.tier ?? 'Tier 1',
            fundType: overrides.fundType ?? 'Current',
            canViewAllOus,
            requestedBy: currentUser?.id ?? null
        };
    }, [currentUser, getVisibilityScope]);

    const applyScopedData = useCallback((data: Awaited<ReturnType<typeof loadScopedAppData>>) => {
        replaceSubprojects(data.subprojects);
        replaceIpos(data.ipos);
        replaceActivities(data.activities);
        replaceMarketingPartners(data.marketingPartners);
        replaceOfficeReqs(data.officeReqs);
        replaceStaffingReqs(data.staffingReqs);
        replaceOtherProgramExpenses(data.otherProgramExpenses);
        replaceFinancialObligations(data.financialObligations);
        replaceFinancialDisbursements(data.financialDisbursements);
        replaceReferenceUacs(data.referenceUacsList);
        replaceReferenceParticulars(data.referenceParticularList);
        replaceRefCommodities(data.refCommodities);
        replaceRefLivestock(data.refLivestock);
        replaceRefEquipment(data.refEquipment);
        replaceRefInputs(data.refInputs);
        replaceRefInfrastructure(data.refInfrastructure);
        replaceRefTrainings(data.refTrainings);
        replaceReferenceActivities(data.referenceActivities);
        setDeadlines(data.deadlines as Deadline[]);
        setBudgetCeilings(data.budgetCeilings || []);
        setGidaAreas((data.gidaAreas || []) as GidaArea[]);
        setElcacAreas((data.elcacAreas || []) as ElcacArea[]);
        setActivityMonitoringReports((data.activityMonitoringReports || []) as ActivityMonitoringReport[]);
        setActivityMonitoringActions((data.activityMonitoringActions || []) as ActivityMonitoringAction[]);
    }, [
        replaceActivities,
        replaceFinancialDisbursements,
        replaceFinancialObligations,
        replaceIpos,
        replaceMarketingPartners,
        replaceOfficeReqs,
        replaceOtherProgramExpenses,
        replaceRefCommodities,
        replaceRefEquipment,
        replaceRefInfrastructure,
        replaceRefInputs,
        replaceRefLivestock,
        replaceRefTrainings,
        replaceReferenceActivities,
        replaceReferenceParticulars,
        replaceReferenceUacs,
        replaceStaffingReqs,
        replaceSubprojects
    ]);

    const ensureDataScope = useCallback(async (scopeOverrides: Partial<DataScope> = {}, force = false) => {
        const nextScope = buildDefaultDataScope(scopeOverrides);
        const nextScopeKey = getDataScopeKey(nextScope);

        if (!force && activeDataScopeKeyRef.current === nextScopeKey) {
            return;
        }

        const requestSeq = scopeRequestSeqRef.current + 1;
        scopeRequestSeqRef.current = requestSeq;
        setIsGlobalRefreshing(true);
        setGlobalRefreshError(null);
        setGlobalCacheStatus(null);
        let hadCachedData = false;

        try {
            const cachedData = await readScopedCache(nextScope);
            if (requestSeq !== scopeRequestSeqRef.current) {
                return;
            }

            if (cachedData) {
                hadCachedData = true;
                applyScopedData(cachedData);
                activeDataScopeKeyRef.current = nextScopeKey;
                activeDataScopeRef.current = nextScope;
                const cachedAt = await getScopeCacheMeta(nextScope);
                const savedAt = cachedAt?.savedAt || new Date().toISOString();
                setGlobalLastRefreshedAt(savedAt);
                setGlobalCacheStatus(`Cached data from ${new Date(savedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`);
            }

            const data = await loadScopedAppData(nextScope);
            if (requestSeq !== scopeRequestSeqRef.current) {
                return;
            }
            applyScopedData(data);
            await writeScopedCache(nextScope, data);
            activeDataScopeKeyRef.current = nextScopeKey;
            activeDataScopeRef.current = nextScope;
            setGlobalLastRefreshedAt(new Date().toISOString());
            setGlobalCacheStatus(null);
        } catch (error: any) {
            if (requestSeq !== scopeRequestSeqRef.current) {
                return;
            }
            const message = error?.message || 'Unable to refresh scoped data.';
            setGlobalRefreshError(hadCachedData ? `Showing cached data. ${message}` : `No cached data for this filter. Connect and refresh data. ${message}`);
            if (hadCachedData) {
                setGlobalCacheStatus('Showing cached data');
            }
            console.error('Scoped data refresh failed:', error);
        } finally {
            if (requestSeq === scopeRequestSeqRef.current) {
                setIsGlobalRefreshing(false);
            }
        }
    }, [applyScopedData, buildDefaultDataScope]);

    const refreshAllData = useCallback(async () => {
        const currentScope = activeDataScopeRef.current || {};
        await Promise.all([
            ensureDataScope(currentScope, true),
            refreshUsersList(),
            refreshPermissions(),
            refreshUser()
        ]);
    }, [ensureDataScope, refreshPermissions, refreshUser, refreshUsersList]);

    const clearLocalCache = useCallback(async () => {
        if (!currentUser?.id) return;
        await clearUserCache(currentUser.id);
        setGlobalCacheStatus(null);
        setGlobalLastRefreshedAt(null);
        setGlobalRefreshError('Local cache cleared. Refresh data to rebuild the cache.');
    }, [currentUser?.id]);

    useEffect(() => {
        if (!isAuthReady) return;
        ensureDataScope();
    }, [ensureDataScope, isAuthReady]);

    // Selection States
    const [selectedSubproject, setSelectedSubproject] = useState<Subproject | null>(null);
    const [selectedIpo, setSelectedIpo] = useState<IPO | null>(null);
    const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
    const [selectedMonitoringReportContext, setSelectedMonitoringReportContext] = useState<{
        activity: Activity;
        ipo: IPO;
        report?: ActivityMonitoringReport | null;
    } | null>(null);
    const [selectedOfficeReq, setSelectedOfficeReq] = useState<OfficeRequirement | null>(null);
    const [selectedStaffingReq, setSelectedStaffingReq] = useState<StaffingRequirement | null>(null);
    const [selectedOtherExpense, setSelectedOtherExpense] = useState<OtherProgramExpense | null>(null);
    const [selectedMarketingPartner, setSelectedMarketingPartner] = useState<MarketingPartner | null>(null);
    const [selectedMarketingLinkageKey, setSelectedMarketingLinkageKey] = useState<string | number | null>(null);
    const [selectedLodYear, setSelectedLodYear] = useState<number | null>(null);
    
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
            if (leavingPage === '/activity-monitoring-report') setSelectedMonitoringReportContext(null);
            if (leavingPage === '/ipo-detail') setSelectedIpo(null);
            if (leavingPage === '/program-management/office-detail') setSelectedOfficeReq(null);
            if (leavingPage === '/program-management/staffing-detail') setSelectedStaffingReq(null);
            if (leavingPage === '/program-management/other-expense-detail') setSelectedOtherExpense(null);
            if (leavingPage === '/marketing-profile-detail') {
                const nextPage = event.state?.page || window.location.hash.replace('#', '') || '/';
                if (!['/marketing-profile-edit', '/marketing-linkage-edit', '/marketing-linkage-detail'].includes(nextPage)) {
                    setSelectedMarketingPartner(null);
                    setSelectedMarketingLinkageKey(null);
                }
            }
            if (leavingPage === '/marketing-linkage-detail') setSelectedMarketingLinkageKey(null);
            if (leavingPage === '/lod-details') {
                setSelectedIpo(null);
                setSelectedLodYear(null);
            }

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
        
        // Initial setup: Fix for 404 on refresh. OAuth callbacks are the one exception
        // because Google must return to the settings page after a full redirect.
        const hashPath = window.location.hash.replace('#', '') || '/';
        const isGoogleDriveCallback = hashPath.startsWith('/settings?drive=');
        const initialPath = isGoogleDriveCallback ? '/settings' : '/';
        window.history.replaceState({ page: initialPath, stack: [] }, '', isGoogleDriveCallback ? `/#${hashPath}` : `/#${initialPath}`);
        setCurrentPage(initialPath);

        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // Track previous user to redirect to home on login
    const prevUserRef = useRef<User | null>(null);

    useEffect(() => {
        if (currentUser && !prevUserRef.current) {
            const hashPath = window.location.hash.replace('#', '') || '/';
            if (hashPath.startsWith('/settings?drive=')) {
                setCurrentPage('/settings');
                setHistoryStack([]);
                window.history.replaceState({ page: '/settings', stack: [] }, '', `/#${hashPath}`);
                prevUserRef.current = currentUser;
                return;
            }
            setCurrentPage('/');
            setHistoryStack([]);
            window.history.replaceState({ page: '/', stack: [] }, '', '/#/');
        }
        prevUserRef.current = currentUser;
    }, [currentUser]);

    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
    const toggleDarkMode = () => {
        setThemeMode(prevTheme => {
            const nextTheme = prevTheme === 'dark' ? 'light' : 'dark';
            saveThemePreference(nextTheme);
            return nextTheme;
        });
    };

    useEffect(() => {
        applyTheme(themeMode);
    }, [themeMode]);

    useEffect(() => {
        const themeQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
        if (!themeQuery) return;

        const handleSystemThemeChange = () => {
            if (!getSavedThemePreference()) {
                setThemeMode(getSystemThemePreference());
            }
        };

        themeQuery.addEventListener('change', handleSystemThemeChange);
        return () => themeQuery.removeEventListener('change', handleSystemThemeChange);
    }, []);

    useEffect(() => {
        const handleThemeStorageChange = (event: StorageEvent) => {
            if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
            setThemeMode(resolveInitialTheme());
        };

        window.addEventListener('storage', handleThemeStorageChange);
        return () => window.removeEventListener('storage', handleThemeStorageChange);
    }, []);

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

    // Navigation Handlers
    const handleSelectSubproject = (project: Subproject) => {
        setSelectedSubproject(project);
        navigateTo('/subproject-detail');
    };

    const handleSelectIpo = (ipo: IPO) => {
        setSelectedIpo(ipo);
        navigateTo('/ipo-detail');
    };

    const handleOpenIpoListForAncestralDomain = (adNo: string) => {
        setExternalFilters({ ancestralDomainNo: adNo });
        navigateTo('/ipo');
    };

    const handleSelectActivity = (activity: Activity) => {
        setSelectedActivity(activity);
        navigateTo('/activity-detail');
    };

    const handleOpenMonitoringReport = (activity: Activity, ipo: IPO, report?: ActivityMonitoringReport | null) => {
        setSelectedMonitoringReportContext({ activity, ipo, report: report || null });
        navigateTo('/activity-monitoring-report');
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
    const handleApplyFilter = (filters: { region?: string; year?: string; search?: string; status?: string; ancestralDomainNo?: string }) => {
        setExternalFilters(filters);
    };

    if (!isAuthReady) {
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

    if (!currentUser) {
        return <Login />;
    }

    const handleSelectIpoForLod = (ipo: IPO, year?: number) => {
        setSelectedIpo(ipo);
        setSelectedLodYear(year ?? null);
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
        if (['/trainings', '/other-activities', '/activities', '/activity-edit', '/activity-detail', '/activity-monitoring-report'].includes(currentPage)) {
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
        if (['/marketing-database', '/marketing-profile-detail', '/marketing-profile-edit', '/marketing-linkage-edit', '/marketing-linkage-detail'].includes(currentPage)) {
            if (!checkAccess('Marketing Database')) return denied;
        }
        if (['/level-of-development', '/lod-details'].includes(currentPage)) {
            if (!checkAccess('Level of Development')) return denied;
        }
        if (currentPage === '/commodity-mapping') {
            if (!checkAccess('Commodity Mapping')) return denied;
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
                            onDataScopeChange={ensureDataScope}
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
                            marketingPartners={marketingPartners}
                            onSelectIpo={handleSelectIpo}
                            onSelectSubproject={handleSelectSubproject}
                            onSelectActivity={handleSelectActivity}
                            onSelectMarketingPartner={handleSelectMarketingPartner}
                            setExternalFilters={setExternalFilters}
                            navigateTo={navigateTo}
                            onDataScopeChange={ensureDataScope}
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
                            onDataScopeChange={ensureDataScope}
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
                            onDataScopeChange={ensureDataScope}
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
                            onDataScopeChange={ensureDataScope}
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
                            onDataScopeChange={ensureDataScope}
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
                            budgetCeilings={budgetCeilings}
                            uacsCodes={derivedUacsCodes}
                            onSelectOfficeReq={handleSelectOfficeReq}
                            onSelectStaffingReq={handleSelectStaffingReq}
                            onSelectOtherExpense={handleSelectOtherExpense}
                            // @ts-ignore
                            externalFilters={externalFilters}
                            onDataScopeChange={ensureDataScope}
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
                            budgetCeilings={budgetCeilings}
                            uacsCodes={derivedUacsCodes}
                            onSelectSubproject={handleSelectSubproject}
                            onSelectActivity={handleSelectActivity}
                            onSelectOfficeReq={handleSelectOfficeReq}
                            onSelectStaffingReq={handleSelectStaffingReq}
                            onSelectOtherExpense={handleSelectOtherExpense}
                            onOpenIpoListForAncestralDomain={handleOpenIpoListForAncestralDomain}
                            onDataScopeChange={ensureDataScope}
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
                            onDataScopeChange={ensureDataScope}
                        />;
                
            case '/program-management/office-detail':
                if (!selectedOfficeReq) return <div>Select an item</div>;
                const latestOffice = visibleOfficeReqs.find(i => i.id === selectedOfficeReq.id) || selectedOfficeReq;
                return <OfficeRequirementDetail 
                            item={latestOffice}
                            onBack={handleBack}
                            uacsCodes={derivedUacsCodes}
                            onUpdate={(updatedItem) => {
                                setOfficeReqs(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
                                setSelectedOfficeReq(updatedItem);
                            }}
                        />;
            case '/program-management/staffing-detail':
                if (!selectedStaffingReq) return <div>Select an item</div>;
                const latestStaff = visibleStaffingReqs.find(i => i.id === selectedStaffingReq.id) || selectedStaffingReq;
                return <StaffingRequirementDetail 
                            item={latestStaff}
                            onBack={handleBack}
                            uacsCodes={derivedUacsCodes}
                            onUpdate={(updatedItem) => {
                                setStaffingReqs(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
                                setSelectedStaffingReq(updatedItem);
                            }}
                        />;
            case '/program-management/other-expense-detail':
                if (!selectedOtherExpense) return <div>Select an item</div>;
                const latestOther = visibleOtherExpenses.find(i => i.id === selectedOtherExpense.id) || selectedOtherExpense;
                return <OtherExpenseDetail 
                            item={latestOther}
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
                            deadlines={deadlines}
                            budgetCeilings={budgetCeilings}
                            uacsCodes={derivedUacsCodes}
                            onSelectSubproject={handleSelectSubproject}
                            onSelectActivity={handleSelectActivity}
                            onSelectOfficeReq={handleSelectOfficeReq}
                            onSelectStaffingReq={handleSelectStaffingReq}
                            onSelectOtherExpense={handleSelectOtherExpense}
                            onDataScopeChange={ensureDataScope}
                        />;
            case '/subproject-detail':
                if (!selectedSubproject) return <div>Select a subproject</div>;
                const latestSp = visibleSubprojects.find(s => s.id === selectedSubproject.id) || selectedSubproject;
                return <SubprojectDetail 
                            subproject={latestSp} 
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
                            monitoringActivities={visibleActivities}
                            cachedMonitoringReports={activityMonitoringReports}
                            cachedMonitoringActions={activityMonitoringActions}
                            marketingPartners={marketingPartners}
                            onBack={handleBack}
                            previousPageName={getPageName(previousPage)}
                            onUpdateIpo={(updated) => {
                                setIpos(prev => prev.map(i => i.id === updated.id ? updated : i));
                                setSelectedIpo(updated);
                            }}
                            onSelectSubproject={handleSelectSubproject}
                            onSelectActivity={handleSelectActivity}
                            onOpenMonitoringReport={handleOpenMonitoringReport}
                            onSelectLodYear={handleSelectIpoForLod}
                            onSelectMarketingPartner={handleSelectMarketingPartner}
                            particularTypes={derivedParticularTypes}
                            commodityCategories={derivedCommodityCategories}
                        />;
            case '/activity-detail':
                if (!selectedActivity) return <div>Select an activity</div>;
                const latestAct = visibleActivities.find(a => a.id === selectedActivity.id) || selectedActivity;
                return <ActivityDetail
                            activity={latestAct}
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
                            cachedMonitoringReports={activityMonitoringReports}
                            cachedMonitoringActions={activityMonitoringActions}
                            onSelectIpo={handleSelectIpo}
                            onOpenMonitoringReport={handleOpenMonitoringReport}
                        />;
            case '/activity-monitoring-report':
                if (!selectedMonitoringReportContext) return <div>Select a monitoring report</div>;
                return <ActivityMonitoringReportDetail
                            activity={selectedMonitoringReportContext.activity}
                            ipo={selectedMonitoringReportContext.ipo}
                            initialReport={selectedMonitoringReportContext.report}
                            initialActions={selectedMonitoringReportContext.report?.id
                                ? activityMonitoringActions.filter(action => Number(action.monitoring_report_id) === Number(selectedMonitoringReportContext.report?.id))
                                : []}
                            onBack={handleBack}
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
                            onAddLinkage={() => {
                                navigateTo('/marketing-linkage-edit');
                            }}
                            onSelectLinkage={(linkageKey) => {
                                setSelectedMarketingLinkageKey(linkageKey);
                                navigateTo('/marketing-linkage-detail');
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
            case '/marketing-linkage-detail':
                if (!selectedMarketingPartner || selectedMarketingLinkageKey === null) return <div>Select a market linkage</div>;
                return <MarketLinkageDetail
                            partner={selectedMarketingPartner}
                            linkageKey={selectedMarketingLinkageKey}
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
                return <LODDetails ipo={selectedIpo} onBack={handleBack} initialYear={selectedLodYear} />;
            case '/commodity-mapping':
                return <CommodityMappingPage subprojects={subprojects} ipos={ipos} />;
            default:
                return <div className="p-6">Page not found</div>;
        }
    };

    return (
        <div className="app-shell">
            <Sidebar 
                isOpen={isSidebarOpen} 
                toggleSidebar={toggleSidebar}
                closeSidebar={() => setIsSidebarOpen(false)} 
                currentPage={currentPage} 
                setCurrentPage={navigateTo} 
            />
            <div className="app-workspace">
                <Header 
                    toggleSidebar={toggleSidebar} 
                    toggleDarkMode={toggleDarkMode} 
                    isDarkMode={isDarkMode} 
                    setCurrentPage={navigateTo}
                    onRefreshData={refreshAllData}
                    onClearLocalCache={clearLocalCache}
                    isRefreshingData={isGlobalRefreshing}
                    lastDataRefreshAt={globalLastRefreshedAt}
                    dataRefreshError={globalRefreshError}
                    cacheStatus={globalCacheStatus}
                />
                <main className="app-main">
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
