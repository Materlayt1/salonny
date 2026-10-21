-- Serial PostgreSQL-engine acceptance of deployed 031 bodies, isolated in temp
-- tables. Never writes public/auth/customer/appointment rows, roles or grants.
-- Clone substitutions are ONLY public. -> pg_temp. and auth.uid() -> a private
-- temporary fixture identity. This is not actual JWT/RLS/concurrency acceptance.
-- Execute as one session/batch AFTER installing migration 031. Always ROLLBACK.
begin;

create temporary table employees(id uuid primary key,business_id uuid not null,active boolean not null,unique(business_id,id));
create temporary table branches(id uuid primary key,business_id uuid not null,active boolean not null,unique(business_id,id));
create temporary table business_members(business_id uuid not null,user_id uuid not null,active boolean not null,role text not null,primary key(business_id,user_id));
create temporary table employee_branches(employee_id uuid not null references pg_temp.employees(id),branch_id uuid not null references pg_temp.branches(id),primary key(employee_id,branch_id));
create temporary table employee_working_hours(
  id uuid primary key default gen_random_uuid(),business_id uuid not null,branch_id uuid not null,employee_id uuid not null,
  weekday smallint not null check(weekday between 0 and 6),starts_at time not null,ends_at time not null,valid_from date,valid_until date,
  check(starts_at<ends_at),check(valid_from is null or valid_until is null or valid_from<=valid_until),
  foreign key(business_id,employee_id) references pg_temp.employees(business_id,id),
  foreign key(business_id,branch_id) references pg_temp.branches(business_id,id),
  foreign key(employee_id,branch_id) references pg_temp.employee_branches(employee_id,branch_id) on delete restrict
);
create temporary table appointments(id uuid primary key,business_id uuid not null,employee_id uuid not null,branch_id uuid not null,status text not null,starts_at timestamptz not null,ends_at timestamptz not null);
create temporary table native_staff_schedule_smoke_results(check_name text primary key);

create function pg_temp.staff_smoke_uid() returns uuid language sql stable as $$ select nullif(current_setting('salonny.staff_smoke_actor',true),'')::uuid $$;
create function pg_temp.staff_smoke_expect_error(p_sql text,p_marker text) returns void language plpgsql as $$
declare v_message text;
begin
  begin execute p_sql;
  exception when others then
    get stacked diagnostics v_message=message_text;
    if v_message=p_marker then return; end if;
    raise exception 'smoke_wrong_error: expected %, received %',p_marker,v_message;
  end;
  raise exception 'smoke_missing_error: %',p_marker;
end $$;

do $$ declare v_signature text; v_oid oid; v_definition text; v_source text; v_cloned text; v_temp_signature text;
begin
  foreach v_signature in array array[
    'public.parse_employee_schedule_period(jsonb,boolean)',
    'public.employee_schedule_dates_overlap(smallint,date,date,date,date)',
    'public.manage_employee_schedule_period(uuid,uuid,uuid,text,uuid,jsonb,jsonb)',
    'public.set_employee_branch_assignment(uuid,uuid,uuid,boolean,boolean)',
    'public.guard_employee_branch_assignment()',
    'public.guard_staff_assignment_parent_scope()',
    'public.guard_appointment_employee_assignment()',
    'public.save_employee_weekly_schedule(uuid,uuid,jsonb)',
    'public.native_staff_schedules_ready(uuid)'
  ] loop
    v_oid:=to_regprocedure(v_signature);
    if v_oid is null then raise exception 'smoke_prerequisite_missing: %',v_signature; end if;
    v_temp_signature:=replace(v_signature,'public.','pg_temp.');
    if to_regprocedure(v_temp_signature) is not null then raise exception 'smoke_temp_function_collision: %',v_signature; end if;
    select prosrc into v_source from pg_catalog.pg_proc where oid=v_oid;
    v_definition:=replace(replace(pg_catalog.pg_get_functiondef(v_oid),'public.','pg_temp.'),'auth.uid()','pg_temp.staff_smoke_uid()');
    v_definition:=regexp_replace(v_definition,'SET search_path TO [^\n]*','SET search_path TO ''pg_temp''','i');
    v_definition:=regexp_replace(v_definition,'SECURITY DEFINER','SECURITY INVOKER','i');
    if v_definition ~* '\mpublic\M' or v_definition ~* '\m(auth|storage|extensions)\.' or v_definition not like 'CREATE OR REPLACE FUNCTION pg_temp.%'
    then raise exception 'smoke_clone_scope_not_isolated: %',v_signature; end if;
    execute v_definition;
    select prosrc into v_cloned from pg_catalog.pg_proc where oid=to_regprocedure(v_temp_signature);
    if v_cloned is distinct from replace(replace(v_source,'public.','pg_temp.'),'auth.uid()','pg_temp.staff_smoke_uid()') then raise exception 'smoke_clone_body_changed: %',v_signature; end if;
  end loop;
