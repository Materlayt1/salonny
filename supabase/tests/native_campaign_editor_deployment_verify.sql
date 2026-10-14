-- Read-only catalog/source checks. No promotion/customer/appointment writes.
with expected(signature,exposed,body_md5) as(values
  ('public.campaign_editor_authorize(uuid)',false,'f6ae110fc2ab302100df93ebb664ffe6'),
  ('public.campaign_editor_row(uuid)',false,'efa481fc61db1e63358dd58ef9a04cc6'),
  ('public.native_business_campaigns(uuid,text,integer)',true,'0019e96d24f34f17c52628079cedbba4'),
  ('public.native_save_business_campaign(uuid,uuid,uuid,integer,text,text,text,text,text,integer,text,timestamptz,timestamptz)',true,'ac636ee61cdc5dc54b5d676d514f7b8c'),
  ('public.create_business_campaign(text,text,text,integer,text,timestamptz,timestamptz)',true,'c6bc0392bef4e420758058d563987519'),
  ('public.set_business_campaign_status(uuid,text)',true,'65dfbebbcc736ae30219ec983f7c6dcc')
), procedures as(
  select e.*,p.oid,p.proacl,p.proowner,p.prosrc,p.proconfig,p.prosecdef
  from expected e left join pg_catalog.pg_proc p on p.oid=to_regprocedure(e.signature)
)
select check_name,case when ok then 'PASS' else 'FAIL' end result from (
  select 'campaign revision' check_name,exists(select 1 from information_schema.columns where table_schema='public' and table_name='campaigns' and column_name='revision' and data_type='integer' and is_nullable='NO') ok
  union all select 'sealed campaign writes',not(has_table_privilege('authenticated','public.campaigns','INSERT') or has_table_privilege('authenticated','public.campaigns','UPDATE') or has_table_privilege('authenticated','public.campaigns','DELETE') or has_any_column_privilege('authenticated','public.campaigns','UPDATE'))
  union all select 'sealed discount writes',not(has_table_privilege('authenticated','public.discounts','INSERT') or has_table_privilege('authenticated','public.discounts','UPDATE') or has_table_privilege('authenticated','public.discounts','DELETE') or has_any_column_privilege('authenticated','public.discounts','UPDATE'))
  union all select 'private request ledger',not(has_table_privilege('authenticated','public.campaign_editor_requests','SELECT') or has_table_privilege('anon','public.campaign_editor_requests','SELECT')) and (select relrowsecurity from pg_class where oid='public.campaign_editor_requests'::regclass)
  union all select 'privileged JWT-only functions',bool_and(p.prosecdef and p.proconfig @> array['search_path=""'] and has_function_privilege('authenticated',p.oid,'EXECUTE') and not has_function_privilege('anon',p.oid,'EXECUTE')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('native_business_campaigns','native_save_business_campaign','create_business_campaign','set_business_campaign_status')
  union all select 'private helpers',bool_and(not has_function_privilege('authenticated',p.oid,'EXECUTE') and not has_function_privilege('anon',p.oid,'EXECUTE')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('campaign_editor_authorize','campaign_editor_row')
  union all select 'coupon one-use ledger retained',exists(select 1 from pg_constraint where conrelid='public.coupon_redemptions'::regclass and conname='coupon_user_once') and exists(select 1 from pg_constraint where conrelid='public.coupon_redemptions'::regclass and conname='coupon_customer_once')
  union all select 'six exact functions and ACLs',count(oid)=6 and coalesce(bool_and(oid is not null
    and prosecdef and proconfig @> array['search_path=""']
    and has_function_privilege('authenticated',oid,'EXECUTE')=exposed
    and not has_function_privilege('anon',oid,'EXECUTE')
    and not exists(select 1 from aclexplode(coalesce(proacl,acldefault('f',proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')),false) from procedures
  union all select 'function sources match repository',count(oid)=6 and coalesce(bool_and(oid is not null
    and md5(regexp_replace(replace(prosrc,chr(13),''),'^[[:space:]]+|[[:space:]]+$','','g'))=body_md5),false) from procedures
  union all select 'two editor indexes valid',count(*)=2 and coalesce(bool_and(indisvalid),false) from pg_index
    where indexrelid in(to_regclass('public.campaigns_business_editor_order_idx'),to_regclass('public.discounts_campaign_editor_idx'))
) checks order by check_name;
