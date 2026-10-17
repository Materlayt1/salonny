-- Manual, isolated SQL-engine smoke for migration 202610100029.
-- READS deployed function definitions, then executes their actual bodies only
-- against temporary tables. No public/auth/customer rows, roles, extensions or
-- grants are changed. All test objects and rows disappear with ROLLBACK.
-- This is serial engine acceptance, NOT a concurrent-load test or production GO.
-- Run the entire file as one session/batch after the migration is installed.
begin;

create temporary table business_resources (
  id uuid primary key, business_id uuid not null, branch_id uuid not null,
  capacity integer not null, active boolean not null
);
create temporary table appointments (
  id uuid primary key, business_id uuid not null, branch_id uuid not null,
  starts_at timestamptz not null, ends_at timestamptz not null
);
create temporary table appointment_items (
  id integer primary key, appointment_id uuid not null,
  business_id uuid not null, service_id uuid not null
);
create temporary table service_resources (
  service_id uuid not null, resource_id uuid not null, quantity integer not null
);
create temporary table appointment_resource_reservations (
  id integer primary key, appointment_id uuid not null, business_id uuid not null,
  branch_id uuid not null, resource_id uuid not null,
  starts_at timestamptz not null, ends_at timestamptz not null, released_at timestamptz
);
create temporary table native_resource_smoke_results (check_name text primary key);

-- Keep the deployed function bodies byte-for-byte, except for replacing all
-- explicit public. references with pg_temp. references. Header-only adjustments
-- use invoker security and a temporary-only search path. Abort on collisions or
-- any remaining public schema token rather than touching a real table/function.
do $$
declare
  v_signature text;
  v_oid oid;
  v_definition text;
  v_source_body text;
  v_cloned_body text;
  v_temp_signature text;
begin
  foreach v_signature in array array[
    'public.resource_peak_units(uuid,timestamptz,timestamptz)',
    'public.retime_appointment_resource_reservations()'
  ] loop
    v_oid := to_regprocedure(v_signature);
    if v_oid is null then raise exception 'smoke_prerequisite_missing: %',v_signature; end if;
    v_temp_signature := replace(v_signature,'public.','pg_temp.');
    if to_regprocedure(v_temp_signature) is not null then raise exception 'smoke_temp_function_collision: %',v_temp_signature; end if;
    select prosrc into v_source_body from pg_catalog.pg_proc where oid=v_oid;
    v_definition := replace(pg_catalog.pg_get_functiondef(v_oid),'public.','pg_temp.');
    v_definition := regexp_replace(v_definition,'SET search_path TO [^\n]*','SET search_path TO ''pg_temp''','i');
    v_definition := regexp_replace(v_definition,'SECURITY DEFINER','SECURITY INVOKER','i');
    if v_definition ~* '\mpublic\M' or v_definition ~* '\m(auth|storage|extensions)\.'
      or v_definition not like 'CREATE OR REPLACE FUNCTION pg_temp.%' then
      raise exception 'smoke_clone_scope_not_isolated: %',v_signature;
    end if;
    execute v_definition;
    select prosrc into v_cloned_body from pg_catalog.pg_proc where oid=to_regprocedure(v_temp_signature);
    if v_cloned_body is distinct from replace(v_source_body,'public.','pg_temp.') then
      raise exception 'smoke_clone_body_changed: %',v_signature;
    end if;
  end loop;
end $$;

create trigger native_resource_smoke_retime
  before update of starts_at,ends_at,branch_id,business_id on pg_temp.appointments
  for each row execute function pg_temp.retime_appointment_resource_reservations();

do $$
declare
  v_business constant uuid := '60000000-0000-4000-8000-000000000001';
  v_branch constant uuid := '60000000-0000-4000-8000-000000000002';
  v_other_branch constant uuid := '60000000-0000-4000-8000-000000000003';
  v_other_business constant uuid := '60000000-0000-4000-8000-000000000004';
  v_resource constant uuid := '60000000-0000-4000-8000-000000000005';
  v_service constant uuid := '60000000-0000-4000-8000-000000000006';
  v_appointment constant uuid := '60000000-0000-4000-8000-000000000007';
  v_other_appointment constant uuid := '60000000-0000-4000-8000-000000000008';
  v_message text;
