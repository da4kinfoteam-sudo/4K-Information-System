-- Phase 2 Migration: Approval Workflow Engine
-- Author: 4K 

-- Add workflow_status to key data tables
ALTER TABLE subprojects ADD COLUMN IF NOT EXISTS workflow_status TEXT DEFAULT 'APPROVED' CHECK (workflow_status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED'));
ALTER TABLE ipos ADD COLUMN IF NOT EXISTS workflow_status TEXT DEFAULT 'APPROVED' CHECK (workflow_status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED'));
ALTER TABLE activities ADD COLUMN IF NOT EXISTS workflow_status TEXT DEFAULT 'APPROVED' CHECK (workflow_status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED'));
ALTER TABLE marketing_partners ADD COLUMN IF NOT EXISTS workflow_status TEXT DEFAULT 'APPROVED' CHECK (workflow_status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED'));
ALTER TABLE office_requirements ADD COLUMN IF NOT EXISTS workflow_status TEXT DEFAULT 'APPROVED' CHECK (workflow_status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED'));
ALTER TABLE staffing_requirements ADD COLUMN IF NOT EXISTS workflow_status TEXT DEFAULT 'APPROVED' CHECK (workflow_status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED'));
ALTER TABLE other_program_expenses ADD COLUMN IF NOT EXISTS workflow_status TEXT DEFAULT 'APPROVED' CHECK (workflow_status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED'));

-- Note: Existing records default to 'APPROVED' to avoid breaking current system visibility.
-- New records from 'RFO - User' will be 'PENDING' via application logic.

-- --- End of phase2_migration.sql ---
