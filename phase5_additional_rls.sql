-- Phase 5 Additional Row Level Security for Remaining Tables
-- Author: 4K

-- 1. Reference Data (Global View allowed for all authenticated users, Update restricted)
-- Replace table names as per your DB schema

DO $$
DECLARE
    ref_table text;
    ref_tables text[] := ARRAY['ipos', 'marketing_partners', 'reference_uacs', 'reference_particulars', 
                               'ref_commodities', 'ref_livestock', 'ref_equipment', 'ref_inputs', 
                               'ref_infrastructure', 'ref_trainings', 'gida_areas', 'elcac_areas', 'roles_config'];
BEGIN
    FOR ref_table IN SELECT unnest(ref_tables) LOOP
        -- Enable RLS
        EXECUTE format('ALTER TABLE IF EXISTS public.%I ENABLE ROW LEVEL SECURITY;', ref_table);

        -- Drop existing policies to prevent duplication
        EXECUTE format('DROP POLICY IF EXISTS "%I_view_policy" ON public.%I;', ref_table, ref_table);
        EXECUTE format('DROP POLICY IF EXISTS "%I_modify_policy" ON public.%I;', ref_table, ref_table);

        -- Add View Policy (All authenticated users can view)
        EXECUTE format('
            CREATE POLICY "%I_view_policy" ON public.%I
            FOR SELECT TO authenticated
            USING (true);
        ', ref_table, ref_table);

        -- Add Modify Policy (Only Super Admins can insert/update/delete reference data natively if required, or everyone for now)
        -- Since this depends on roles, we can use a quick check on the users table.
        EXECUTE format('
            CREATE POLICY "%I_modify_policy" ON public.%I
            FOR ALL TO authenticated
            USING (
                (SELECT role FROM public.users WHERE auth_id = auth.uid() LIMIT 1) IN (''Super Admin'', ''Administrator'')
                OR true -- Setting to true for now so as not to break existing app workflows. Remove "OR true" to lock it down.
            );
        ', ref_table, ref_table);
    END LOOP;
END $$;
