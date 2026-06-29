import React, { useEffect, useMemo, useState } from 'react';
import {
    Award,
    BarChart3,
    CalendarDays,
    ChevronDown,
    Download,
    Medal,
    RotateCcw,
    Save,
    SlidersHorizontal,
    Trophy,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import {
    AwardAnnualOuRow,
    AwardManualScore,
    AwardPhysicalComponentKey,
    AwardQuarterResult,
    AwardRankingSettings,
    awardQuarters,
    calculateAwardsDashboardData,
    DEFAULT_AWARD_SETTINGS,
    normalizeAwardSettings,
} from '../../lib/awardRankings';
import { IPO, OfficeRequirement, OtherActivity, OtherProgramExpense, StaffingRequirement, Subproject, Training, operatingUnits } from '../../constants';

interface AwardsRankingsDashboardProps {
    data: {
        subprojects: Subproject[];
        trainings: Training[];
        otherActivities: OtherActivity[];
        officeReqs: OfficeRequirement[];
        staffingReqs: StaffingRequirement[];
        otherProgramExpenses: OtherProgramExpense[];
        ipos: IPO[];
    };
    selectedYear: string;
    selectedTier: string;
    selectedFundType: string;
}

type ManualField =
    | 'reportorial_required'
    | 'reportorial_submitted'
    | 'national_activities_required'
    | 'national_activities_attended'
    | 'remarks';

const SETTINGS_KEY = 'awards_and_rankings';
const AWARD_PERIODS: AwardManualScore['period'][] = ['Q1', 'Q2', 'Q3', 'Q4', 'Year End'];

const componentLabels: Record<AwardPhysicalComponentKey, string> = {
    socialPrep: 'Social Prep',
    productionLivelihood: 'Production and Livelihood',
    marketingEnterprise: 'Marketing and Enterprise',
    programManagement: 'Program Management',
};

const formatScore = (value: number, suffix = '') => `${value.toFixed(2)}${suffix}`;
const formatPercent = (value: number) => `${value.toFixed(1)}%`;
const formatCurrency = (amount: number) => new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
}).format(Math.ceil(amount));

const getMedalClass = (rank: number) => rank <= 3 ? `award-rank-medal award-rank-medal--${rank}` : 'award-rank-medal';

const ensureManualRows = (rows: AwardManualScore[], year: number): AwardManualScore[] => {
    const map = new Map<string, AwardManualScore>();
    rows.forEach(row => {
        map.set(`${row.period}::${row.operating_unit}`, {
            ...row,
            reportorial_required: Number(row.reportorial_required) || 0,
            reportorial_submitted: Number(row.reportorial_submitted) || 0,
            national_activities_required: Number(row.national_activities_required) || 0,
            national_activities_attended: Number(row.national_activities_attended) || 0,
            remarks: row.remarks || '',
        });
    });

    return AWARD_PERIODS.flatMap(period => operatingUnits.map(ou => (
        map.get(`${period}::${ou}`) || {
            fund_year: year,
            period,
            operating_unit: ou,
            reportorial_required: 0,
            reportorial_submitted: 0,
            national_activities_required: 0,
            national_activities_attended: 0,
            remarks: '',
        }
    )));
};

const settingsEqual = (a: AwardRankingSettings, b: AwardRankingSettings) => JSON.stringify(a) === JSON.stringify(b);
const manualEqual = (a: AwardManualScore[], b: AwardManualScore[]) => JSON.stringify(a) === JSON.stringify(b);

