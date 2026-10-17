-- Read-only catalogue gate. Run after 040 -> verified app deployment -> 041.
-- This does not replace separate real-JWT owner/manager/employee acceptance.
with private_tables as (
 select unnest(array['appointments','appointment_items','customers','payments','inventory_products','inventory_transactions','data_import_jobs','conversations','messages']) name
), views as (
 select unnest(array['business_calendar_appointments','business_inventory_access','business_customer_totals']) name
), checks as (
 select 'panel_query_indexes_valid' check_name,count(*)=3 and bool_and(i.indisvalid and i.indisready) passed from pg_index i
 where i.indexrelid in(to_regclass('public.employees_active_user_scope_idx'),to_regclass('public.appointments_panel_branch_order_idx'),to_regclass('public.appointments_panel_employee_order_idx'))
 union all
 select 'private_tables_rls_enabled' check_name,count(c.oid)=9 and bool_and(c.relrowsecurity) passed
 from private_tables t left join pg_class c on c.oid=to_regclass('public.'||t.name)
 union all
 select 'restrictive_private_access_ceilings',count(*)=9 from pg_policies
 where schemaname='public' and policyname in('private_appointments_read_ceiling','private_appointment_items_read_ceiling','private_customers_ceiling','private_payments_read_ceiling','private_inventory_ceiling','private_inventory_movements_read_ceiling','private_import_jobs_read_ceiling','private_conversations_ceiling','private_messages_ceiling')
 and permissive='RESTRICTIVE' and roles=array['authenticated']::name[]
 union all
 select 'scoped_views_security_barriers',count(c.oid)=3 and bool_and(c.relkind='v' and c.reloptions @> array['security_barrier=true'] and not coalesce(c.reloptions @> array['security_invoker=true'],false) and pg_get_userbyid(c.relowner) not in('anon','authenticated'))
 from views v left join pg_class c on c.oid=to_regclass('public.'||v.name)
 union all
 select 'scoped_views_select_only',count(*)=3 and bool_and(has_table_privilege('authenticated','public.'||v.name,'SELECT') and not has_table_privilege('authenticated','public.'||v.name,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') and not has_table_privilege('anon','public.'||v.name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) from views v
 union all
 select 'private_anonymous_table_access_closed',not exists(select 1 from private_tables t where has_table_privilege('anon','public.'||t.name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
 union all
 select 'private_anonymous_column_access_closed',not exists(select 1 from private_tables t join pg_class c on c.oid=to_regclass('public.'||t.name) join pg_attribute a on a.attrelid=c.oid
   where a.attnum>0 and not a.attisdropped and has_column_privilege('anon',c.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES'))
 union all
 select 'client_maintenance_privileges_closed',not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join unnest(array['anon','authenticated']) r(role_name)
   where n.nspname='public' and c.relkind in('r','p','v','m','f') and has_table_privilege(r.role_name,c.oid,'TRUNCATE,REFERENCES,TRIGGER'))
 union all
 select 'client_column_reference_grants_closed',not exists(select 1 from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace cross join unnest(array['anon','authenticated']) r(role_name)
   where n.nspname='public' and c.relkind in('r','p','v','m','f') and a.attnum>0 and not a.attisdropped and has_column_privilege(r.role_name,c.oid,a.attnum,'REFERENCES'))
 union all
 select 'immutable_raw_mutations_closed',not exists(select 1 from unnest(array['appointments','appointment_items','payments','inventory_transactions','data_import_jobs']) t(name) where has_table_privilege('authenticated','public.'||t.name,'INSERT,UPDATE,DELETE'))
 union all
 select 'legacy_import_entry_point_closed',not has_function_privilege('authenticated','public.bulk_import_customers(jsonb)','EXECUTE') and not has_function_privilege('anon','public.bulk_import_customers(jsonb)','EXECUTE')
 union all
 select 'guarded_panel_rpc_acl',bool_and(has_function_privilege('authenticated',f.signature,'EXECUTE') and not has_function_privilege('anon',f.signature,'EXECUTE')) from unnest(array['public.import_business_customers(uuid,jsonb)','public.business_update_appointment_status(uuid,public.appointment_state)','public.adjust_inventory_stock(uuid,numeric,text)','public.create_staff_appointment_series(uuid,uuid,uuid,uuid,timestamptz,integer,integer,integer,text)']) f(signature)
 union all
 select 'customer_identity_guard_installed',exists(select 1 from pg_trigger where tgrelid='public.customers'::regclass and tgname='customer_account_identity_guard' and tgenabled='O' and not tgisinternal)
 union all
 select 'identity_helpers_not_client_callable',not has_function_privilege('authenticated','public.customer_identity_phone_key(text)','EXECUTE') and not has_function_privilege('authenticated','public.guard_customer_account_identity()','EXECUTE') and not has_function_privilege('anon','public.guard_customer_account_identity()','EXECUTE')
)
select check_name,case when passed is true then 'PASS' else 'FAIL' end result from checks order by check_name;