end $$;

create trigger staff_smoke_assignment before insert or update or delete on pg_temp.employee_branches for each row execute function pg_temp.guard_employee_branch_assignment();
create trigger staff_smoke_employee_parent before update of business_id on pg_temp.employees for each row execute function pg_temp.guard_staff_assignment_parent_scope();
create trigger staff_smoke_branch_parent before update of business_id on pg_temp.branches for each row execute function pg_temp.guard_staff_assignment_parent_scope();
create trigger staff_smoke_booking before insert or update of status,starts_at,ends_at,employee_id,branch_id,business_id on pg_temp.appointments for each row execute function pg_temp.guard_appointment_employee_assignment();

do $$
declare
  v_business constant uuid:='61000000-0000-4000-8000-000000000001';
  v_other_business constant uuid:='61000000-0000-4000-8000-000000000002';
  v_employee constant uuid:='61000000-0000-4000-8000-000000000003';
  v_branch constant uuid:='61000000-0000-4000-8000-000000000004';
  v_second_branch constant uuid:='61000000-0000-4000-8000-000000000005';
  v_foreign_branch constant uuid:='61000000-0000-4000-8000-000000000006';
  v_actor constant uuid:='61000000-0000-4000-8000-000000000007';
  v_period_id constant uuid:='61000000-0000-4000-8000-000000000008';
  v_second_period_id constant uuid:='61000000-0000-4000-8000-000000000009';
  v_appointment_id constant uuid:='61000000-0000-4000-8000-000000000010';
  v_legacy_empty_period_id constant uuid:='61000000-0000-4000-8000-000000000011';
  v_period jsonb:='{"weekday":0,"startsAt":"09:00:00.123456","endsAt":"12:00:00.654321","validFrom":"2030-01-01","validUntil":"2030-01-31"}';
  v_expected jsonb; v_result jsonb; v_sql text; v_bad jsonb; v_bad_text text; v_parsed record;
