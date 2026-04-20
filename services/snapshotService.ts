import { supabase } from '../supabaseClient';
import { calculateBAR1ReportData } from '../components/reports/BAR1Calculation';
import { Subproject, Training, OtherActivity, OfficeRequirement, StaffingRequirement, OtherProgramExpense, IPO, filterYears, operatingUnits, fundTypes, tiers } from '../constants';

export interface SnapshotFilter {
    operating_unit: string;
    fund_year: number;
    fund_type: string;
    tier: string;
}

export const generateBar1Snapshots = async () => {
    if (!supabase) return { error: 'Supabase client not initialized' };

    try {
        // Fetch All Data needed for BAR 1
        const [
            { data: subprojects },
            { data: activities },
            { data: officeReqs },
            { data: staffingReqs },
            { data: ipos }
        ] = await Promise.all([
            supabase.from('subprojects').select('*'),
            supabase.from('activities').select('*'),
            supabase.from('office_requirements').select('*'),
            supabase.from('staffing_requirements').select('*'),
            supabase.from('ipos').select('*')
        ]);

        if (!subprojects || !activities || !officeReqs || !staffingReqs || !ipos) {
            return { error: 'Failed to fetch base data for snapshots' };
        }

        const trainings = activities.filter(a => a.type === 'Training') as Training[];
        const otherActivities = activities.filter(a => a.type === 'Activity') as OtherActivity[];

        const today = new Date().toISOString().split('T')[0];
        const snapshots: any[] = [];

        // All possible filter combinations
        for (const ou of operatingUnits) {
            for (const year of filterYears) {
                for (const ft of fundTypes) {
                    for (const tier of tiers) {
                        const yearNum = parseInt(year);
                        
                        // Filter data for this specific combination
                        const filteredData = {
                            subprojects: subprojects.filter(sp => sp.operatingUnit === ou && sp.fundingYear === yearNum && sp.fundType === ft && sp.tier === tier),
                            trainings: trainings.filter(t => t.operatingUnit === ou && t.fundingYear === yearNum && t.fundType === ft && t.tier === tier),
                            otherActivities: otherActivities.filter(a => a.operatingUnit === ou && a.fundingYear === yearNum && a.fundType === ft && a.tier === tier),
                            officeReqs: officeReqs.filter(or => or.operatingUnit === ou && or.fundYear === yearNum && or.fundType === ft && or.tier === tier),
                            staffingReqs: staffingReqs.filter(sr => sr.operatingUnit === ou && sr.fundYear === yearNum && sr.fundType === ft && sr.tier === tier),
                            otherProgramExpenses: [], // Not fully implemented in BAR 1 calculation logic yet but placeholder
                            ipos: ipos // IPOs are global
                        };

                        // Skip if no data for this combination to save space? 
                        // Actually BAR 1 might show zeros, but usually snapshots are for active combinations.
                        const hasData = filteredData.subprojects.length > 0 || 
                                      filteredData.trainings.length > 0 || 
                                      filteredData.otherActivities.length > 0 || 
                                      filteredData.officeReqs.length > 0 || 
                                      filteredData.staffingReqs.length > 0;

                        if (hasData) {
                            const bar1ReportData = calculateBAR1ReportData(filteredData, year, ou);
                            
                            snapshots.push({
                                operating_unit: ou,
                                fund_year: yearNum,
                                fund_type: ft,
                                tier: tier,
                                snapshot_date: today,
                                report_data: bar1ReportData
                            });
                        }
                    }
                }
            }
        }

        // Upsert Snapshots to Supabase
        // Note: The table has a UNIQUE constraint on (ou, year, type, tier, date)
        const { error: upsertError } = await supabase
            .from('bar1_report_snapshots')
            .upsert(snapshots, { 
                onConflict: 'operating_unit, fund_year, fund_type, tier, snapshot_date' 
            });

        if (upsertError) {
            console.error('Error upserting BAR1 snapshots:', upsertError);
            return { error: upsertError.message };
        }

        return { success: true, count: snapshots.length };
    } catch (err: any) {
        console.error('Snapshot Generation Error:', err);
        return { error: err.message };
    }
};
