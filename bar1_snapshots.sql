-- SQL for Phase 1: Creation of the table to store historical BAR 1 reports

CREATE TABLE IF NOT EXISTS bar1_report_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operating_unit TEXT NOT NULL,
    fund_year INTEGER NOT NULL,
    fund_type TEXT NOT NULL,
    tier TEXT NOT NULL,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    report_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraint to ensure we only have one snapshot per filter set per day
    UNIQUE(operating_unit, fund_year, fund_type, tier, snapshot_date)
);

-- Indexing for faster retrieval by filters and date
CREATE INDEX IF NOT EXISTS idx_bar1_snapshots_ou ON bar1_report_snapshots(operating_unit);
CREATE INDEX IF NOT EXISTS idx_bar1_snapshots_year ON bar1_report_snapshots(fund_year);
CREATE INDEX IF NOT EXISTS idx_bar1_snapshots_date ON bar1_report_snapshots(snapshot_date);

COMMENT ON TABLE bar1_report_snapshots IS 'Stores daily snapshots of the BAR 1 report for historical review.';
