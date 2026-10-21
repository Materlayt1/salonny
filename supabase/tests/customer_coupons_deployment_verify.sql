-- Read-only installation acceptance, not real JWT/concurrency/booking acceptance.
with expected(signature,public_offer) as(values
  ('public.list_business_coupons(uuid)',true),
  ('public.quote_customer_coupon(uuid,uuid,uuid,uuid,text)',false),
  ('public.create_appointment_with_coupon(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text,text)',false)
), procedures as(
  select e.*,p.oid,p.prosecdef,p.proconfig,p.proacl,p.proowner
  from expected e left join pg_catalog.pg_proc p on p.oid=to_regprocedure(e.signature)
), checks as(
  select 'three_coupon_functions_installed' check_name,count(oid)=3 passed from procedures
  union all select 'only_offer_is_anonymous',coalesce(bool_and(oid is not null
    and has_function_privilege('authenticated',oid,'EXECUTE')
    and has_function_privilege('anon',oid,'EXECUTE')=public_offer
    and not exists(select 1 from aclexplode(coalesce(proacl,acldefault('f',proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')),false) from procedures
  union all select 'definers_use_fixed_search_path',coalesce(bool_and(oid is not null and prosecdef
    and exists(select 1 from unnest(proconfig) c where c like 'search_path=%')),false) from procedures
  union all select 'ledger_rls_enabled',(select relrowsecurity from pg_catalog.pg_class where oid=to_regclass('public.coupon_redemptions'))
  union all select 'ledger_has_no_client_table_or_column_access',not exists(
    select 1 from pg_catalog.pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    where c.oid=to_regclass('public.coupon_redemptions') and a.grantee in(0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated'))
  ) and not exists(
    select 1 from pg_catalog.pg_attribute c cross join lateral aclexplode(c.attacl) a
    where c.attrelid=to_regclass('public.coupon_redemptions') and a.grantee in(0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated'))
  )
  union all select 'three_once_constraints',count(*)=3 and coalesce(bool_and(convalidated and contype='u'),false)
    from pg_catalog.pg_constraint where conrelid=to_regclass('public.coupon_redemptions') and conname in('coupon_user_once','coupon_customer_once','coupon_appointment_once')
  union all select 'four_restrict_foreign_keys',count(*)=4 and coalesce(bool_and(convalidated and confdeltype='r'),false)
    from pg_catalog.pg_constraint where conrelid=to_regclass('public.coupon_redemptions') and contype='f'
  union all select 'normalized_code_index_valid',exists(select 1 from pg_catalog.pg_index
    where indexrelid=to_regclass('public.discounts_normalized_code_key') and indisvalid and indisunique and indpred is not null)
)
select check_name,case when passed then 'PASS' else 'FAIL' end result from checks order by check_name;
