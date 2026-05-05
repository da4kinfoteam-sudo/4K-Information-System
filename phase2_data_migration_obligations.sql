-- Phase 2 Part 2: Data Migration for Multiple Obligations
-- Author: 4K

-- 1. Migrate Subproject Details Obligations
INSERT INTO public.financial_obligations (entity_type, parent_id, item_id, amount, obligation_date, remarks)
SELECT 
    'subproject_detail' as entity_type,
    s.id as parent_id,
    (detail->>'id')::TEXT as item_id,
    (detail->>'actualObligationAmount')::NUMERIC as amount,
    COALESCE(
        NULLIF(detail->>'actualObligationDate', '')::DATE,
        NULLIF(detail->>'actualDeliveryDate', '')::DATE,
        NOW()::DATE
    ) as obligation_date,
    'Migrated from legacy single-entry field' as remarks
FROM public.subprojects s,
     jsonb_array_elements(s.details) as detail
WHERE detail->>'actualObligationAmount' IS NOT NULL 
  AND (detail->>'actualObligationAmount')::NUMERIC > 0;

-- 2. Migrate Activity Expenses Obligations
INSERT INTO public.financial_obligations (entity_type, parent_id, item_id, amount, obligation_date, remarks)
SELECT 
    'activity_expense' as entity_type,
    a.id as parent_id,
    (expense->>'id')::TEXT as item_id,
    (expense->>'actualObligationAmount')::NUMERIC as amount,
    COALESCE(
        NULLIF(expense->>'actualObligationDate', '')::DATE,
        a."actualDate"::DATE,
        NOW()::DATE
    ) as obligation_date,
    'Migrated from legacy single-entry field' as remarks
FROM public.activities a,
     jsonb_array_elements(a.expenses) as expense
WHERE expense->>'actualObligationAmount' IS NOT NULL 
  AND (expense->>'actualObligationAmount')::NUMERIC > 0;

-- 3. Migrate Office Requirements Obligations
INSERT INTO public.financial_obligations (entity_type, parent_id, amount, obligation_date, remarks)
SELECT 
    'office_requirement' as entity_type,
    id as parent_id,
    "actualObligationAmount" as amount,
    COALESCE(NULLIF("actualObligationDate", '')::DATE, NOW()::DATE) as obligation_date,
    'Migrated from legacy single-entry field' as remarks
FROM public.office_requirements
WHERE "actualObligationAmount" > 0;

-- 4. Migrate Staffing Requirements Obligations (Header level if exists, though usually it's in expenses)
INSERT INTO public.financial_obligations (entity_type, parent_id, amount, obligation_date, remarks)
SELECT 
    'staffing_requirement' as entity_type,
    id as parent_id,
    "actualObligationAmount" as amount,
    COALESCE(NULLIF("actualObligationDate", '')::DATE, NOW()::DATE) as obligation_date,
    'Migrated from legacy single-entry field' as remarks
FROM public.staffing_requirements
WHERE "actualObligationAmount" > 0;

-- 5. Migrate Staffing Expenses Obligations
INSERT INTO public.financial_obligations (entity_type, parent_id, item_id, amount, obligation_date, remarks)
SELECT 
    'staffing_expense' as entity_type,
    sr.id as parent_id,
    (expense->>'id')::TEXT as item_id,
    (expense->>'actualObligationAmount')::NUMERIC as amount,
    COALESCE(
        NULLIF(expense->>'actualObligationDate', '')::DATE,
        NOW()::DATE
    ) as obligation_date,
    'Migrated from legacy single-entry field (nested expense)' as remarks
FROM public.staffing_requirements sr,
     jsonb_array_elements(sr.expenses) as expense
WHERE expense->>'actualObligationAmount' IS NOT NULL 
  AND (expense->>'actualObligationAmount')::NUMERIC > 0;

-- 6. Migrate Other Program Expenses Obligations
INSERT INTO public.financial_obligations (entity_type, parent_id, amount, obligation_date, remarks)
SELECT 
    'other_program_expense' as entity_type,
    id as parent_id,
    "actualObligationAmount" as amount,
    COALESCE(NULLIF("actualObligationDate", '')::DATE, NOW()::DATE) as obligation_date,
    'Migrated from legacy single-entry field' as remarks
FROM public.other_program_expenses
WHERE "actualObligationAmount" > 0;

-- Log the migration completion
INSERT INTO public.user_logs (description, username, operating_unit, created_at)
VALUES ('DB_MIGRATION: Completed data migration for multiple obligation dates', 'SYSTEM', 'NPMO', NOW());

-- --- End of phase2_data_migration_obligations.sql ---
