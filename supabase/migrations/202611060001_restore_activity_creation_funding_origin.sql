-- Change only initial funding-origin admission in the installed guard. Preserve
-- its security settings and any earlier History archive-recovery integration.
do $patch$
declare
  definition text;
  anchor text := '  if tg_op=''UPDATE'' then'||chr(10);
  rejected text := '    if tg_op=''INSERT'' and (coalesce(new."isSavings",false) or coalesce(new."isRealignment",false)) then raise exception ''Use Supplemental Information for new Savings or Realignment funding.'' using errcode=''42501''; end if;'||chr(10);
  exclusive text := '  if tg_op=''INSERT'' and coalesce(new."isSavings",false) and coalesce(new."isRealignment",false) then'||chr(10)
    ||'    raise exception ''Select either Savings or Realignment, not both.'' using errcode=''22023'';'||chr(10)||'  end if;'||chr(10);
  start_at integer;
begin
  select replace(pg_get_functiondef('public.guard_activity_budget_separation()'::regprocedure),E'\r\n',E'\n') into definition;
  if position('Select either Savings or Realignment, not both.' in definition)>0 and position(rejected in definition)=0 then return; end if;
  if (length(definition)-length(replace(definition,rejected,'')))<>length(rejected) then
    raise exception 'Unsupported Activity guard: initial funding-origin anchor changed.';
  end if;
  definition:=replace(definition,rejected,'');
  start_at:=position(anchor in definition);
  if start_at=0 then raise exception 'Unsupported Activity guard: update boundary missing.'; end if;
  definition:=overlay(definition placing exclusive from start_at for 0);
  execute definition;
end $patch$;
