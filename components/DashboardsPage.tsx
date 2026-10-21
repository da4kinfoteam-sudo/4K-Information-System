// Author: 4K 
import React, { useState, useMemo } from 'react';
import { Subproject, IPO, Training, OtherActivity, ouToRegionMap, OfficeRequirement, StaffingRequirement, OtherProgramExpense, MarketingPartner, RefFundSource } from '../constants';
import PhysicalDashboard from './dashboards/PhysicalDashboard';
import FinancialDashboard from './dashboards/FinancialDashboard';
import GADDashboard from './dashboards/GADDashboard';
import IPOLevelDashboard from './dashboards/IPOLevelDashboard';
import NutritionDashboard from './dashboards/NutritionDashboard';
import FarmProductivityDashboard from './dashboards/FarmProductivityDashboard';
import SCADDashboard from './dashboards/SCADDashboard';
import AgriculturalInterventionsDashboard from './dashboards/AgriculturalInterventionsDashboard';
import CommodityDashboard from './dashboards/CommodityDashboard';
import AwardsRankingsDashboard from './dashboards/AwardsRankingsDashboard';
import { ModalItem } from './dashboards/DashboardComponents';
import type { DataScope } from '../lib/scopedDataFetch';
import type { DashboardPageKey } from '../lib/appNavigation';
import { DashboardScopeFilterPanel, useDashboardScopeFilters } from './ui/DashboardScopeFilters';
import { annualScope, dashboardScopeLabels, matchesDashboardScope, selectionScalar, selectionValues } from '../lib/dashboardScope';
import { LoadingState } from './ui/enterprise';

export interface DashboardsPageProps {
    activePage: DashboardPageKey;
    subprojects: Subproject[];
    ipos: IPO[];
    trainings: Training[];
    otherActivities: OtherActivity[];
    officeReqs: OfficeRequirement[];
    staffingReqs: StaffingRequirement[];
    otherProgramExpenses: OtherProgramExpense[];
    marketingPartners: MarketingPartner[];
    fundSources?: RefFundSource[];
    onSelectIpo?: (ipo: IPO) => void;
    onSelectLodIpo?: (ipo: IPO, year?: number) => void;
    onSelectSubproject?: (project: Subproject) => void;
    onSelectActivity?: (activity: Training | OtherActivity) => void;
    onSelectMarketingPartner?: (partner: MarketingPartner) => void;
    onSelectGadAssessment?: (operatingUnit: string, year: number) => void;
    setExternalFilters?: (filters: any) => void;
    navigateTo?: (page: string) => void;
    onDataScopeChange?: (scope: Partial<DataScope>) => void;
    programDataLoading?: boolean;
    programDataError?: string | null;
}