begin
  insert into pg_temp.employees values(v_employee,v_business,true);
  insert into pg_temp.branches values(v_branch,v_business,true),(v_second_branch,v_business,true),(v_foreign_branch,v_other_business,true);
  insert into pg_temp.business_members values(v_business,v_actor,true,'OWNER');
  perform set_config('salonny.staff_smoke_actor',v_actor::text,true);

  select * into v_parsed from pg_temp.parse_employee_schedule_period(v_period);
  if v_parsed.starts_at is distinct from '09:00:00.123456'::time or v_parsed.ends_at is distinct from '12:00:00.654321'::time then raise exception 'smoke_failed: full_time_precision'; end if;
  foreach v_bad_text in array array['24:00','09:60','09:00:60','09:00:00.1234567','9:00','09:00Z','09:00:00+03'] loop
    v_bad:=jsonb_set(v_period,'{startsAt}',to_jsonb(v_bad_text));
    perform pg_temp.staff_smoke_expect_error(format('select * from pg_temp.parse_employee_schedule_period(%L::jsonb)',v_bad::text),'INVALID_SCHEDULE');
  end loop;
  foreach v_bad in array array[
    v_period||'{"weekday":"0"}'::jsonb,v_period||'{"weekday":7}'::jsonb,v_period||'{"startsAt":null}'::jsonb,
    v_period||'{"validFrom":"2030-02-30"}'::jsonb,v_period||'{"validFrom":"0000-01-01"}'::jsonb,
    v_period||'{"validFrom":"2030-02-01"}'::jsonb,v_period||'{"validUntil":123}'::jsonb,
    v_period||'{"validUntil":"2030-01-03"}'::jsonb,
    v_period||'{"unknown":true}'::jsonb,v_period-'validFrom',v_period||'{"endsAt":"08:00"}'::jsonb
  ] loop perform pg_temp.staff_smoke_expect_error(format('select * from pg_temp.parse_employee_schedule_period(%L::jsonb)',v_bad::text),'INVALID_SCHEDULE'); end loop;
  insert into pg_temp.native_staff_schedule_smoke_results values('strict_types_calendar_and_microseconds');

  if pg_temp.employee_schedule_dates_overlap(0::smallint,'2030-01-01','2030-01-03','2030-01-01','2030-01-31') is distinct from false
    or pg_temp.employee_schedule_dates_overlap(0::smallint,'2030-01-07','2030-01-07','2030-01-01','2030-01-31') is distinct from true
    or pg_temp.employee_schedule_dates_overlap(0::smallint,'2030-01-01','2030-01-31','2030-02-01','2030-02-28') is distinct from false
    or pg_temp.employee_schedule_dates_overlap(0::smallint,null,null,'2030-01-01','2030-01-03') is distinct from false
    or pg_temp.employee_schedule_dates_overlap(0::smallint,null,null,null,'2030-01-03') is distinct from true
    or pg_temp.employee_schedule_dates_overlap(0::smallint,null,null,'2030-01-03',null) is distinct from true
  then raise exception 'smoke_failed: actual_weekday_occurrence'; end if;
  insert into pg_temp.native_staff_schedule_smoke_results values('inclusive_dates_actual_weekday_unbounded');

  perform set_config('salonny.staff_smoke_actor','',true);
  perform pg_temp.staff_smoke_expect_error(format('select pg_temp.manage_employee_schedule_period(%L,%L,%L,''create'',%L,null,%L::jsonb)',v_business,v_branch,v_employee,v_period_id,v_period::text),'FORBIDDEN');
  perform set_config('salonny.staff_smoke_actor',v_actor::text,true);
  update pg_temp.business_members set role='EMPLOYEE';
  perform pg_temp.staff_smoke_expect_error(format('select pg_temp.set_employee_branch_assignment(%L,%L,%L,true,false)',v_business,v_employee,v_branch),'FORBIDDEN');
  update pg_temp.business_members set role='OWNER',active=false;
  perform pg_temp.staff_smoke_expect_error(format('select pg_temp.set_employee_branch_assignment(%L,%L,%L,true,false)',v_business,v_employee,v_branch),'FORBIDDEN');
  update pg_temp.business_members set role='MANAGER',active=true;
  if pg_temp.native_staff_schedules_ready(v_business) is distinct from true or pg_temp.native_staff_schedules_ready(v_other_business) is distinct from false then raise exception 'smoke_failed: readiness_scope'; end if;
  insert into pg_temp.native_staff_schedule_smoke_results values('active_owner_manager_and_tenant_authorization');

  perform pg_temp.staff_smoke_expect_error(format('select pg_temp.set_employee_branch_assignment(%L,%L,%L,true,false)',v_business,v_employee,v_foreign_branch),'NOT_FOUND');
  perform pg_temp.staff_smoke_expect_error(format('insert into pg_temp.employee_branches values(%L,%L)',v_employee,v_foreign_branch),'INVALID_SCHEDULE');
  perform pg_temp.staff_smoke_expect_error(format('select pg_temp.manage_employee_schedule_period(%L,%L,%L,''create'',%L,null,%L::jsonb)',v_business,v_branch,v_employee,v_period_id,v_period::text),'BRANCH_NOT_ASSIGNED');
  v_result:=pg_temp.set_employee_branch_assignment(v_business,v_employee,v_branch,true,false);
  if v_result is distinct from jsonb_build_object('branchId',v_branch,'assigned',true) then raise exception 'smoke_failed: branch_assignment_result'; end if;
  perform pg_temp.staff_smoke_expect_error(format('select pg_temp.set_employee_branch_assignment(%L,%L,%L,false,false)',v_business,v_employee,v_branch),'STALE_SCHEDULE');
  perform pg_temp.staff_smoke_expect_error(format('update pg_temp.employee_branches set branch_id=%L where employee_id=%L',v_second_branch,v_employee),'INVALID_SCHEDULE');
  insert into pg_temp.native_staff_schedule_smoke_results values('assignment_scope_optimistic_and_immutable');

  perform pg_temp.staff_smoke_expect_error(format('update pg_temp.employees set business_id=%L where id=%L',v_other_business,v_employee),'INVALID_SCHEDULE');
  perform pg_temp.staff_smoke_expect_error(format('update pg_temp.branches set business_id=%L where id=%L',v_other_business,v_branch),'INVALID_SCHEDULE');
  update pg_temp.employees set business_id=v_business where id=v_employee;
  update pg_temp.branches set business_id=v_business where id=v_branch;
  if not exists(select 1 from pg_temp.employees where id=v_employee and business_id=v_business)
    or not exists(select 1 from pg_temp.branches where id=v_branch and business_id=v_business)
  then raise exception 'smoke_failed: parent_tenant_preserved'; end if;
  insert into pg_temp.native_staff_schedule_smoke_results values('linked_employee_and_branch_tenant_reparent_guard');

  v_result:=pg_temp.manage_employee_schedule_period(v_business,v_branch,v_employee,'create',v_period_id,null,v_period);
  if v_result->'period'->>'id' is distinct from v_period_id::text or v_result->'period'->>'startsAt' is distinct from '09:00:00.123456' or v_result->'period'->>'endsAt' is distinct from '12:00:00.654321' then raise exception 'smoke_failed: create_result'; end if;
  if pg_temp.manage_employee_schedule_period(v_business,v_branch,v_employee,'create',v_period_id,null,v_period) is distinct from v_result then raise exception 'smoke_failed: stable_create_replay'; end if;
  perform pg_temp.staff_smoke_expect_error(format('select pg_temp.manage_employee_schedule_period(%L,%L,%L,''create'',%L,null,%L::jsonb)',v_business,v_branch,v_employee,v_period_id,(v_period||'{"startsAt":"10:00"}'::jsonb)::text),'STALE_SCHEDULE');
  perform pg_temp.set_employee_branch_assignment(v_business,v_employee,v_second_branch,true,false);
  perform pg_temp.staff_smoke_expect_error(format('select pg_temp.manage_employee_schedule_period(%L,%L,%L,''create'',%L,null,%L::jsonb)',v_business,v_second_branch,v_employee,v_period_id,v_period::text),'STALE_SCHEDULE');
  insert into pg_temp.native_staff_schedule_smoke_results values('stable_id_replay_exact_scope_and_precision');

  perform pg_temp.staff_smoke_expect_error(format('select pg_temp.manage_employee_schedule_period(%L,%L,%L,''create'',%L,null,%L::jsonb)',v_business,v_branch,v_employee,v_second_period_id,(v_period||'{"startsAt":"11:00","endsAt":"13:00"}'::jsonb)::text),'SCHEDULE_OVERLAP');
  -- Adjacent half-open times and intersections without that weekday are valid.
  perform pg_temp.manage_employee_schedule_period(v_business,v_branch,v_employee,'create',v_second_period_id,null,v_period||'{"startsAt":"12:00:00.654321","endsAt":"14:00"}'::jsonb);
  -- A legacy empty-occurrence range stays readable/deletable but does not cause
  -- a false-positive overlap. New inputs cannot create such a useless period.
  insert into pg_temp.employee_working_hours(id,business_id,branch_id,employee_id,weekday,starts_at,ends_at,valid_from,valid_until)
    values(v_legacy_empty_period_id,v_business,v_branch,v_employee,0,'09:00','12:00','2030-01-01','2030-01-03');
  perform pg_temp.staff_smoke_expect_error(format('select pg_temp.manage_employee_schedule_period(%L,%L,%L,''update'',%L,%L::jsonb,%L::jsonb)',v_business,v_branch,v_employee,v_second_period_id,(v_period||'{"startsAt":"12:00:00.654321","endsAt":"14:00"}'::jsonb)::text,(v_period||'{"startsAt":"11:00","endsAt":"14:00"}'::jsonb)::text),'SCHEDULE_OVERLAP');
  if (select count(*) from pg_temp.employee_working_hours)<>3 then raise exception 'smoke_failed: nonconflicting_periods'; end if;
  if not exists(select 1 from pg_temp.employee_working_hours where id=v_second_period_id and starts_at='12:00:00.654321'::time) then raise exception 'smoke_failed: overlapping_update_preserved'; end if;
  insert into pg_temp.native_staff_schedule_smoke_results values('overlap_rejection_touching_times_nonoccurring_weekday');

  v_expected:=v_period;
  v_period:=v_period||'{"startsAt":"08:30"}'::jsonb;
  perform pg_temp.manage_employee_schedule_period(v_business,v_branch,v_employee,'update',v_period_id,v_expected,v_period);
  perform pg_temp.staff_smoke_expect_error(format('select pg_temp.manage_employee_schedule_period(%L,%L,%L,''delete'',%L,%L::jsonb,null)',v_business,v_branch,v_employee,v_period_id,v_expected::text),'STALE_SCHEDULE');
  if not exists(select 1 from pg_temp.employee_working_hours where id=v_period_id and starts_at='08:30'::time) then raise exception 'smoke_failed: stale_preserved'; end if;
  v_expected:=v_period||'{"startsAt":"08:30:00.000000"}'::jsonb;
  v_result:=pg_temp.manage_employee_schedule_period(v_business,v_branch,v_employee,'delete',v_period_id,v_expected,null);
  if v_result is distinct from jsonb_build_object('deletedId',v_period_id) then raise exception 'smoke_failed: typed_delete_snapshot'; end if;
  perform pg_temp.staff_smoke_expect_error(format('select pg_temp.manage_employee_schedule_period(%L,%L,%L,''delete'',%L,%L::jsonb,null)',v_business,v_branch,v_employee,v_period_id,v_expected::text),'NOT_FOUND');
  insert into pg_temp.native_staff_schedule_smoke_results values('typed_expected_stale_preserves_and_missing_404');

  perform pg_temp.staff_smoke_expect_error(format('select pg_temp.set_employee_branch_assignment(%L,%L,%L,false,true)',v_business,v_employee,v_branch),'SCHEDULE_IN_USE');
  perform pg_temp.staff_smoke_expect_error(format('delete from pg_temp.employee_branches where employee_id=%L and branch_id=%L',v_employee,v_branch),'SCHEDULE_IN_USE');
  perform pg_temp.staff_smoke_expect_error(format('select pg_temp.save_employee_weekly_schedule(%L,%L,''[]''::jsonb)',v_employee,v_branch),'SCHEDULE_IN_USE');
  if (select count(*) from pg_temp.employee_working_hours)<>2 then raise exception 'smoke_failed: dated_schedule_preservation'; end if;
  insert into pg_temp.native_staff_schedule_smoke_results values('unlink_and_simple_weekly_preserve_dated_periods');

  v_expected:='{"weekday":0,"startsAt":"09:00:00","endsAt":"12:00:00","validFrom":"2030-01-01","validUntil":"2030-01-03"}'::jsonb;
  v_result:=pg_temp.manage_employee_schedule_period(v_business,v_branch,v_employee,'delete',v_legacy_empty_period_id,v_expected,null);
  if v_result is distinct from jsonb_build_object('deletedId',v_legacy_empty_period_id) or (select count(*) from pg_temp.employee_working_hours)<>1 then raise exception 'smoke_failed: empty_legacy_range_cleanup'; end if;
  insert into pg_temp.native_staff_schedule_smoke_results values('legacy_empty_weekday_snapshot_cleanup');

  delete from pg_temp.employee_working_hours;
  -- Legal pre-existing PostgreSQL midnight endpoint can be deleted with a full
  -- typed snapshot, but cannot be introduced through new create/update input.
  v_expected:='{"weekday":6,"startsAt":"18:00","endsAt":"24:00:00.000000","validFrom":null,"validUntil":null}'::jsonb;
  insert into pg_temp.employee_working_hours(id,business_id,branch_id,employee_id,weekday,starts_at,ends_at) values(v_period_id,v_business,v_branch,v_employee,6,'18:00','24:00');
  perform pg_temp.manage_employee_schedule_period(v_business,v_branch,v_employee,'delete',v_period_id,v_expected,null);
  perform pg_temp.staff_smoke_expect_error(format('select pg_temp.manage_employee_schedule_period(%L,%L,%L,''create'',%L,null,%L::jsonb)',v_business,v_branch,v_employee,v_period_id,v_expected::text),'INVALID_SCHEDULE');
  perform pg_temp.staff_smoke_expect_error(format('select * from pg_temp.parse_employee_schedule_period(%L::jsonb,true)',(v_expected||'{"endsAt":"24:00:01"}'::jsonb)::text),'INVALID_SCHEDULE');
  insert into pg_temp.native_staff_schedule_smoke_results values('legacy_midnight_snapshot_cleanup_only');

  perform pg_temp.save_employee_weekly_schedule(v_employee,v_branch,'[{"weekday":0,"startsAt":"09:00","endsAt":"12:00"}]'::jsonb);
  perform pg_temp.manage_employee_schedule_period(v_business,v_branch,v_employee,'create',v_period_id,null,'{"weekday":0,"startsAt":"13:00","endsAt":"17:00","validFrom":null,"validUntil":null}'::jsonb);
  perform pg_temp.staff_smoke_expect_error(format('select pg_temp.save_employee_weekly_schedule(%L,%L,''[]''::jsonb)',v_employee,v_branch),'SCHEDULE_IN_USE');
  if (select count(*) from pg_temp.employee_working_hours)<>2 then raise exception 'smoke_failed: multipart_preservation'; end if;
  delete from pg_temp.employee_working_hours;
  perform pg_temp.staff_smoke_expect_error(format('select pg_temp.save_employee_weekly_schedule(%L,%L,%L::jsonb)',v_employee,v_branch,'[{"weekday":0,"startsAt":"09:00","endsAt":"12:00"},{"weekday":0,"startsAt":"13:00","endsAt":"17:00"}]'),'INVALID_SCHEDULE');
  insert into pg_temp.native_staff_schedule_smoke_results values('multipart_legacy_guard_before_deletion');

  insert into pg_temp.appointments values(v_appointment_id,v_business,v_employee,v_branch,'confirmed',now()-interval '30 minutes',now()+interval '30 minutes');
  perform pg_temp.staff_smoke_expect_error(format('select pg_temp.set_employee_branch_assignment(%L,%L,%L,false,true)',v_business,v_employee,v_branch),'SCHEDULE_IN_USE');
  perform pg_temp.staff_smoke_expect_error(format('delete from pg_temp.employee_branches where employee_id=%L and branch_id=%L',v_employee,v_branch),'SCHEDULE_IN_USE');
  update pg_temp.appointments set status='cancelled';
  perform pg_temp.set_employee_branch_assignment(v_business,v_employee,v_branch,false,true);
  perform pg_temp.staff_smoke_expect_error(format('update pg_temp.appointments set status=''pending'' where id=%L',v_appointment_id),'BRANCH_NOT_ASSIGNED');
  perform pg_temp.staff_smoke_expect_error(format('insert into pg_temp.appointments values(%L,%L,%L,%L,''pending'',now()+interval ''1 hour'',now()+interval ''2 hours'')',gen_random_uuid(),v_business,v_employee,v_branch),'BRANCH_NOT_ASSIGNED');
  if not exists(select 1 from pg_temp.appointments where id=v_appointment_id and status='cancelled') then raise exception 'smoke_failed: booking_guard_rollback'; end if;
  insert into pg_temp.native_staff_schedule_smoke_results values('ongoing_booking_unlink_guard_and_future_status_guard');

  perform pg_temp.set_employee_branch_assignment(v_business,v_employee,v_branch,true,false);
  v_period:='{"weekday":1,"startsAt":"09:00","endsAt":"12:00","validFrom":null,"validUntil":null}'::jsonb;
  perform pg_temp.manage_employee_schedule_period(v_business,v_branch,v_employee,'create',v_period_id,null,v_period);
  update pg_temp.employees set active=false;
  perform pg_temp.staff_smoke_expect_error(format('select pg_temp.manage_employee_schedule_period(%L,%L,%L,''update'',%L,%L::jsonb,%L::jsonb)',v_business,v_branch,v_employee,v_period_id,v_period::text,v_period::text),'INVALID_SCHEDULE');
  perform pg_temp.manage_employee_schedule_period(v_business,v_branch,v_employee,'delete',v_period_id,v_period,null);
  update pg_temp.branches set active=false where id=v_branch;
  perform pg_temp.set_employee_branch_assignment(v_business,v_employee,v_branch,false,true);
  perform pg_temp.staff_smoke_expect_error(format('select pg_temp.set_employee_branch_assignment(%L,%L,%L,true,false)',v_business,v_employee,v_branch),'INVALID_SCHEDULE');
  perform pg_temp.set_employee_branch_assignment(v_business,v_employee,v_second_branch,false,true);
  perform pg_temp.set_employee_branch_assignment(v_business,v_employee,v_second_branch,true,false);
  if not exists(select 1 from pg_temp.employee_branches where employee_id=v_employee and branch_id=v_second_branch) then raise exception 'smoke_failed: inactive_staff_preparation'; end if;
  if (select count(*) from pg_temp.appointments)<>1 then raise exception 'smoke_failed: appointments_untouched'; end if;
  insert into pg_temp.native_staff_schedule_smoke_results values('inactive_cleanup_without_appointment_changes');
end $$;

select check_name,'PASS' result from pg_temp.native_staff_schedule_smoke_results order by check_name;
rollback;
