-- Read-only catalog/source/ACL acceptance. Not a live customer write, JWT
-- lifecycle concurrency test or accounting/privacy retention certification.
with expected(signature,exposed,body_md5) as(values
  ('public.guard_package_ledger_immutable()',false,'f5dd68f6f6e38ed399472b82a9a56576'),
  ('public.record_new_customer_package()',false,'f6058638acc93a4142253f847a6ca211'),
  ('public.assign_customer_package_atomic(uuid,uuid,uuid,uuid)',true,'0e487bb7d556250a87d172e447c5375a'),
  ('public.observe_legacy_package_completion()',false,'19206d269ed4ce7a8604aebfd99b2ab5'),
  ('public.consume_customer_package_session(uuid)',false,'877df5faae1b0f14154cf1a667d6defb'),
  ('public.guard_customer_package_balance()',false,'839c939aa4705a6ae6cf5e59776d2055'),
  ('public.native_package_ledger_ready(uuid)',true,'587d68099f3239c000edf8164e59c5fd'),
  ('public.native_customer_package_ledger(uuid,uuid,integer)',true,'a4964b2e887b830522321030e266facc'),
  ('public.automate_appointment_lifecycle()',false,'557ab58fff7c5cd895f57425a2102d22')
), procedures as(
  select e.*,p.oid,p.proacl,p.proowner,p.prosrc,p.proconfig,p.prosecdef
  from expected e left join pg_catalog.pg_proc p on p.oid=to_regprocedure(e.signature)
), tables as(
  select c.oid,c.relname,c.relrowsecurity,c.relacl,c.relowner from pg_class c
  where c.oid in(to_regclass('public.customer_packages'),to_regclass('public.customer_package_snapshots'),
    to_regclass('public.package_session_ledger'),to_regclass('public.package_completion_receipts'))
), checks as(
  select 'nine_package_functions_installed' check_name,count(oid)=9 passed from procedures
  union all select 'only_assign_ready_ledger_exposed',coalesce(bool_and(oid is not null
    and has_function_privilege('authenticated',oid,'EXECUTE')=exposed
    and not has_function_privilege('anon',oid,'EXECUTE')
    and not exists(select 1 from aclexplode(coalesce(proacl,acldefault('f',proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')),false) from procedures
  union all select 'package_function_sources_match_repository',coalesce(bool_and(oid is not null
    and md5(regexp_replace(replace(prosrc,chr(13),''),'^[[:space:]]+|[[:space:]]+$','','g'))=body_md5),false) from procedures
  union all select 'new_functions_fixed_empty_search_path',coalesce(bool_and(oid is not null
    and exists(select 1 from unnest(proconfig) c where c in('search_path=""','search_path='))),false)
    from procedures where signature<>'public.automate_appointment_lifecycle()'
  union all select 'financial_rpcs_are_definer',coalesce(bool_and(prosecdef),false) from procedures
    where signature in('public.assign_customer_package_atomic(uuid,uuid,uuid,uuid)','public.native_customer_package_ledger(uuid,uuid,integer)')
  union all select 'all_four_package_tables_have_rls',count(*)=4 and coalesce(bool_and(relrowsecurity),false) from tables
  union all select 'raw_tables_are_read_only_or_private',count(*)=4 and coalesce(bool_and(
    has_table_privilege('authenticated',oid,'SELECT')=(relname='customer_packages')
    and not has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    and not exists(select 1 from aclexplode(coalesce(relacl,acldefault('r',relowner))) a
      where a.grantee=0 or (a.grantee in((select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated')) and a.privilege_type<>'SELECT'))),false) from tables
  union all select 'legacy_raw_mutation_policies_removed',not exists(select 1 from pg_policy
    where polrelid=to_regclass('public.customer_packages') and polcmd<>'r')
  union all select 'raw_column_write_acls_revoked',not exists(
    select 1 from pg_attribute a join tables t on t.oid=a.attrelid
    cross join lateral aclexplode(a.attacl) x
    where a.attnum>0 and not a.attisdropped and x.grantee in(0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated')))
  union all select 'six_immutable_snapshot_balance_receipt_triggers',count(*)=6 and coalesce(bool_and(tgenabled='O'),false)
    from pg_trigger where not tgisinternal and tgname in('customer_package_snapshot_immutable','package_session_ledger_immutable',
      'package_completion_receipt_immutable','customer_package_insert_snapshot','appointment_package_legacy_completion','customer_package_balance_guard')
  union all select 'five_ledger_indexes_valid',count(*)=5 and coalesce(bool_and(indisvalid),false) from pg_index
    where indexrelid in(to_regclass('public.customer_packages_business_ledger_key'),to_regclass('public.appointments_business_package_ledger_key'),
      to_regclass('public.package_session_ledger_appointment_once'),to_regclass('public.package_session_ledger_start_once'),to_regclass('public.package_session_ledger_page_idx'))
  union all select 'five_scope_bound_ledger_foreign_keys_valid',count(*)=5 and coalesce(bool_and(convalidated),false)
    from pg_constraint where contype='f' and conrelid in(to_regclass('public.customer_package_snapshots'),to_regclass('public.package_session_ledger'),to_regclass('public.package_completion_receipts'))
  union all select 'existing_lifecycle_trigger_still_enabled',count(*)=1 and coalesce(bool_and(tgenabled='O'
    and tgfoid=to_regprocedure('public.automate_appointment_lifecycle()')),false)
    from pg_trigger where not tgisinternal and tgrelid=to_regclass('public.appointments') and tgname='appointment_lifecycle_automation'
)
select check_name,case when passed then 'PASS' else 'FAIL' end result from checks order by check_name;
