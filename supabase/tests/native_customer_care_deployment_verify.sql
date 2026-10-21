-- Read-only catalog checks. No private care/customer/media contents returned.
with expected(signature,exposed,body_md5) as(values
 ('public.customer_care_context(uuid,boolean)',false,'65514ca3b2aef5862bf6841c0b471814'),
 ('public.assert_customer_care_access(uuid,uuid,boolean)',false,'b27235fc67d953ef69b00838d8bd4147'),
 ('public.can_access_customer_care(uuid,uuid)',true,'55ba91d23fe4517304e817a382958118'),
 ('public.customer_care_path_access(text,boolean)',true,'15e4a7360f9ee41932bb72882a67a728'),
 ('public.record_customer_loyalty_change()',false,'42edfe39f874ad8669f4b793b5771691'),
 ('public.save_customer_care_atomic(uuid,uuid,timestamptz,text[],text,text,text,text)',true,'31171be3644a946c65bd7b6acd298247'),
 ('public.register_customer_care_media_atomic(uuid,uuid,text,text,text)',true,'bcec4db3a079f3ba12aafd9bc46a3d66'),
 ('public.native_customer_care_directory(uuid,uuid,text,integer)',true,'2fde3266f330670bea3096272f404bf9'),
 ('public.native_customer_care(uuid,uuid,uuid,text,integer)',true,'ca2acbccd492b359e83eafc2819d0786')
), procedures as(select e.*,p.oid,p.proacl,p.proowner,p.prosrc,p.proconfig,p.prosecdef from expected e left join pg_catalog.pg_proc p on p.oid=to_regprocedure(e.signature)),
care_tables(name) as(values('customer_care_profiles'),('customer_care_media'),('loyalty_accounts'),('loyalty_point_movements'))
select check_name,case when coalesce(ok,false) then 'PASS' else 'FAIL' end result from (
 select 'nine exact functions and JWT-only ACLs' check_name,count(oid)=9 and bool_and(prosecdef and proconfig @> array['search_path=""']
  and has_function_privilege('authenticated',oid,'EXECUTE')=exposed and not has_function_privilege('anon',oid,'EXECUTE')
  and not exists(select 1 from aclexplode(coalesce(proacl,acldefault('f',proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')) ok from procedures
 union all select 'nine function sources match repository',count(oid)=9 and bool_and(md5(regexp_replace(replace(prosrc,chr(13),''),'^[[:space:]]+|[[:space:]]+$','','g'))=body_md5) from procedures
 union all select 'four care tables RLS enabled',count(c.oid)=4 and bool_and(c.relrowsecurity) from care_tables t left join pg_class c on c.oid=to_regclass('public.'||t.name)
 union all select 'care direct writes including column grants sealed',bool_and(not(has_table_privilege('authenticated','public.'||name,'INSERT') or has_table_privilege('authenticated','public.'||name,'UPDATE') or has_table_privilege('authenticated','public.'||name,'DELETE')
  or has_any_column_privilege('authenticated','public.'||name,'INSERT') or has_any_column_privilege('authenticated','public.'||name,'UPDATE') or has_table_privilege('anon','public.'||name,'SELECT'))) from care_tables
 union all select 'four tenant/customer FKs validated',count(*)=4 and bool_and(convalidated and contype='f') from pg_constraint where conname in('customer_care_profiles_care_tenant_customer_fk','customer_care_media_care_tenant_customer_fk','loyalty_accounts_care_tenant_customer_fk','loyalty_point_movements_care_tenant_customer_fk') and connamespace='public'::regnamespace
 union all select 'four scoped care read policies',count(*)=4 and bool_and(cmd='SELECT' and qual like '%can_access_customer_care%') from pg_policies where schemaname='public' and policyname in('care_profiles_scoped_read','care_media_scoped_read','loyalty_scoped_read','loyalty_movements_scoped_read')
 union all select 'legacy broad care policies removed',not exists(select 1 from pg_policies where schemaname='public' and policyname in('care_profiles_tenant','care_media_tenant','loyalty_tenant'))
 union all select 'private bucket remains private',exists(select 1 from storage.buckets where id='customer-care-assets' and not public)
 union all select 'three scoped private storage policies',count(*)=3 and bool_and(coalesce(qual,with_check) like '%customer_care_path_access%') from pg_policies where schemaname='storage' and tablename='objects' and policyname in('customer_care_assets_scoped_read','customer_care_assets_manager_insert','customer_care_assets_manager_delete')
 union all select 'legacy broad storage policies removed',not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname in('customer_care_assets_member_read','customer_care_assets_member_insert','customer_care_assets_member_delete'))
 union all select 'future-only loyalty trigger enabled',exists(select 1 from pg_trigger where tgrelid='public.loyalty_accounts'::regclass and tgname='customer_loyalty_movement_record' and tgenabled='O' and tgfoid='public.record_customer_loyalty_change()'::regprocedure)
 union all select 'seven care directory/history indexes valid',count(*)=7 and bool_and(indisvalid) from pg_index where indexrelid in(to_regclass('public.customers_business_id_id_care_key'),to_regclass('public.loyalty_movements_customer_order_idx'),to_regclass('public.customer_care_appointment_history_idx'),to_regclass('public.customer_care_assigned_directory_idx'),to_regclass('public.customer_care_directory_order_idx'),to_regclass('public.customer_care_media_storage_path_key'),to_regclass('public.customer_care_delivery_payload_idx'))
 union all select 'private media path constraint validated',exists(select 1 from pg_constraint where conrelid='public.customer_care_media'::regclass and conname='customer_care_media_path_scope_check' and contype='c' and convalidated)
) checks order by check_name;
