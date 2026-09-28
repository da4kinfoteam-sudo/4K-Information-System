
// Author: 4K 
// OS support: Any
import { 
    Subproject, Activity, OfficeRequirement, 
    StaffingRequirement, OtherProgramExpense, ReferenceUacs,
    ReferenceParticular, ReferenceCommodity, MarketingPartner,
    RefCommodity, RefLivestock, RefEquipment, RefInput,
    RefInfrastructure, RefTrainingReference, RefFundSource, GidaArea, ElcacArea
} from './constants';

// --- Helper Functions for Reference Lists ---
const flattenUacs = () => {
    // Empty default
    return [];
};

const flattenParticulars = () => {
    // Empty default per request to delete sample data
    return [];
}

const flattenCommodities = () => {
    // Empty default
    return [];
}

export const sampleReferenceUacsList: ReferenceUacs[] = [];
export const sampleReferenceParticularList: ReferenceParticular[] = flattenParticulars();
export const sampleReferenceCommodityList: ReferenceCommodity[] = flattenCommodities();
export const sampleRefCommodities: RefCommodity[] = [];
export const sampleRefLivestock: RefLivestock[] = [];
export const sampleRefEquipment: RefEquipment[] = [];
export const sampleRefInputs: RefInput[] = [];
export const sampleRefInfrastructure: RefInfrastructure[] = [];
export const sampleRefTrainings: RefTrainingReference[] = [];
export const sampleFundSources: RefFundSource[] = [
    { id: 1, uid: 'FS-000001', label: '4K Fund', is_active: true, sort_order: 1 },
    { id: 2, uid: 'FS-000002', label: 'High Value Crops', is_active: true, sort_order: 2 },
    { id: 3, uid: 'FS-000003', label: 'Corn', is_active: true, sort_order: 3 },
    { id: 4, uid: 'FS-000004', label: 'Rice', is_active: true, sort_order: 4 },
    { id: 5, uid: 'FS-000005', label: 'Organic', is_active: true, sort_order: 5 },
    { id: 6, uid: 'FS-000006', label: 'Livestock', is_active: true, sort_order: 6 },
];
export const sampleGidaAreas: GidaArea[] = [];
export const sampleElcacAreas: ElcacArea[] = [];
export const sampleReferenceActivities: any[] = [];
export const sampleBudgetCeilings: any[] = [];
export const sampleFinancialObligations: any[] = [];
export const sampleFinancialDisbursements: any[] = [];
export const sampleActivityMonitoringReports: any[] = [];
export const sampleActivityMonitoringActions: any[] = [];
export const sampleBudgetItemAdjustmentHistory: any[] = [];

// --- Sample Data: Cleared for DB Connection ---
export const sampleSubprojects: Subproject[] = [];
export const sampleActivities: Activity[] = [];
export const sampleMarketingPartners: MarketingPartner[] = [];
export const sampleOfficeRequirements: OfficeRequirement[] = [];
export const sampleStaffingRequirements: StaffingRequirement[] = [];
export const sampleOtherProgramExpenses: OtherProgramExpense[] = [];
