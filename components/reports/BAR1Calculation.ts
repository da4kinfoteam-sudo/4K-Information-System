import { Subproject, Training, OtherActivity, OfficeRequirement, StaffingRequirement, OtherProgramExpense, IPO, FundType, Tier } from '../../constants';

export interface BAR1DataGroup {
    indicator: string;
    target: BAR1Counter;
    actual: BAR1Counter;
}

export interface BAR1Counter {
    m1: number; m2: number; m3: number; q1: number;
    m4: number; m5: number; m6: number; q2: number;
    m7: number; m8: number; m9: number; q3: number;
    m10: number; m11: number; m12: number; q4: number;
    total: number;
    m1_items: string[]; m2_items: string[]; m3_items: string[];
    m4_items: string[]; m5_items: string[]; m6_items: string[];
    m7_items: string[]; m8_items: string[]; m9_items: string[];
    m10_items: string[]; m11_items: string[]; m12_items: string[];
}

export const initializeCounter = (): BAR1Counter => ({
    m1: 0, m2: 0, m3: 0, q1: 0,
    m4: 0, m5: 0, m6: 0, q2: 0,
    m7: 0, m8: 0, m9: 0, q3: 0,
    m10: 0, m11: 0, m12: 0, q4: 0,
    total: 0,
    m1_items: [], m2_items: [], m3_items: [],
    m4_items: [], m5_items: [], m6_items: [],
    m7_items: [], m8_items: [], m9_items: [],
    m10_items: [], m11_items: [], m12_items: []
});

const getMonthIndex = (dateStr?: string): number => {
    if (!dateStr) return -1;
    const d = new Date(dateStr + 'T00:00:00Z');
    return d.getUTCMonth(); // 0-11
};

const incrementCounter = (counter: BAR1Counter, dateStr?: string, count: number = 1, itemName?: string) => {
    const monthIdx = getMonthIndex(dateStr);
    if (monthIdx !== -1) {
        const monthKey = `m${monthIdx + 1}` as keyof BAR1Counter;
        (counter[monthKey] as number) += count;
        
        if (itemName) {
            const itemsKey = `${monthKey}_items` as keyof BAR1Counter;
            const items = counter[itemsKey] as string[];
            if (!items.includes(itemName)) {
                items.push(itemName);
            }
        }

        if (monthIdx < 3) counter.q1 += count;
        else if (monthIdx < 6) counter.q2 += count;
        else if (monthIdx < 9) counter.q3 += count;
        else counter.q4 += count;
        
        counter.total += count;
    }
};

const calculateFirstEncounter = (entries: { id: string; date?: string; label?: string }[]) => {
    const counter = initializeCounter();
    const validEntries = entries
        .filter(e => e.date)
        .map(e => ({ ...e, d: new Date(e.date + 'T00:00:00Z') }))
        .sort((a, b) => a.d.getTime() - b.d.getTime());

    const seen = new Set<string>();

    validEntries.forEach(entry => {
        if (!seen.has(entry.id)) {
            seen.add(entry.id);
            incrementCounter(counter, entry.date, 1, entry.label || entry.id);
        }
    });
    return counter;
};

const calculateSumOverTime = (entries: { val: number; date?: string; label?: string }[]) => {
    const counter = initializeCounter();
    entries.forEach(e => {
        if (e.date) {
            incrementCounter(counter, e.date, e.val, e.label);
        }
    });
    return counter;
};