begin
  -- Adjacent endpoints must be combined before the running sum. The peak of
  -- [10,11) and [11,12) is ONE, including a range clamped to [10:30,11:30).
  insert into pg_temp.appointment_resource_reservations values
    (1,v_appointment,v_business,v_branch,v_resource,'2030-01-01 10:00Z','2030-01-01 11:00Z',null),
    (2,v_other_appointment,v_business,v_branch,v_resource,'2030-01-01 11:00Z','2030-01-01 12:00Z',null);
  if pg_temp.resource_peak_units(v_resource,'2030-01-01 10:00Z','2030-01-01 12:00Z') is distinct from 1
    or pg_temp.resource_peak_units(v_resource,'2030-01-01 10:30Z','2030-01-01 11:30Z') is distinct from 1 then
    raise exception 'smoke_failed: grouped_endpoint_deltas';
  end if;
  insert into pg_temp.native_resource_smoke_results values('grouped_endpoint_deltas');

  -- Three overlapping-range rows can still have a simultaneous peak of TWO.
  insert into pg_temp.appointment_resource_reservations values
    (3,v_other_appointment,v_business,v_branch,v_resource,'2030-01-01 10:30Z','2030-01-01 11:30Z',null);
  if pg_temp.resource_peak_units(v_resource,'2030-01-01 10:00Z','2030-01-01 12:00Z') is distinct from 2 then
    raise exception 'smoke_failed: overlap_peak';
  end if;
  insert into pg_temp.native_resource_smoke_results values('overlap_peak');

  truncate pg_temp.appointment_resource_reservations;
  insert into pg_temp.business_resources values(v_resource,v_business,v_branch,2,true);
  insert into pg_temp.appointments values(v_appointment,v_business,v_branch,'2030-01-01 10:00Z','2030-01-01 11:00Z');
  insert into pg_temp.appointment_items values(1,v_appointment,v_business,v_service);
  insert into pg_temp.service_resources values(v_service,v_resource,1);
  insert into pg_temp.appointment_resource_reservations values
    (1,v_appointment,v_business,v_branch,v_resource,'2030-01-01 10:00Z','2030-01-01 11:00Z',null),
    (2,v_other_appointment,v_business,v_branch,v_resource,'2030-01-01 11:00Z','2030-01-01 12:00Z',null);

  update pg_temp.appointments set starts_at='2030-01-01 12:00Z',ends_at='2030-01-01 13:00Z' where id=v_appointment;
  if not exists(select 1 from pg_temp.appointments where id=v_appointment and starts_at='2030-01-01 12:00Z' and ends_at='2030-01-01 13:00Z')
    or not exists(select 1 from pg_temp.appointment_resource_reservations where id=1 and starts_at='2030-01-01 12:00Z' and ends_at='2030-01-01 13:00Z')
    or (select count(*) from pg_temp.appointment_resource_reservations where appointment_id=v_appointment)<>1 then
    raise exception 'smoke_failed: successful_hold_retime';
  end if;
  insert into pg_temp.native_resource_smoke_results values('successful_hold_retime');

  update pg_temp.business_resources set capacity=1 where id=v_resource;
  begin
    update pg_temp.appointments set starts_at='2030-01-01 11:15Z',ends_at='2030-01-01 12:15Z' where id=v_appointment;
    raise exception 'smoke_failed: capacity_conflict_not_rejected';
  exception when sqlstate '40001' then
    get stacked diagnostics v_message=message_text;
    if v_message<>'resource_conflict' then raise exception 'smoke_failed: capacity_conflict_signal %',v_message; end if;
  end;
  if not exists(select 1 from pg_temp.appointments where id=v_appointment and starts_at='2030-01-01 12:00Z' and ends_at='2030-01-01 13:00Z')
    or not exists(select 1 from pg_temp.appointment_resource_reservations where id=1 and starts_at='2030-01-01 12:00Z' and ends_at='2030-01-01 13:00Z') then
    raise exception 'smoke_failed: capacity_conflict_did_not_rollback';
  end if;
  insert into pg_temp.native_resource_smoke_results values('capacity_conflict_rollback');

  update pg_temp.service_resources set quantity=2 where resource_id=v_resource;
  begin
    update pg_temp.appointments set starts_at='2030-01-01 13:00Z',ends_at='2030-01-01 14:00Z' where id=v_appointment;
    raise exception 'smoke_failed: graph_change_not_rejected';
  exception when sqlstate '40001' then
    get stacked diagnostics v_message=message_text;
    if v_message<>'resource_graph_changed' then raise exception 'smoke_failed: graph_change_signal %',v_message; end if;
  end;
  if not exists(select 1 from pg_temp.appointments where id=v_appointment and starts_at='2030-01-01 12:00Z' and ends_at='2030-01-01 13:00Z')
    or not exists(select 1 from pg_temp.appointment_resource_reservations where id=1 and starts_at='2030-01-01 12:00Z' and ends_at='2030-01-01 13:00Z') then
    raise exception 'smoke_failed: graph_change_did_not_rollback';
  end if;
  insert into pg_temp.native_resource_smoke_results values('graph_change_40001_rollback');

  update pg_temp.service_resources set quantity=1 where resource_id=v_resource;
  update pg_temp.business_resources set capacity=2,active=false where id=v_resource;
  begin
    update pg_temp.appointments set starts_at='2030-01-01 13:00Z',ends_at='2030-01-01 14:00Z' where id=v_appointment;
    raise exception 'smoke_failed: inactive_resource_not_rejected';
  exception when sqlstate '40001' then
    get stacked diagnostics v_message=message_text;
    if v_message<>'resource_conflict' then raise exception 'smoke_failed: inactive_resource_signal %',v_message; end if;
  end;
  if not exists(select 1 from pg_temp.appointments where id=v_appointment and starts_at='2030-01-01 12:00Z' and ends_at='2030-01-01 13:00Z')
    or not exists(select 1 from pg_temp.appointment_resource_reservations where id=1 and starts_at='2030-01-01 12:00Z' and ends_at='2030-01-01 13:00Z') then
    raise exception 'smoke_failed: inactive_resource_did_not_rollback';
  end if;
  insert into pg_temp.native_resource_smoke_results values('inactive_resource_40001_rollback');
  update pg_temp.business_resources set active=true where id=v_resource;

  begin
    update pg_temp.appointments set branch_id=v_other_branch where id=v_appointment;
    raise exception 'smoke_failed: branch_change_not_rejected';
  exception when sqlstate '23514' then
    get stacked diagnostics v_message=message_text;
    if v_message<>'resource_scope_immutable' then raise exception 'smoke_failed: branch_scope_signal %',v_message; end if;
  end;
  begin
    update pg_temp.appointments set business_id=v_other_business where id=v_appointment;
    raise exception 'smoke_failed: business_change_not_rejected';
  exception when sqlstate '23514' then
    get stacked diagnostics v_message=message_text;
    if v_message<>'resource_scope_immutable' then raise exception 'smoke_failed: business_scope_signal %',v_message; end if;
  end;
  if not exists(select 1 from pg_temp.appointments where id=v_appointment and business_id=v_business and branch_id=v_branch)
    or not exists(select 1 from pg_temp.appointment_resource_reservations where id=1 and business_id=v_business and branch_id=v_branch) then
    raise exception 'smoke_failed: scope_guard_did_not_rollback';
  end if;
  insert into pg_temp.native_resource_smoke_results values('scope_guard_23514');

  truncate pg_temp.appointments,pg_temp.appointment_items,pg_temp.service_resources,pg_temp.business_resources,pg_temp.appointment_resource_reservations;
  insert into pg_temp.business_resources values(v_resource,v_business,v_branch,4,true);
  insert into pg_temp.appointments values(v_appointment,v_business,v_branch,'2030-01-01 10:00Z','2030-01-01 11:00Z');
  insert into pg_temp.appointment_items values(1,v_appointment,v_business,v_service),(2,v_appointment,v_business,v_service);
  insert into pg_temp.service_resources values(v_service,v_resource,2);
  insert into pg_temp.appointment_resource_reservations
    select unit,v_appointment,v_business,v_branch,v_resource,'2030-01-01 10:00Z'::timestamptz,'2030-01-01 11:00Z'::timestamptz,null
    from generate_series(1,4) unit;
  -- Two items requiring two units each must SUM to FOUR, not DISTINCT to TWO.
  update pg_temp.appointments set starts_at='2030-01-01 12:00Z',ends_at='2030-01-01 13:00Z' where id=v_appointment;
  if (select count(*) from pg_temp.appointment_resource_reservations where appointment_id=v_appointment and starts_at='2030-01-01 12:00Z' and ends_at='2030-01-01 13:00Z')<>4
    or pg_temp.resource_peak_units(v_resource,'2030-01-01 12:00Z','2030-01-01 13:00Z') is distinct from 4 then
    raise exception 'smoke_failed: repeated_item_quantity_sum';
  end if;
  insert into pg_temp.native_resource_smoke_results values('repeated_item_quantity_sum');

  if (select count(*) from pg_temp.native_resource_smoke_results)<>8 then raise exception 'smoke_failed: expected_8_checks'; end if;
  raise notice 'PASS: 8 isolated native resource engine checks; no public rows changed; next statement rolls back all test objects';
end $$;

select 'PASS: isolated temporary-table engine smoke; not concurrent acceptance' as result,
  count(*) as passed_checks,array_agg(check_name order by check_name) as checks
from pg_temp.native_resource_smoke_results;
rollback;
