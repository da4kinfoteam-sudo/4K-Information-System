-- COMPREHENSIVE RLS FIX FOR FINANCIAL TABLES
-- Run this in the Supabase SQL Editor

-- 1. Reset financial_obligations policies
DROP POLICY IF EXISTS obligations_all_policy ON public.financial_obligations;
DROP POLICY IF EXISTS obligations_select_policy ON public.financial_obligations;

ALTER TABLE public.financial_obligations ENABLE ROW LEVEL SECURITY;

CREATE POLICY financial_obligations_permissive_policy ON public.financial_obligations
    FOR ALL 
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 2. Reset financial_disbursements policies
DROP POLICY IF EXISTS disbursements_all_policy ON public.financial_disbursements;
DROP POLICY IF EXISTS disbursements_select_policy ON public.financial_disbursements;

ALTER TABLE public.financial_disbursements ENABLE ROW LEVEL SECURITY;

CREATE POLICY financial_disbursements_permissive_policy ON public.financial_disbursements
    FOR ALL 
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 3. Verify column types for item_id (should be TEXT to handle various source row IDs)
-- Already handled in creation but ensuring consistency.

-- 4. Log the manual fix
INSERT INTO public.user_logs (description, username, operating_unit, created_at)
VALUES ('DB_FIX: Applied comprehensive RLS override for financial_obligations and disbursements', 'SYSTEM', 'NPMO', NOW());
