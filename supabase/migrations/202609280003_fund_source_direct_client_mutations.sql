-- Match the existing application login without permitting anonymous table writes.
-- Credentials are checked against the stored user; permissions are never supplied
-- by the browser. A real Supabase Auth session must match the same stored user.
create or replace function public.save_fund_source_reference(
  p_actor_id bigint,
  p_actor_password text,
  p_reference_id bigint default null,
  p_label text default null,
  p_sort_order integer default null,
  p_is_active boolean default null
)
returns public.ref_fund_sources
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.users%rowtype;
  saved public.ref_fund_sources%rowtype;
  allowed_edit boolean;
  override_value jsonb;
begin
  select * into actor from public.users where id = p_actor_id;
  if actor.id is null then
    raise exception using errcode = '42501', message = 'Please sign in again before editing Fund Sources.';
  end if;

  if auth.uid() is not null then
    if actor.auth_id is distinct from auth.uid() then
      raise exception using errcode = '42501', message = 'The signed-in user does not match this request.';
    end if;
  elsif nullif(p_actor_password, '') is null
    or actor.password is distinct from p_actor_password then
    raise exception using errcode = '42501', message = 'Please sign in again before editing Fund Sources.';
  end if;

  if actor.role in ('Super Admin', 'Administrator') then
    allowed_edit := true;
  elsif actor.role = 'Guest' then
    allowed_edit := false;
  else
    override_value := actor.permissions_override -> 'References' -> 'can_edit';
    if jsonb_typeof(override_value) = 'boolean' then
      allowed_edit := (override_value #>> '{}')::boolean;
    else
      select rc.can_edit into allowed_edit from public.roles_config rc
      where rc.role = actor.role and rc.module = 'References' limit 1;
    end if;
  end if;

  if not coalesce(allowed_edit, false) then
    raise exception using errcode = '42501', message = 'You do not have permission to edit Fund Sources.';
  end if;

  if (p_reference_id is null and p_label is null)
    or (p_label is not null and (btrim(p_label) = '' or char_length(btrim(p_label)) > 120)) then
    raise exception using errcode = '22023', message = 'Enter a Fund Source name between 1 and 120 characters.';
  end if;
  if p_sort_order is not null and p_sort_order < 0 then
    raise exception using errcode = '22023', message = 'Sort order cannot be negative.';
  end if;

  if p_reference_id is null then
    insert into public.ref_fund_sources (label, sort_order, is_active)
    values (btrim(p_label), coalesce(p_sort_order, 0), coalesce(p_is_active, true))
    returning * into saved;
  else
    update public.ref_fund_sources
    set label = coalesce(btrim(p_label), label),
        sort_order = coalesce(p_sort_order, sort_order),
        is_active = coalesce(p_is_active, is_active)
    where id = p_reference_id
    returning * into saved;
    if not found then
      raise exception using errcode = 'P0002', message = 'This Fund Source no longer exists. Refresh and try again.';
    end if;
  end if;
  return saved;
end;
$$;

revoke insert, update, delete on public.ref_fund_sources from anon;
revoke all on function public.save_fund_source_reference(bigint, text, bigint, text, integer, boolean) from public;
grant execute on function public.save_fund_source_reference(bigint, text, bigint, text, integer, boolean) to anon, authenticated;
