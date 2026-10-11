-- Read-only metadata acceptance after 028, 029 and the default-grant fix 030.
-- Does not read customer/auth rows, change privileges, or execute business RPCs.
-- Every row must have passed=true. This is NOT JWT/RLS race/load acceptance.
with expected_functions(signature,authenticated_execute) as (values
  ('public.manage_native_waitlist(uuid,uuid,text,jsonb,text)',true),
  ('public.native_waitlist_management_ready(uuid,uuid)',true),
  ('public.join_customer_waitlist(uuid,uuid,uuid,uuid,timestamptz,timestamptz)',true),
  ('public.accept_customer_waitlist_offer(uuid)',true),
  ('public.get_my_waitlist_entries()',true),
  ('public.offer_next_waitlist_entry(uuid,uuid,timestamptz,integer)',false),
  ('public.manage_business_resource(uuid,uuid,text,uuid,jsonb)',true),
  ('public.native_resource_management_ready(uuid)',true),
  ('public.get_resource_usage_summary(uuid,uuid,uuid,timestamptz,timestamptz)',true),
  ('public.resource_peak_units(uuid,timestamptz,timestamptz)',false),
  ('public.guard_resource_definition()',false),
  ('public.guard_service_resource_link()',false),
  ('public.reserve_resources_for_appointment_item()',false),
  ('public.retime_appointment_resource_reservations()',false)
), functions as (
  select e.*,to_regprocedure(signature) as oid from expected_functions e
), expected_constraints(table_name,constraint_name) as (values
  ('waitlist_entries','waitlist_tenant_branch_fk'),
  ('waitlist_entries','waitlist_tenant_customer_fk'),
  ('waitlist_entries','waitlist_tenant_service_fk'),
  ('waitlist_entries','waitlist_tenant_employee_fk'),
  ('business_resources','resources_tenant_branch_fk'),
  ('service_resources','resource_links_tenant_service_fk'),
  ('service_resources','resource_links_tenant_resource_fk'),
  ('appointment_resource_reservations','resource_reservations_tenant_resource_fk'),
  ('appointment_resource_reservations','resource_reservations_tenant_appointment_fk')
), constraints as (
  select e.*,c.oid,c.convalidated from expected_constraints e
  left join pg_constraint c on c.conrelid=to_regclass('public.'||e.table_name)
    and c.conname=e.constraint_name and c.contype='f'
), old_constraints(table_name,constraint_name) as (values
  ('waitlist_entries','waitlist_entries_branch_id_fkey'),
  ('waitlist_entries','waitlist_entries_customer_id_fkey'),
  ('waitlist_entries','waitlist_entries_service_id_fkey'),
  ('waitlist_entries','waitlist_entries_employee_id_fkey'),
  ('business_resources','business_resources_branch_id_fkey'),
  ('service_resources','service_resources_service_id_fkey'),
  ('service_resources','service_resources_resource_id_fkey'),
  ('appointment_resource_reservations','appointment_resource_reservations_resource_id_fkey'),
  ('appointment_resource_reservations','appointment_resource_reservations_appointment_id_fkey')
), expected_triggers(table_name,trigger_name,function_signature) as (values
  ('business_resources','resource_definition_guard','public.guard_resource_definition()'),
  ('service_resources','service_resource_link_guard','public.guard_service_resource_link()'),
  ('appointments','appointment_resource_retime_guard','public.retime_appointment_resource_reservations()'),
  ('appointment_items','appointment_item_reserve_resources','public.reserve_resources_for_appointment_item()')
), triggers as (
  select e.*,t.oid,t.tgenabled,t.tgfoid from expected_triggers e
  left join pg_trigger t on t.tgrelid=to_regclass('public.'||e.table_name)
    and t.tgname=e.trigger_name and not t.tgisinternal
), expected_tables(table_name,authenticated_select) as (values
  ('waitlist_entries',true),('business_resources',true),('service_resources',true),
  ('appointment_resource_reservations',true),('native_waitlist_requests',false)
), protected_tables as (
  select e.*,c.oid,c.relrowsecurity from expected_tables e
  left join pg_class c on c.oid=to_regclass('public.'||e.table_name)
), checks(check_name,result,passed) as (
  select '01 migration history',count(*)::text||'/3',count(*)=3
  from supabase_migrations.schema_migrations where version in('202610100028','202610100029','202610110030')
  union all select '02 RPC/helper execute ACL',count(*)::text||'/14',count(*)=14
  from functions where oid is not null
    and has_function_privilege('authenticated',oid,'EXECUTE')=authenticated_execute
    and not has_function_privilege('anon',oid,'EXECUTE')
  union all select '03 validated tenant foreign keys',count(*)::text||'/9',count(*)=9
  from constraints where oid is not null and convalidated
  union all select '04 old ambiguous foreign keys',count(*)::text,count(*)=0
  from old_constraints e join pg_constraint c on c.conrelid=to_regclass('public.'||e.table_name) and c.conname=e.constraint_name
  union all select '05 enabled correct triggers',count(*)::text||'/4',count(*)=4
  from triggers where oid is not null and tgenabled in('O','A') and tgfoid=to_regprocedure(function_signature)
  union all select '06 RLS enabled protected tables',count(*)::text||'/5',count(*)=5
  from protected_tables where oid is not null and relrowsecurity
  union all select '07 authenticated SELECT ACL',count(*)::text||'/5',count(*)=5
  from protected_tables where oid is not null and has_table_privilege('authenticated',oid,'SELECT')=authenticated_select
  union all select '08 anonymous table/column reads',count(*)::text,count(*)=0
  from protected_tables where oid is not null and (has_table_privilege('anon',oid,'SELECT') or has_any_column_privilege('anon',oid,'SELECT'))
  union all select '09 raw write/maintenance privileges',count(*)::text,count(*)=0
  from protected_tables p cross join (values('anon'),('authenticated')) r(role_name)
  where p.oid is not null and has_table_privilege(r.role_name,p.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
  union all select '10 raw column write privileges',count(*)::text,count(*)=0
  from protected_tables p cross join (values('anon'),('authenticated')) r(role_name)
  where p.oid is not null and has_any_column_privilege(r.role_name,p.oid,'INSERT,UPDATE,REFERENCES')
  union all select '11 private replay ledger grants',count(*)::text,count(*)=0
  from protected_tables p cross join (values('anon'),('authenticated')) r(role_name)
  where p.table_name='native_waitlist_requests' and p.oid is not null
    and (has_table_privilege(r.role_name,p.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
      or has_any_column_privilege(r.role_name,p.oid,'SELECT,INSERT,UPDATE,REFERENCES'))
  union all select '12 active waitlist unique index',count(*)::text||'/1',count(*)=1
  from pg_index where indexrelid=to_regclass('public.waitlist_active_customer_service_key')
    and indisvalid and indisunique and pg_get_expr(indpred,indrelid) like '%waiting%'
    and pg_get_expr(indpred,indrelid) like '%offered%'
)
select check_name,result,passed from checks order by check_name;
