export const GAD_HGDG_SCORE = 17.33;
export const GAD_HGDG_MAX_SCORE = 20;
export const GAD_HGDG_ATTRIBUTION_RATE = GAD_HGDG_SCORE / GAD_HGDG_MAX_SCORE;

export interface GadAttributionInput {
    allocation: number;
    obligation: number;
    pimmeScore: number | null;
}

export interface GadAttributionResult {
    attributionRate: number;
    pimmeRate: number | null;
    attributableAllocation: number;
    attributableObligation: number | null;
    utilization: number | null;
}

export interface GadAttributionTotals {
    allocation: number;
    obligation: number;
    attributableAllocation: number;
    attributableObligation: number;
    hasAttributedObligation: boolean;
    utilization: number | null;
}

const finiteOrZero = (value: number) => Number.isFinite(value) ? value : 0;

export const calculateGadAttribution = ({
    allocation,
    obligation,
    pimmeScore,
}: GadAttributionInput): GadAttributionResult => {
    const normalizedAllocation = finiteOrZero(allocation);
    const normalizedObligation = finiteOrZero(obligation);
    const normalizedPimmeScore = pimmeScore !== null && Number.isFinite(pimmeScore)
        ? pimmeScore
        : null;
    const pimmeRate = normalizedPimmeScore === null
        ? null
        : normalizedPimmeScore / GAD_HGDG_MAX_SCORE;
    const attributableAllocation = normalizedAllocation * GAD_HGDG_ATTRIBUTION_RATE;
    const attributableObligation = pimmeRate === null
        ? null
        : normalizedObligation * pimmeRate;

    return {
        attributionRate: GAD_HGDG_ATTRIBUTION_RATE,
        pimmeRate,
        attributableAllocation,
        attributableObligation,
        utilization: attributableAllocation !== 0 && attributableObligation !== null
            ? (attributableObligation / attributableAllocation) * 100
            : null,
    };
};

export const summarizeGadAttribution = (
    rows: ReadonlyArray<Pick<GadAttributionInput, 'allocation' | 'obligation'> & Pick<GadAttributionResult, 'attributableAllocation' | 'attributableObligation'>>,
): GadAttributionTotals => {
    const hasAttributedObligation = rows.some(row => row.attributableObligation !== null);
    const totals = rows.reduce((result, row) => ({
        allocation: result.allocation + finiteOrZero(row.allocation),
        obligation: result.obligation + finiteOrZero(row.obligation),
        attributableAllocation: result.attributableAllocation + finiteOrZero(row.attributableAllocation),
        attributableObligation: result.attributableObligation + finiteOrZero(row.attributableObligation ?? 0),
    }), {
        allocation: 0,
        obligation: 0,
        attributableAllocation: 0,
        attributableObligation: 0,
    });

    return {
        ...totals,
        hasAttributedObligation,
        utilization: totals.attributableAllocation !== 0 && hasAttributedObligation
            ? (totals.attributableObligation / totals.attributableAllocation) * 100
            : null,
    };
};
