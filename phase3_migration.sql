-- Phase 3 Migration: Supabase Authentication & Row Level Security (RLS)
-- Author: 4K 

-- =====================================================================================
-- STEP 1: Enable pgcrypto for password hashing
-- =====================================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================================
-- STEP 2: Link public.users to auth.users
-- =====================================================================================
-- Add auth_id reference to track the Supabase auth user if it doesn't exist
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_id UUID REFERENCES auth.users(id);
-- Optionally map the identifier into uniqueness
-- ADD UNIQUE CONSTRAINT on email if you don't already have one
-- ALTER TABLE public.users ADD CONSTRAINT users_email_unique UNIQUE (email);

-- =====================================================================================
-- STEP 3: Function to seamlessly migrate plaintext users to auth.users
-- =====================================================================================
-- Warning: This will hash their current plaintext passwords into Supabase Auth.
DO $$
DECLARE
    row public.users%rowtype;
    new_auth_id UUID;
BEGIN
    FOR row IN SELECT * FROM public.users WHERE auth_id IS NULL AND email IS NOT NULL AND password IS NOT NULL LOOP
        -- Generate a realistic uuid
        new_auth_id := gen_random_uuid();
        
        -- Insert into auth.users (simulate Supabase creation)
        IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = row.email) THEN
            INSERT INTO auth.users (
                instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, 
                recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, 
                created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
            ) VALUES (
                '00000000-0000-0000-0000-000000000000', new_auth_id, 'authenticated', 'authenticated', row.email, 
                crypt(row.password, gen_salt('bf')), -- secure blowfish hash
                now(), NULL, NULL, 
                '{"provider": "email", "providers": ["email"]}', 
                '{}', 
                now(), now(), '', '', '', ''
            );
        ELSE
            -- Grab the existing auth_id if the user already exists in auth.users by email
            new_auth_id := (SELECT id FROM auth.users WHERE email = row.email LIMIT 1);
        END IF;

        -- Update the core users table to map to auth provider
        UPDATE public.users 
        SET auth_id = (SELECT id FROM auth.users WHERE email = row.email LIMIT 1) 
        WHERE id = row.id;
    END LOOP;
END $$;

-- Optional: Erase plain text passwords after verifying the migration
-- UPDATE public.users SET password = NULL WHERE auth_id IS NOT NULL;


-- =====================================================================================
-- STEP 4: Set up Triggers for New User Creation
-- =====================================================================================
-- This creates a mirrored `public.users` record whenever someone signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_auth_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (auth_id, email, "fullName", username, role, "operatingUnit", visibility_scope)
  VALUES (
      new.id, 
      new.email, 
      COALESCE(new.raw_user_meta_data->>'full_name', 'New Auth User'), 
      COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)), 
      'User', 
      'NPMO', 
      'All OUs'
  )
  ON CONFLICT DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger attachment
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();


-- =====================================================================================
-- STEP 5: Enable Row Level Security (RLS) on key tables using `visibility_scope`
-- =====================================================================================
-- 1. Subprojects Table
ALTER TABLE public.subprojects ENABLE ROW LEVEL SECURITY;

CREATE POLICY subprojects_view_policy ON public.subprojects
FOR SELECT TO authenticated
USING (
    (SELECT visibility_scope FROM public.users WHERE auth_id = auth.uid() LIMIT 1) = 'All OUs'
    OR "operatingUnit" = (SELECT "operatingUnit" FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
);

CREATE POLICY subprojects_insert_policy ON public.subprojects
FOR INSERT TO authenticated
WITH CHECK (true); -- Optional: restrict creation check

CREATE POLICY subprojects_update_policy ON public.subprojects
FOR UPDATE TO authenticated
USING (
    (SELECT visibility_scope FROM public.users WHERE auth_id = auth.uid() LIMIT 1) = 'All OUs'
    OR "operatingUnit" = (SELECT "operatingUnit" FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
);

-- 2. Activities Table
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY activities_view_policy ON public.activities
FOR SELECT TO authenticated
USING (
    (SELECT visibility_scope FROM public.users WHERE auth_id = auth.uid() LIMIT 1) = 'All OUs'
    OR "operatingUnit" = (SELECT "operatingUnit" FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
);

CREATE POLICY activities_insert_policy ON public.activities
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY activities_update_policy ON public.activities
FOR UPDATE TO authenticated
USING (
    (SELECT visibility_scope FROM public.users WHERE auth_id = auth.uid() LIMIT 1) = 'All OUs'
    OR "operatingUnit" = (SELECT "operatingUnit" FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
);

-- 3. Office Requirements Table
ALTER TABLE public.office_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY office_requirements_view_policy ON public.office_requirements
FOR SELECT TO authenticated
USING (
    (SELECT visibility_scope FROM public.users WHERE auth_id = auth.uid() LIMIT 1) = 'All OUs'
    OR "operatingUnit" = (SELECT "operatingUnit" FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
);

CREATE POLICY office_requirements_insert_policy ON public.office_requirements
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY office_requirements_update_policy ON public.office_requirements
FOR UPDATE TO authenticated
USING (
    (SELECT visibility_scope FROM public.users WHERE auth_id = auth.uid() LIMIT 1) = 'All OUs'
    OR "operatingUnit" = (SELECT "operatingUnit" FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
);

-- 4. Staffing Requirements Table
ALTER TABLE public.staffing_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY staffing_requirements_view_policy ON public.staffing_requirements
FOR SELECT TO authenticated
USING (
    (SELECT visibility_scope FROM public.users WHERE auth_id = auth.uid() LIMIT 1) = 'All OUs'
    OR "operatingUnit" = (SELECT "operatingUnit" FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
);

CREATE POLICY staffing_requirements_insert_policy ON public.staffing_requirements
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY staffing_requirements_update_policy ON public.staffing_requirements
FOR UPDATE TO authenticated
USING (
    (SELECT visibility_scope FROM public.users WHERE auth_id = auth.uid() LIMIT 1) = 'All OUs'
    OR "operatingUnit" = (SELECT "operatingUnit" FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
);

-- 5. Other Program Expenses Table
ALTER TABLE public.other_program_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY other_expenses_view_policy ON public.other_program_expenses
FOR SELECT TO authenticated
USING (
    (SELECT visibility_scope FROM public.users WHERE auth_id = auth.uid() LIMIT 1) = 'All OUs'
    OR "operatingUnit" = (SELECT "operatingUnit" FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
);

CREATE POLICY other_expenses_insert_policy ON public.other_program_expenses
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY other_expenses_update_policy ON public.other_program_expenses
FOR UPDATE TO authenticated
USING (
    (SELECT visibility_scope FROM public.users WHERE auth_id = auth.uid() LIMIT 1) = 'All OUs'
    OR "operatingUnit" = (SELECT "operatingUnit" FROM public.users WHERE auth_id = auth.uid() LIMIT 1)
);

-- Note: IPOs and Marketing Partners generally act as regional registries. 
-- Their RLS may require mapping OU to Region or making them globally viewable.
-- For now, they can be configured with similar global/OU-restricted logic if needed.

-- --- End of phase3_migration.sql ---
