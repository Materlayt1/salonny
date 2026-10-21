-- Read-only installation/ACL/index checks; no real JWT or capacity acceptance.
with expected(signature,exposed,body_md5) as(values
  ('public.native_business_report(uuid,uuid,integer,boolean,text,integer)',true,'76b42fe1e60e02dd73b7cae33b0c4876'),
  ('public.business_report_range_minutes(tstzmultirange)',false,'dfb7216e395a2331b276cdbdc5e3b7d6')
), procedures as(
  select e.*,p.oid,p.prosecdef,p.proconfig,p.proacl,p.proowner,p.provolatile,p.prosrc
  from expected e left join pg_catalog.pg_proc p on p.oid=to_regprocedure(e.signature)
), checks as(
  select 'report_and_private_helper_installed' check_name,count(oid)=2 passed from procedures
  union all select 'only_report_exposed_to_authenticated',coalesce(bool_and(oid is not null
    and has_function_privilege('authenticated',oid,'EXECUTE')=exposed
    and not has_function_privilege('anon',oid,'EXECUTE')
    and not exists(select 1 from aclexplode(coalesce(proacl,acldefault('f',proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')),false) from procedures
  union all select 'fixed_empty_search_path',coalesce(bool_and(oid is not null
    and exists(select 1 from unnest(proconfig) c where c in ('search_path=""','search_path='))),false) from procedures
  union all select 'report_definer_is_stable',coalesce(bool_and(prosecdef and provolatile='s'),false) from procedures where exposed
  union all select 'helper_invoker_is_immutable',coalesce(bool_and(not prosecdef and provolatile='i'),false) from procedures where not exposed
  union all select 'report_source_matches_repository',coalesce(bool_and(oid is not null
    and md5(regexp_replace(replace(prosrc,chr(13),''),'^[[:space:]]+|[[:space:]]+$','','g'))=body_md5),false) from procedures where exposed
  union all select 'private_helper_source_matches_repository',coalesce(bool_and(oid is not null
    and md5(regexp_replace(replace(prosrc,chr(13),''),'^[[:space:]]+|[[:space:]]+$','','g'))=body_md5),false) from procedures where not exposed
  union all select 'three_report_indexes_valid',count(*)=3 and coalesce(bool_and(indisvalid),false)
    from pg_catalog.pg_index where indexrelid in(
      to_regclass('public.appointments_business_report_start_idx'),
      to_regclass('public.appointment_items_report_booking_service_idx'),
      to_regclass('public.employee_time_off_report_employee_start_idx'))
)
select check_name,case when passed then 'PASS' else 'FAIL' end result from checks order by check_name;
