-- Read-only source/ACL/FK/Storage-policy checks. Not a real image upload,
-- authenticated write, simultaneous onboarding race or traffic certification.
with expected(signature,body_md5) as(values
 ('public.native_business_setup_ready(uuid)','1dc13a53b7ed1069dc46557d94537991'),
 ('public.native_start_business_setup(text,text)','915f0da9347be371b3b654306a41441d'),
 ('public.native_submit_business_setup(uuid)','73d8f321f75f4867df985d044fe128f6'),
 ('public.native_save_business_setup(uuid,uuid,text,jsonb,jsonb)','2480c86d8edd5a7d1c54663733751180'),
 ('public.native_business_asset_manager(text)','e1714158e315bd3e78673eac2832273c')
), procedures as(
 select e.*,p.oid,p.proacl,p.proowner,p.prosrc,p.proconfig,p.prosecdef
 from expected e left join pg_proc p on p.oid=to_regprocedure(e.signature)
), checks as(
 select 'five_setup_functions_installed' check_name,count(oid)=5 passed from procedures
 union all select 'setup_functions_authenticated_only',coalesce(bool_and(oid is not null
   and has_function_privilege('authenticated',oid,'EXECUTE') and not has_function_privilege('anon',oid,'EXECUTE')
   and not exists(select 1 from aclexplode(coalesce(proacl,acldefault('f',proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')),false) from procedures
 union all select 'setup_functions_fixed_empty_search_path',coalesce(bool_and(oid is not null
   and exists(select 1 from unnest(proconfig) c where c in('search_path=""','search_path='))),false) from procedures
 union all select 'setup_functions_security_definer',coalesce(bool_and(prosecdef),false) from procedures
 union all select 'setup_function_sources_match_repository',coalesce(bool_and(oid is not null
   and md5(regexp_replace(replace(prosrc,chr(13),''),'^[[:space:]]+|[[:space:]]+$','','g'))=body_md5),false) from procedures
 union all select 'two_tenant_branch_constraints_validated',count(*)=2 and coalesce(bool_and(convalidated
   and contype='f' and confdeltype='c' and confrelid=to_regclass('public.branches')
   and (select array_agg(a.attname order by u.ordinality) from unnest(c.conkey) with ordinality u(attnum,ordinality)
     join pg_attribute a on a.attrelid=c.conrelid and a.attnum=u.attnum)=array['business_id','branch_id']::name[]
   and (select array_agg(a.attname order by u.ordinality) from unnest(c.confkey) with ordinality u(attnum,ordinality)
     join pg_attribute a on a.attrelid=c.confrelid and a.attnum=u.attnum)=array['business_id','id']::name[]),false)
   from pg_constraint c where conname in('native_images_tenant_branch_fk','native_locations_tenant_branch_fk')
   and conrelid in(to_regclass('public.business_images'),to_regclass('public.business_locations'))
 union all select 'native_photo_hash_column_installed',count(*)=1 from pg_attribute
   where attrelid=to_regclass('public.business_images') and attname='native_content_sha256' and atttypid='text'::regtype and not attisdropped
 union all select 'native_photo_hash_constraint_installed',count(*)=1 from pg_constraint
   where conrelid=to_regclass('public.business_images') and contype='c' and pg_get_constraintdef(oid) like '%native_content_sha256%' and convalidated
 union all select 'storage_rls_remains_enabled',coalesce(bool_and(relrowsecurity),false) from pg_class where oid=to_regclass('storage.objects')
 union all select 'storage_owned_manager_read_without_public_listing',count(*)=1 and coalesce(bool_and(
   polcmd='r' and polroles=array[(select oid from pg_roles where rolname='authenticated')]
   and polqual is not null and pg_get_expr(polqual,polrelid) like '%bucket_id%'
   and pg_get_expr(polqual,polrelid) like '%business-assets%'
   and pg_get_expr(polqual,polrelid) like '%native_business_asset_manager%'),false)
   from pg_policy where polrelid=to_regclass('storage.objects') and polname in('business_assets_manager_read','business_assets_public_read')
 union all select 'three_business_assets_storage_mutation_policies',count(*)=3 and coalesce(bool_and(polroles=array[(select oid from pg_roles where rolname='authenticated')]
   and polname in('business_assets_member_insert','business_assets_member_update','business_assets_member_delete')
   and (polqual is null or pg_get_expr(polqual,polrelid) like '%native_business_asset_manager%')
   and (polwithcheck is null or pg_get_expr(polwithcheck,polrelid) like '%native_business_asset_manager%')),false)
   from pg_policy where polrelid=to_regclass('storage.objects') and polcmd in('a','w','d','*')
   and (polname like 'business_assets_%'
     or coalesce(pg_get_expr(polqual,polrelid),'') like '%business-assets%'
     or coalesce(pg_get_expr(polwithcheck,polrelid),'') like '%business-assets%')
 -- Other buckets (including private customer care) legitimately have their
 -- own policies. Reject an unexpected global/broad mutation policy accessible
 -- to public/anonymous/authenticated without falsely counting those buckets.
 union all select 'no_unscoped_public_storage_mutation_policy',not exists(
   select 1 from pg_policy where polrelid=to_regclass('storage.objects') and polcmd in('a','w','d','*')
     and polroles && array[0::oid,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated')]
     and polname not in('business_assets_member_insert','business_assets_member_update','business_assets_member_delete')
     and not (
       (polqual is null or (pg_get_expr(polqual,polrelid) like '%bucket_id%' and pg_get_expr(polqual,polrelid) not like '%business-assets%'))
       and (polwithcheck is null or (pg_get_expr(polwithcheck,polrelid) like '%bucket_id%' and pg_get_expr(polwithcheck,polrelid) not like '%business-assets%'))
       and (polqual is not null or polwithcheck is not null)
     ))
 union all select 'storage_insert_update_checks_and_update_delete_using',count(*)=3 and coalesce(bool_and(
   (polcmd<>'a' or polwithcheck is not null) and (polcmd<>'w' or (polwithcheck is not null and polqual is not null)) and (polcmd<>'d' or polqual is not null)),false)
   from pg_policy where polrelid=to_regclass('storage.objects') and polname in('business_assets_member_insert','business_assets_member_update','business_assets_member_delete')
)
select check_name,case when passed then 'PASS' else 'FAIL' end result from checks order by check_name;
