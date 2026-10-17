-- Additive, date-bounded staff periods and scoped branch assignments.
-- No appointment, reservation, customer or existing schedule is rewritten.
begin;

-- Freeze relevant writes before preflight, so a legacy/raw writer cannot add
-- an inconsistent row between the checks and installing the guards. Time out
-- rather than waiting indefinitely for a busy deployment; transaction rollback
-- leaves the previous schema/data intact on any failure.
set local lock_timeout='5s';
set local statement_timeout='60s';
lock table public.appointments,public.employee_branches,public.employee_working_hours,public.employees,public.branches in share row exclusive mode;

-- Stop on legacy tenant/dangling/date inconsistencies; never silently repair.
do $$ begin
  if exists (
    select 1 from public.employee_branches eb
    join public.employees e on e.id=eb.employee_id
    join public.branches b on b.id=eb.branch_id
    where e.business_id<>b.business_id
  ) or exists (
    select 1 from public.employee_working_hours h
    left join public.employees e on e.id=h.employee_id and e.business_id=h.business_id
    left join public.branches b on b.id=h.branch_id and b.business_id=h.business_id
    left join public.employee_branches eb on eb.employee_id=h.employee_id and eb.branch_id=h.branch_id
    where e.id is null or b.id is null or eb.employee_id is null
      or (h.valid_from is not null and not isfinite(h.valid_from))
      or (h.valid_until is not null and not isfinite(h.valid_until))
      or h.valid_from>h.valid_until
  ) or exists (
    select 1 from public.appointments a
    left join public.employee_branches eb on eb.employee_id=a.employee_id and eb.branch_id=a.branch_id
    left join public.employees e on e.id=a.employee_id and e.business_id=a.business_id
    left join public.branches b on b.id=a.branch_id and b.business_id=a.business_id
    where a.status in('pending','confirmed') and a.ends_at>now()
      and (eb.employee_id is null or e.id is null or b.id is null)
  ) then raise exception 'staff_schedule_integrity_violation: administrator review required; no changes made' using errcode='23514'; end if;
end $$;

create unique index if not exists employees_business_schedule_key on public.employees(business_id,id);
create unique index if not exists branches_business_resource_key on public.branches(business_id,id);
alter table public.employee_working_hours add constraint employee_hours_tenant_employee_fk
  foreign key(business_id,employee_id) references public.employees(business_id,id) on delete cascade not valid;
alter table public.employee_working_hours add constraint employee_hours_tenant_branch_fk
  foreign key(business_id,branch_id) references public.branches(business_id,id) on delete cascade not valid;
alter table public.employee_working_hours add constraint employee_hours_assignment_fk
  foreign key(employee_id,branch_id) references public.employee_branches(employee_id,branch_id) on delete restrict not valid;
alter table public.employee_working_hours add constraint employee_hours_finite_dates_check
  check ((valid_from is null or isfinite(valid_from)) and (valid_until is null or isfinite(valid_until)) and (valid_from is null or valid_until is null or valid_from<=valid_until)) not valid;
alter table public.employee_working_hours validate constraint employee_hours_tenant_employee_fk;
alter table public.employee_working_hours validate constraint employee_hours_tenant_branch_fk;
alter table public.employee_working_hours validate constraint employee_hours_assignment_fk;
alter table public.employee_working_hours validate constraint employee_hours_finite_dates_check;
create index if not exists appointments_employee_branch_live_end_idx
  on public.appointments(employee_id,branch_id,ends_at) where status in('pending','confirmed');

