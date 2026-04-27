-- Fix for Migration Script & User Roles Update
-- Author: 4K

-- 1. Sync the roles to raw_user_meta_data in auth.users so it reflects properly in Supabase Auth mapping
DO $$
DECLARE
    user_row public.users%rowtype;
BEGIN
    FOR user_row IN SELECT * FROM public.users WHERE auth_id IS NOT NULL LOOP
        UPDATE auth.users
        SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
            'full_name', COALESCE(user_row."fullName", ''),
            'username', COALESCE(user_row.username, ''),
            'role', user_row.role,
            'operatingUnit', user_row."operatingUnit"
        )
        WHERE id = user_row.auth_id;
    END LOOP;
END $$;

-- 2. Add safe read policy for users table to fix Webapp "Offline Mode" Database connection checker
-- If Row Level Security is turned on for public.users, the connection health check will fail because it 
-- runs as an anonymous user (not signed in yet).
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous to check users count" ON public.users;
CREATE POLICY "Allow anonymous to check users count" ON public.users 
FOR SELECT 
USING (true);

-- 3. Cleanup Duplicate auth_ids in public.users before applying constraint
-- We keep the row with the lowest id and delete the duplicates
DELETE FROM public.users
WHERE id IN (
    SELECT id
    FROM (
        SELECT id,
               ROW_NUMBER() OVER (partition BY auth_id ORDER BY id ASC) as rnum
        FROM public.users
        WHERE auth_id IS NOT NULL
    ) t
    WHERE t.rnum > 1
);

-- 4. Fix handle_new_auth_user trigger in case public.users unique constraint is missing
-- We first add a unique constraint to the auth_id so the trigger doesn't duplicate them
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_auth_id_unique;
ALTER TABLE public.users ADD CONSTRAINT users_auth_id_unique UNIQUE (auth_id);

CREATE OR REPLACE FUNCTION public.handle_new_auth_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (auth_id, email, "fullName", username, role, "operatingUnit", visibility_scope)
  VALUES (
      new.id, 
      new.email, 
      COALESCE(new.raw_user_meta_data->>'full_name', 'New Auth User'), 
      COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)), 
      COALESCE(new.raw_user_meta_data->>'role', 'User'), 
      COALESCE(new.raw_user_meta_data->>'operatingUnit', 'NPMO'), 
      'All OUs'
  )
  ON CONFLICT (auth_id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

