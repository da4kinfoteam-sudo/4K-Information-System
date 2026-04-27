-- Author: 4K 
CREATE TABLE IF NOT EXISTS user_roles_config (
    role_name TEXT PRIMARY KEY,
    permissions_default JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO user_roles_config (role_name)
VALUES 
    ('Super Admin'),
    ('Administrator'),
    ('Focal - User'),
    ('RFO - User'),
    ('User'),
    ('Guest')
ON CONFLICT (role_name) DO NOTHING;

ALTER TABLE users ADD COLUMN IF NOT EXISTS visibility_scope TEXT DEFAULT 'All OUs';
ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_focal_id BIGINT REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions_override JSONB DEFAULT '{}'::jsonb;

ALTER TABLE user_logs ADD COLUMN IF NOT EXISTS user_role TEXT;
ALTER TABLE user_logs ADD COLUMN IF NOT EXISTS action_metadata JSONB DEFAULT '{}'::jsonb;
-- --- End of phase1_migration.sql ---