-- Private typed parser. Strict JSON keys/types, real calendar dates, finite
-- HH:mm[:ss[.ffffff]] times; typed snapshots equate 09:00 and 09:00:00.
create or replace function public.parse_employee_schedule_period(p_period jsonb,p_snapshot boolean default false)
returns table(weekday smallint,starts_at time,ends_at time,valid_from date,valid_until date)
language plpgsql immutable security invoker set search_path='' as $$
begin
  if p_period is null or jsonb_typeof(p_period)<>'object' or octet_length(p_period::text)>1024
    or not(p_period ?& array['weekday','startsAt','endsAt','validFrom','validUntil'])
    or exists(select 1 from jsonb_object_keys(p_period) k where k not in('weekday','startsAt','endsAt','validFrom','validUntil'))
    or jsonb_typeof(p_period->'weekday')<>'number' or p_period->>'weekday' !~ '^[0-6]$'
    or jsonb_typeof(p_period->'startsAt')<>'string' or jsonb_typeof(p_period->'endsAt')<>'string'
    or (p_period->>'startsAt' !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,6})?)?$' and (not coalesce(p_snapshot,false) or p_period->>'startsAt' !~ '^24:00(:00(\.0{1,6})?)?$'))
    or (p_period->>'endsAt' !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,6})?)?$' and (not coalesce(p_snapshot,false) or p_period->>'endsAt' !~ '^24:00(:00(\.0{1,6})?)?$'))
    or jsonb_typeof(p_period->'validFrom') not in('null','string')
    or jsonb_typeof(p_period->'validUntil') not in('null','string')
    or (p_period->>'validFrom' is not null and p_period->>'validFrom' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
    or (p_period->>'validUntil' is not null and p_period->>'validUntil' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
  then raise exception 'INVALID_SCHEDULE' using errcode='22023'; end if;
  begin
    weekday:=(p_period->>'weekday')::smallint;
    starts_at:=(p_period->>'startsAt')::time; ends_at:=(p_period->>'endsAt')::time;
    valid_from:=(p_period->>'validFrom')::date; valid_until:=(p_period->>'validUntil')::date;
  exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
    raise exception 'INVALID_SCHEDULE' using errcode='22023';
  end;
  -- Snapshot-only acceptance preserves PostgreSQL's legal legacy 24:00 endpoint
  -- for typed stale checks/deletion. It never authorizes new midnight periods.
  if not coalesce(p_snapshot,false) and (starts_at>=ends_at or valid_from>valid_until) then raise exception 'INVALID_SCHEDULE' using errcode='22023'; end if;
  if not coalesce(p_snapshot,false) and valid_from is not null and valid_until is not null
    and valid_from+((weekday-(extract(isodow from valid_from)::integer-1)+7)%7)>valid_until
  then raise exception 'INVALID_SCHEDULE' using errcode='22023'; end if;
  return next;
end $$;
revoke execute on function public.parse_employee_schedule_period(jsonb,boolean) from public,anon,authenticated;

-- Date ranges are inclusive. Intersection alone is insufficient: a two-day
-- intersection on Tue/Wed is not a Monday conflict. Infinite bounds require no
-- day expansion; finite intersections test the first actual matching weekday.
create or replace function public.employee_schedule_dates_overlap(p_weekday smallint,p_from_a date,p_until_a date,p_from_b date,p_until_b date)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare v_from date:=greatest(coalesce(p_from_a,'-infinity'::date),coalesce(p_from_b,'-infinity'::date));
  v_until date:=least(coalesce(p_until_a,'infinity'::date),coalesce(p_until_b,'infinity'::date));
begin
  if v_from>v_until then return false; end if;
  if not isfinite(v_from) or not isfinite(v_until) then return true; end if;
  return v_from+((p_weekday-(extract(isodow from v_from)::integer-1)+7)%7)<=v_until;
end $$;
revoke execute on function public.employee_schedule_dates_overlap(smallint,date,date,date,date) from public,anon,authenticated;

create or replace function public.manage_employee_schedule_period(
  p_business_id uuid,p_branch_id uuid,p_employee_id uuid,p_action text,p_period_id uuid,p_expected jsonb,p_period jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_existing public.employee_working_hours%rowtype; v_period record; v_expected record; v_active boolean;
begin
  if not exists(select 1 from public.business_members where business_id=p_business_id and user_id=auth.uid() and active and role in('OWNER','MANAGER')) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_employee_id is null or p_branch_id is null or p_period_id is null or p_action is null or p_action not in('create','update','delete') then raise exception 'INVALID_SCHEDULE' using errcode='22023'; end if;
  -- Canonical employee-only lock is shared by periodic, weekly and assignment
  -- RPCs, including edits to different branches. Never lock employee FOR UPDATE:
  -- booking/assignment foreign-key KEY SHARE locks would invert that ordering.
  perform pg_advisory_xact_lock(hashtextextended('employee-schedule:'||p_employee_id::text,0));
  -- UUID collisions across employees are serialized too; one tenant never
  -- overwrites another's row or reports a mismatched replay as success.
  perform pg_advisory_xact_lock(hashtextextended('employee-period:'||p_period_id::text,0));
  select e.active into v_active from public.employees e where e.id=p_employee_id and e.business_id=p_business_id;
  if not found or not exists(select 1 from public.branches where id=p_branch_id and business_id=p_business_id) then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  if p_action in('create','update') and (not v_active or not exists(select 1 from public.branches where id=p_branch_id and business_id=p_business_id and active)) then raise exception 'INVALID_SCHEDULE' using errcode='22023'; end if;
  perform 1 from public.employee_branches where employee_id=p_employee_id and branch_id=p_branch_id for key share;
  if not found then raise exception 'BRANCH_NOT_ASSIGNED' using errcode='P0001'; end if;
  if p_action='create' then
    if p_expected is not null and p_expected<>'null'::jsonb then raise exception 'INVALID_SCHEDULE' using errcode='22023'; end if;
  else
    select * into v_expected from public.parse_employee_schedule_period(p_expected,true);
  end if;
  if p_action in('create','update') then select * into v_period from public.parse_employee_schedule_period(p_period);
  elsif p_period is not null and p_period<>'null'::jsonb then raise exception 'INVALID_SCHEDULE' using errcode='22023'; end if;
  select * into v_existing from public.employee_working_hours where id=p_period_id;
  if p_action='create' and found then
    -- Stable UUID replay is accepted only while that same scoped row retains
    -- exactly the same typed content. This is not a permanent request ledger.
    if v_existing.business_id is distinct from p_business_id or v_existing.branch_id is distinct from p_branch_id or v_existing.employee_id is distinct from p_employee_id
      or v_existing.weekday is distinct from v_period.weekday or v_existing.starts_at is distinct from v_period.starts_at or v_existing.ends_at is distinct from v_period.ends_at
      or v_existing.valid_from is distinct from v_period.valid_from or v_existing.valid_until is distinct from v_period.valid_until
    then raise exception 'STALE_SCHEDULE' using errcode='P0001'; end if;
  else
    if p_action<>'create' then
      if not found or v_existing.business_id<>p_business_id or v_existing.branch_id<>p_branch_id or v_existing.employee_id<>p_employee_id then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
      if not(v_existing.weekday is not distinct from v_expected.weekday and v_existing.starts_at is not distinct from v_expected.starts_at and v_existing.ends_at is not distinct from v_expected.ends_at and v_existing.valid_from is not distinct from v_expected.valid_from and v_existing.valid_until is not distinct from v_expected.valid_until)
      then raise exception 'STALE_SCHEDULE' using errcode='P0001'; end if;
    end if;
    if p_action='delete' then
      delete from public.employee_working_hours where id=p_period_id and business_id=p_business_id and branch_id=p_branch_id and employee_id=p_employee_id;
      return jsonb_build_object('deletedId',p_period_id);
    end if;
    if exists (
      select 1 from public.employee_working_hours h
      where h.employee_id=p_employee_id and h.branch_id=p_branch_id and h.business_id=p_business_id and h.id<>p_period_id and h.weekday=v_period.weekday
        and h.starts_at<v_period.ends_at and h.ends_at>v_period.starts_at
        and public.employee_schedule_dates_overlap(v_period.weekday,h.valid_from,h.valid_until,v_period.valid_from,v_period.valid_until)
    ) then raise exception 'SCHEDULE_OVERLAP' using errcode='P0001'; end if;
    if p_action='create' then
      insert into public.employee_working_hours(id,business_id,branch_id,employee_id,weekday,starts_at,ends_at,valid_from,valid_until)
      values(p_period_id,p_business_id,p_branch_id,p_employee_id,v_period.weekday,v_period.starts_at,v_period.ends_at,v_period.valid_from,v_period.valid_until)
      returning * into v_existing;
    else
      update public.employee_working_hours set weekday=v_period.weekday,starts_at=v_period.starts_at,ends_at=v_period.ends_at,valid_from=v_period.valid_from,valid_until=v_period.valid_until
      where id=p_period_id and business_id=p_business_id and branch_id=p_branch_id and employee_id=p_employee_id returning * into v_existing;
    end if;
  end if;
  return jsonb_build_object('period',jsonb_build_object('id',v_existing.id,'weekday',v_existing.weekday,'startsAt',v_existing.starts_at::text,'endsAt',v_existing.ends_at::text,'validFrom',v_existing.valid_from,'validUntil',v_existing.valid_until));
end $$;
revoke execute on function public.manage_employee_schedule_period(uuid,uuid,uuid,text,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.manage_employee_schedule_period(uuid,uuid,uuid,text,uuid,jsonb,jsonb) to authenticated;

create or replace function public.set_employee_branch_assignment(p_business_id uuid,p_employee_id uuid,p_branch_id uuid,p_assigned boolean,p_expected_assigned boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_assigned boolean; v_branch_active boolean;
begin
  if not exists(select 1 from public.business_members where business_id=p_business_id and user_id=auth.uid() and active and role in('OWNER','MANAGER')) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_employee_id is null or p_branch_id is null or p_assigned is null or p_expected_assigned is null then raise exception 'INVALID_SCHEDULE' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('employee-schedule:'||p_employee_id::text,0));
  perform 1 from public.employees where id=p_employee_id and business_id=p_business_id;
  if not found then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  select active into v_branch_active from public.branches where id=p_branch_id and business_id=p_business_id;
  if not found then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  perform 1 from public.employee_branches where employee_id=p_employee_id and branch_id=p_branch_id for update;
  v_assigned:=found;
  if v_assigned is distinct from p_expected_assigned then raise exception 'STALE_SCHEDULE' using errcode='P0001'; end if;
  if p_assigned then
    -- Inactive staff may be prepared/created in an active branch; booking and
    -- period creation still require active staff. Preserve existing no-op links.
    if not v_branch_active and not v_assigned then raise exception 'INVALID_SCHEDULE' using errcode='22023'; end if;
    insert into public.employee_branches(employee_id,branch_id) values(p_employee_id,p_branch_id) on conflict(employee_id,branch_id) do nothing;
  elsif v_assigned then
    -- ANY period blocks unlink, including past/future date-bounded periods.
    -- ends_at includes appointments currently in progress, not only starts_at.
    if exists(select 1 from public.employee_working_hours where employee_id=p_employee_id and branch_id=p_branch_id)
      or exists(select 1 from public.appointments where employee_id=p_employee_id and branch_id=p_branch_id and status in('pending','confirmed') and ends_at>now())
    then raise exception 'SCHEDULE_IN_USE' using errcode='P0001'; end if;
    delete from public.employee_branches where employee_id=p_employee_id and branch_id=p_branch_id;
  end if;
  return jsonb_build_object('branchId',p_branch_id,'assigned',p_assigned);
end $$;
revoke execute on function public.set_employee_branch_assignment(uuid,uuid,uuid,boolean,boolean) from public,anon;
grant execute on function public.set_employee_branch_assignment(uuid,uuid,uuid,boolean,boolean) to authenticated;

-- Retain legacy upserts used by staff creation. Their tenant/active constraints
-- and raw unlink checks must not be bypassable via PostgREST. A row trigger is
-- already entered with a row lock; taking the advisory lock here would invert
-- RPC advisory -> row ordering. Conditional booking KEY SHARE and the period
-- FK/KEY SHARE supply the row-level synchronization instead.
create or replace function public.guard_employee_branch_assignment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.employee_id is distinct from old.employee_id or new.branch_id is distinct from old.branch_id then raise exception 'INVALID_SCHEDULE' using errcode='22023'; end if;
    return new;
  elsif tg_op='DELETE' then
    if exists(select 1 from public.employee_working_hours where employee_id=old.employee_id and branch_id=old.branch_id)
      or exists(select 1 from public.appointments where employee_id=old.employee_id and branch_id=old.branch_id and status in('pending','confirmed') and ends_at>now())
    then raise exception 'SCHEDULE_IN_USE' using errcode='P0001'; end if;
    return old;
  end if;
  -- Retain parent scope through commit. These KEY SHARE locks also serialize
  -- with parent business_id updates (part of the composite unique keys), so an
  -- unlinked parent cannot be moved while an INSERT passes its tenant check.
  perform 1 from public.employees e join public.branches b on b.business_id=e.business_id
    where e.id=new.employee_id and b.id=new.branch_id
      and (b.active or exists(select 1 from public.employee_branches eb where eb.employee_id=new.employee_id and eb.branch_id=new.branch_id))
    for key share of e,b;
  if not found then raise exception 'INVALID_SCHEDULE' using errcode='22023'; end if;
  return new;
end $$;
create trigger employee_branch_assignment_guard before insert or update or delete on public.employee_branches
  for each row execute function public.guard_employee_branch_assignment();
revoke execute on function public.guard_employee_branch_assignment() from public,anon,authenticated;

-- Link validation must remain true if a parent row is later edited. Existing
-- links make tenant reparenting invalid; unlinked preparation rows retain their
-- previous behavior. Do not lock link/appointment rows here: parent UPDATE is
-- already row-locked, and the raw INSERT guard takes parent KEY SHARE first.
create or replace function public.guard_staff_assignment_parent_scope()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.business_id is not distinct from old.business_id then return new; end if;
  if (tg_table_name='employees' and exists(select 1 from public.employee_branches where employee_id=old.id))
    or (tg_table_name='branches' and exists(select 1 from public.employee_branches where branch_id=old.id))
  then raise exception 'INVALID_SCHEDULE' using errcode='22023'; end if;
  return new;
end $$;
create trigger employee_assignment_parent_scope_guard before update of business_id on public.employees
  for each row execute function public.guard_staff_assignment_parent_scope();
create trigger branch_assignment_parent_scope_guard before update of business_id on public.branches
  for each row execute function public.guard_staff_assignment_parent_scope();
revoke execute on function public.guard_staff_assignment_parent_scope() from public,anon,authenticated;

-- All entry points, including future direct status/time/scope updates, retain
-- their assignment through commit. No advisory/appointment FOR UPDATE lock is
-- acquired here, so branch unlink never needs to lock appointment rows.
create or replace function public.guard_appointment_employee_assignment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status in('pending','confirmed') and new.ends_at>now() then
    perform 1 from public.employee_branches eb
    join public.employees e on e.id=eb.employee_id and e.business_id=new.business_id
    join public.branches b on b.id=eb.branch_id and b.business_id=new.business_id
    where eb.employee_id=new.employee_id and eb.branch_id=new.branch_id for key share of eb;
    if not found then raise exception 'BRANCH_NOT_ASSIGNED' using errcode='P0001'; end if;
  end if;
  return new;
end $$;
create trigger appointment_employee_assignment_guard before insert or update of status,starts_at,ends_at,employee_id,branch_id,business_id on public.appointments
  for each row execute function public.guard_appointment_employee_assignment();
revoke execute on function public.guard_appointment_employee_assignment() from public,anon,authenticated;

-- The simple weekly editor is not a bulk advanced editor. Protect existing
-- dated/multipart rows BEFORE deletion, under the exact same employee lock.
create or replace function public.save_employee_weekly_schedule(p_employee_id uuid,p_branch_id uuid,p_schedule jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v_business_id uuid; v_item jsonb; v_period record; v_weekdays smallint[]:='{}'::smallint[];
begin
  select business_id into v_business_id from public.employees where id=p_employee_id;
  if not found then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  if not exists(select 1 from public.business_members where business_id=v_business_id and user_id=auth.uid() and active and role in('OWNER','MANAGER')) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('employee-schedule:'||p_employee_id::text,0));
  if not exists(select 1 from public.employees e join public.branches b on b.business_id=e.business_id where e.id=p_employee_id and b.id=p_branch_id and e.active and b.active) then raise exception 'NOT_FOUND' using errcode='P0001'; end if;
  perform 1 from public.employee_branches where employee_id=p_employee_id and branch_id=p_branch_id for key share;
  if not found then raise exception 'BRANCH_NOT_ASSIGNED' using errcode='P0001'; end if;
  if p_schedule is null or jsonb_typeof(p_schedule)<>'array' or jsonb_array_length(p_schedule)>7 then raise exception 'INVALID_SCHEDULE' using errcode='22023'; end if;
  for v_item in select value from jsonb_array_elements(p_schedule) loop
    if jsonb_typeof(v_item)<>'object' or not(v_item ?& array['weekday','startsAt','endsAt']) or exists(select 1 from jsonb_object_keys(v_item) k where k not in('weekday','startsAt','endsAt')) then raise exception 'INVALID_SCHEDULE' using errcode='22023'; end if;
    select * into v_period from public.parse_employee_schedule_period(v_item||jsonb_build_object('validFrom',null,'validUntil',null));
    if v_period.weekday=any(v_weekdays) then raise exception 'INVALID_SCHEDULE' using errcode='22023'; end if;
    v_weekdays:=array_append(v_weekdays,v_period.weekday);
  end loop;
  if exists(select 1 from public.employee_working_hours where employee_id=p_employee_id and branch_id=p_branch_id and (valid_from is not null or valid_until is not null))
    or exists(select 1 from public.employee_working_hours where employee_id=p_employee_id and branch_id=p_branch_id group by weekday having count(*)>1)
  then raise exception 'SCHEDULE_IN_USE' using errcode='P0001'; end if;
  delete from public.employee_working_hours where employee_id=p_employee_id and branch_id=p_branch_id and business_id=v_business_id;
  insert into public.employee_working_hours(business_id,employee_id,branch_id,weekday,starts_at,ends_at)
  select v_business_id,p_employee_id,p_branch_id,(item->>'weekday')::smallint,(item->>'startsAt')::time,(item->>'endsAt')::time from jsonb_array_elements(p_schedule) item;
end $$;
revoke execute on function public.save_employee_weekly_schedule(uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_employee_weekly_schedule(uuid,uuid,jsonb) to authenticated;

create or replace function public.native_staff_schedules_ready(p_business_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.business_members where business_id=p_business_id and user_id=auth.uid() and active and role in('OWNER','MANAGER'));
$$;
revoke execute on function public.native_staff_schedules_ready(uuid) from public,anon;
grant execute on function public.native_staff_schedules_ready(uuid) to authenticated;

-- Every repository hours writer uses the scoped RPC; eliminate raw REST and
-- leftover column/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN grants. Keep existing
-- anon/customer RLS reads and legacy employee_branches creation unchanged.
revoke all privileges on table public.employee_working_hours from public,anon,authenticated;
do $$ declare v_columns text; begin
  select string_agg(format('%I',attname),',' order by attnum) into v_columns from pg_catalog.pg_attribute where attrelid='public.employee_working_hours'::regclass and attnum>0 and not attisdropped;
  execute format('revoke select (%1$s),insert (%1$s),update (%1$s),references (%1$s) on table public.employee_working_hours from public,anon,authenticated',v_columns);
end $$;
grant select on table public.employee_working_hours to anon,authenticated;

notify pgrst,'reload schema';
commit;
