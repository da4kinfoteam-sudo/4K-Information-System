
// Author: 4K 
// OS support: Any
import { 
    Subproject, Activity, OfficeRequirement, 
    StaffingRequirement, OtherProgramExpense, ReferenceUacs,
    ReferenceParticular, ReferenceCommodity, MarketingPartner,
    RefCommodity, RefLivestock, RefEquipment, RefInput,
    RefInfrastructure, RefTrainingReference, GidaArea, ElcacArea
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
