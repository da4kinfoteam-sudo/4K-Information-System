-- Phase 9 Migration: Multiple Disbursements Feature
-- Author: 4K

-- Create a centralized table for financial disbursements
CREATE TABLE IF NOT EXISTS public.financial_disbursements (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    entity_type TEXT NOT NULL, 
    -- Types: 'subproject_detail', 'activity_expense', 'staffing_expense', 'office_requirement', 'other_program_expense'
    parent_id BIGINT NOT NULL,
    item_id TEXT, -- The internal ID of the detail/expense item within its parent array (if applicable)
    disbursement_date DATE NOT NULL,
    amount NUMERIC NOT NULL DEFAULT 0,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for optimized lookups during report generation and dashboard queries
CREATE INDEX IF NOT EXISTS idx_disbursements_parent_lookup ON public.financial_disbursements (entity_type, parent_id, item_id);

-- Enable Row Level Security
ALTER TABLE public.financial_disbursements ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read 
CREATE POLICY disbursements_select_policy ON public.financial_disbursements
    FOR SELECT USING (auth.role() = 'authenticated');

-- Allow authenticated users to perform writes
CREATE POLICY disbursements_all_policy ON public.financial_disbursements
    FOR ALL USING (auth.role() = 'authenticated');

-- Ensure updated_at is handled
CREATE TRIGGER update_financial_disbursements_updated_at
BEFORE UPDATE ON public.financial_disbursements
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();

-- Log the migration
INSERT INTO public.user_logs (description, username, operating_unit, created_at)
VALUES ('DB_MIGRATION: Created financial_disbursements table for multiple disbursement dates feature', 'SYSTEM', 'NPMO', NOW());

-- Data Migration for Activities and Subprojects only

-- 1. Migrate Subproject Details Disbursements
INSERT INTO public.financial_disbursements (entity_type, parent_id, item_id, amount, disbursement_date, remarks)
SELECT 
    'subproject_detail' as entity_type,
    s.id as parent_id,
    (detail->>'id')::TEXT as item_id,
    (detail->>'actualDisbursementAmount')::NUMERIC as amount,
    COALESCE(
        NULLIF(detail->>'actualDisbursementDate', '')::DATE,
        NOW()::DATE
    ) as disbursement_date,
    'Migrated from legacy single-entry field' as remarks
FROM public.subprojects s,
     jsonb_array_elements(s.details) as detail
WHERE detail->>'actualDisbursementAmount' IS NOT NULL 
  AND (detail->>'actualDisbursementAmount')::NUMERIC > 0;

-- 2. Migrate Activity Expenses Disbursements
INSERT INTO public.financial_disbursements (entity_type, parent_id, item_id, amount, disbursement_date, remarks)
SELECT 
    'activity_expense' as entity_type,
    a.id as parent_id,
    (expense->>'id')::TEXT as item_id,
    (expense->>'actualDisbursementAmount')::NUMERIC as amount,
    COALESCE(
        NULLIF(expense->>'actualDisbursementDate', '')::DATE,
        NOW()::DATE
    ) as disbursement_date,
    'Migrated from legacy single-entry field' as remarks
FROM public.activities a,
     jsonb_array_elements(a.expenses) as expense
WHERE expense->>'actualDisbursementAmount' IS NOT NULL 
  AND (expense->>'actualDisbursementAmount')::NUMERIC > 0;

-- Log the migration completion
INSERT INTO public.user_logs (description, username, operating_unit, created_at)
VALUES ('DB_MIGRATION: Completed data migration for multiple disbursement dates', 'SYSTEM', 'NPMO', NOW());

-- --- End of phase9_multiple_disbursements.sql ---