const DashboardsPage: React.FC<DashboardsPageProps> = (props) => {
    const { onDataScopeChange } = props;
    const activeTab = props.activePage;
    const [modalData, setModalData] = useState<{ title: string; items: ModalItem[] } | null>(null);
    const references = props.fundSources || [];
    const sourceRecords = useMemo(() => [...props.subprojects, ...props.trainings, ...props.otherActivities, ...props.officeReqs, ...props.staffingReqs, ...props.otherProgramExpenses], [props.subprojects, props.trainings, props.otherActivities, props.officeReqs, props.staffingReqs, props.otherProgramExpenses]);
    const dcfFilters = useDashboardScopeFilters({
        storageKey: 'dashboards_dcf_scope',
        references, records: sourceRecords,
        registryOnly: activeTab === 'SCAD',
        visibilityModule: activeTab === 'GAD' ? 'Gender and Development' : undefined,
        enabled: activeTab !== 'IPO Level of Development' && activeTab !== 'Nutrition',
        onDataScopeChange,
    });
    const [requestedAnnualYear, setAnnualYear] = useState(String(new Date().getFullYear()));
    const annualYears = selectionValues(dcfFilters.applied.years) || dcfFilters.availableYears;
    const viewYear = annualYears.includes(requestedAnnualYear) ? requestedAnnualYear : annualYears.slice().sort().at(-1) || '';
    const isAnnual = activeTab === 'GAD' || activeTab === 'Awards and Rankings';
    const scope = isAnnual ? annualScope(dcfFilters.applied, viewYear) : dcfFilters.applied;
    const selectedYear = selectionScalar(scope.years), selectedOu = selectionScalar(scope.operatingUnits);
    const selectedTier = selectionScalar(scope.tiers), selectedFundType = selectionScalar(scope.fundTypes);
    const selectedYears = selectionValues(scope.years), selectedOus = selectionValues(scope.operatingUnits);
    const scopeLabels = dashboardScopeLabels(scope, references, sourceRecords);
    const filteredData = useMemo(() => {
        // Deep sanitization helper: ensures array exists and filters out null/undefined items inside it
        const sanitizeDetails = (items: any[] | undefined) => (items || []).filter(i => i);
        const sanitizeExpenses = (items: any[] | undefined) => (items || []).filter(i => i);

        let data = {
            subprojects: props.subprojects.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
            ipos: props.ipos.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
            trainings: props.trainings.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
            otherActivities: props.otherActivities.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
            officeReqs: props.officeReqs.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
            staffingReqs: props.staffingReqs.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
            otherProgramExpenses: props.otherProgramExpenses.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED')
        };

        const matches = (record: any) => matchesDashboardScope(record, scope, references);
        data.subprojects = data.subprojects.filter(matches);
        data.trainings = data.trainings.filter(matches);
        data.otherActivities = data.otherActivities.filter(matches);
        data.officeReqs = data.officeReqs.filter(matches);
        data.staffingReqs = data.staffingReqs.filter(matches);
        data.otherProgramExpenses = data.otherProgramExpenses.filter(matches);
        if (selectedOus) {
            const regions = new Set(selectedOus.map(ou => ouToRegionMap[ou]).filter(Boolean));
            data.ipos = data.ipos.filter(ipo => regions.has(ipo.region));
        }

        return {
            ...data,
            subprojects: data.subprojects.map(p => ({ ...p, details: sanitizeDetails(p.details) })),
            trainings: data.trainings.map(t => ({ ...t, expenses: sanitizeExpenses(t.expenses) })),
            otherActivities: data.otherActivities.map(a => ({ ...a, expenses: sanitizeExpenses(a.expenses) })),
            staffingReqs: data.staffingReqs.map(s => ({ ...s, expenses: sanitizeExpenses(s.expenses) })),
        };
    }, [dcfFilters.key, viewYear, activeTab, props]);

    const financialSourceData = useMemo(() => {
        const sanitizeDetails = (items: any[] | undefined) => (items || []).filter(i => i);
        const sanitizeExpenses = (items: any[] | undefined) => (items || []).filter(i => i);

        return {
            subprojects: props.subprojects.filter(p => matchesDashboardScope(p, scope, references)).map(p => ({ ...p, details: sanitizeDetails(p.details) })),
            ipos: props.ipos.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
            trainings: props.trainings.filter(p => matchesDashboardScope(p, scope, references)).map(t => ({ ...t, expenses: sanitizeExpenses(t.expenses) })),
            otherActivities: props.otherActivities.filter(p => matchesDashboardScope(p, scope, references)).map(a => ({ ...a, expenses: sanitizeExpenses(a.expenses) })),
            officeReqs: props.officeReqs.filter(p => matchesDashboardScope(p, scope, references)),
            staffingReqs: props.staffingReqs.filter(p => matchesDashboardScope(p, scope, references)).map(s => ({ ...s, expenses: sanitizeExpenses(s.expenses) })),
            otherProgramExpenses: props.otherProgramExpenses.filter(p => matchesDashboardScope(p, scope, references)),
        };
    }, [props, dcfFilters.key, viewYear, activeTab]);

    const awardsData = useMemo(() => {
        const sanitizeDetails = (items: any[] | undefined) => (items || []).filter(i => i);
        const sanitizeExpenses = (items: any[] | undefined) => (items || []).filter(i => i);

        let data = {
            subprojects: props.subprojects.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
            ipos: props.ipos.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
            trainings: props.trainings.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
            otherActivities: props.otherActivities.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
            officeReqs: props.officeReqs.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
            staffingReqs: props.staffingReqs.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
            otherProgramExpenses: props.otherProgramExpenses.filter(i => !i.workflow_status || i.workflow_status === 'APPROVED'),
        };

        if (selectedYear !== 'All') {
            data.subprojects = data.subprojects.filter(p => p.fundingYear?.toString() === selectedYear);
            data.trainings = data.trainings.filter(t => t.fundingYear?.toString() === selectedYear);
            data.otherActivities = data.otherActivities.filter(a => a.fundingYear?.toString() === selectedYear);
            data.officeReqs = data.officeReqs.filter(i => i.fundYear?.toString() === selectedYear);
            data.staffingReqs = data.staffingReqs.filter(i => i.fundYear?.toString() === selectedYear);
            data.otherProgramExpenses = data.otherProgramExpenses.filter(i => i.fundYear?.toString() === selectedYear);
        }

        if (selectedTier !== 'All') {
            data.subprojects = data.subprojects.filter(p => p.tier === selectedTier);
            data.trainings = data.trainings.filter(t => t.tier === selectedTier);
            data.otherActivities = data.otherActivities.filter(a => a.tier === selectedTier);
            data.officeReqs = data.officeReqs.filter(i => i.tier === selectedTier);
            data.staffingReqs = data.staffingReqs.filter(i => i.tier === selectedTier);
            data.otherProgramExpenses = data.otherProgramExpenses.filter(i => i.tier === selectedTier);
        }

        if (selectedFundType !== 'All') {
            data.subprojects = data.subprojects.filter(p => p.fundType === selectedFundType);
            data.trainings = data.trainings.filter(t => t.fundType === selectedFundType);
            data.otherActivities = data.otherActivities.filter(a => a.fundType === selectedFundType);
            data.officeReqs = data.officeReqs.filter(i => i.fundType === selectedFundType);
            data.staffingReqs = data.staffingReqs.filter(i => i.fundType === selectedFundType);
            data.otherProgramExpenses = data.otherProgramExpenses.filter(i => i.fundType === selectedFundType);
        }

        const matches = (record: any) => matchesDashboardScope(record, scope, references);
        data.subprojects = data.subprojects.filter(matches);
        data.trainings = data.trainings.filter(matches);
        data.otherActivities = data.otherActivities.filter(matches);
        data.officeReqs = data.officeReqs.filter(matches);
        data.staffingReqs = data.staffingReqs.filter(matches);
        data.otherProgramExpenses = data.otherProgramExpenses.filter(matches);

        return {
            ...data,
            operatingUnitScope: selectedOus,
            subprojects: data.subprojects.map(p => ({ ...p, details: sanitizeDetails(p.details) })),
            trainings: data.trainings.map(t => ({ ...t, expenses: sanitizeExpenses(t.expenses) })),
            otherActivities: data.otherActivities.map(a => ({ ...a, expenses: sanitizeExpenses(a.expenses) })),
            staffingReqs: data.staffingReqs.map(s => ({ ...s, expenses: sanitizeExpenses(s.expenses) })),
        };
    }, [props, dcfFilters.key, viewYear, activeTab]);

    return (
        <div className="data-list-page dashboards-page">
            <div className="data-list-header">
                <h2 className="data-list-title">Strategic Dashboard</h2>
            </div>
            {activeTab !== 'IPO Level of Development' && activeTab !== 'Nutrition' && (
                <DashboardScopeFilterPanel filters={dcfFilters} />
            )}

            {isAnnual && (dcfFilters.applied.years.mode === 'all' || annualYears.length > 1) && <label className="dashboard-annual-view"><span>Annual View</span><select className="form-control" aria-label="Annual View" value={viewYear} onChange={event => setAnnualYear(event.target.value)}>{annualYears.slice().sort().reverse().map(year => <option key={year}>{year}</option>)}</select></label>}
            {dcfFilters.error && activeTab !== 'IPO Level of Development' && activeTab !== 'Nutrition' && <div className="notice notice--warning" role="alert"><p>{dcfFilters.error}</p><button type="button" className="btn btn-secondary" onClick={dcfFilters.retry}>Retry</button></div>}
            {dcfFilters.loading && <LoadingState title="Loading dashboard" />}

            <div className="dashboard-tab-content">{(activeTab === 'IPO Level of Development' || activeTab === 'Nutrition' || (!dcfFilters.loading && !dcfFilters.error)) && <>
                {activeTab === 'Physical' && (
                    <PhysicalDashboard 
                        data={filteredData} 
                        setModalData={setModalData} 
                        selectedYear={selectedYear}
                        selectedYears={selectedYears}
                        selectedOus={selectedOus}
                        scopeLabels={scopeLabels}
                        selectedOu={selectedOu}
                        isAllOuView={selectedOu === 'All'}
                        onSelectIpo={props.onSelectIpo}
                        onSelectSubproject={props.onSelectSubproject}
                        onSelectActivity={props.onSelectActivity}
                        setExternalFilters={props.setExternalFilters}
                        navigateTo={props.navigateTo}
                    />
                )}
                {activeTab === 'Financial' && (
                    <FinancialDashboard 
                        data={financialSourceData} 
                        scopeLabels={scopeLabels}
                        selectedYearProp={selectedYear}
                        selectedOuProp={selectedOu}
                        selectedTierProp={selectedTier}
                        selectedFundTypeProp={selectedFundType}
                    />
                )}
                {activeTab === 'SCAD' && <SCADDashboard ipos={filteredData.ipos} />}
                {activeTab === 'Agricultural Interventions' && <AgriculturalInterventionsDashboard subprojects={filteredData.subprojects} />}
                {activeTab === 'Commodities' && <CommodityDashboard subprojects={filteredData.subprojects} onSelectSubproject={props.onSelectSubproject} />}
                {activeTab === 'GAD' && (
                    <GADDashboard
                        subprojects={financialSourceData.subprojects}
                        trainings={financialSourceData.trainings}
                        otherActivities={financialSourceData.otherActivities}
                        officeReqs={financialSourceData.officeReqs}
                        staffingReqs={financialSourceData.staffingReqs}
                        otherProgramExpenses={financialSourceData.otherProgramExpenses}
                        ipos={financialSourceData.ipos}
                        onSelectIpo={props.onSelectIpo}
                        programDataLoading={props.programDataLoading}
                        programDataError={props.programDataError}
                        selectedYear={selectedYear}
                        selectedOus={selectedOus}
                        selectedOuLabel={scopeLabels.operatingUnits}
                        selectedOu={selectedOu}
                        selectedTier={selectedTier}
                        selectedFundType={selectedFundType}
                        navigateTo={props.navigateTo}
                        onSelectAssessment={props.onSelectGadAssessment}
                    />
                )}
                {activeTab === 'IPO Level of Development' && <IPOLevelDashboard onSelectLodIpo={props.onSelectLodIpo} />}
                {activeTab === 'Nutrition' && <NutritionDashboard />}
                {activeTab === 'Farm Productivity and Income' && (
                    <FarmProductivityDashboard
                        subprojects={filteredData.subprojects}
                        ipos={filteredData.ipos}
                        marketingPartners={props.marketingPartners}
                        selectedYear={selectedYear}
                        selectedYears={selectedYears}
                        scopeLabels={scopeLabels}
                        selectedOu={selectedOu}
                        selectedTier={selectedTier}
                        selectedFundType={selectedFundType}
                        onSelectSubproject={props.onSelectSubproject}
                        onSelectIpo={props.onSelectIpo}
                        onSelectMarketingPartner={props.onSelectMarketingPartner}
                    />
                )}
                {activeTab === 'Awards and Rankings' && (
                    <AwardsRankingsDashboard
                        data={awardsData}
                        selectedOus={selectedOus}
                        selectedYear={selectedYear}
                        selectedTier={selectedTier}
                        selectedFundType={selectedFundType}
                    />
                )}
            </>}</div>
            
            {modalData && (
                <div className="dashboard-modal-backdrop" onClick={() => setModalData(null)}>
                    <div className="dashboard-modal dashboard-modal--compact" onClick={e => e.stopPropagation()}>
                        <div className="dashboard-modal__header">
                            <h3>{modalData.title}</h3>
                            <button type="button" onClick={() => setModalData(null)} className="dashboard-modal__close" aria-label="Close modal">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="dashboard-modal__body custom-scrollbar">
                            {modalData.items.length > 0 ? (
                                <ul className="dashboard-modal__stack">
                                    {modalData.items.map((item, index) => (
                                        <li key={index} className="dashboard-modal__event">
                                            <p className="dashboard-modal__metric-value">{item.name}</p>
                                            {item.details && <p className="dashboard-modal__metric-subtext">{item.details}</p>}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="dashboard-empty text-center">No items found.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DashboardsPage;
