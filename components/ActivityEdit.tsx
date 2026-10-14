import { getActivityBudgetSummary, isOriginalActivityBudgetLocked, isSupplementalExpense, isActivityExpenseActualEligible } from '../lib/activitySupplementalBudget';
import { ActivityBudgetEditor } from './ui/ActivityBudgetEditor';
import { remapActivityExpenseGroups, rescheduleActivityTargets, validateActivitySchedule } from '../lib/activityBudgetSchedules';
import { getChangedActivityActualIds, persistActivityDraft } from '../lib/activityDraftPersistence';
import { createBudgetScheduleId } from '../lib/subprojectBudgetSchedules';
import { activityTitleForSave, getActivityDisplayTitle, normalizeActivityTitle } from '../lib/activityTitles';

// Author: 4K 
import React, { useState, FormEvent, useEffect, useMemo, useRef } from 'react';
import { Activity, ActivityExpense, IPO, fundTypes, FundType, tiers, Tier, otherActivityComponents, ReferenceActivity, RefFundSource, philippineRegions, operatingUnits, ouToRegionMap } from '../constants';
import LocationPicker from './LocationPicker';
import { useAuth } from '../contexts/AuthContext';
import { useLogAction } from '../hooks/useLogAction';
import { getMonetaryChanges } from '../lib/logUtils';
import { useIpoHistory } from '../hooks/useIpoHistory';
import { normalizePolicyMonth, useDcfPolicyGuard } from '../hooks/useDcfPolicyGuard';
import { supabase } from '../supabaseClient';
import { ObligationsEditor } from './accomplishment/ObligationsEditor';
import { DisbursementsEditor } from './accomplishment/DisbursementsEditor';
import { resolvePhysicalAccomplishmentSubmittedAt, valuesDiffer } from '../lib/physicalAccomplishmentTimestamp';
import {
    ensureOriginalBudgetSnapshot,
    getBudgetLineAmount,
    getBudgetLineTag,
    isBudgetLineExcludedFromTargets,
    normalizeBudgetLineStatus,
    requestAdjustmentReason,
    summarizeBudgetAdjustments,
    writeBudgetItemAdjustmentHistory
} from '../lib/budgetLineAdjustments';
import { getActualObligationValidationError, hasActualObligationRecords } from '../lib/financialObligationUtils';
import { fetchFinancialObligationsForParent, replaceFinancialObligationRecords } from '../lib/financialObligationSync';
import { getFundSourceByUid, getNewFundSourceDefault, resolveFundSourceUidFromLegacyLabel } from '../lib/fundSources';
import { FundSourceField } from './ui/FundSourceField';
import { ActivityIpoSelector } from './ui/ActivityIpoSelector';
import { buildActivityDetailsPayload, getActivityIpoIds, reconcileActivityIpoLinks } from '../lib/activityIpoLinks';

interface ActivityEditProps {
    mode: 'create' | 'details' | 'expenses' | 'accomplishment';
    activity?: Activity;
    ipos: IPO[];
    onBack: () => void;
    onUpdateActivity: (updatedActivity: Activity) => void;
    uacsCodes: { [key: string]: { [key: string]: { [key: string]: string } } };
    referenceActivities?: ReferenceActivity[];
    fundSources?: RefFundSource[];
    forcedType?: 'Training' | 'Activity';
}

const commonInputClasses = "form-control";

const formatCurrency = (amount: number) => {
    const finiteAmount = Number.isFinite(amount) ? amount : 0;
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(finiteAmount);
};

const defaultFormData: Activity = {
    id: 0,
    uid: '',
    type: 'Activity', 
    name: '',
    date: '',
    endDate: '',
    description: '',
    location: '',
    facilitator: '',
    participatingIpos: [],
    participating_ipo_ids: [],
    participantsMale: 0,
    participantsFemale: 0,
    component: 'Social Preparation',
    expenses: [],
    fundingYear: new Date().getFullYear(),
    fundType: 'Current',
    fundSource: null,
    fundSourceUid: null,
    tier: 'Tier 1',
    operatingUnit: '',
    encodedBy: '',
    catchUpPlanRemarks: '',
    newTargetDate: '',
    actualDate: '',
    actualEndDate: '',
    actualParticipantsMale: 0,
    actualParticipantsFemale: 0,
    // Gender and Inclusivity Actuals
    actualPWD: 0,
    actualMuslim: 0,
    actualLGBTQ: 0,
    actualSoloParent: 0,
    actualSenior: 0,
    actualYouth: 0,
    status: 'Proposed'
};

