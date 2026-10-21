-- Read-only production acceptance. No claims, test users, requests or bookings.
with functions as (
  select p.proname,p.prosecdef,p.proconfig,p.oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
    'business_owner_lifecycle_blocked','lock_business_owner_lifecycle',
    'guard_business_owner_lifecycle','withdraw_owner_businesses',
    'guard_account_deletion_lifecycle','apply_account_deletion_lifecycle',
    'guard_user_deletion_lifecycle','apply_user_deletion_lifecycle','request_account_deletion'
  )
), checks as (
  select 'nine definer functions with empty search_path' check_name,
    count(*)=9 and bool_and(prosecdef and proconfig @> array['search_path=""']) passed from functions
  union all
  select 'private helpers cannot be called by anon or authenticated',count(*)=8 and bool_and(
    not has_function_privilege('anon',oid,'execute') and not has_function_privilege('authenticated',oid,'execute'))
    from functions where proname<>'request_account_deletion'
  union all
  select 'request RPC available only to authenticated',
    has_function_privilege('authenticated','public.request_account_deletion(text)','execute')
      and not has_function_privilege('anon','public.request_account_deletion(text)','execute')
  union all
  select 'five lifecycle triggers enabled',count(*)=5 and bool_and(tgenabled='O')
    from pg_trigger where not tgisinternal and tgrelid in ('public.businesses'::regclass,'public.users'::regclass,'public.account_deletion_requests'::regclass)
      and tgname in ('businesses_owner_lifecycle','account_deletion_lifecycle_guard','account_deletion_lifecycle_apply','users_deletion_lifecycle_guard','users_deletion_lifecycle_apply')
  union all
  select 'blocked owners have no public or verified listing',not exists (
    select 1 from public.businesses where (status in ('published','pending_review') or verified_at is not null)
      and public.business_owner_lifecycle_blocked(owner_user_id)
  )
  union all
  select 'owner lifecycle lookup index valid',exists(select 1 from pg_index where indexrelid=to_regclass('public.businesses_owner_lifecycle_idx') and indisvalid)
)
select jsonb_build_object('checks',jsonb_agg(jsonb_build_object('check',check_name,'result',case when passed then 'PASS' else 'FAIL' end) order by check_name),
  'all_passed',bool_and(passed),'counts',jsonb_build_object(
    'users',(select count(*) from public.users),
    'businesses',(select count(*) from public.businesses),
    'appointments',(select count(*) from public.appointments),
    'requests',(select count(*) from public.account_deletion_requests),
    'withdrawal_audits',(select count(*) from public.audit_logs where action='business_withdrawn_owner_deletion')
  )) as lifecycle_deployment_acceptance from checks;
