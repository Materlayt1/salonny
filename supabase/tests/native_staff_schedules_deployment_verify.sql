-- Read-only catalog acceptance for 031. Does not mutate real or temporary data.
-- These checks prove installation/ACL/constraint shape, not real JWT or load GO.
with expected(signature,client_callable,definer) as(values
  ('public.parse_employee_schedule_period(jsonb,boolean)',false,false),
  ('public.employee_schedule_dates_overlap(smallint,date,date,date,date)',false,false),
  ('public.manage_employee_schedule_period(uuid,uuid,uuid,text,uuid,jsonb,jsonb)',true,true),
  ('public.set_employee_branch_assignment(uuid,uuid,uuid,boolean,boolean)',true,true),
  ('public.guard_employee_branch_assignment()',false,true),
  ('public.guard_staff_assignment_parent_scope()',false,true),
  ('public.guard_appointment_employee_assignment()',false,true),
  ('public.save_employee_weekly_schedule(uuid,uuid,jsonb)',true,true),
  ('public.native_staff_schedules_ready(uuid)',true,false)
), procedures as(
  select e.*,p.oid,p.prosecdef,p.proconfig,p.proacl,p.proowner
  from expected e left join pg_catalog.pg_proc p on p.oid=to_regprocedure(e.signature)
), checks as(
  select 'nine_installed_function_signatures' check_name,count(oid)=9 passed from procedures
  union all select 'explicit_authenticated_only_entry_points',coalesce(bool_and(
    oid is not null and has_function_privilege('authenticated',oid,'EXECUTE')=client_callable
      and not has_function_privilege('anon',oid,'EXECUTE')
      and not exists(select 1 from aclexplode(coalesce(proacl,acldefault('f',proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')
  ),false) from procedures
  union all select 'definer_and_fixed_search_paths',coalesce(bool_and(oid is not null and prosecdef=definer and exists(select 1 from unnest(proconfig) c where c like 'search_path=%')),false) from procedures
  union all select 'four_validated_schedule_constraints',count(*)=4 and coalesce(bool_and(convalidated),false)
    from pg_catalog.pg_constraint where conrelid='public.employee_working_hours'::regclass
      and conname in('employee_hours_tenant_employee_fk','employee_hours_tenant_branch_fk','employee_hours_assignment_fk','employee_hours_finite_dates_check')
  union all select 'hours_rls_retained',(select relrowsecurity from pg_catalog.pg_class where oid='public.employee_working_hours'::regclass)
  union all select 'hours_anon_and_authenticated_reads_retained',has_table_privilege('anon','public.employee_working_hours','SELECT') and has_table_privilege('authenticated','public.employee_working_hours','SELECT')
  union all select 'raw_hours_table_and_column_writes_closed',not exists(
    select 1 from pg_catalog.pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    where c.oid='public.employee_working_hours'::regclass and a.privilege_type<>'SELECT'
      and a.grantee in(0,(select oid from pg_catalog.pg_roles where rolname='anon'),(select oid from pg_catalog.pg_roles where rolname='authenticated'))
  ) and not exists(
    select 1 from pg_catalog.pg_attribute c cross join lateral aclexplode(c.attacl) a
    where c.attrelid='public.employee_working_hours'::regclass and a.privilege_type<>'SELECT'
      and a.grantee in(0,(select oid from pg_catalog.pg_roles where rolname='anon'),(select oid from pg_catalog.pg_roles where rolname='authenticated'))
  )
  union all select 'assignment_guard_installed',exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.employee_branches'::regclass and tgname='employee_branch_assignment_guard' and tgenabled='O' and tgfoid=to_regprocedure('public.guard_employee_branch_assignment()') and not tgisinternal)
  union all select 'booking_assignment_guard_installed',exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.appointments'::regclass and tgname='appointment_employee_assignment_guard' and tgenabled='O' and tgfoid=to_regprocedure('public.guard_appointment_employee_assignment()') and not tgisinternal)
  union all select 'employee_parent_tenant_guard_installed',exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.employees'::regclass and tgname='employee_assignment_parent_scope_guard' and tgenabled='O' and tgfoid=to_regprocedure('public.guard_staff_assignment_parent_scope()') and not tgisinternal)
  union all select 'branch_parent_tenant_guard_installed',exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.branches'::regclass and tgname='branch_assignment_parent_scope_guard' and tgenabled='O' and tgfoid=to_regprocedure('public.guard_staff_assignment_parent_scope()') and not tgisinternal)
  union all select 'active_appointment_lookup_index_valid',exists(select 1 from pg_catalog.pg_index where indexrelid=to_regclass('public.appointments_employee_branch_live_end_idx') and indisvalid and indpred is not null)
)
select check_name,case when passed then 'PASS' else 'FAIL' end result from checks order by check_name;
