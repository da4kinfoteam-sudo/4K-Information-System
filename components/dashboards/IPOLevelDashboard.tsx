// Author: 4K
import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    Award,
    BarChart3,
    Download,
    Gauge,
    MapPin,
    Minus,
    RefreshCw,
    Search,
    TrendingDown,
    TrendingUp,
    Users,
} from 'lucide-react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ComposedChart,
    Legend,
    Line,
    Pie,
    PieChart,
    PolarAngleAxis,
    PolarGrid,
    PolarRadiusAxis,
    Radar,
    RadarChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { IPO, LodAnswer, LodAssessment, LodChoice, LodLevelConfig, LodQuestion, LodSection } from '../../constants';
import { supabase } from '../../supabaseClient';
import { parseLocation } from '../LocationPicker';

interface IPOLevelDashboardProps {
    ipos: IPO[];
    selectedYear: string;
}

type ProgressionStatus = 'Improved' | 'Maintained' | 'Declined' | 'New / No Baseline' | 'Needs Assessment';

interface LodDashboardRow {
    ipo: IPO;
    region: string;
    province: string;
    currentAssessment: LodAssessment | null;
    previousAssessment: LodAssessment | null;
    currentLevel: number | null;
    previousLevel: number | null;
    change: number | null;
    componentScores: Record<number, number | null>;
    previousComponentScores: Record<number, number | null>;
    status: ProgressionStatus;
    isHighPerforming: boolean;
    isAtRisk: boolean;
    isReadyForScaleUp: boolean;
    history: { year: number; level: number }[];
}

interface LodDashboardData {
    assessments: LodAssessment[];
    answers: LodAnswer[];
    questions: LodQuestion[];
    choices: LodChoice[];
    sections: LodSection[];
    levelConfigs: LodLevelConfig[];
}

const EMPTY_DATA: LodDashboardData = {
    assessments: [],
    answers: [],
    questions: [],
    choices: [],
    sections: [],
    levelConfigs: [],
};

const LEVEL_COLORS: Record<number, string> = {
    1: '#ef4444',
    2: '#f59e0b',
    3: '#3b82f6',
    4: '#16a34a',
    5: '#0f766e',
};

const STATUS_COLORS: Record<ProgressionStatus, string> = {
    Improved: '#16a34a',
    Maintained: '#2563eb',
    Declined: '#dc2626',
    'New / No Baseline': '#f59e0b',
    'Needs Assessment': '#94a3b8',
};

const STATUS_BADGE_CLASS: Record<ProgressionStatus, string> = {
    Improved: 'status-badge--completed',
    Maintained: 'status-badge--info',
    Declined: 'status-badge--cancelled',
    'New / No Baseline': 'status-badge--pending',
    'Needs Assessment': 'status-badge--neutral',
};

const LEVEL_LABELS: Record<number, string> = {
    1: 'Level 1',
    2: 'Level 2',
    3: 'Level 3',
    4: 'Level 4',
    5: 'Level 5',
};

const formatScore = (value: number | null | undefined, digits = 2) => {
    if (value === null || value === undefined || Number.isNaN(value)) return 'No Data';
    return value.toFixed(digits);
};