const ActivityEdit: React.FC<ActivityEditProps> = ({ 
    mode, activity, ipos, onBack, onUpdateActivity, uacsCodes, referenceActivities = [], fundSources = [], forcedType
}) => {
    const { currentUser, hasAccess } = useAuth();
    const { logAction } = useLogAction();
    const { addIpoHistory } = useIpoHistory();
    const { getStatusDecision, getMonthDecision, getMonthLockMessage, isMonthSelectionAllowed, ensureDecisionAllowed } = useDcfPolicyGuard();
    const isAdmin = currentUser?.role === 'Administrator';

    const [formData, setFormData] = useState<Activity>(activity || defaultFormData);
    const [initialActivity, setInitialActivity] = useState<Activity>(activity || defaultFormData);
    const [monthLockMessage, setMonthLockMessage] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const saveInFlight = useRef(false);

    const [activeTab, setActiveTab] = useState<'details' | 'expenses'>('details');
    const [selectedActivityType, setSelectedActivityType] = useState('');
    const trainingNameDraft = useRef(activity?.type === 'Training' ? activity.name : '');
    const [conductType, setConductType] = useState<'Single' | 'Multi-day' | 'Repeating'>('Single');
    const [repeatingEntries, setRepeatingEntries] = useState<any[]>([]);
    const [currentRepeatingEntry, setCurrentRepeatingEntry] = useState<any>({
        id: 0, date: '', endDate: '', isMultiDay: false, participantsMale: 0, participantsFemale: 0, participatingIpos: [], participating_ipo_ids: []
    });
    
    // Filter state for IPO selection
    const [ipoRegionFilter, setIpoRegionFilter] = useState('All');
    const fundSourceDefaultApplied = useRef(false);

    useEffect(() => {
        if (mode !== 'create' || activity) {
            fundSourceDefaultApplied.current = false;
            return;
        }
        if (fundSourceDefaultApplied.current || fundSources.length === 0) return;
        fundSourceDefaultApplied.current = true;
        const defaultSource = getNewFundSourceDefault(fundSources);
        if (defaultSource) {
            setFormData(previous => previous.fundSourceUid || previous.fundSource
                ? previous
                : { ...previous, fundSourceUid: defaultSource.uid, fundSource: defaultSource.label });
        }
    }, [mode, activity, fundSources]);

    const [missingFields, setMissingFields] = useState<string[]>([]);
    const [budgetDraftPending, setBudgetDraftPending] = useState(false);
    const [actualsLoading, setActualsLoading] = useState(false);
    const [actualsLoadError, setActualsLoadError] = useState('');
    const budgetBaseline = useRef<Activity>(activity || defaultFormData);

    const supplementalBudgetSummary = getActivityBudgetSummary(formData);
    const budgetAdjustmentSummary = useMemo(() => summarizeBudgetAdjustments(formData.expenses || []), [formData.expenses]);

    useEffect(() => {
        let cancelled = false;
        if (activity) {
            const applyObligationRows = (centralRows: Awaited<ReturnType<typeof fetchFinancialObligationsForParent>> | null, disbursementRows: any[] = []) => {
                const processedActivity: Activity = {
                    ...activity,
                    expenses: (activity.expenses || []).map(exp => {
                    const centralObligations = centralRows?.filter(row => row.itemId === String(exp.id)) || [];
                    const centralDisbursements = disbursementRows.filter(row => String(row.item_id) === String(exp.id)).map(row => ({ id: row.id, date: row.disbursement_date, amount: Number(row.amount), remarks: row.remarks || '' }));
                    const disbursements = centralDisbursements.length ? centralDisbursements : exp.disbursements?.length ? exp.disbursements : Number(exp.actualDisbursementAmount || 0) !== 0 ? [{ id: `legacy-${exp.id}`, date: exp.actualDisbursementDate || '', amount: exp.actualDisbursementAmount || 0, remarks: 'Legacy Record' }] : exp.disbursements;
                    if (centralObligations.length > 0) return { ...exp, obligations: centralObligations, disbursements };
                    const hasAmount = Number(exp.actualObligationAmount || 0) !== 0;
                    const hasNoObligations = !exp.obligations || exp.obligations.length === 0;
                    if (hasAmount && hasNoObligations) {
                        return {
                            ...exp, disbursements,
                            obligations: [{
                                id: `legacy-obligation-${exp.id}`,
                                date: exp.actualObligationDate || '',
                                amount: exp.actualObligationAmount || 0,
                                remarks: 'Legacy Record'
                            }]
                        };
                    }
                    return { ...exp, disbursements };
                    }),
                };
                if (cancelled) return;
                setFormData(previous => ({
                    ...previous,
                    expenses: previous.expenses.map(expense => {
                        const loaded = processedActivity.expenses.find(item => item.id === expense.id);
                        return loaded ? { ...expense, obligations: loaded.obligations, disbursements: loaded.disbursements } : expense;
                    }),
                }));
                setInitialActivity(previous => ({ ...previous, expenses: processedActivity.expenses }));
            };

            budgetBaseline.current = structuredClone(activity);
            setActualsLoadError('');
            setFormData({ ...activity, expenses: activity.expenses || [] });
            trainingNameDraft.current = activity.type === 'Training' ? activity.name : '';
            setInitialActivity({ ...activity, expenses: activity.expenses || [] });
            if (supabase && activity.id > 0 && mode === 'accomplishment') {
                setActualsLoading(true);
                void Promise.all([
                    fetchFinancialObligationsForParent({ entityType: 'activity_expense', parentId: activity.id }),
                    supabase.from('financial_disbursements').select('*').eq('entity_type', 'activity_expense').eq('parent_id', activity.id),
                ]).then(([rows, disbursements]) => {
                    if (disbursements.error) throw disbursements.error;
                    applyObligationRows(rows, disbursements.data || []);
                })
                    .catch(error => {
                        console.error('Failed to load authoritative activity obligations:', error);
                        if (!cancelled) setActualsLoadError('Existing financial actuals could not be loaded. Reopen the activity before saving.');
                    }).finally(() => { if (!cancelled) setActualsLoading(false); });
            } else {
                setActualsLoading(false);
            }
            if (activity.endDate && activity.endDate !== activity.date) {
                setConductType('Multi-day');
            } else {
                setConductType('Single');
            }
            if (activity.type === 'Training') {
                const ref = activity.reference_activity_id
                    ? referenceActivities?.find(ra => String(ra.id) === String(activity.reference_activity_id))
                    : referenceActivities?.find(ra => ra.component === activity.component && ra.type === 'Training');
                setSelectedActivityType(ref ? ref.activity_name : `${activity.component} Training`);
            } else {
                const ref = activity.reference_activity_id
                    ? referenceActivities?.find(ra => String(ra.id) === String(activity.reference_activity_id))
                    : undefined;
                setSelectedActivityType(ref ? ref.activity_name : activity.name);
            }
        } else {
            // Create Mode Defaults
            const userOu = currentUser?.operatingUnit || '';
            const defaultSource = getNewFundSourceDefault(fundSources);
            setFormData({
                ...defaultFormData,
                type: forcedType || 'Activity',
                operatingUnit: userOu,
                encodedBy: currentUser?.fullName || '',
                fundSourceUid: defaultSource?.uid || null,
                fundSource: defaultSource?.label || null,
                status: 'Proposed'
            });
            setConductType('Single');
            setIpoRegionFilter(ouToRegionMap[userOu] || 'All');
        }
        
        if (mode === 'expenses') setActiveTab('expenses');
        return () => { cancelled = true; };
    }, [activity?.id, mode, forcedType, currentUser?.id]);

    // Derived States
    const activityOptions = useMemo(() => {
        return referenceActivities
            .filter(ra => ra.component === formData.component)
            .filter(ra => forcedType ? ra.type === forcedType : true)
            .map(ra => ra.activity_name);
    }, [formData.component, referenceActivities, forcedType]);

    // Status Logic
    const availableStatuses = useMemo(() => {
        return ['Proposed', 'Ongoing', 'Completed', 'Cancelled'];
    }, []);

    const originalBudgetLocked = !!activity && isOriginalActivityBudgetLocked(activity);
    const isDetailsLocked = mode === 'create' ? !hasAccess('Activities', 'edit') : !!activity && !getStatusDecision({
        moduleKey: 'activities', item: activity, action: mode === 'expenses' ? 'editBudget' : 'editDetails',
        hasModuleAccess: hasAccess('Activities', 'edit'),
    }).allowed;

    // --- Handlers ---

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        
        if (name === 'component') {
            setSelectedActivityType('');
        }

        setFormData(prev => {
            const newData = { ...prev, [name]: value };
            if (name === 'component') {
                newData.reference_activity_id = null;
            }
            if (name === 'operatingUnit') {
                const mappedRegion = ouToRegionMap[value] || 'All';
                setIpoRegionFilter(mappedRegion);
            }
            if (name === 'date' && conductType === 'Single') newData.endDate = value;
            if (name === 'actualDate' && conductType === 'Single') newData.actualEndDate = value;
            return newData;
        });
        
        if (missingFields.includes(name)) {
            setMissingFields(prev => prev.filter(f => f !== name));
        }
    };

    const handleNumericChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        const numValue = value === '' ? 0 : Number(value);
        if (name === 'fundingYear' && budgetDraftPending) { alert('Apply or discard the schedule draft before changing Fund Year.'); return; }
        const reschedule = mode === 'create' && name === 'fundingYear' && formData.fundingYear !== numValue && formData.expenses.length > 0
            && window.confirm('Reschedule planned expense months to this Fund Year? Actual dates will remain unchanged.');
        setFormData(previous => ({ ...previous, [name]: numValue, ...(reschedule ? { expenses: rescheduleActivityTargets(previous.expenses, numValue) } : {}) }));
    };

    const handleActivityTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        if (formData.type === 'Training') trainingNameDraft.current = formData.name;
        const selectedName = e.target.value;
        setSelectedActivityType(selectedName);
        const ref = referenceActivities?.find(ra => ra.activity_name === selectedName && ra.component === formData.component);
        const type = ref?.type || 'Activity'; 
        
        if (missingFields.includes('type')) {
            setMissingFields(prev => prev.filter(f => f !== 'type'));
        }

        setFormData(prev => ({ 
            ...prev, 
            name: type === 'Training' ? trainingNameDraft.current : selectedName,
            type: type,
            reference_activity_id: ref?.id ? Number(ref.id) : null
        }));
    };

    const handleConductTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value as any;
        setConductType(val);
        setFormData(prev => {
             if (val === 'Single') return { ...prev, endDate: prev.date, actualEndDate: prev.actualDate };
             if (val === 'Repeating') return { ...prev, date: '', endDate: '' };
             return prev;
        });
    };

    // Repeating Activity Logic
    const handleRepeatingEntryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        if (type === 'checkbox') {
             setCurrentRepeatingEntry(prev => ({ ...prev, [name]: checked }));
        } else {
             const isNum = type === 'number';
             setCurrentRepeatingEntry(prev => ({ ...prev, [name]: isNum ? (value === '' ? '' : parseFloat(value)) : value }));
        }
        
        if (name === 'date' && !currentRepeatingEntry.isMultiDay) {
             setCurrentRepeatingEntry(prev => ({ ...prev, endDate: value }));
        }
    };
    
    const handleAddRepeatingEntry = () => {
        if (!currentRepeatingEntry.date) {
            alert("Date is required.");
            return;
        }
        const newEntry = { ...currentRepeatingEntry, id: Date.now() };
        setRepeatingEntries(prev => [...prev, newEntry]);
        setCurrentRepeatingEntry({ id: 0, date: '', endDate: '', isMultiDay: false, participantsMale: 0, participantsFemale: 0, participatingIpos: [], participating_ipo_ids: [] });
    };

    const getUacsDescription = (objectType: string, particular: string, code: string) => uacsCodes[objectType]?.[particular]?.[code] || '';

    // Target changes are staged; adjustment history follows the confirmed parent save.
    const handleApplyExpenses = (rows: ActivityExpense[]) => {
        setFormData(previous => {
            const staged = new Map(rows.map(row => {
                const before = previous.expenses.find(item => item.id === row.id);
                const snapshot = ensureOriginalBudgetSnapshot(before || row);
                return [String(row.id), normalizeBudgetLineStatus({ ...row, originalPlannedAmount: snapshot.originalPlannedAmount, originalCapturedAt: snapshot.originalCapturedAt })];
            }));
            const expenses = previous.expenses.map(row => staged.get(String(row.id)) || row);
            const reserved = new Set(previous.expenses.map(row => String(row.id)));
            return { ...previous, expenses: [...expenses, ...rows.filter(row => !reserved.has(String(row.id))).map(row => staged.get(String(row.id))!)] };
        });
    };
    const handleRemoveExpense = (expense: ActivityExpense) => {
        const isSavedLine = !!activity?.expenses?.some(row => row.id === expense.id);
        const hasActuals = !!expense.obligations?.length || !!expense.disbursements?.length || hasActualObligationRecords(expense) || Number(expense.actualDisbursementAmount || 0) !== 0;
        if (isSavedLine || hasActuals) {
            const reason = requestAdjustmentReason('cancelling this expense');
            if (!reason) return;
            handleApplyExpenses([{ ...expense, isCancelled: true, isRealignment: false, isSavings: false, adjustmentReason: reason }]);
        } else setFormData(previous => ({ ...previous, expenses: previous.expenses.filter(row => row.id !== expense.id) }));
    };
    const leaveForm = () => {
        if (budgetDraftPending && !window.confirm('Discard the unsaved schedule draft?')) return;
        onBack();
    };

    const handleExpenseAccomplishmentChange = (id: number, field: keyof ActivityExpense, value: any) => {
        setFormData(prev => ({
            ...prev,
            expenses: prev.expenses.map(e => e.id === id ? { ...e, [field]: value } : e)
        }));
    };

    const validateActivityActualMonth = async (month?: string) => {
        if (!month || !activity) return true;
        const decision = getMonthDecision(month);
        if (isMonthSelectionAllowed(decision)) {
            setMonthLockMessage('');
            return true;
        }
        setMonthLockMessage(getMonthLockMessage(decision));
        return false;
    };

    const hasMonthChanged = (current?: string | null, original?: string | null) => (
        normalizePolicyMonth(current) !== normalizePolicyMonth(original)
    );

    const getChangedRecordMonths = (
        currentRecords: Array<{ id?: number | string; date?: string | null }> = [],
        originalRecords: Array<{ id?: number | string; date?: string | null }> = []
    ) => currentRecords
        .filter((record, index) => {
            const originalRecord = record.id !== undefined
                ? originalRecords.find(item => item.id === record.id)
                : originalRecords[index];
            return !!record.date && (!originalRecord || hasMonthChanged(record.date, originalRecord.date));
        })
        .map(record => record.date)
        .filter(Boolean) as string[];

    const validateActivityAccomplishmentMonthsForSave = async () => {
        if (mode !== 'accomplishment') return true;
        const months = [
            ...(hasMonthChanged(formData.actualDate, initialActivity.actualDate) ? [formData.actualDate] : []),
            ...(hasMonthChanged(formData.actualEndDate, initialActivity.actualEndDate) ? [formData.actualEndDate] : []),
            ...formData.expenses.flatMap(exp => {
                const originalExpense = initialActivity.expenses.find(item => item.id === exp.id);
                return [
                    ...getChangedRecordMonths(exp.obligations || [], originalExpense?.obligations || []),
                    ...getChangedRecordMonths(exp.disbursements || [], originalExpense?.disbursements || []),
                ];
            }),
        ].filter(Boolean) as string[];
        for (const month of months) {
            if (!(await validateActivityActualMonth(month))) return false;
        }
        return true;
    };

    const handleActualConductDateChange = async (field: 'actualDate' | 'actualEndDate', value: string) => {
        if (value && !(await validateActivityActualMonth(value))) return;
        setFormData(prev => ({
            ...prev,
            [field]: value,
            ...(field === 'actualDate' && conductType === 'Single' ? { actualEndDate: value } : {}),
        }));
        if (missingFields.includes(field)) {
            setMissingFields(prev => prev.filter(item => item !== field));
        }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (mode === 'expenses' && originalBudgetLocked) { alert('The original budget is locked. Use Supplemental Information.'); return; }
        if (budgetDraftPending) { alert('Apply or discard the expense schedule draft before saving.'); return; }
        if (actualsLoading || actualsLoadError) { alert(actualsLoadError || 'Wait for existing actuals to finish loading.'); return; }
        if (saveInFlight.current) return;
        saveInFlight.current = true;
        setIsSaving(true);
        try {

        if (mode === 'create' && !hasAccess('Activities', 'edit')) {
            alert('You do not have permission to create activities.');
            return;
        }

        if (mode === 'create' || mode === 'expenses') {
            const issue = formData.expenses.map(row => {
                const original = activity?.expenses?.find(item => item.id === row.id);
                if (original && JSON.stringify(original) === JSON.stringify(row)) return null;
                return validateActivitySchedule(row, { uacsCodes }, original);
            }).find(Boolean);
            if (issue) { alert(issue); return; }
        }
        if (mode === 'accomplishment') {
            const obligationError = (formData.expenses || [])
                .map(expense => getActualObligationValidationError(expense.obligations || []))
                .find(Boolean);
            if (obligationError) {
                alert(obligationError);
                return;
            }
        }

        if (mode !== 'create' && activity) {
            const action = mode === 'details'
                ? 'editDetails'
                : mode === 'expenses'
                    ? 'editBudget'
                    : 'editPhysicalAccomplishment';
            const hasModuleAccess = mode === 'accomplishment'
                ? hasAccess('Accomplishment - Physical', 'edit') || hasAccess('Accomplishment - Financial', 'edit')
                : hasAccess('Activities', 'edit');
            const decision = getStatusDecision({
                moduleKey: 'activities',
                item: activity,
                action,
                hasModuleAccess,
            });
            const allowed = await ensureDecisionAllowed(decision, {
                moduleKey: 'activities',
                item: activity,
                itemId: activity.id,
                itemName: activity.name,
                status: activity.status,
                action,
                entityType: 'activity',
            });
            if (!allowed) return;
        }

        if (!(await validateActivityAccomplishmentMonthsForSave())) return;
        
        if (mode === 'create' || mode === 'details') {
            const requiredFields = ['component', 'type', 'location'];
            if (conductType !== 'Repeating') requiredFields.push('date');
            if (formData.type === 'Training') requiredFields.push('name');
            if (conductType === 'Multi-day') requiredFields.push('endDate');

            const missing = requiredFields.filter(field => !formData[field as keyof Activity]);
            if (missing.length > 0) {
                setMissingFields(missing);
                alert('Please fill out all required fields before proceeding.');
                return;
            }
        }

        if (mode === 'create' && conductType === 'Repeating' && repeatingEntries.length === 0) {
            alert('Add at least one schedule entry before saving.');
            return;
        }

        let activitiesToSave: Activity[] = [];
        const currentYear = new Date().getFullYear();
        const prefix = formData.type === 'Training' ? 'TRN' : 'ACT';
        const workflow_status = currentUser?.requires_approver ? 'PENDING' : 'APPROVED';

        if (mode === 'create') {
            const selectedUid = formData.fundSourceUid || resolveFundSourceUidFromLegacyLabel(formData.fundSource, fundSources);
            const selectedSource = getFundSourceByUid(selectedUid, fundSources);
            if (!selectedSource?.is_active) {
                alert('Select an active Fund Source before saving a new activity.');
                return;
            }
        }

        const repeatingExpenseIds = new Set<string>(formData.expenses.map(row => String(row.id)));
        if (mode === 'create') {
             if (conductType === 'Repeating') {
                activitiesToSave = repeatingEntries.map((entry, idx) => ({
                    ...formData,
                    uid: `${prefix}-${currentYear}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}-${idx}`,
                    date: entry.date,
                    endDate: entry.endDate || entry.date, 
                    participantsMale: entry.participantsMale,
                    participantsFemale: entry.participantsFemale,
                    participatingIpos: entry.participatingIpos,
                    participating_ipo_ids: entry.participating_ipo_ids,
                    expenses: remapActivityExpenseGroups(formData.expenses).map(exp => ({ ...exp, id: createBudgetScheduleId(repeatingExpenseIds) })),
                    id: 0,
                    workflow_status,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    history: [{ date: new Date().toISOString(), event: "Created (Repeating)", user: currentUser?.fullName || "System" }]
                }));
             } else {
                 activitiesToSave = [{
                     ...formData,
                     uid: `${prefix}-${currentYear}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
                     id: 0,
                     workflow_status,
                     created_at: new Date().toISOString(),
                     updated_at: new Date().toISOString(),
                     history: [{ date: new Date().toISOString(), event: "Created", user: currentUser?.fullName || "System" }]
                 }];
             }
        } else {
            // Edit Mode
            const submittedAt = new Date().toISOString();
            let updatedStatus = formData.status;
            // Auto-complete logic for Accomplishment Mode if actual date is present
            if (mode === 'accomplishment') {
                 if (formData.actualDate) {
                     updatedStatus = 'Completed';
                 }
            }

            const physicalActualFields: (keyof Activity)[] = [
                'actualDate',
                'actualEndDate',
                'actualParticipantsMale',
                'actualParticipantsFemale',
                'actualPWD',
                'actualMuslim',
                'actualLGBTQ',
                'actualSoloParent',
                'actualSenior',
                'actualYouth'
            ];
            const physicalAccomplishmentChanged = mode === 'accomplishment'
                ? physicalActualFields.some(field => valuesDiffer(initialActivity[field], formData[field]))
                : valuesDiffer(initialActivity.actualDate, formData.actualDate);
            const physicalAccomplishmentSubmittedAt = resolvePhysicalAccomplishmentSubmittedAt({
                hasPhysicalAccomplishment: !!formData.actualDate,
                hasChanged: physicalAccomplishmentChanged,
                previousSubmittedAt: initialActivity.physical_accomplishment_submitted_at,
                submittedAt
            });

            activitiesToSave = [{
                ...formData,
                status: updatedStatus,
                physical_accomplishment_submitted_at: physicalAccomplishmentSubmittedAt,
                updated_at: submittedAt,
                history: [...(formData.history || []), { date: submittedAt, event: `Updated (${mode})`, user: currentUser?.fullName || "System" }]
            }];
        }

        if (mode === 'create' || mode === 'details') {
            activitiesToSave = activitiesToSave.map(saved => ({ ...saved, activity_title: activityTitleForSave(saved), ...reconcileActivityIpoLinks(saved, ipos) }));
        }
        if (mode === 'details' && activity) {
            const oldTitle = normalizeActivityTitle(activity.activity_title);
            const newTitle = normalizeActivityTitle(formData.activity_title);
            if (oldTitle !== newTitle) {
                activitiesToSave[0].history!.push({
                    date: activitiesToSave[0].updated_at!,
                    event: `Activity title changed (${activity.uid || activity.id}, ID ${activity.id}): ${JSON.stringify(oldTitle)} -> ${JSON.stringify(newTitle)}`,
                    user: currentUser?.fullName || 'System',
                });
            }
            const before = reconcileActivityIpoLinks(activity, ipos);
            const after = reconcileActivityIpoLinks(formData, ipos);
            if (JSON.stringify(before) !== JSON.stringify(after)) {
                activitiesToSave[0].history!.push({
                    date: activitiesToSave[0].updated_at!,
                    event: `Participating IPOs changed: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`,
                    user: currentUser?.fullName || 'System',
                });
            }
        }

        const linkedFundSourceUid = formData.fundSourceUid || resolveFundSourceUidFromLegacyLabel(formData.fundSource, fundSources);
        const linkedFundSource = getFundSourceByUid(linkedFundSourceUid, fundSources);
        if (linkedFundSource) {
            activitiesToSave = activitiesToSave.map(saved => ({
                ...saved,
                fundSourceUid: linkedFundSource.uid,
                fundSource: linkedFundSource.label,
            }));
        }

        if (supabase) {
            const persisted: Activity[] = [];
            try {
                for (let i = 0; i < activitiesToSave.length; i++) {
                    const act = activitiesToSave[i];
                    const { id, ...payload } = act;
                    
                    // Sanitize date fields: convert empty strings to null
                    const sanitizedPayload: any = mode === 'details' ? buildActivityDetailsPayload(act) : { ...payload };
                    if (mode === 'details' && originalBudgetLocked) {
                        for (const field of ['fundingYear','fundType','tier','fundSourceUid','fundSource','isSavings','isRealignment']) delete sanitizedPayload[field];
                    }
                    if (mode === 'details' && normalizeActivityTitle(initialActivity.activity_title) === act.activity_title) {
                        delete sanitizedPayload.activity_title;
                    }
                    if (mode === 'expenses' || mode === 'accomplishment') {
                        delete sanitizedPayload.activity_title;
                        delete sanitizedPayload.participatingIpos;
                        delete sanitizedPayload.participating_ipo_ids;
                    }
                    if (sanitizedPayload.reference_activity_id === '' || sanitizedPayload.reference_activity_id === undefined) {
                        sanitizedPayload.reference_activity_id = null;
                    }
                    const dateFields = ['date', 'endDate', 'newTargetDate', 'actualDate', 'actualEndDate'];
                    dateFields.forEach(field => {
                        if (sanitizedPayload[field] === '') {
                            sanitizedPayload[field] = null;
                        }
                    });
                    if (sanitizedPayload.expenses && mode === 'accomplishment') {
                        sanitizedPayload.expenses = sanitizedPayload.expenses.map((exp: any) => {
                            const sanitizedExp = { ...exp };
                            if (sanitizedExp.obligations && sanitizedExp.obligations.length === 0) {
                                sanitizedExp.actualObligationAmount = 0;
                                sanitizedExp.actualObligationDate = null;
                            } else if (sanitizedExp.obligations && sanitizedExp.obligations.length > 0) {
                                const latestOb = [...sanitizedExp.obligations].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                                sanitizedExp.actualObligationAmount = sanitizedExp.obligations.reduce((sum: number, o: any) => sum + (o.amount || 0), 0);
                                sanitizedExp.actualObligationDate = latestOb.date;
                            }
                            if (sanitizedExp.disbursements && sanitizedExp.disbursements.length === 0) {
                                sanitizedExp.actualDisbursementAmount = 0;
                                sanitizedExp.actualDisbursementDate = null;
                            } else if (sanitizedExp.disbursements && sanitizedExp.disbursements.length > 0) {
                                const latestDb = [...sanitizedExp.disbursements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                                sanitizedExp.actualDisbursementAmount = sanitizedExp.disbursements.reduce((sum: number, d: any) => sum + (d.amount || 0), 0);
                                sanitizedExp.actualDisbursementDate = latestDb.date;
                            }
                            ['actualObligationDate', 'actualDisbursementDate'].forEach(field => {
                                if (sanitizedExp[field] === '') {
                                    sanitizedExp[field] = null;
                                }
                            });
                            return sanitizedExp;
                        });
                    }

                    if (mode === 'create') {
                         const { data, error } = await supabase.from('activities').insert([sanitizedPayload]).select();
                         if (error) throw error;
                         if (!data?.length) throw new Error('No saved activity was returned. Reload before retrying.');
                         if (data.length > 0) {
                             const createdId = data[0].id;
                             activitiesToSave[i] = data[0] as Activity;
                             persisted.push(data[0] as Activity);
                             logAction(`Created ${act.type}`, act.name, undefined, act.type, String(createdId));
                             
                             // Planned schedules have no central actual records to synchronize.
                         }
                    } else {
                         let data: Activity;
                         if (mode === 'expenses' || mode === 'accomplishment') {
                             data = await persistActivityDraft(mode === 'expenses' ? budgetBaseline.current : initialActivity, { ...act, expenses: sanitizedPayload.expenses }, mode);
                         } else {
                             const result = await supabase.from('activities').update(sanitizedPayload).eq('id', activity!.id).select().single();
                             if (result.error) throw result.error;
                             if (!result.data) throw new Error('No saved activity was returned. Reload before retrying.');
                             data = result.data as Activity;
                         }
                         activitiesToSave[i] = data;
                         persisted.push(data);
                         
                         const metadata = mode === 'details' ? undefined : getMonetaryChanges(activity, sanitizedPayload, 'Activity');
                         logAction(`Updated ${act.type}`, act.name, undefined, act.type, String(activity!.id), metadata);
                         
                         // Sync obligations for updated activity
                         if (mode === 'accomplishment') {
                             const obligationIds = getChangedActivityActualIds(initialActivity.expenses, formData.expenses, 'obligation');
                             const disbursementIds = getChangedActivityActualIds(initialActivity.expenses, formData.expenses, 'disbursement');
                             await syncActivityObligations(activity!.id, data.expenses.filter(row => obligationIds.has(String(row.id))));
                             await syncActivityDisbursements(activity!.id, data.expenses.filter(row => disbursementIds.has(String(row.id))));
                         }
                         if (mode === 'expenses') await persistExpenseAdjustmentHistory(data);
                    }
                    
                    // IPO History Log
                    const saved = activitiesToSave[i];
                    for (const ipoId of getActivityIpoIds(reconcileActivityIpoLinks(saved, ipos))) {
                        if (ipos.some(ipo => Number(ipo.id) === ipoId)) {
                            await addIpoHistory(ipoId, `${mode === 'create' ? 'Created' : 'Updated'} ${saved.type}: ${getActivityDisplayTitle(saved)} (${saved.uid || saved.id})`);
                        }
                    }
                }
            } catch (err: any) {
                persisted.forEach(onUpdateActivity);
                alert(persisted.length
                    ? `${persisted.length} activity record(s) saved, but a follow-up operation failed: ${err.message}. Reload before retrying to avoid duplicates.`
                    : "Error saving: " + err.message);
                if (persisted.length) onBack();
                return;
            }
        } else {
            if (mode === 'create') {
                for (let i = 0; i < activitiesToSave.length; i++) {
                    activitiesToSave[i].id = Date.now() + i;
                }
            }
        }
        
        for (const act of activitiesToSave) {
            onUpdateActivity(act);
        }
        if (mode === 'create') alert(`Saved ${activitiesToSave.length} activities.`);
        onBack();
        } finally {
            saveInFlight.current = false;
            setIsSaving(false);
        }
    };

    const syncActivityObligations = async (parentId: number, expenses: ActivityExpense[]) => {
        if (!supabase) return;
        const entityType = 'activity_expense';

        for (const exp of expenses) {
            if (exp.obligations && exp.obligations.length > 0) {
                // Also update legacy fields for fallback reporting
                const latestOb = [...exp.obligations].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                exp.actualObligationAmount = exp.obligations.reduce((sum, o) => sum + (o.amount || 0), 0);
                exp.actualObligationDate = latestOb.date;

            } else {
                exp.actualObligationAmount = 0;
                exp.actualObligationDate = null;
            }
            await replaceFinancialObligationRecords({
                entityType,
                parentId,
                itemId: exp.id ?? null,
                records: exp.obligations || [],
            });
        }
    };

    const syncActivityDisbursements = async (parentId: number, expenses: ActivityExpense[]) => {
        if (!supabase) return;
        for (const exp of expenses) {
            const { error: deleteError } = await supabase.from('financial_disbursements').delete()
                .eq('entity_type', 'activity_expense').eq('parent_id', parentId).eq('item_id', String(exp.id));
            if (deleteError) throw deleteError;
            const records = exp.disbursements || [];
            if (!records.length) continue;
            const { error } = await supabase.from('financial_disbursements').insert(records.map(row => ({
                entity_type: 'activity_expense', parent_id: parentId, item_id: String(exp.id),
                disbursement_date: row.date, amount: row.amount || 0, remarks: row.remarks || '',
            })));
            if (error) throw error;
        }
    };
    const persistExpenseAdjustmentHistory = async (saved: Activity) => {
        for (const row of saved.expenses) {
            const before = budgetBaseline.current.expenses.find(item => item.id === row.id);
            const intended = formData.expenses.find(item => item.id === row.id);
            if (!intended || JSON.stringify(before) === JSON.stringify(intended)) continue;
            if (JSON.stringify(before) === JSON.stringify(row)) continue;
            if (![before?.isCancelled, before?.isSavings, before?.isRealignment, row.isCancelled, row.isSavings, row.isRealignment].some(Boolean)) continue;
            await writeBudgetItemAdjustmentHistory({
                sourceType: 'activity_expense', parentId: saved.id, itemId: row.id,
                action: !before ? 'create_adjustment_item' : row.isCancelled ? 'cancel' : row.isRealignment ? 'tag_realignment' : row.isSavings ? 'tag_savings' : before.isCancelled ? 'restore' : 'clear_tag',
                beforeSnapshot: before || null, afterSnapshot: row,
                reason: row.adjustmentReason || 'Updated expense adjustment.', currentUser,
            });
        }
    };

    const changeTab = (name: 'details' | 'expenses') => {
        if (budgetDraftPending) { alert('Apply or discard the expense schedule draft before changing tabs.'); return; }
        setActiveTab(name);
    };

    return (
        <div className="form-page animate-fadeIn">
             <div className="detail-header">
                <div className="detail-heading">
                <h1 className="detail-title">
                    {mode === 'create' ? 'Create New Activity' : `Edit ${mode === 'expenses' ? 'Expenses' : mode === 'accomplishment' ? 'Accomplishment' : 'Details'}: ${getActivityDisplayTitle(formData)}`}
                </h1>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="form-card">
                <fieldset className="activity-form-save-boundary" disabled={isSaving || actualsLoading}>
                {monthLockMessage && (
                    <div className="notice notice--warning" role="status">
                        {monthLockMessage}
                    </div>
                )}
                
                {/* Mode: Create - Tabs */}
                {mode === 'create' && (
                    <div className="data-tabs">
                        <div className="data-tabs__nav">
                            <button type="button" onClick={() => changeTab('details')} className={`data-tab ${activeTab === 'details' ? 'is-active' : ''}`}>Basic Info</button>
                            <button type="button" onClick={() => changeTab('expenses')} className={`data-tab ${activeTab === 'expenses' ? 'is-active' : ''}`}>Expenses</button>
                        </div>
                    </div>
                )}

                {/* CREATE / DETAILS MODE */}
                {((mode === 'create' && activeTab === 'details') || mode === 'details') && (
                    <div className="form-stack form-stack--spacious">
                        <fieldset className="form-fieldset" disabled={isDetailsLocked}>
                            <legend className="form-legend">Basic Information</legend>
                            <div className="form-grid">
                                <div>
                                    <label className="form-label">Status</label>
                                    <select name="status" value={formData.status} onChange={handleInputChange} className={commonInputClasses} disabled={mode === 'create'}>
                                        {availableStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label">Operating Unit</label>
                                    <select 
                                        name="operatingUnit" 
                                        value={formData.operatingUnit || ''} 
                                        onChange={handleInputChange} 
                                        className={commonInputClasses} 
                                        disabled={!isAdmin}
                                        title={!isAdmin ? "Only Administrators can edit the Operating Unit" : ""}
                                    >
                                        <option value="">Select Operating Unit</option>
                                        {operatingUnits.map(ou => <option key={ou} value={ou}>{ou}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label">Component <span className="form-required">*</span></label>
                                    <select name="component" value={formData.component} onChange={handleInputChange} className={`${commonInputClasses} ${missingFields.includes('component') ? 'form-control--invalid' : ''}`}>
                                        {otherActivityComponents.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="form-label">Activity Type <span className="form-required">*</span></label>
                                    <select value={selectedActivityType} onChange={handleActivityTypeChange} className={`${commonInputClasses} ${missingFields.includes('type') ? 'form-control--invalid' : ''}`}>
                                        <option value="">Select Activity</option>
                                        {activityOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                </div>
                                {formData.type === 'Activity' && (
                                    <div className="form-field--full">
                                        <label className="form-label" htmlFor="activity-title">Activity Title (optional)</label>
                                        <input id="activity-title" type="text" name="activity_title" value={formData.activity_title ?? ''} onChange={handleInputChange} className={commonInputClasses} />
                                    </div>
                                )}
                                {formData.type === 'Training' && (
                                    <div className="form-field--full">
                                        <label className="form-label">Specific Title <span className="form-required">*</span></label>
                                        <input type="text" name="name" value={formData.name} onChange={handleInputChange} className={`${commonInputClasses} ${missingFields.includes('name') ? 'form-control--invalid' : ''}`} required />
                                    </div>
                                )}
                                
                                {(mode === 'create' || mode === 'details') && (
                                    <div>
                                        <label className="form-label">Conduct Type</label>
                                        <select value={conductType} onChange={handleConductTypeChange} className={commonInputClasses} disabled={isDetailsLocked}>
                                            <option value="Single">Single Day</option>
                                            <option value="Multi-day">Multi-Day</option>
                                            {mode === 'create' && <option value="Repeating">Repeating Entries</option>}
                                        </select>
                                    </div>
                                )}

                                {conductType !== 'Repeating' && (
                                    <>
                                        <div>
                                            <label className="form-label">Start Date <span className="form-required">*</span></label>
                                            <input type="date" name="date" value={formData.date} onChange={handleInputChange} required className={`${commonInputClasses} ${missingFields.includes('date') ? 'form-control--invalid' : ''}`} />
                                        </div>
                                        {conductType === 'Multi-day' && (
                                            <div>
                                                <label className="form-label">End Date <span className="form-required">*</span></label>
                                                <input type="date" name="endDate" value={formData.endDate} onChange={handleInputChange} required className={`${commonInputClasses} ${missingFields.includes('endDate') ? 'form-control--invalid' : ''}`} />
                                            </div>
                                        )}
                                    </>
                                )}

                                <div className="md:col-span-2">
                                    <label className="form-label">Location <span className="form-required">*</span></label>
                                    <div className={missingFields.includes('location') ? 'form-control-wrap form-control--invalid' : ''}>
                                        <LocationPicker value={formData.location} onChange={(val) => {
                                            setFormData(prev => ({...prev, location: val}));
                                            if (missingFields.includes('location')) {
                                                setMissingFields(prev => prev.filter(f => f !== 'location'));
                                            }
                                        }} />
                                    </div>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="form-label">Description</label>
                                    <textarea name="description" value={formData.description} onChange={handleInputChange} className={commonInputClasses} rows={3} />
                                </div>
                            </div>
                        </fieldset>
                        
                        {/* Participants Section */}
                        {conductType !== 'Repeating' && (
                            <>
                                <fieldset className="form-fieldset" disabled={isDetailsLocked}>
                                    <legend className="form-legend">Participants</legend>
                                    <div className="form-grid">
                                        <div><label className="form-label">Male</label><input type="number" name="participantsMale" value={formData.participantsMale} onChange={handleNumericChange} className={commonInputClasses} /></div>
                                        <div><label className="form-label">Female</label><input type="number" name="participantsFemale" value={formData.participantsFemale} onChange={handleNumericChange} className={commonInputClasses} /></div>
                                        
                                        <div className="form-field--full">
                                            <ActivityIpoSelector ipos={ipos} links={formData} region={ipoRegionFilter} onRegionChange={setIpoRegionFilter}
                                                disabled={isSaving} onChange={links => setFormData(previous => ({ ...previous, ...links }))} />
                                        </div>
                                    </div>
                                </fieldset>

                                <fieldset className="form-fieldset" disabled={isDetailsLocked || originalBudgetLocked}>
                                    <legend className="form-legend">Funding</legend>
                                    <div className="form-grid form-grid--compact">
                                        <div><label className="form-label">Fund Year</label><input type="number" name="fundingYear" value={formData.fundingYear} onChange={handleNumericChange} className={commonInputClasses} /></div>
                                        <div><label className="form-label">Fund Type</label><select name="fundType" value={formData.fundType} onChange={handleInputChange} className={commonInputClasses}>{fundTypes.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                                        <div>
                                            <label className="form-label">Tier</label>
                                            <select name="tier" value={formData.tier} onChange={handleInputChange} className={commonInputClasses}>
                                                <option value="">Select Tier</option>
                                                {tiers.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </div>
                                        <FundSourceField
                                            uid={formData.fundSourceUid}
                                            label={formData.fundSource}
                                            references={fundSources}
                                            required={mode === 'create'}
                                            disabled={isDetailsLocked}
                                            onChange={(fundSourceUid, fundSource) => setFormData(previous => ({ ...previous, fundSourceUid, fundSource }))}
                                        />
                                    </div>
                                </fieldset>
                            </>
                        )}
                        
                        {/* Repeating Entry Form (Create Only) */}
                        {mode === 'create' && conductType === 'Repeating' && (
                             <fieldset className="form-fieldset form-fieldset--highlight">
                                <legend className="form-legend">Repeating Schedule</legend>
                                <div className="form-subsection form-grid form-grid--compact">
                                    <div className="form-field--full form-check-group">
                                        <input type="checkbox" name="isMultiDay" checked={currentRepeatingEntry.isMultiDay} onChange={handleRepeatingEntryChange} className="form-checkbox" />
                                        <label className="form-label form-label--inline">Is Multi-day?</label>
                                    </div>
                                    <div><label className="form-label form-label--compact">Start Date</label><input type="date" name="date" value={currentRepeatingEntry.date} onChange={handleRepeatingEntryChange} className={commonInputClasses} /></div>
                                    {currentRepeatingEntry.isMultiDay && <div><label className="form-label form-label--compact">End Date</label><input type="date" name="endDate" value={currentRepeatingEntry.endDate} onChange={handleRepeatingEntryChange} className={commonInputClasses} /></div>}
                                    <div><label className="form-label form-label--compact">Male</label><input type="number" name="participantsMale" value={currentRepeatingEntry.participantsMale} onChange={handleRepeatingEntryChange} className={commonInputClasses} /></div>
                                    <div><label className="form-label form-label--compact">Female</label><input type="number" name="participantsFemale" value={currentRepeatingEntry.participantsFemale} onChange={handleRepeatingEntryChange} className={commonInputClasses} /></div>
                                    
                                    <div className="form-field--full">
                                        <ActivityIpoSelector key={currentRepeatingEntry.id} ipos={ipos} links={currentRepeatingEntry} region={ipoRegionFilter}
                                            onRegionChange={setIpoRegionFilter} disabled={isSaving}
                                            onChange={links => setCurrentRepeatingEntry(previous => ({ ...previous, ...links }))} />
                                    </div>
                                    <div className="form-field--full"><button type="button" onClick={handleAddRepeatingEntry} className="btn btn-primary btn-block">Add to Schedule</button></div>
                                </div>
                                {/* List of entries to be created */}
                                <div className="form-repeat-list">
                                    {repeatingEntries.map((entry, idx) => (
                                        <div key={idx} className="form-repeat-card">
                                            <span>{entry.date} {entry.endDate ? `to ${entry.endDate}` : ''} | M:{entry.participantsMale} F:{entry.participantsFemale}</span>
                                            <span>{entry.participatingIpos.length} IPOs</span>
                                        </div>
                                    ))}
                                </div>
                             </fieldset>
                        )}
                    </div>
                )}

                {/* EXPENSES MODE (and Create Tab) */}
                {((mode === 'create' && activeTab === 'expenses') || mode === 'expenses') && (
                     <fieldset className="form-fieldset" disabled={isDetailsLocked}>
                        <legend className="form-legend">Expenses</legend>
                        <ActivityBudgetEditor items={formData.expenses.filter(row => !isSupplementalExpense(row,formData))} parent={formData} uacsCodes={uacsCodes}
                            showAdjustmentTags={false} disabled={isDetailsLocked || isSaving || originalBudgetLocked} onApply={handleApplyExpenses} onRemove={handleRemoveExpense}
                            onDraftChange={setBudgetDraftPending} />
                        <div className="budget-adjustment-summary">
                            <div className="budget-adjustment-summary__header">
                                <h4>Expense Calculator</h4>
                            </div>
                            <div className="budget-adjustment-summary__grid">
                                <div><span>Allocation</span><strong>{supplementalBudgetSummary.original === null ? '-' : formatCurrency(supplementalBudgetSummary.original)}</strong></div>
                                <div><span>Active Target</span><strong>{formatCurrency(supplementalBudgetSummary.target)}</strong></div>
                                <div><span>Cancelled</span><strong>{formatCurrency(budgetAdjustmentSummary.cancelledAmount)}</strong></div>
                                <div><span>Realignment Supplements</span><strong>{formatCurrency(supplementalBudgetSummary.realignment)}</strong></div>
                                <div><span>Supplemental Budget</span><strong>{formatCurrency(supplementalBudgetSummary.supplemental)}</strong></div>
                                <div><span>Unobligated Balance</span><strong>{formatCurrency(supplementalBudgetSummary.unobligated)}</strong></div>
                                <div><span>Actual Obligated</span><strong>{formatCurrency(supplementalBudgetSummary.obligated)}</strong></div>
                                <div><span>Actual Disbursed</span><strong>{formatCurrency(supplementalBudgetSummary.disbursed)}</strong></div>
                            </div>
                        </div>
                     </fieldset>
                )}

                {/* ACCOMPLISHMENT MODE */}
                {mode === 'accomplishment' && (
                     <div className="space-y-6">
                        <fieldset className="form-fieldset">
                            <legend className="form-legend">Actual Conduct</legend>
                            <div className="form-grid">
                                <div>
                                    <label className="form-label">Actual Start Date</label>
                                    <input
                                        type="date"
                                        name="actualDate"
                                        value={formData.actualDate || ''}
                                        onChange={(event) => { void handleActualConductDateChange('actualDate', event.currentTarget.value); }}
                                        className={commonInputClasses}
                                    />
                                </div>
                                {conductType === 'Multi-day' && (
                                    <div>
                                        <label className="form-label">Actual End Date</label>
                                        <input
                                            type="date"
                                            name="actualEndDate"
                                            value={formData.actualEndDate || ''}
                                            onChange={(event) => { void handleActualConductDateChange('actualEndDate', event.currentTarget.value); }}
                                            className={commonInputClasses}
                                        />
                                    </div>
                                )}
                                <div><label className="form-label">Actual Male</label><input type="number" name="actualParticipantsMale" value={formData.actualParticipantsMale} onChange={handleNumericChange} className={commonInputClasses} /></div>
                                <div><label className="form-label">Actual Female</label><input type="number" name="actualParticipantsFemale" value={formData.actualParticipantsFemale} onChange={handleNumericChange} className={commonInputClasses} /></div>
                            </div>
                        </fieldset>
                         
                        <fieldset className="form-fieldset">
                            <legend className="form-legend">Budget Utilization</legend>
                            {formData.expenses.filter(isActivityExpenseActualEligible).map((exp) => (
                                <div key={exp.id} className="budget-utilization-item">
                                    <p className="budget-utilization-title">
                                        {exp.expenseParticular} ({exp.uacsCode})
                                        {getUacsDescription(exp.objectType, exp.expenseParticular, exp.uacsCode) && (
                                            <span className="detail-list-copy block">{getUacsDescription(exp.objectType, exp.expenseParticular, exp.uacsCode)}</span>
                                        )}
                                    </p>
                                    <div className="budget-utilization-grid">
                                        {/* Actual Obligation Group */}
                                        <div className="budget-editor-panel budget-editor-panel--obligation">
                                            <p className="budget-editor-panel__title">Obligations</p>
                                            <ObligationsEditor
                                                obligations={exp.obligations || []}
                                                onChange={(newObs, total) => {
                                                    handleExpenseAccomplishmentChange(exp.id, 'obligations', newObs);
                                                    handleExpenseAccomplishmentChange(exp.id, 'actualObligationAmount', total);
                                                }}
                                                defaultYear={formData.fundingYear}
                                                validateMonthChange={validateActivityActualMonth}
                                            />
                                        </div>

                                        {/* Actual Disbursement Group */}
                                        <div className="budget-editor-panel budget-editor-panel--disbursement">
                                            <p className="budget-editor-panel__title">Disbursement</p>
                                            <DisbursementsEditor
                                                disbursements={exp.disbursements || []}
                                                onChange={(newDisb, total) => {
                                                    handleExpenseAccomplishmentChange(exp.id, 'disbursements', newDisb);
                                                    handleExpenseAccomplishmentChange(exp.id, 'actualDisbursementAmount', total);
                                                }}
                                                defaultYear={formData.fundingYear}
                                                validateMonthChange={validateActivityActualMonth}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </fieldset>

                        {/* Gender and Inclusivity Section */}
                        <fieldset className="form-fieldset">
                            <legend className="form-legend">Gender and Inclusivity</legend>
                            <div className="form-grid form-grid--compact">
                                <div><label className="form-label">PWD</label><input type="number" name="actualPWD" value={formData.actualPWD || ''} onChange={handleNumericChange} className={commonInputClasses} placeholder="0" /></div>
                                <div><label className="form-label">Muslim</label><input type="number" name="actualMuslim" value={formData.actualMuslim || ''} onChange={handleNumericChange} className={commonInputClasses} placeholder="0" /></div>
                                <div><label className="form-label">LGBTQ+</label><input type="number" name="actualLGBTQ" value={formData.actualLGBTQ || ''} onChange={handleNumericChange} className={commonInputClasses} placeholder="0" /></div>
                                <div><label className="form-label">Solo Parents</label><input type="number" name="actualSoloParent" value={formData.actualSoloParent || ''} onChange={handleNumericChange} className={commonInputClasses} placeholder="0" /></div>
                                <div><label className="form-label">Senior</label><input type="number" name="actualSenior" value={formData.actualSenior || ''} onChange={handleNumericChange} className={commonInputClasses} placeholder="0" /></div>
                                <div><label className="form-label">Youth</label><input type="number" name="actualYouth" value={formData.actualYouth || ''} onChange={handleNumericChange} className={commonInputClasses} placeholder="0" /></div>
                            </div>
                        </fieldset>
                     </div>
                )}

                <div className="form-footer">
                    <button type="button" onClick={leaveForm} className="btn btn-secondary" disabled={isSaving || actualsLoading}>
                        Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={isSaving || actualsLoading}>
                        {isSaving ? 'Saving...' : mode === 'create' ? 'Create Activity' : 'Save Changes'}
                    </button>
                </div>
                </fieldset>
            </form>
        </div>
    );
};

export default ActivityEdit;
