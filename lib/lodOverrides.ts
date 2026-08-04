import { getLodEffectiveState } from './lodScoring.ts';
import type { LodAssessmentLike } from './lodScoring.ts';

export type LodOverrideSource = 'lod_list_bulk' | 'lod_list_inline' | 'lod_detail';

export interface LodManualOverrideInput {
    ipoId: number;
    year: number;
    level: number;
    reason: string;
}

export interface LodManualOverrideRow {
    ipo_id: number;
    year: number;
    manual_level: number;
    manual_override_reason: string;
}

export const normalizeLodOverrideReason = (value: unknown) => String(value ?? '').trim();

export const buildLodManualOverrideRows = (inputs: LodManualOverrideInput[]): LodManualOverrideRow[] => {
    const seen = new Set<string>();
    return inputs.map(input => {
        const ipoId = Number(input.ipoId);
        const year = Number(input.year);
        const level = Number(input.level);
        const reason = normalizeLodOverrideReason(input.reason);
        const key = `${ipoId}:${year}`;

        if (!Number.isInteger(ipoId) || ipoId <= 0) throw new Error('Every override requires a valid IPO.');
        if (!Number.isInteger(year) || year < 1900 || year > 2200) throw new Error('Enter a valid assessment year.');
        if (!Number.isInteger(level) || level < 1 || level > 5) throw new Error('Select an LOD level from 1 to 5.');
        if (!reason) throw new Error('Enter a reason for the manual override.');
        if (seen.has(key)) throw new Error('The override contains a duplicate IPO and assessment year.');
        seen.add(key);

        return {
            ipo_id: ipoId,
            year,
            manual_level: level,
            manual_override_reason: reason,
        };
    });
};

export const buildLodOverrideAuditMetadata = ({
    ipoId,
    ipoName,
    year,
    previousAssessment,
    newLevel,
    reason,
    actorName,
    actorRole,
    source,
}: {
    ipoId: number;
    ipoName: string;
    year: number;
    previousAssessment?: LodAssessmentLike | null;
    newLevel: number;
    reason: string;
    actorName: string;
    actorRole: string;
    source: LodOverrideSource;
}) => ({
    ipo_id: ipoId,
    ipo_name: ipoName,
    assessment_year: year,
    previous_level: getLodEffectiveState(previousAssessment).level,
    previous_state: getLodEffectiveState(previousAssessment).label,
    new_manual_level: newLevel,
    override_reason: normalizeLodOverrideReason(reason),
    actor_name: actorName,
    actor_role: actorRole,
    source,
    client_timestamp: new Date().toISOString(),
});
