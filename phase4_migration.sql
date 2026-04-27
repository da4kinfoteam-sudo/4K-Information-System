-- Phase 4 Migration: User Control Center (Role-Level UX)
-- Author: 4K

CREATE TABLE IF NOT EXISTS public.roles_config (
    id SERIAL PRIMARY KEY,
    role VARCHAR(50) NOT NULL,
    module VARCHAR(100) NOT NULL,
    can_view BOOLEAN DEFAULT true,
    can_edit BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(role, module)
);

ALTER TABLE public.roles_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY roles_config_view_policy ON public.roles_config
FOR SELECT TO authenticated
USING (true);

CREATE POLICY roles_config_all_policy ON public.roles_config
FOR ALL TO authenticated
USING (
    (SELECT role FROM public.users WHERE auth_id = auth.uid() LIMIT 1) = 'Super Admin'
);

-- Note: In Phase 5 we will add user-level overrides table.
