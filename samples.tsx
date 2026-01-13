// Author: 4K 
// OS support: Any
import { 
    Subproject, Activity, OfficeRequirement, 
    StaffingRequirement, OtherProgramExpense, initialUacsCodes, 
    initialParticularTypes, ReferenceUacs, ReferenceParticular 
} from './constants';

// --- Helper Functions for Reference Lists ---
const flattenUacs = () => {
    const list: any[] = [];
    let id = 1;
    for (const objType in initialUacsCodes) {
        for (const particular in initialUacsCodes[objType]) {
             for (const code in initialUacsCodes[objType][particular]) {
                 list.push({
                     id: String(id++),
                     objectType: objType,
                     particular: particular,
                     uacsCode: code,
                     description: initialUacsCodes[objType][particular][code]
                 });
             }
        }
    }
    return list;
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

export const sampleReferenceUacsList: ReferenceUacs[] = flattenUacs();
export const sampleReferenceParticularList: ReferenceParticular[] = flattenParticulars();

// --- Sample Data: Cleared for DB Connection ---
export const sampleSubprojects: Subproject[] = [];
export const sampleActivities: Activity[] = [];
export const sampleOfficeRequirements: OfficeRequirement[] = [];
export const sampleStaffingRequirements: StaffingRequirement[] = [];
export const sampleOtherProgramExpenses: OtherProgramExpense[] = [];
// --- End of samples.tsx ---