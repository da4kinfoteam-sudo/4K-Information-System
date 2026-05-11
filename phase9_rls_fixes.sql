-- Fix RLS for centralized financial tables
-- Ensure they have both USING and WITH CHECK policies

-- First, drop existing policies to avoid conflicts
DROP POLICY IF EXISTS obligations_all_policy ON public.financial_obligations;
DROP POLICY IF EXISTS disbursements_all_policy ON public.financial_disbursements;

-- Enable RLS (just in case)
ALTER TABLE public.financial_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_disbursements ENABLE ROW LEVEL SECURITY;

-- Re-create policies with explicit WITH CHECK
CREATE POLICY obligations_all_policy ON public.financial_obligations
    FOR ALL 
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY disbursements_all_policy ON public.financial_disbursements
    FOR ALL 
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- Also, let's ensure the tables have the right permissions for the authenticated role
GRANT ALL ON public.financial_obligations TO authenticated;
GRANT ALL ON public.financial_disbursements TO authenticated;
GRANT ALL ON public.financial_obligations TO service_role;
GRANT ALL ON public.financial_disbursements TO service_role;
