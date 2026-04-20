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

    // Trainings
    const processTrainings = (componentName: string, targetContainer: any[], isPackage: boolean = false) => {
        const relevantTrainings = data.trainings.filter(t => t.component === componentName);
        if (relevantTrainings.length === 0 && !isPackage) return; // Skip empty groups? Original didn't skip, but it keeps it clean. Wait, original didn't skip.

        const getTargetDate = (t: Training) => t.endDate || t.date;
        const getActualDate = (t: Training) => t.actualDate;
        const targetTrainings = relevantTrainings.map(t => ({ val: 1, label: t.name, date: getTargetDate(t) }));
        const actualTrainings = relevantTrainings.map(t => ({ val: 1, label: t.name, date: getActualDate(t) }));
        const targetIPOs: { id: string, label: string, date?: string }[] = [];
        const actualIPOs: { id: string, label: string, date?: string }[] = [];
        
        relevantTrainings.forEach(t => {
            const tDate = getTargetDate(t);
            const aDate = getActualDate(t);
            (t.participatingIpos || []).forEach(ipo => {
                targetIPOs.push({ id: ipo, label: ipo, date: tDate });
                if (aDate) actualIPOs.push({ id: ipo, label: ipo, date: aDate });
            });
        });

        const targetPax = relevantTrainings.map(t => ({ 
            val: (t.participantsMale || 0) + (t.participantsFemale || 0), 
            label: t.name,
            date: getTargetDate(t) 
        }));
        const actualPax = relevantTrainings.map(t => ({ 
            val: (t.actualParticipantsMale || 0) + (t.actualParticipantsFemale || 0), 
            label: t.name,
            date: getActualDate(t) 
        }));

        const trainingGroup = {
            indicator: "Trainings",
            isExpandable: true,
            items: [
                {
                    indicator: "Number of Trainings conducted",
                    target: calculateSumOverTime(targetTrainings),
                    actual: calculateSumOverTime(actualTrainings)
                },
                {
                    indicator: "Number of IPOs trained",
                    target: calculateFirstEncounter(targetIPOs),
                    actual: calculateFirstEncounter(actualIPOs)
                },
                {
                    indicator: "Number of Participants",
                    target: calculateSumOverTime(targetPax),
                    actual: calculateSumOverTime(actualPax)
                }
            ]
        };

        if (isPackage) {
            if (!finalData['Production and Livelihood'].packages['Trainings']) {
                finalData['Production and Livelihood'].packages['Trainings'] = { items: [] };
            }
            finalData['Production and Livelihood'].packages['Trainings'].items.push(...trainingGroup.items);
        } else {
            targetContainer.push(trainingGroup);
        }
    };

    const processOtherActivities = (componentName: string, targetContainer: any[], isPackage: boolean = false) => {
        const relevantActivities = data.otherActivities.filter(a => a.component === componentName);
        
        // Group by name
        const groups: { [name: string]: OtherActivity[] } = {};
        relevantActivities.forEach(a => {
            if (!groups[a.name]) groups[a.name] = [];
            groups[a.name].push(a);
        });

        Object.entries(groups).forEach(([name, activities]) => {
            const targetConducted = activities.map(a => ({ val: 1, label: a.location || a.name, date: a.date }));
            const actualConducted = activities.map(a => ({ val: 1, label: a.location || a.name, date: a.actualDate }));

            const targetIPOs: { id: string, label: string, date?: string }[] = [];
            const actualIPOs: { id: string, label: string, date?: string }[] = [];
            
            activities.forEach(a => {
                if (a.participatingIpos) {
                    a.participatingIpos.forEach(ipo => {
                        targetIPOs.push({ id: ipo, label: ipo, date: a.date });
                        if (a.actualDate) actualIPOs.push({ id: ipo, label: ipo, date: a.actualDate });
                    });
                }
            });

            let activityGroup: any;

            if (componentName === 'Program Management') {
                activityGroup = {
                    indicator: name,
                    target: calculateSumOverTime(targetConducted),
                    actual: calculateSumOverTime(actualConducted)
                };
            } else {
                activityGroup = {
                    indicator: name,
                    isExpandable: true,
                    items: [
                        {
                            indicator: `Number of ${name} conducted`,
                            target: calculateSumOverTime(targetConducted),
                            actual: calculateSumOverTime(actualConducted)
                        },
                        {
                            indicator: `Number of IPOs assisted in ${name}`,
                            target: calculateFirstEncounter(targetIPOs),
                            actual: calculateFirstEncounter(actualIPOs)
                        }
                    ]
                };
            }

            if (isPackage) {
                 if (finalData['Program Management'].packages['Activities']) {
                    finalData['Program Management'].packages['Activities'].items.push(activityGroup);
                 }
            } else {
                targetContainer.push(activityGroup);
            }
        });
    };

    processTrainings('Social Preparation', finalData['Social Preparation']);
    processTrainings('Marketing and Enterprise', finalData['Marketing and Enterprise']);
    processTrainings('Production and Livelihood', [], true);

    processOtherActivities('Social Preparation', finalData['Social Preparation']);
    processOtherActivities('Marketing and Enterprise', finalData['Marketing and Enterprise']);
    processOtherActivities('Program Management', [], true);

    const createBar1Item = (indicator: string, physicalCount: number, targetDate?: string, actualDate?: string, itemName?: string) => {
        const item: any = {
            indicator,
            target: initializeCounter(),
            actual: initializeCounter()
        };
        incrementCounter(item.target, targetDate, physicalCount, itemName);
        incrementCounter(item.actual, actualDate, physicalCount, itemName);
        return item;
    };

    const addItemToGroup = (list: any[], newItem: any) => {
        const existing = list.find(i => i.indicator === newItem.indicator);
        if (existing) {
            for (const key in newItem.target) {
                if (key.endsWith('_items')) {
                    existing.target[key] = [...(existing.target[key] || []), ...((newItem.target[key] as any) || [])];
                } else {
                    (existing.target as any)[key] += (newItem.target as any)[key];
                }
            }
            for (const key in newItem.actual) {
                if (key.endsWith('_items')) {
                    existing.actual[key] = [...(existing.actual[key] || []), ...((newItem.actual[key] as any) || [])];
                } else {
                    (existing.actual as any)[key] += (newItem.actual as any)[key];
                }
            }
        } else {
            list.push(newItem);
        }
    };

    const processPm = (items: any[], pkgKey: string, isStaff = false, isOtherExpense = false) => {
        items.forEach(pm => {
            if (isOtherExpense) return; 
            const indicator = isStaff ? pm.personnelPosition : (pm.equipment || pm.particulars);
            const count = isStaff ? 1 : (pm.numberOfUnits || 1);
            const itemName = isStaff ? pm.personnelPosition : (pm.equipment || pm.particulars);
            const item = createBar1Item(indicator, count, pm.obligationDate, pm.actualDate, itemName);
            addItemToGroup(finalData['Program Management'].packages[pkgKey].items, item);
        });
    }
    processPm(data.staffingReqs || [], 'Staff Requirements', true);
    processPm(data.officeReqs || [], 'Office Requirements');

    const plPackageKeys = Object.keys(finalData['Production and Livelihood'].packages).sort();
    const sortedPLPackageData: { [key: string]: any } = {};
    for (const key of plPackageKeys) sortedPLPackageData[key] = finalData['Production and Livelihood'].packages[key];
    finalData['Production and Livelihood'].packages = sortedPLPackageData;

    return finalData;
};
