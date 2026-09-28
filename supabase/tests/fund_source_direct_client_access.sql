-- Exercise the actual application database role. All test rows are rolled back.
-- Sequence values may advance; no existing users or subprojects are updated.
begin;
set local role anon;

do $$
declare
  admin_actor public.users%rowtype;
  guest_actor public.users%rowtype;
  editor_actor public.users%rowtype;
  saved public.ref_fund_sources%rowtype;
  original_uid text;
  test_label text := '__fund_source_access_check_' || gen_random_uuid()::text;
begin
  if (select count(*) from public.ref_fund_sources where uid in
      ('FS-000001', 'FS-000002', 'FS-000003', 'FS-000004', 'FS-000005', 'FS-000006')) <> 6 then
    raise exception 'The application cannot read the six existing Fund Sources.';
  end if;

  select * into strict admin_actor from public.users
  where role = 'Super Admin' and nullif(password, '') is not null order by id limit 1;
  select * into strict guest_actor from public.users
  where role = 'Guest' and nullif(password, '') is not null order by id limit 1;

  begin
    perform public.save_fund_source_reference(admin_actor.id, '', null, test_label);
    raise exception 'Missing credentials were accepted.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_fund_source_reference(admin_actor.id, gen_random_uuid()::text, null, test_label);
    raise exception 'Invalid credentials were accepted.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_fund_source_reference(guest_actor.id, guest_actor.password, null, test_label);
    raise exception 'A Guest was allowed to edit Fund Sources.';
  exception when insufficient_privilege then null;
  end;

  saved := public.save_fund_source_reference(admin_actor.id, admin_actor.password, null, test_label, 9999);
  original_uid := saved.uid;
  if original_uid is null or saved.label <> test_label or not saved.is_active then
    raise exception 'Creating a Fund Source did not return the persisted reference.';
  end if;

  saved := public.save_fund_source_reference(admin_actor.id, admin_actor.password, saved.id, test_label || '_renamed');
  if saved.uid <> original_uid or saved.label <> test_label || '_renamed' then
    raise exception 'Rename did not preserve the UID.';
  end if;
  begin
    perform public.save_fund_source_reference(admin_actor.id, admin_actor.password, null, saved.label);
    raise exception 'A duplicate active label was accepted.';
  exception when unique_violation then null;
  end;

  saved := public.save_fund_source_reference(admin_actor.id, admin_actor.password, saved.id, null, null, false);
  if saved.is_active or saved.uid <> original_uid then
    raise exception 'Deactivation did not preserve the reference.';
  end if;
  saved := public.save_fund_source_reference(admin_actor.id, admin_actor.password, saved.id, null, null, true);
  if not saved.is_active then raise exception 'Reactivation failed.'; end if;

  for editor_actor in
    select u.* from public.users u
    where u.role not in ('Super Admin', 'Administrator', 'Guest')
      and nullif(u.password, '') is not null
      and coalesce(
        case when jsonb_typeof(u.permissions_override -> 'References' -> 'can_edit') = 'boolean'
          then (u.permissions_override -> 'References' ->> 'can_edit')::boolean end,
        (select rc.can_edit from public.roles_config rc where rc.role = u.role and rc.module = 'References' limit 1),
        false
      )
    limit 1
  loop
    saved := public.save_fund_source_reference(editor_actor.id, editor_actor.password, saved.id, null, 9998);
    if saved.sort_order <> 9998 then raise exception 'A permitted References editor could not save.'; end if;
  end loop;

  begin
    update public.ref_fund_sources set label = test_label where id = saved.id;
    raise exception 'Direct anonymous table writes were allowed.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
select 'Application-role Fund Source read, write, permission, UID, and duplicate checks passed; test rows rolled back.' as result;