export const calculateBAR1ReportData = (data: {
    subprojects: Subproject[];
    trainings: Training[];
    otherActivities: OtherActivity[];
    officeReqs: OfficeRequirement[];
    staffingReqs: StaffingRequirement[];
    otherProgramExpenses: OtherProgramExpense[];
    ipos: IPO[];
}, selectedYear: string, selectedOu: string) => {
    const finalData: { [key: string]: any } = {
        'Social Preparation': [],
        'Production and Livelihood': { isNestedExpandable: true, packages: {} },
        'Marketing and Enterprise': [], 
        'Program Management': { 
            isNestedExpandable: true, 
            packages: {
                'Staff Requirements': { items: [] },
                'Office Requirements': { items: [] },
                'Activities': { items: [] }
            } 
        }
    };

    const ipoAdMap = new Map<string, string>();
    data.ipos.forEach(ipo => {
        if (ipo.ancestralDomainNo) ipoAdMap.set(ipo.name, ipo.ancestralDomainNo);
    });

    // Production and Livelihood - Subproject Reach
    const allTargetADs = data.subprojects.map(sp => ({
        id: ipoAdMap.get(sp.indigenousPeopleOrganization) || '',
        label: ipoAdMap.get(sp.indigenousPeopleOrganization) || '',
        date: sp.estimatedCompletionDate
    })).filter(x => x.id);
    const allActualADs = data.subprojects.map(sp => ({
        id: ipoAdMap.get(sp.indigenousPeopleOrganization) || '',
        label: ipoAdMap.get(sp.indigenousPeopleOrganization) || '',
        date: sp.actualCompletionDate
    })).filter(x => x.id);

    const allTargetIPOs = data.subprojects.map(sp => ({
        id: sp.indigenousPeopleOrganization,
        label: sp.indigenousPeopleOrganization,
        date: sp.estimatedCompletionDate
    }));
    const allActualIPOs = data.subprojects.map(sp => ({
        id: sp.indigenousPeopleOrganization,
        label: sp.indigenousPeopleOrganization,
        date: sp.actualCompletionDate
    }));

    finalData['Production and Livelihood'].packages['Subproject Reach'] = {
        items: [
            {
                indicator: "Number of Ancestral Domains covered",
                target: calculateFirstEncounter(allTargetADs),
                actual: calculateFirstEncounter(allActualADs)
            },
            {
                indicator: "Number of IPOs with subprojects",
                target: calculateFirstEncounter(allTargetIPOs),
                actual: calculateFirstEncounter(allActualIPOs)
            }
        ]
    };

    const packages: Record<string, Subproject[]> = {};
    data.subprojects.forEach(sp => {
        const pkg = sp.packageType || 'Other';
        if (!packages[pkg]) packages[pkg] = [];
        packages[pkg].push(sp);
    });

    Object.entries(packages).forEach(([pkgName, subprojects]) => {
        if (!finalData['Production and Livelihood'].packages[pkgName]) {
            finalData['Production and Livelihood'].packages[pkgName] = { items: [] };
        }
        const pkgItems = finalData['Production and Livelihood'].packages[pkgName].items;

        const targetADs = subprojects.map(sp => ({
            id: ipoAdMap.get(sp.indigenousPeopleOrganization) || '',
            label: ipoAdMap.get(sp.indigenousPeopleOrganization) || '',
            date: sp.estimatedCompletionDate 
        })).filter(x => x.id); 
        const actualADs = subprojects.map(sp => ({
            id: ipoAdMap.get(sp.indigenousPeopleOrganization) || '',
            label: ipoAdMap.get(sp.indigenousPeopleOrganization) || '',
            date: sp.actualCompletionDate
        })).filter(x => x.id);

        pkgItems.push({
            indicator: "Number of Ancestral Domains covered",
            target: calculateFirstEncounter(targetADs),
            actual: calculateFirstEncounter(actualADs)
        });

        const targetIPOs = subprojects.map(sp => ({
            id: sp.indigenousPeopleOrganization,
            label: sp.indigenousPeopleOrganization,
            date: sp.estimatedCompletionDate
        }));
        const actualIPOs = subprojects.map(sp => ({
            id: sp.indigenousPeopleOrganization,
            label: sp.indigenousPeopleOrganization,
            date: sp.actualCompletionDate
        }));

        pkgItems.push({
            indicator: "Number of IPOs",
            target: calculateFirstEncounter(targetIPOs),
            actual: calculateFirstEncounter(actualIPOs)
        });

        const targetSPs = subprojects.map(sp => ({ val: 1, date: sp.estimatedCompletionDate, label: sp.name }));
        const actualSPs = subprojects.map(sp => ({ val: 1, date: sp.actualCompletionDate, label: sp.name }));
        pkgItems.push({
            indicator: "Number of Subprojects",
            target: calculateSumOverTime(targetSPs),
            actual: calculateSumOverTime(actualSPs)
        });
    });

    // Social Prep, Marketing and Enterprise
    const activityGroups = {
        'Social Preparation': finalData['Social Preparation'],
        'Marketing and Enterprise': finalData['Marketing and Enterprise'],
        'Production and Livelihood': finalData['Production and Livelihood'].packages // Note: Activities also go in packages here? 
        // Based on original logic, activities go into Component groups.
    };

    [...data.trainings, ...data.otherActivities].forEach(act => {
        const targetIPOs = (act.participatingIpos || []).map(ipo => ({ id: ipo, label: ipo, date: act.date }));
        const actualIPOs = (act.participatingIpos || []).map(ipo => ({ id: ipo, label: ipo, date: act.actualDate }));

        let group: any;
        if (act.component === 'Production and Livelihood') {
            if (!finalData['Production and Livelihood'].packages['Activities']) {
                finalData['Production and Livelihood'].packages['Activities'] = { items: [] };
            }
            group = finalData['Production and Livelihood'].packages['Activities'].items;
        } else if (finalData[act.component]) {
            group = finalData[act.component];
        }

        if (group) {
            const newItemIPOs = {
                indicator: `Number of IPOs (${act.name})`,
                target: calculateFirstEncounter(targetIPOs),
                actual: calculateFirstEncounter(actualIPOs)
            };
            const newItemParticipants = {
                indicator: `Number of participants Male (${act.name})`,
                target: calculateSumOverTime([{ val: act.participantsMale || 0, date: act.date, label: act.name }]),
                actual: calculateSumOverTime([{ val: act.actualParticipantsMale || 0, date: act.actualDate, label: act.name }])
            };
            const newItemParticipantsF = {
                indicator: `Number of participants Female (${act.name})`,
                target: calculateSumOverTime([{ val: act.participantsFemale || 0, date: act.date, label: act.name }]),
                actual: calculateSumOverTime([{ val: act.actualParticipantsFemale || 0, date: act.actualDate, label: act.name }])
            };
            
            // Deduplicate indicators if needed or just push
            group.push(newItemIPOs, newItemParticipants, newItemParticipantsF);
        }
    });

    // Program Management
    data.staffingReqs.forEach(sr => {
        finalData['Program Management'].packages['Staff Requirements'].items.push({
            indicator: `${sr.uid} - ${sr.uacsCode}`,
            target: calculateSumOverTime([{ val: 1, date: sr.obligationDate, label: sr.uid }]),
            actual: calculateSumOverTime([{ val: sr.actualObligationDate ? 1 : 0, date: sr.actualObligationDate, label: sr.uid }])
        });
    });

    data.officeReqs.forEach(or => {
        finalData['Program Management'].packages['Office Requirements'].items.push({
            indicator: `${or.uid} - ${or.uacsCode}`,
            target: calculateSumOverTime([{ val: 1, date: or.obligationDate, label: or.uid }]),
            actual: calculateSumOverTime([{ val: or.actualObligationDate ? 1 : 0, date: or.actualObligationDate, label: or.uid }])
        });
    });

    return finalData;
};
