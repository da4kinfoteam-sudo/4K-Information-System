-- NUCLEAR RLS OVERRIDE: DISABLE RLS FOR FINANCIAL TABLES
-- This script completely disables RLS for the tables causing issues.
-- Run this in the Supabase SQL Editor if policies are still denying access.

-- 1. Disable RLS for centralized tables
ALTER TABLE IF EXISTS public.financial_obligations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.financial_disbursements DISABLE ROW LEVEL SECURITY;

-- 2. Drop any existing policies to be clean
DROP POLICY IF EXISTS financial_obligations_permissive_policy ON public.financial_obligations;
DROP POLICY IF EXISTS financial_disbursements_permissive_policy ON public.financial_disbursements;
DROP POLICY IF EXISTS obligations_all_policy ON public.financial_obligations;
DROP POLICY IF EXISTS obligations_select_policy ON public.financial_obligations;
DROP POLICY IF EXISTS disbursements_all_policy ON public.financial_disbursements;
DROP POLICY IF EXISTS disbursements_select_policy ON public.financial_disbursements;

-- 3. Grant full permissions to all roles just in case
GRANT ALL ON TABLE public.financial_obligations TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.financial_disbursements TO authenticated, anon, service_role;

-- 4. Ensure sequences are accessible
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon, service_role;

-- 5. Log the fix
INSERT INTO public.user_logs (description, username, operating_unit, created_at)
VALUES ('DB_FIX: NUCLEAR RLS DISABLE for financial_obligations and disbursements', 'SYSTEM', 'NPMO', NOW());