const LeaderboardTable: React.FC<{
    title: string;
    rows: AwardAnnualOuRow[];
    columns: Array<{ key: string; label: string; render: (row: AwardAnnualOuRow) => React.ReactNode }>;
}> = ({ title, rows, columns }) => (
    <article className="dashboard-panel award-panel">
        <div className="dashboard-panel__header">
            <h3 className="dashboard-panel__title">{title}</h3>
        </div>
        <div className="data-table-scroll custom-scrollbar">
            <table className="data-table award-table">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>OU</th>
                        <th className="data-table__numeric">Points</th>
                        {columns.map(column => <th key={column.key} className="data-table__numeric">{column.label}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => (
                        <tr key={row.ou}>
                            <td><span className={getMedalClass(row.rank)}>{row.rank}</span></td>
                            <td className="font-semibold">{row.ou}</td>
                            <td className="data-table__numeric font-black">{formatScore(row.totalPoints)}</td>
                            {columns.map(column => (
                                <td key={column.key} className="data-table__numeric">{column.render(row)}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </article>
);

const QuarterLeaderboard: React.FC<{ quarter: AwardQuarterResult }> = ({ quarter }) => (
    <article className="dashboard-panel award-panel award-quarter-panel">
        <div className="dashboard-panel__header">
            <h3 className="dashboard-panel__title">{quarter.period} Awards</h3>
            <span className="award-panel__meta">Quarter-only performance</span>
        </div>
        <div className="award-quarter-grid">
            <div className="award-mini-board">
                <h4>Top Physical Performance</h4>
                <ul>
                    {quarter.physicalOverall.slice(0, 5).map(row => (
                        <li key={row.ou}>
                            <span className={getMedalClass(row.rank)}>{row.rank}</span>
                            <strong>{row.ou}</strong>
                            <b>{formatScore(row.points)} pts</b>
                        </li>
                    ))}
                </ul>
            </div>
            <div className="award-mini-board">
                <h4>Top Financial Performance</h4>
                <ul>
                    {quarter.financial.slice(0, 5).map(row => (
                        <li key={row.ou}>
                            <span className={getMedalClass(row.rank)}>{row.rank}</span>
                            <strong>{row.ou}</strong>
                            <b>{formatScore(row.points)} pts</b>
                        </li>
                    ))}
                </ul>
            </div>
            <div className="award-component-board">
                <h4>Physical Component Points</h4>
                <div className="data-table-scroll custom-scrollbar">
                    <table className="data-table award-table award-table--compact">
                        <thead>
                            <tr>
                                <th>Component</th>
                                <th>Top OU</th>
                                <th className="data-table__numeric">Score</th>
                                <th className="data-table__numeric">Completion</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(Object.entries(quarter.physicalComponents) as Array<[AwardPhysicalComponentKey, typeof quarter.physicalComponents[AwardPhysicalComponentKey]]>).map(([key, rows]) => {
                                const winner = rows[0];
                                return (
                                    <tr key={key}>
                                        <td>{componentLabels[key]}</td>
                                        <td className="font-semibold">{winner?.ou || 'No Data'}</td>
                                        <td className="data-table__numeric">{winner ? formatScore(winner.score) : '0.00'}</td>
                                        <td className="data-table__numeric">{winner ? formatPercent(winner.completionRate) : '0.0%'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </article>
);

const AwardsRankingsDashboard: React.FC<AwardsRankingsDashboardProps> = ({ data, selectedYear, selectedTier, selectedFundType }) => {
    const { currentUser } = useAuth();
    const isAdmin = currentUser?.role === 'Super Admin' || currentUser?.role === 'Administrator';
    const effectiveYear = Number.isFinite(Number(selectedYear)) ? Number(selectedYear) : new Date().getFullYear();
    const [controllerOpen, setControllerOpen] = useState(false);
    const [activeManualPeriod, setActiveManualPeriod] = useState<AwardManualScore['period']>('Q1');
    const [settings, setSettings] = useState<AwardRankingSettings>(DEFAULT_AWARD_SETTINGS);
    const [draftSettings, setDraftSettings] = useState<AwardRankingSettings>(DEFAULT_AWARD_SETTINGS);
    const [manualScores, setManualScores] = useState<AwardManualScore[]>([]);
    const [draftManualScores, setDraftManualScores] = useState<AwardManualScore[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isAdmin) return;
        let cancelled = false;

        const loadController = async () => {
            if (!supabase) {
                setError('Supabase is not configured. Awards settings cannot be loaded.');
                return;
            }
            setLoading(true);
            setError('');
            setMessage('');
            try {
                const [settingsResult, scoresResult] = await Promise.all([
                    supabase.from('award_ranking_settings').select('settings').eq('settings_key', SETTINGS_KEY).maybeSingle(),
                    supabase.from('award_manual_scores').select('*').eq('fund_year', effectiveYear).order('period').order('operating_unit'),
                ]);

                if (cancelled) return;
                if (settingsResult.error) {
                    console.error('Unable to load award ranking settings:', settingsResult.error);
                    setError('Award settings could not be loaded. Check that the awards migration has been applied.');
                }
                if (scoresResult.error) {
                    console.error('Unable to load award manual scores:', scoresResult.error);
                    setError('Manual award inputs could not be loaded. Check that the awards migration has been applied.');
                }

                const normalizedSettings = normalizeAwardSettings(settingsResult.data?.settings);
                const normalizedRows = ensureManualRows((scoresResult.data || []) as AwardManualScore[], effectiveYear);
                setSettings(normalizedSettings);
                setDraftSettings(normalizedSettings);
                setManualScores(normalizedRows);
                setDraftManualScores(normalizedRows);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadController();
        return () => {
            cancelled = true;
        };
    }, [effectiveYear, isAdmin]);

    const awardsData = useMemo(
        () => calculateAwardsDashboardData(data, selectedYear, settings, manualScores),
        [data, manualScores, selectedYear, settings]
    );

    const hasChanges = !settingsEqual(settings, draftSettings) || !manualEqual(manualScores, draftManualScores);

    const updateManual = (period: AwardManualScore['period'], ou: string, field: ManualField, value: string) => {
        setDraftManualScores(current => ensureManualRows(current, effectiveYear).map(row => {
            if (row.period !== period || row.operating_unit !== ou) return row;
            if (field === 'remarks') return { ...row, remarks: value };
            return { ...row, [field]: Math.max(0, Math.floor(Number(value) || 0)) };
        }));
        setMessage('');
    };

    const updateQuarterWeight = (component: AwardPhysicalComponentKey, key: string, value: string) => {
        setDraftSettings(current => ({
            ...current,
            quarterlyPhysicalWeights: {
                ...current.quarterlyPhysicalWeights,
                [component]: {
                    ...current.quarterlyPhysicalWeights[component],
                    [key]: Number(value) || 0,
                },
            },
        }));
        setMessage('');
    };

    const updateSimpleSetting = (group: 'quarterlyRankPoints' | 'annualRankPoints' | 'annualConsistencyPoints' | 'annualAttendanceMissedPoints', key: string, value: string) => {
        setDraftSettings(current => ({
            ...current,
            [group]: {
                ...current[group],
                [key]: Number(value) || 0,
            },
        }));
        setMessage('');
    };

    const updateFinancialWeight = (key: keyof AwardRankingSettings['quarterlyFinancialWeights'], value: string) => {
        setDraftSettings(current => ({
            ...current,
            quarterlyFinancialWeights: {
                ...current.quarterlyFinancialWeights,
                [key]: Number(value) || 0,
            },
        }));
        setMessage('');
    };

    const saveController = async () => {
        if (!supabase) {
            setError('Supabase is not configured. Awards controller cannot be saved.');
            return;
        }

        setSaving(true);
        setError('');
        setMessage('');
        try {
            const normalizedSettings = normalizeAwardSettings(draftSettings);
            const rowsToSave = ensureManualRows(draftManualScores, effectiveYear).map(row => ({
                fund_year: effectiveYear,
                period: row.period,
                operating_unit: row.operating_unit,
                reportorial_required: Number(row.reportorial_required) || 0,
                reportorial_submitted: Number(row.reportorial_submitted) || 0,
                national_activities_required: Number(row.national_activities_required) || 0,
                national_activities_attended: Number(row.national_activities_attended) || 0,
                remarks: row.remarks || null,
                updated_by: currentUser?.id || null,
                updated_by_name: currentUser?.fullName || currentUser?.username || null,
            }));

            const [settingsResult, scoresResult] = await Promise.all([
                supabase.from('award_ranking_settings').upsert({
                    settings_key: SETTINGS_KEY,
                    settings: normalizedSettings,
                    updated_by: currentUser?.id || null,
                    updated_by_name: currentUser?.fullName || currentUser?.username || null,
                }, { onConflict: 'settings_key' }),
                supabase.from('award_manual_scores').upsert(rowsToSave, { onConflict: 'fund_year,period,operating_unit' }),
            ]);

            if (settingsResult.error || scoresResult.error) {
                console.error('Unable to save awards controller:', settingsResult.error || scoresResult.error);
                setError('Awards controller could not be saved. Check migration/table permissions.');
                return;
            }

            setSettings(normalizedSettings);
            setDraftSettings(normalizedSettings);
            const normalizedManual = ensureManualRows(rowsToSave as AwardManualScore[], effectiveYear);
            setManualScores(normalizedManual);
            setDraftManualScores(normalizedManual);
            setMessage('Awards controller saved.');
        } finally {
            setSaving(false);
        }
    };

    const exportWorkbook = () => {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(awardsData.annual.overall.map(row => ({
            Rank: row.rank,
            OU: row.ou,
            Points: row.totalPoints,
            'Disbursement vs Allotment': row.disbursementVsAllotmentRate,
            'Disbursement vs Obligation': row.disbursementVsObligationRate,
            'Physical Completion': row.physicalCompletionRate,
            'Financial Top 4 Quarters': row.financialTop4Quarters,
            'Physical Top 4 Quarters': row.physicalTop4Quarters,
            'Attendance Missed': row.attendanceMissed,
        }))), 'Annual Overall');
        awardsData.quarters.forEach(quarter => {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(quarter.physicalOverall.map(row => ({
                Rank: row.rank,
                OU: row.ou,
                Score: row.score,
                Points: row.points,
            }))), `${quarter.period} Physical`);
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(quarter.financial.map(row => ({
                Rank: row.rank,
                OU: row.ou,
                Allocation: row.allocation,
                Obligation: row.obligation,
                Disbursement: row.disbursement,
                'Obligation Rate': row.obligationRate,
                'Disbursement Rate': row.disbursementRate,
                Score: row.score,
                Points: row.points,
            }))), `${quarter.period} Financial`);
        });
        XLSX.writeFile(wb, `Awards_Rankings_FY${awardsData.effectiveYear}.xlsx`);
    };

    if (!isAdmin) {
        return (
            <section className="dashboard-panel award-access-panel">
                <h3 className="dashboard-panel__title">Awards and Rankings</h3>
                <p className="dashboard-empty">This dashboard is available only to Administrator and Super Admin users.</p>
            </section>
        );
    }

    const annualWinner = awardsData.annual.overall[0];
    const financialWinner = awardsData.annual.financial[0];
    const physicalWinner = awardsData.annual.physical[0];

    return (
        <div className="awards-dashboard dashboard-view">
            <section className="award-hero dashboard-panel">
                <div>
                    <span className="award-eyebrow">Awards and Rankings</span>
                    <h3>OU Awarding Dashboard</h3>
                    <p>Fund Year {awardsData.effectiveYear} / {selectedTier} / {selectedFundType}</p>
                    {error && <p className="award-message award-message--error">{error}</p>}
                    {message && <p className="award-message award-message--success">{message}</p>}
                </div>
                <div className="award-hero__actions">
                    <button
                        type="button"
                        className="btn btn-secondary btn-responsive"
                        onClick={() => setControllerOpen(prev => !prev)}
                        aria-expanded={controllerOpen}
                        aria-controls="award-controller"
                    >
                        <SlidersHorizontal className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Award Controller</span>
                        <ChevronDown className={`btn-symbol ${controllerOpen ? 'is-open' : ''}`} aria-hidden="true" />
                    </button>
                    <button type="button" className="btn btn-primary btn-responsive" onClick={exportWorkbook}>
                        <Download className="btn-symbol" aria-hidden="true" />
                        <span className="btn-text">Export</span>
                    </button>
                </div>
            </section>

            {controllerOpen && (
                <section id="award-controller" className="award-controller dashboard-panel">
                    <div className="dashboard-panel__header">
                        <div>
                            <h3 className="dashboard-panel__title">Award Controller</h3>
                            <span className="award-panel__meta">{loading ? 'Loading saved controller...' : hasChanges ? 'Unsaved changes' : 'Saved settings active'}</span>
                        </div>
                        <div className="award-controller__actions">
                            <button type="button" className="btn btn-secondary btn-responsive" onClick={() => {
                                setDraftSettings(DEFAULT_AWARD_SETTINGS);
                                setMessage('');
                            }} disabled={saving}>
                                <RotateCcw className="btn-symbol" aria-hidden="true" />
                                <span className="btn-text">Reset Formulas</span>
                            </button>
                            <button type="button" className="btn btn-secondary btn-responsive" onClick={() => {
                                setDraftSettings(settings);
                                setDraftManualScores(manualScores);
                                setMessage('');
                            }} disabled={!hasChanges || saving}>
                                <span className="btn-text">Cancel</span>
                            </button>
                            <button type="button" className="btn btn-primary btn-responsive" onClick={saveController} disabled={!hasChanges || saving || loading}>
                                <Save className="btn-symbol" aria-hidden="true" />
                                <span className="btn-text">{saving ? 'Saving...' : 'Save'}</span>
                            </button>
                        </div>
                    </div>

                    <div className="award-controller-grid">
                        <div className="award-controller-card">
                            <h4>Quarterly Physical Weights</h4>
                            {(Object.entries(draftSettings.quarterlyPhysicalWeights) as Array<[AwardPhysicalComponentKey, Record<string, number>]>).map(([component, weights]) => (
                                <div key={component} className="award-form-group">
                                    <strong>{componentLabels[component]}</strong>
                                    {Object.entries(weights).map(([key, value]) => (
                                        <label key={key}>
                                            <span>{key.replace(/([A-Z])/g, ' $1')}</span>
                                            <input type="number" value={value} onChange={event => updateQuarterWeight(component, key, event.target.value)} />
                                        </label>
                                    ))}
                                </div>
                            ))}
                        </div>
                        <div className="award-controller-card">
                            <h4>Rank and Financial Rules</h4>
                            <div className="award-form-group">
                                <strong>Quarter Rank Points</strong>
                                {[1, 2, 3, 4, 5].map(rank => (
                                    <label key={rank}>
                                        <span>Rank {rank}</span>
                                        <input type="number" value={draftSettings.quarterlyRankPoints[String(rank)] || 0} onChange={event => updateSimpleSetting('quarterlyRankPoints', String(rank), event.target.value)} />
                                    </label>
                                ))}
                                <label>
                                    <span>Rest</span>
                                    <input type="number" value={draftSettings.quarterlyRestPoints} onChange={event => setDraftSettings(current => ({ ...current, quarterlyRestPoints: Number(event.target.value) || 0 }))} />
                                </label>
                            </div>
                            <div className="award-form-group">
                                <strong>Quarter Financial Weights</strong>
                                <label>
                                    <span>Disbursement vs Allotment</span>
                                    <input type="number" value={draftSettings.quarterlyFinancialWeights.disbursementVsAllotment} onChange={event => updateFinancialWeight('disbursementVsAllotment', event.target.value)} />
                                </label>
                                <label>
                                    <span>Obligation vs Allotment</span>
                                    <input type="number" value={draftSettings.quarterlyFinancialWeights.obligationVsAllotment} onChange={event => updateFinancialWeight('obligationVsAllotment', event.target.value)} />
                                </label>
                            </div>
                            <div className="award-form-group">
                                <strong>Annual Rank Points</strong>
                                {[1, 2, 3, 4].map(rank => (
                                    <label key={rank}>
                                        <span>Rank {rank}</span>
                                        <input type="number" value={draftSettings.annualRankPoints[String(rank)] || 0} onChange={event => updateSimpleSetting('annualRankPoints', String(rank), event.target.value)} />
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="award-manual-controller">
                        <div className="award-manual-controller__tabs">
                            {AWARD_PERIODS.map(period => (
                                <button key={period} type="button" className={activeManualPeriod === period ? 'is-active' : ''} onClick={() => setActiveManualPeriod(period)}>
                                    {period}
                                </button>
                            ))}
                        </div>
                        <div className="data-table-scroll custom-scrollbar">
                            <table className="data-table award-table award-manual-table">
                                <thead>
                                    <tr>
                                        <th>OU</th>
                                        <th className="data-table__numeric">Reports Required</th>
                                        <th className="data-table__numeric">Reports Submitted</th>
                                        <th className="data-table__numeric">Activities Required</th>
                                        <th className="data-table__numeric">Activities Attended</th>
                                        <th>Remarks</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ensureManualRows(draftManualScores, effectiveYear)
                                        .filter(row => row.period === activeManualPeriod)
                                        .map(row => (
                                            <tr key={`${row.period}-${row.operating_unit}`}>
                                                <td className="font-semibold">{row.operating_unit}</td>
                                                <td className="data-table__numeric"><input type="number" value={row.reportorial_required} onChange={event => updateManual(row.period, row.operating_unit, 'reportorial_required', event.target.value)} /></td>
                                                <td className="data-table__numeric"><input type="number" value={row.reportorial_submitted} onChange={event => updateManual(row.period, row.operating_unit, 'reportorial_submitted', event.target.value)} /></td>
                                                <td className="data-table__numeric"><input type="number" value={row.national_activities_required} onChange={event => updateManual(row.period, row.operating_unit, 'national_activities_required', event.target.value)} /></td>
                                                <td className="data-table__numeric"><input type="number" value={row.national_activities_attended} onChange={event => updateManual(row.period, row.operating_unit, 'national_activities_attended', event.target.value)} /></td>
                                                <td><input type="text" value={row.remarks || ''} onChange={event => updateManual(row.period, row.operating_unit, 'remarks', event.target.value)} /></td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
            )}

            <section className="award-summary-grid">
                <article className="award-summary-card award-summary-card--gold">
                    <Trophy aria-hidden="true" />
                    <span>Overall Top Performance</span>
                    <strong>{annualWinner?.ou || 'No Data'}</strong>
                    <small>{annualWinner ? `${formatScore(annualWinner.totalPoints)} pts` : 'No ranked OUs'}</small>
                </article>
                <article className="award-summary-card">
                    <BarChart3 aria-hidden="true" />
                    <span>Top Financial Performance</span>
                    <strong>{financialWinner?.ou || 'No Data'}</strong>
                    <small>{financialWinner ? `${formatScore(financialWinner.totalPoints)} pts` : 'No ranked OUs'}</small>
                </article>
                <article className="award-summary-card">
                    <Medal aria-hidden="true" />
                    <span>Top Physical Performance</span>
                    <strong>{physicalWinner?.ou || 'No Data'}</strong>
                    <small>{physicalWinner ? `${formatScore(physicalWinner.totalPoints)} pts` : 'No ranked OUs'}</small>
                </article>
                <article className="award-summary-card">
                    <CalendarDays aria-hidden="true" />
                    <span>Awarding Timeline</span>
                    <strong>Quarterly + Year End</strong>
                    <small>{awardQuarters.join(', ')} and annual awards</small>
                </article>
            </section>

            <section className="award-section">
                <div className="award-section__header">
                    <div>
                        <span>Annual Awards</span>
                        <h3>Year-End Award Rankings</h3>
                    </div>
                </div>
                <div className="award-annual-grid">
                    <LeaderboardTable
                        title="Overall Top Performance"
                        rows={awardsData.annual.overall}
                        columns={[
                            { key: 'disb-allotment', label: 'Disb / Allot', render: row => formatPercent(row.disbursementVsAllotmentRate) },
                            { key: 'disb-obli', label: 'Disb / Obli', render: row => formatPercent(row.disbursementVsObligationRate) },
                            { key: 'physical', label: 'Physical', render: row => formatPercent(row.physicalCompletionRate) },
                            { key: 'top4', label: 'Top 4 Qtrs', render: row => `${row.financialTop4Quarters}F / ${row.physicalTop4Quarters}P` },
                        ]}
                    />
                    <LeaderboardTable
                        title="Top Financial Performance"
                        rows={awardsData.annual.financial}
                        columns={[
                            { key: 'disb-allotment', label: 'Disb / Allot', render: row => formatPercent(row.disbursementVsAllotmentRate) },
                            { key: 'disb-obli', label: 'Disb / Obli', render: row => formatPercent(row.disbursementVsObligationRate) },
                            { key: 'top4', label: 'Top 4 Qtrs', render: row => row.financialTop4Quarters },
                        ]}
                    />
                    <LeaderboardTable
                        title="Top Physical Performance"
                        rows={awardsData.annual.physical}
                        columns={[
                            { key: 'physical', label: 'Physical', render: row => formatPercent(row.physicalCompletionRate) },
                            { key: 'top4', label: 'Top 4 Qtrs', render: row => row.physicalTop4Quarters },
                        ]}
                    />
                </div>

                <div className="award-special-grid">
                    {[
                        ['Most IPOs Assisted', awardsData.annual.mostIposAssisted],
                        ['Committed to Attending National Activities', awardsData.annual.mostAttendance],
                        ['Most Trainings Conducted', awardsData.annual.mostTrainings],
                        ['Most Subprojects Provided', awardsData.annual.mostSubprojects],
                    ].map(([title, rows]) => (
                        <article key={title as string} className="award-mini-board award-special-card">
                            <h4>{title as string}</h4>
                            <ul>
                                {(rows as Array<{ ou: string; rank: number; score: number }>).slice(0, 5).map(row => (
                                    <li key={row.ou}>
                                        <span className={getMedalClass(row.rank)}>{row.rank}</span>
                                        <strong>{row.ou}</strong>
                                        <b>{row.score.toLocaleString()}</b>
                                    </li>
                                ))}
                            </ul>
                        </article>
                    ))}
                </div>
            </section>

            <section className="award-section">
                <div className="award-section__header">
                    <div>
                        <span>Quarterly Awards</span>
                        <h3>Quarter-Only Performance Rankings</h3>
                    </div>
                </div>
                <div className="award-quarter-list">
                    {awardsData.quarters.map(quarter => <QuarterLeaderboard key={quarter.period} quarter={quarter} />)}
                </div>
            </section>

            <section className="dashboard-panel award-panel">
                <div className="dashboard-panel__header">
                    <h3 className="dashboard-panel__title">Quarter Financial Details</h3>
                    <span className="award-panel__meta">Quarter actuals versus quarter due allotment</span>
                </div>
                <div className="data-table-scroll custom-scrollbar">
                    <table className="data-table award-table">
                        <thead>
                            <tr>
                                <th>Period</th>
                                <th>Rank</th>
                                <th>OU</th>
                                <th className="data-table__numeric">Allocation</th>
                                <th className="data-table__numeric">Obligation</th>
                                <th className="data-table__numeric">Disbursement</th>
                                <th className="data-table__numeric">Obli Rate</th>
                                <th className="data-table__numeric">Disb Rate</th>
                                <th className="data-table__numeric">Score</th>
                                <th className="data-table__numeric">Points</th>
                            </tr>
                        </thead>
                        <tbody>
                            {awardsData.quarters.flatMap(quarter => quarter.financial.slice(0, 5).map(row => (
                                <tr key={`${quarter.period}-${row.ou}`}>
                                    <td>{quarter.period}</td>
                                    <td><span className={getMedalClass(row.rank)}>{row.rank}</span></td>
                                    <td className="font-semibold">{row.ou}</td>
                                    <td className="data-table__numeric">{formatCurrency(row.allocation)}</td>
                                    <td className="data-table__numeric">{formatCurrency(row.obligation)}</td>
                                    <td className="data-table__numeric">{formatCurrency(row.disbursement)}</td>
                                    <td className="data-table__numeric">{formatPercent(row.obligationRate)}</td>
                                    <td className="data-table__numeric">{formatPercent(row.disbursementRate)}</td>
                                    <td className="data-table__numeric">{formatScore(row.score)}</td>
                                    <td className="data-table__numeric">{formatScore(row.points)}</td>
                                </tr>
                            )))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
};

export default AwardsRankingsDashboard;
