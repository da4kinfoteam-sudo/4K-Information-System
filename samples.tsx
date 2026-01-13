
// Author: 4K 
// OS support: Any
import { 
    Subproject, Activity, OfficeRequirement, 
    StaffingRequirement, OtherProgramExpense, initialUacsCodes, 
    initialParticularTypes, ReferenceUacs, ReferenceParticular 
} from './constants';

// --- Helper Functions for Reference Lists ---
const flattenUacs = () => {
    // Empty default
    return [];
};

const flattenParticulars = () => {
    const list: any[] = [];
    let id = 1;
    for (const type in initialParticularTypes) {
        initialParticularTypes[type].forEach(p => {
            list.push({
                id: String(id++),
                type: type,
                particular: p
            });
        });
    }
    return list;
}

export const sampleReferenceUacsList: ReferenceUacs[] = [];
export const sampleReferenceParticularList: ReferenceParticular[] = flattenParticulars();

// --- Sample Data: Cleared for DB Connection ---
export const sampleSubprojects: Subproject[] = [];
export const sampleActivities: Activity[] = [];
export const sampleOfficeRequirements: OfficeRequirement[] = [];
export const sampleStaffingRequirements: StaffingRequirement[] = [];
export const sampleOtherProgramExpenses: OtherProgramExpense[] = [];
