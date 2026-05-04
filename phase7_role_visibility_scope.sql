-- Phase 7 Migration: Role-Level Visibility Scope
-- Author: 4K

-- Add visibility_scope column to roles_config table
ALTER TABLE public.roles_config 
ADD COLUMN IF NOT EXISTS visibility_scope VARCHAR(50) DEFAULT 'Own OU';

-- Update existing data to have sensible defaults
-- Super Admin, Administrator, and Management should usually see all OUs by default
UPDATE public.roles_config 
SET visibility_scope = 'All OUs' 
WHERE role IN ('Super Admin', 'Administrator', 'Management');

-- Others default to 'Own OU'
UPDATE public.roles_config 
SET visibility_scope = 'Own OU' 
WHERE visibility_scope IS NULL;

-- Log the change
INSERT INTO public.system_logs (event, details, user_id)
VALUES ('DB_MIGRATION', 'Added visibility_scope to roles_config table', 'SYSTEM');
