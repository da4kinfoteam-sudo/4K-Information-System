-- Phase 8 Migration: Multiple Obligations Feature
-- Author: 4K

-- Create a centralized table for financial obligations
CREATE TABLE IF NOT EXISTS public.financial_obligations (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    entity_type TEXT NOT NULL, 
    -- Types: 'subproject_detail', 'activity_expense', 'staffing_expense', 'office_requirement', 'other_program_expense'
    parent_id BIGINT NOT NULL,
    item_id TEXT, -- The internal ID of the detail/expense item within its parent array (if applicable)
    obligation_date DATE NOT NULL,
    amount NUMERIC NOT NULL DEFAULT 0,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for optimized lookups during report generation and dashboard queries
CREATE INDEX IF NOT EXISTS idx_obligations_parent_lookup ON public.financial_obligations (entity_type, parent_id, item_id);

-- Enable Row Level Security
ALTER TABLE public.financial_obligations ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read (visibility is handled in frontend for now, or can be refined later)
CREATE POLICY obligations_select_policy ON public.financial_obligations
    FOR SELECT USING (auth.role() = 'authenticated');

-- Allow authenticated users to perform writes (insert, update, delete)
CREATE POLICY obligations_all_policy ON public.financial_obligations
    FOR ALL USING (auth.role() = 'authenticated');

-- Ensure updated_at is handled
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_financial_obligations_updated_at
BEFORE UPDATE ON public.financial_obligations
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();

-- Log the migration
INSERT INTO public.user_logs (description, username, operating_unit, created_at)
VALUES ('DB_MIGRATION: Created financial_obligations table for multiple obligation dates feature', 'SYSTEM', 'NPMO', NOW());

-- --- End of phase8_multiple_obligations.sql ---
