-- Phase 6: User Permissions & Bugfixes
-- Fixes missing DELETE RLS policies and adds approver logic columns to users table

-- 1. Add approver columns to public.users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS requires_approver BOOLEAN DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS approver_id BIGINT REFERENCES public.users(id);

-- 2. Add missing DELETE policies for tables with RLS enabled

-- Subprojects
DROP POLICY IF EXISTS subprojects_delete_policy ON public.subprojects;
CREATE POLICY subprojects_delete_policy ON public.subprojects
FOR DELETE TO authenticated
USING (
    (SELECT visibility_scope FROM public.users WHERE auth_id = auth.uid() LIMIT 1) = 'All OUs'
    OR "operatingUnit" = (SELECT "operatingUnit" FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
);

-- Activities
DROP POLICY IF EXISTS activities_delete_policy ON public.activities;
CREATE POLICY activities_delete_policy ON public.activities
FOR DELETE TO authenticated
USING (
    (SELECT visibility_scope FROM public.users WHERE auth_id = auth.uid() LIMIT 1) = 'All OUs'
    OR "operatingUnit" = (SELECT "operatingUnit" FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
);

-- Office Requirements
DROP POLICY IF EXISTS office_requirements_delete_policy ON public.office_requirements;
CREATE POLICY office_requirements_delete_policy ON public.office_requirements
FOR DELETE TO authenticated
USING (
    (SELECT visibility_scope FROM public.users WHERE auth_id = auth.uid() LIMIT 1) = 'All OUs'
    OR "operatingUnit" = (SELECT "operatingUnit" FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
);

-- Staffing Requirements
DROP POLICY IF EXISTS staffing_requirements_delete_policy ON public.staffing_requirements;
CREATE POLICY staffing_requirements_delete_policy ON public.staffing_requirements
FOR DELETE TO authenticated
USING (
    (SELECT visibility_scope FROM public.users WHERE auth_id = auth.uid() LIMIT 1) = 'All OUs'
    OR "operatingUnit" = (SELECT "operatingUnit" FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
);

-- Other Program Expenses
DROP POLICY IF EXISTS other_expenses_delete_policy ON public.other_program_expenses;
CREATE POLICY other_expenses_delete_policy ON public.other_program_expenses
FOR DELETE TO authenticated
USING (
    (SELECT visibility_scope FROM public.users WHERE auth_id = auth.uid() LIMIT 1) = 'All OUs'
    OR "operatingUnit" = (SELECT "operatingUnit" FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
);
