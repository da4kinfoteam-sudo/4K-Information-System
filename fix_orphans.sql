DO $$
DECLARE
    auth_row RECORD;
BEGIN
    FOR auth_row IN SELECT * FROM auth.users WHERE id NOT IN (SELECT auth_id FROM public.users WHERE auth_id IS NOT NULL) LOOP
        INSERT INTO public.users (auth_id, email, "fullName", username, role, "operatingUnit", visibility_scope)
        VALUES (
            auth_row.id, 
            auth_row.email, 
            COALESCE(auth_row.raw_user_meta_data->>'full_name', 'New Auth User'), 
            COALESCE(auth_row.raw_user_meta_data->>'username', split_part(auth_row.email, '@', 1)), 
            COALESCE(auth_row.raw_user_meta_data->>'role', 'User'), 
            COALESCE(auth_row.raw_user_meta_data->>'operatingUnit', 'NPMO'), 
            'All OUs'
        );
    END LOOP;
END $$;