const average = (values: number[]) => {
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const percent = (part: number, total: number) => {
    if (total <= 0) return '0.0%';
    return `${((part / total) * 100).toFixed(1)}%`;
};

const getEffectiveLevel = (assessment: LodAssessment | null | undefined, levelConfigs: LodLevelConfig[]) => {
    if (!assessment) return null;

    const explicitLevel = Number(assessment.manual_level ?? assessment.computed_level);
    if (explicitLevel >= 1 && explicitLevel <= 5) return Math.round(explicitLevel);

    const score = Number(assessment.total_score);
    const matchedConfig = levelConfigs.find(config => score >= Number(config.min_score) && score <= Number(config.max_score));
    return matchedConfig ? Number(matchedConfig.level) : null;
};

const getAssessmentKey = (assessmentId: number, questionId: number) => `${assessmentId}:${questionId}`;

const getComponentScores = (
    assessment: LodAssessment | null,
    sections: LodSection[],
    questionsBySection: Map<number, LodQuestion[]>,
    choicesByQuestion: Map<number, LodChoice[]>,
    answersByAssessmentQuestion: Map<string, LodAnswer>
) => {
    const scores: Record<number, number | null> = {};

    sections.forEach(section => {
        if (!assessment) {
            scores[section.id] = null;
            return;
        }

        const questions = questionsBySection.get(section.id) || [];
        let earned = 0;
        let possible = 0;
        let hasAnswer = false;

        questions.forEach(question => {
            const choices = choicesByQuestion.get(question.id) || [];
            const maxChoicePoints = choices.reduce((max, choice) => Math.max(max, Number(choice.points) || 0), 0);
            const questionWeight = Number(question.weight) || 1;

            if (maxChoicePoints > 0) {
                possible += maxChoicePoints * questionWeight;
            }

            const answer = answersByAssessmentQuestion.get(getAssessmentKey(assessment.id, question.id));
            if (answer) {
                hasAnswer = true;
                earned += Number(answer.points_earned) || 0;
            }
        });

        scores[section.id] = hasAnswer && possible > 0 ? Math.max(0, Math.min(5, (earned / possible) * 5)) : null;
    });

    return scores;
};

const resolveIpoProvince = (ipo: IPO) => {
    const parsed = parseLocation(ipo.location || '');
    return parsed.province || ipo.location || 'Unspecified Province';
};

const buildSparklinePoints = (history: { year: number; level: number }[]) => {
    if (history.length === 0) return '';
    const width = 70;
    const height = 28;
    const maxLevel = 5;
    const minLevel = 1;
    const span = Math.max(1, history.length - 1);

    return history.map((point, index) => {
        const x = history.length === 1 ? width / 2 : (index / span) * width;
        const y = height - ((point.level - minLevel) / (maxLevel - minLevel)) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
};

const getInsightToneClass = (status: 'green' | 'blue' | 'orange' | 'red' | 'gray') => `lod-insight lod-insight--${status}`;

const IPOLevelDashboard: React.FC<IPOLevelDashboardProps> = ({ ipos, selectedYear }) => {
    const [data, setData] = useState<LodDashboardData>(EMPTY_DATA);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [yearFilter, setYearFilter] = useState(selectedYear || new Date().getFullYear().toString());
    const [regionFilter, setRegionFilter] = useState('All');
    const [provinceFilter, setProvinceFilter] = useState('All');
    const [statusFilter, setStatusFilter] = useState('All');
    const [levelFilter, setLevelFilter] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    useEffect(() => {
        setYearFilter(selectedYear || new Date().getFullYear().toString());
    }, [selectedYear]);

    useEffect(() => {
        const fetchDashboardData = async () => {
            if (!supabase) {
                setData(EMPTY_DATA);
                setLoading(false);
                return;
            }

            setLoading(true);
            setFetchError(null);

            const [
                assessmentsResult,
                answersResult,
                questionsResult,
                choicesResult,
                sectionsResult,
                levelConfigsResult,
            ] = await Promise.all([
                supabase.from('lod_assessments').select('*'),
                supabase.from('lod_answers').select('*'),
                supabase.from('lod_questions').select('*'),
                supabase.from('lod_choices').select('*'),
                supabase.from('lod_sections').select('*').order('order', { ascending: true }),
                supabase.from('lod_level_configs').select('*').order('level', { ascending: true }),
            ]);

            const firstError = assessmentsResult.error || answersResult.error || questionsResult.error || choicesResult.error || sectionsResult.error || levelConfigsResult.error;
            if (firstError) {
                console.error('Error fetching LOD dashboard data:', firstError);
                setFetchError(firstError.message || 'Unable to load LOD dashboard data.');
                setData(EMPTY_DATA);
            } else {
                setData({
                    assessments: assessmentsResult.data || [],
                    answers: answersResult.data || [],
                    questions: questionsResult.data || [],
                    choices: choicesResult.data || [],
                    sections: (sectionsResult.data || []).sort((a, b) => (a.order || 0) - (b.order || 0)),
                    levelConfigs: levelConfigsResult.data || [],
                });
            }

            setLoading(false);
        };

        fetchDashboardData();
    }, []);

    const model = useMemo(() => {
        const visibleIpoIds = new Set((ipos || []).map(ipo => Number(ipo.id)));
        const visibleAssessments = data.assessments.filter(assessment => visibleIpoIds.has(Number(assessment.ipo_id)));
        const availableYears = Array.from(
            new Set(visibleAssessments.map(assessment => Number(assessment.year)).filter(year => Number.isFinite(year)))
        ).sort((a: number, b: number) => b - a);
        const assessmentYearsByIpo = new Map<number, LodAssessment[]>();
        const questionsBySection = new Map<number, LodQuestion[]>();
        const choicesByQuestion = new Map<number, LodChoice[]>();
        const answersByAssessmentQuestion = new Map<string, LodAnswer>();

        data.questions.forEach(question => {
            const list = questionsBySection.get(question.section_id) || [];
            list.push(question);
            questionsBySection.set(question.section_id, list);
        });
        questionsBySection.forEach(list => list.sort((a, b) => (a.order || 0) - (b.order || 0)));

        data.choices.forEach(choice => {
            const list = choicesByQuestion.get(choice.question_id) || [];
            list.push(choice);
            choicesByQuestion.set(choice.question_id, list);
        });
        choicesByQuestion.forEach(list => list.sort((a, b) => (a.order || 0) - (b.order || 0)));

        data.answers.forEach(answer => {
            answersByAssessmentQuestion.set(getAssessmentKey(answer.assessment_id, answer.question_id), answer);
        });

        visibleAssessments.forEach(assessment => {
            const ipoId = Number(assessment.ipo_id);
            const list = assessmentYearsByIpo.get(ipoId) || [];
            list.push(assessment);
            assessmentYearsByIpo.set(ipoId, list);
        });
        assessmentYearsByIpo.forEach(list => list.sort((a, b) => Number(b.year) - Number(a.year)));

        const targetYear = yearFilter === 'All' ? null : Number(yearFilter);
        const rows = (ipos || []).map(ipo => {
            const ipoAssessments = assessmentYearsByIpo.get(Number(ipo.id)) || [];
            const currentAssessment = targetYear
                ? ipoAssessments.find(assessment => Number(assessment.year) === targetYear) || null
                : ipoAssessments[0] || null;
            const previousAssessment = currentAssessment
                ? ipoAssessments.find(assessment => Number(assessment.year) < Number(currentAssessment.year)) || null
                : null;
            const currentLevel = getEffectiveLevel(currentAssessment, data.levelConfigs);
            const previousLevel = getEffectiveLevel(previousAssessment, data.levelConfigs);
            const change = currentLevel !== null && previousLevel !== null ? currentLevel - previousLevel : null;
            const componentScores = getComponentScores(currentAssessment, data.sections, questionsBySection, choicesByQuestion, answersByAssessmentQuestion);
            const previousComponentScores = getComponentScores(previousAssessment, data.sections, questionsBySection, choicesByQuestion, answersByAssessmentQuestion);
            const componentValues = Object.values(componentScores).filter((value): value is number => value !== null);
            const history = ipoAssessments
                .slice()
                .sort((a, b) => Number(a.year) - Number(b.year))
                .map(assessment => ({ year: Number(assessment.year), level: getEffectiveLevel(assessment, data.levelConfigs) }))
                .filter((entry): entry is { year: number; level: number } => entry.level !== null);

            let status: ProgressionStatus = 'Needs Assessment';
            if (currentAssessment && previousLevel === null) {
                status = 'New / No Baseline';
            } else if (change !== null && change > 0) {
                status = 'Improved';
            } else if (change !== null && change < 0) {
                status = 'Declined';
            } else if (change !== null) {
                status = 'Maintained';
            }

            return {
                ipo,
                region: ipo.region || 'Unspecified Region',
                province: resolveIpoProvince(ipo),
                currentAssessment,
                previousAssessment,
                currentLevel,
                previousLevel,
                change,
                componentScores,
                previousComponentScores,
                status,
                isHighPerforming: currentLevel !== null && currentLevel >= 4,
                isAtRisk: status === 'Declined' || (currentLevel !== null && currentLevel <= 1),
                isReadyForScaleUp: Boolean(
                    currentLevel !== null &&
                    currentLevel >= 3 &&
                    status !== 'Declined' &&
                    componentValues.length > 0 &&
                    componentValues.every(value => value >= 3)
                ),
                history,
            } satisfies LodDashboardRow;
        });

        return {
            rows,
            visibleAssessments,
            availableYears,
            assessmentsByIpo: assessmentYearsByIpo,
        };
    }, [data, ipos, yearFilter]);

    const regionOptions = useMemo(() => {
        return Array.from(new Set(model.rows.map(row => row.region).filter(Boolean))).sort();
    }, [model.rows]);

    const provinceOptions = useMemo(() => {
        return Array.from(new Set(model.rows
            .filter(row => regionFilter === 'All' || row.region === regionFilter)
            .map(row => row.province)
            .filter(Boolean)
        )).sort();
    }, [model.rows, regionFilter]);

    useEffect(() => {
        if (provinceFilter !== 'All' && !provinceOptions.includes(provinceFilter)) {
            setProvinceFilter('All');
        }
    }, [provinceFilter, provinceOptions]);

    const filteredRows = useMemo(() => {
        return model.rows.filter(row => {
            if (regionFilter !== 'All' && row.region !== regionFilter) return false;
            if (provinceFilter !== 'All' && row.province !== provinceFilter) return false;
            if (statusFilter !== 'All' && row.status !== statusFilter) return false;
            if (levelFilter !== 'All' && row.currentLevel !== Number(levelFilter)) return false;
            return true;
        });
    }, [levelFilter, model.rows, provinceFilter, regionFilter, statusFilter]);

    const assessedRows = filteredRows.filter(row => row.currentAssessment && row.currentLevel !== null);

    const metrics = useMemo(() => {
        const assessedTotal = assessedRows.length;
        const avgLevel = average(assessedRows.map(row => row.currentLevel).filter((value): value is number => value !== null));
        const improved = filteredRows.filter(row => row.status === 'Improved').length;
        const declined = filteredRows.filter(row => row.status === 'Declined').length;
        const maintained = filteredRows.filter(row => row.status === 'Maintained').length;
        const highPerforming = filteredRows.filter(row => row.isHighPerforming).length;
        const atRisk = filteredRows.filter(row => row.isAtRisk).length;
        const readyForScaleUp = filteredRows.filter(row => row.isReadyForScaleUp).length;
        const provinceGroups = new Map<string, number[]>();

        assessedRows.forEach(row => {
            if (row.currentLevel === null) return;
            const values = provinceGroups.get(row.province) || [];
            values.push(row.currentLevel);
            provinceGroups.set(row.province, values);
        });

        const topProvince = Array.from(provinceGroups.entries())
            .map(([province, values]) => ({ province, average: average(values) || 0, count: values.length }))
            .sort((a, b) => b.average - a.average || b.count - a.count)[0] || null;

        return {
            assessedTotal,
            avgLevel,
            improved,
            declined,
            maintained,
            highPerforming,
            atRisk,
            readyForScaleUp,
            topProvince,
        };
    }, [assessedRows, filteredRows]);

    const levelDistribution = useMemo(() => {
        return [1, 2, 3, 4, 5].map(level => {
            const count = assessedRows.filter(row => row.currentLevel === level).length;
            return {
                level,
                name: LEVEL_LABELS[level],
                count,
                percent: metrics.assessedTotal > 0 ? (count / metrics.assessedTotal) * 100 : 0,
            };
        });
    }, [assessedRows, metrics.assessedTotal]);

    const progressionByYear = useMemo(() => {
        const includedIpoIds = new Set(filteredRows.map(row => Number(row.ipo.id)));
        const yearGroups = new Map<number, { year: number; level1: number; level2: number; level3: number; level4: number; level5: number; levels: number[] }>();

        model.visibleAssessments
            .filter(assessment => includedIpoIds.has(Number(assessment.ipo_id)))
            .forEach(assessment => {
                const level = getEffectiveLevel(assessment, data.levelConfigs);
                if (level === null) return;

                const year = Number(assessment.year);
                const group = yearGroups.get(year) || { year, level1: 0, level2: 0, level3: 0, level4: 0, level5: 0, levels: [] };
                group[`level${level}` as 'level1'] += 1;
                group.levels.push(level);
                yearGroups.set(year, group);
            });

        return Array.from(yearGroups.values())
            .sort((a, b) => a.year - b.year)
            .map(group => ({
                year: group.year,
                level1: group.level1,
                level2: group.level2,
                level3: group.level3,
                level4: group.level4,
                level5: group.level5,
                average: Number((average(group.levels) || 0).toFixed(2)),
            }));
    }, [data.levelConfigs, filteredRows, model.visibleAssessments]);

    const componentAverages = useMemo(() => {
        return data.sections.map(section => {
            const values = assessedRows
                .map(row => row.componentScores[section.id])
                .filter((value): value is number => value !== null && value !== undefined);
            return {
                id: section.id,
                component: section.title,
                score: average(values),
                count: values.length,
            };
        });
    }, [assessedRows, data.sections]);

    const componentGapAnalysis = useMemo(() => {
        const scoredComponents = componentAverages.filter(component => component.score !== null);
        const highest = scoredComponents.length > 0 ? Math.max(...scoredComponents.map(component => component.score || 0)) : null;

        return componentAverages.map(component => ({
            ...component,
            gap: component.score !== null && highest !== null ? highest - component.score : null,
        })).sort((a, b) => (b.gap || 0) - (a.gap || 0));
    }, [componentAverages]);

    const regionalAverages = useMemo(() => {
        const regionGroups = new Map<string, number[]>();
        assessedRows.forEach(row => {
            if (row.currentLevel === null) return;
            const values = regionGroups.get(row.region) || [];
            values.push(row.currentLevel);
            regionGroups.set(row.region, values);
        });

        return Array.from(regionGroups.entries())
            .map(([region, values]) => ({ region, score: average(values) || 0, count: values.length }))
            .sort((a, b) => b.score - a.score || b.count - a.count);
    }, [assessedRows]);

    const provinceAverages = useMemo(() => {
        const provinceGroups = new Map<string, number[]>();
        assessedRows.forEach(row => {
            if (row.currentLevel === null) return;
            const values = provinceGroups.get(row.province) || [];
            values.push(row.currentLevel);
            provinceGroups.set(row.province, values);
        });

        return Array.from(provinceGroups.entries())
            .map(([province, values]) => ({ province, score: average(values) || 0, count: values.length }))
            .sort((a, b) => b.score - a.score || b.count - a.count)
            .slice(0, 8);
    }, [assessedRows]);

    const statusDistribution = useMemo(() => {
        const statuses: ProgressionStatus[] = ['Improved', 'Maintained', 'Declined', 'New / No Baseline', 'Needs Assessment'];
        return statuses.map(status => ({
            status,
            count: filteredRows.filter(row => row.status === status).length,
        }));
    }, [filteredRows]);

    const insights = useMemo(() => {
        const strongest = componentAverages
            .filter(component => component.score !== null)
            .sort((a, b) => (b.score || 0) - (a.score || 0))[0] || null;
        const weakest = componentAverages
            .filter(component => component.score !== null)
            .sort((a, b) => (a.score || 0) - (b.score || 0))[0] || null;
        const topRegion = regionalAverages[0] || null;

        const componentDeltas = data.sections.map(section => {
            const deltas = filteredRows
                .map(row => {
                    const current = row.componentScores[section.id];
                    const previous = row.previousComponentScores[section.id];
                    return current !== null && current !== undefined && previous !== null && previous !== undefined ? current - previous : null;
                })
                .filter((value): value is number => value !== null);
            return { component: section.title, delta: average(deltas), count: deltas.length };
        }).filter(item => item.delta !== null && item.count > 0).sort((a, b) => (b.delta || 0) - (a.delta || 0))[0] || null;

        return [
            {
                tone: 'green' as const,
                text: `${metrics.improved} IPOs (${percent(metrics.improved, Math.max(1, metrics.assessedTotal))}) improved from their previous assessment.`,
            },
            {
                tone: metrics.declined > 0 ? 'red' as const : 'blue' as const,
                text: `${metrics.declined} IPOs declined and may need management review.`,
            },
            strongest ? {
                tone: 'green' as const,
                text: `${strongest.component} is the strongest component with an average score of ${formatScore(strongest.score)}.`,
            } : null,
            weakest ? {
                tone: 'orange' as const,
                text: `${weakest.component} is the weakest component with an average score of ${formatScore(weakest.score)}.`,
            } : null,
            topRegion ? {
                tone: 'blue' as const,
                text: `${topRegion.region} has the highest regional average LOD score at ${formatScore(topRegion.score)}.`,
            } : null,
            componentDeltas ? {
                tone: (componentDeltas.delta || 0) >= 0 ? 'green' as const : 'red' as const,
                text: `${componentDeltas.component} is the fastest moving component with a ${componentDeltas.delta && componentDeltas.delta >= 0 ? '+' : ''}${formatScore(componentDeltas.delta)} change.`,
            } : null,
            {
                tone: metrics.atRisk > 0 ? 'red' as const : 'gray' as const,
                text: `${metrics.atRisk} IPOs are currently tagged as at-risk.`,
            },
        ].filter((item): item is { tone: 'green' | 'blue' | 'orange' | 'red' | 'gray'; text: string } => Boolean(item));
    }, [componentAverages, data.sections, filteredRows, metrics.assessedTotal, metrics.atRisk, metrics.declined, metrics.improved, regionalAverages]);

    const searchedRows = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        if (!query) return filteredRows;
        return filteredRows.filter(row => [
            row.ipo.name,
            row.region,
            row.province,
            row.status,
            row.currentAssessment?.year?.toString(),
        ].some(value => (value || '').toLowerCase().includes(query)));
    }, [filteredRows, searchTerm]);

    useEffect(() => {
        setCurrentPage(1);
    }, [yearFilter, regionFilter, provinceFilter, statusFilter, levelFilter, searchTerm, itemsPerPage]);

    const paginatedRows = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return searchedRows.slice(start, start + itemsPerPage);
    }, [currentPage, itemsPerPage, searchedRows]);

    const pageCount = Math.max(1, Math.ceil(searchedRows.length / itemsPerPage));

    const handleResetFilters = () => {
        setYearFilter(selectedYear || new Date().getFullYear().toString());
        setRegionFilter('All');
        setProvinceFilter('All');
        setStatusFilter('All');
        setLevelFilter('All');
        setSearchTerm('');
    };

    const handleExport = () => {
        const headers = [
            'IPO Name',
            'Region',
            'Province',
            'Assessment Year',
            'Current LOD Score',
            'Previous LOD Score',
            'Change',
            ...data.sections.map(section => section.title),
            'Status',
        ];
        const rows = searchedRows.map(row => [
            row.ipo.name,
            row.region,
            row.province,
            row.currentAssessment?.year || '',
            row.currentLevel ?? '',
            row.previousLevel ?? '',
            row.change ?? '',
            ...data.sections.map(section => row.componentScores[section.id] !== null && row.componentScores[section.id] !== undefined ? formatScore(row.componentScores[section.id]) : ''),
            row.status,
        ]);
        const csv = [headers, ...rows]
            .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
            .join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `lod-dashboard-${yearFilter.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const renderMetricCard = (
        title: string,
        value: React.ReactNode,
        detail: string,
        icon: React.ReactNode,
        tone: 'green' | 'blue' | 'orange' | 'red' | 'gray' | 'purple' = 'blue'
    ) => (
        <article className={`lod-kpi-card lod-kpi-card--${tone}`}>
            <div className="lod-kpi-card__icon">{icon}</div>
            <div className="lod-kpi-card__body">
                <p>{title}</p>
                <strong>{value}</strong>
                <span>{detail}</span>
            </div>
        </article>
    );

    if (loading) {
        return <div className="dashboard-empty dashboard-empty--center">Loading LOD dashboard data...</div>;
    }

    if (fetchError) {
        return (
            <div className="dashboard-panel">
                <p className="dashboard-empty dashboard-empty--center">{fetchError}</p>
            </div>
        );
    }

    return (
        <div className="lod-dashboard dashboard-view animate-fadeIn">
            <section className="lod-dashboard-hero" aria-labelledby="lod-dashboard-title">
                <div>
                    <p className="lod-dashboard-eyebrow">IPO Level of Development</p>
                    <h3 id="lod-dashboard-title">LOD Dashboard</h3>
                    <span>Monitoring development status and progression across assessed Indigenous Peoples Organizations.</span>
                </div>
                <div className="lod-dashboard-hero__meta">
                    <span>{metrics.assessedTotal} assessed IPOs</span>
                    <span>{yearFilter === 'All' ? 'Latest assessments' : `Assessment year ${yearFilter}`}</span>
                </div>
            </section>

            <section className="lod-filter-panel" aria-label="LOD dashboard filters">
                <div className="dashboard-filter">
                    <label htmlFor="lod-year-filter">Year</label>
                    <select id="lod-year-filter" value={yearFilter} onChange={event => setYearFilter(event.target.value)}>
                        <option value="All">All / Latest</option>
                        {model.availableYears.map(year => (
                            <option key={year} value={year}>{year}</option>
                        ))}
                    </select>
                </div>
                <div className="dashboard-filter">
                    <label htmlFor="lod-region-filter">Region</label>
                    <select id="lod-region-filter" value={regionFilter} onChange={event => setRegionFilter(event.target.value)}>
                        <option value="All">All Regions</option>
                        {regionOptions.map(region => (
                            <option key={region} value={region}>{region}</option>
                        ))}
                    </select>
                </div>
                <div className="dashboard-filter">
                    <label htmlFor="lod-province-filter">Province</label>
                    <select id="lod-province-filter" value={provinceFilter} onChange={event => setProvinceFilter(event.target.value)}>
                        <option value="All">All Provinces</option>
                        {provinceOptions.map(province => (
                            <option key={province} value={province}>{province}</option>
                        ))}
                    </select>
                </div>
                <div className="dashboard-filter">
                    <label htmlFor="lod-status-filter">Status</label>
                    <select id="lod-status-filter" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
                        <option value="All">All Statuses</option>
                        {(['Improved', 'Maintained', 'Declined', 'New / No Baseline', 'Needs Assessment'] as ProgressionStatus[]).map(status => (
                            <option key={status} value={status}>{status}</option>
                        ))}
                    </select>
                </div>
                <div className="dashboard-filter">
                    <label htmlFor="lod-level-filter">LOD Level</label>
                    <select id="lod-level-filter" value={levelFilter} onChange={event => setLevelFilter(event.target.value)}>
                        <option value="All">All Levels</option>
                        {[1, 2, 3, 4, 5].map(level => (
                            <option key={level} value={level}>{LEVEL_LABELS[level]}</option>
                        ))}
                    </select>
                </div>
                <button type="button" className="btn btn-secondary lod-reset-button" onClick={handleResetFilters}>
                    <RefreshCw size={16} />
                    Reset
                </button>
            </section>

            <section className="lod-kpi-grid" aria-label="Executive KPI cards">
                {renderMetricCard('Total IPOs Assessed', metrics.assessedTotal.toLocaleString(), `Out of ${filteredRows.length.toLocaleString()} IPOs`, <Users />, 'blue')}
                {renderMetricCard('Average LOD Score', formatScore(metrics.avgLevel), 'Primary score uses LOD level', <BarChart3 />, 'green')}
                {renderMetricCard('IPOs Improved', metrics.improved.toLocaleString(), `${percent(metrics.improved, metrics.assessedTotal)} of assessed`, <TrendingUp />, 'green')}
                {renderMetricCard('IPOs Declined', metrics.declined.toLocaleString(), `${percent(metrics.declined, metrics.assessedTotal)} of assessed`, <TrendingDown />, 'red')}
                {renderMetricCard('IPOs Maintained', metrics.maintained.toLocaleString(), `${percent(metrics.maintained, metrics.assessedTotal)} of assessed`, <Minus />, 'blue')}
                {renderMetricCard('High-Performing IPOs', metrics.highPerforming.toLocaleString(), 'At Level 4 or 5', <Award />, 'purple')}
                {renderMetricCard('At-Risk IPOs', metrics.atRisk.toLocaleString(), 'Level 1 or declining', <AlertTriangle />, 'orange')}
                {renderMetricCard('Top Province', metrics.topProvince?.province || 'No Data', metrics.topProvince ? `Avg LOD ${formatScore(metrics.topProvince.average)}` : 'No assessed IPOs', <MapPin />, 'gray')}
            </section>

            <section className="lod-dashboard-grid lod-dashboard-grid--three">
                <article className="dashboard-panel lod-chart-card">
                    <div className="dashboard-panel__header">
                        <h4 className="dashboard-panel__title">LOD Level Distribution</h4>
                    </div>
                    {metrics.assessedTotal > 0 ? (
                        <div className="lod-donut-layout">
                            <ResponsiveContainer width="100%" height={240}>
                                <PieChart>
                                    <Pie data={levelDistribution.filter(item => item.count > 0)} dataKey="count" nameKey="name" innerRadius={62} outerRadius={94} paddingAngle={2}>
                                        {levelDistribution.filter(item => item.count > 0).map(item => (
                                            <Cell key={item.level} fill={LEVEL_COLORS[item.level]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value: number, name: string) => [`${value} IPOs`, name]} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="lod-chart-legend">
                                {levelDistribution.map(item => (
                                    <div key={item.level} className="lod-legend-row">
                                        <span style={{ background: LEVEL_COLORS[item.level] }}></span>
                                        <p>{item.name}</p>
                                        <strong>{item.count} ({item.percent.toFixed(1)}%)</strong>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="dashboard-empty dashboard-empty--center">No Data</p>
                    )}
                </article>

                <article className="dashboard-panel lod-chart-card lod-chart-card--wide">
                    <div className="dashboard-panel__header">
                        <h4 className="dashboard-panel__title">LOD Progression Over Time</h4>
                    </div>
                    {progressionByYear.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <ComposedChart data={progressionByYear}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis dataKey="year" />
                                <YAxis yAxisId="left" allowDecimals={false} />
                                <YAxis yAxisId="right" orientation="right" domain={[1, 5]} />
                                <Tooltip />
                                <Legend />
                                {[1, 2, 3, 4, 5].map(level => (
                                    <Bar key={level} yAxisId="left" stackId="levels" dataKey={`level${level}`} name={LEVEL_LABELS[level]} fill={LEVEL_COLORS[level]} />
                                ))}
                                <Line yAxisId="right" type="monotone" dataKey="average" name="Average LOD Score" stroke="#0f766e" strokeWidth={3} dot={{ r: 4 }} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="dashboard-empty dashboard-empty--center">No Data</p>
                    )}
                </article>

                <article className="dashboard-panel lod-chart-card">
                    <div className="dashboard-panel__header">
                        <h4 className="dashboard-panel__title">LOD Component Average Scores</h4>
                    </div>
                    {componentAverages.some(component => component.score !== null) ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <RadarChart data={componentAverages.map(component => ({
                                component: component.component.length > 28 ? `${component.component.slice(0, 28)}...` : component.component,
                                score: Number((component.score || 0).toFixed(2)),
                            }))}>
                                <PolarGrid />
                                <PolarAngleAxis dataKey="component" tick={{ fontSize: 11 }} />
                                <PolarRadiusAxis angle={90} domain={[0, 5]} tickCount={6} />
                                <Radar name="Average Score" dataKey="score" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.22} />
                                <Tooltip />
                            </RadarChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="dashboard-empty dashboard-empty--center">No Data</p>
                    )}
                </article>
            </section>

            <section className="lod-dashboard-grid lod-dashboard-grid--three">
                <article className="dashboard-panel lod-chart-card">
                    <div className="dashboard-panel__header">
                        <h4 className="dashboard-panel__title">Top Provinces by Average LOD</h4>
                    </div>
                    {provinceAverages.length > 0 ? (
                        <div className="lod-rank-list">
                            {provinceAverages.map(item => (
                                <div key={item.province} className="lod-rank-row">
                                    <div>
                                        <strong>{item.province}</strong>
                                        <span>{item.count} assessed IPOs</span>
                                    </div>
                                    <div className="lod-rank-bar">
                                        <span style={{ width: `${Math.min(100, (item.score / 5) * 100)}%` }}></span>
                                    </div>
                                    <b>{formatScore(item.score)}</b>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="dashboard-empty dashboard-empty--center">No Data</p>
                    )}
                </article>

                <article className="dashboard-panel lod-chart-card">
                    <div className="dashboard-panel__header">
                        <h4 className="dashboard-panel__title">LOD Component Gap Analysis</h4>
                    </div>
                    {componentGapAnalysis.some(component => component.score !== null) ? (
                        <div className="data-table-scroll custom-scrollbar lod-compact-table">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Component</th>
                                        <th className="data-table__numeric">Average</th>
                                        <th className="data-table__numeric">Gap</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {componentGapAnalysis.map(component => (
                                        <tr key={component.id}>
                                            <td>{component.component}</td>
                                            <td className="data-table__numeric">{formatScore(component.score)}</td>
                                            <td className="data-table__numeric">{formatScore(component.gap)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="dashboard-empty dashboard-empty--center">No Data</p>
                    )}
                </article>

                <article className="dashboard-panel lod-chart-card">
                    <div className="dashboard-panel__header">
                        <h4 className="dashboard-panel__title">Development Gap Analysis</h4>
                    </div>
                    <div className="lod-insight-list">
                        {insights.map((insight, index) => (
                            <div key={`${insight.text}-${index}`} className={getInsightToneClass(insight.tone)}>
                                <span></span>
                                <p>{insight.text}</p>
                            </div>
                        ))}
                    </div>
                </article>
            </section>

            <section className="lod-dashboard-grid lod-dashboard-grid--three">
                <article className="dashboard-panel lod-chart-card">
                    <div className="dashboard-panel__header">
                        <h4 className="dashboard-panel__title">LOD Average Score by Region</h4>
                    </div>
                    {regionalAverages.length > 0 ? (
                        <div className="lod-rank-list lod-rank-list--region">
                            <div className="lod-average-benchmark">Philippine Average: <strong>{formatScore(metrics.avgLevel)}</strong></div>
                            {regionalAverages.map(item => (
                                <div key={item.region} className="lod-rank-row">
                                    <div>
                                        <strong>{item.region}</strong>
                                        <span>{item.count} IPOs</span>
                                    </div>
                                    <div className="lod-rank-bar">
                                        <span style={{ width: `${Math.min(100, (item.score / 5) * 100)}%` }}></span>
                                    </div>
                                    <b>{formatScore(item.score)}</b>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="dashboard-empty dashboard-empty--center">No Data</p>
                    )}
                </article>

                <article className="dashboard-panel lod-chart-card">
                    <div className="dashboard-panel__header">
                        <h4 className="dashboard-panel__title">IPOs by Progression Status</h4>
                    </div>
                    {filteredRows.length > 0 ? (
                        <div className="lod-donut-layout">
                            <ResponsiveContainer width="100%" height={250}>
                                <PieChart>
                                    <Pie data={statusDistribution.filter(item => item.count > 0)} dataKey="count" nameKey="status" innerRadius={64} outerRadius={96}>
                                        {statusDistribution.filter(item => item.count > 0).map(item => (
                                            <Cell key={item.status} fill={STATUS_COLORS[item.status]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value: number, name: string) => [`${value} IPOs`, name]} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="lod-chart-legend">
                                {statusDistribution.map(item => (
                                    <div key={item.status} className="lod-legend-row">
                                        <span style={{ background: STATUS_COLORS[item.status] }}></span>
                                        <p>{item.status}</p>
                                        <strong>{item.count}</strong>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="dashboard-empty dashboard-empty--center">No Data</p>
                    )}
                </article>

                <article className="dashboard-panel lod-scale-card">
                    <div className="dashboard-panel__header">
                        <h4 className="dashboard-panel__title">IPOs Ready for Scale-Up</h4>
                    </div>
                    <div className="lod-scale-gauge" style={{ '--ready-pct': `${Math.min(100, metrics.assessedTotal > 0 ? (metrics.readyForScaleUp / metrics.assessedTotal) * 100 : 0)}%` } as React.CSSProperties}>
                        <div>
                            <Gauge />
                            <strong>{metrics.readyForScaleUp.toLocaleString()}</strong>
                            <span>{percent(metrics.readyForScaleUp, metrics.assessedTotal)} of assessed IPOs</span>
                        </div>
                    </div>
                    <p className="lod-scale-note">LOD level at least 3, all available component scores at least 3, and not declining.</p>
                </article>
            </section>

            <section className="data-table-card lod-monitoring-card" aria-labelledby="lod-monitoring-table-title">
                <div className="data-table-toolbar">
                    <div className="data-toolbar-row">
                        <div className="data-toolbar-group">
                            <h4 id="lod-monitoring-table-title" className="dashboard-panel__title">IPO Level of Development Monitoring Table</h4>
                        </div>
                        <div className="data-toolbar-group data-toolbar-group--actions">
                            <div className="data-table-search-wrap">
                                <Search aria-hidden="true" />
                                <input
                                    type="search"
                                    className="data-table-search"
                                    placeholder="Search IPO..."
                                    value={searchTerm}
                                    onChange={event => setSearchTerm(event.target.value)}
                                />
                            </div>
                            <button type="button" className="btn btn-secondary" onClick={handleExport}>
                                <Download size={16} />
                                Export
                            </button>
                        </div>
                    </div>
                </div>

                <div className="data-table-scroll custom-scrollbar">
                    <table className="data-table lod-monitoring-table">
                        <thead>
                            <tr>
                                <th>IPO Name</th>
                                <th>Region</th>
                                <th>Province</th>
                                <th className="data-table__numeric">Year</th>
                                <th className="data-table__numeric">Current LOD</th>
                                <th className="data-table__numeric">Previous LOD</th>
                                <th className="data-table__numeric">Change</th>
                                {data.sections.map(section => (
                                    <th key={section.id} className="data-table__numeric" title={section.title}>{section.title}</th>
                                ))}
                                <th>Status</th>
                                <th>Trend</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedRows.length > 0 ? paginatedRows.map(row => (
                                <tr key={row.ipo.id}>
                                    <td><strong>{row.ipo.name}</strong></td>
                                    <td>{row.region}</td>
                                    <td>{row.province}</td>
                                    <td className="data-table__numeric">{row.currentAssessment?.year || 'No Data'}</td>
                                    <td className="data-table__numeric">{formatScore(row.currentLevel)}</td>
                                    <td className="data-table__numeric">{formatScore(row.previousLevel)}</td>
                                    <td className={`data-table__numeric ${row.change !== null && row.change < 0 ? 'lod-negative' : row.change !== null && row.change > 0 ? 'lod-positive' : ''}`}>
                                        {row.change === null ? 'No Data' : `${row.change > 0 ? '+' : ''}${formatScore(row.change)}`}
                                    </td>
                                    {data.sections.map(section => (
                                        <td key={section.id} className="data-table__numeric">{formatScore(row.componentScores[section.id])}</td>
                                    ))}
                                    <td>
                                        <span className={`status-badge status-badge--compact ${STATUS_BADGE_CLASS[row.status]}`}>{row.status}</span>
                                    </td>
                                    <td>
                                        {row.history.length > 0 ? (
                                            <svg className="lod-sparkline" viewBox="0 0 70 28" role="img" aria-label={`${row.ipo.name} LOD trend`}>
                                                <polyline points={buildSparklinePoints(row.history)} fill="none" stroke={row.status === 'Declined' ? '#dc2626' : '#16a34a'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        ) : (
                                            <span className="text-gray-400">No Data</span>
                                        )}
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={10 + data.sections.length}>
                                        <p className="dashboard-empty dashboard-empty--center">No Data</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="data-table-pagination">
                    <div className="data-table-pagination__page-size">
                        <select value={itemsPerPage} onChange={event => setItemsPerPage(Number(event.target.value))}>
                            {[10, 25, 50].map(size => <option key={size} value={size}>{size} / page</option>)}
                        </select>
                    </div>
                    <div className="data-table-pagination__status">
                        <span>
                            Showing {searchedRows.length === 0 ? 0 : ((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, searchedRows.length)} of {searchedRows.length} IPOs
                        </span>
                    </div>
                    <div className="data-table-pagination__controls">
                        <button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage(page => Math.max(1, page - 1))}>Previous</button>
                        <span>{currentPage} / {pageCount}</span>
                        <button type="button" disabled={currentPage >= pageCount} onClick={() => setCurrentPage(page => Math.min(pageCount, page + 1))}>Next</button>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default IPOLevelDashboard;
