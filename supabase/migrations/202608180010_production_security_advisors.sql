-- Resolve Supabase Security Advisor warnings without weakening tenant RLS.

create schema if not exists extensions;
alter extension btree_gist set schema extensions;

-- Public buckets already serve known object URLs. Listing the entire bucket is unnecessary.
drop policy if exists business_assets_public_read on storage.objects;

-- PostgreSQL grants EXECUTE to PUBLIC for new functions by default. Remove that
-- implicit grant from every SECURITY DEFINER function; retain explicit role grants.
do $$
declare
  target_function regprocedure;
begin
  for target_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', target_function);
  end loop;
end;
$$;

-- These helpers are used inside authenticated RLS policies.
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.has_business_role(uuid,public.business_member_role[]) to authenticated;

-- Exact platform totals avoid loading an arbitrary number of rows in the admin UI.
create or replace function public.get_admin_platform_metrics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  total_users bigint;
  total_businesses bigint;
  active_businesses bigint;
  total_appointments bigint;
  pending_businesses bigint;
  pending_reviews bigint;
  paid_gmv numeric;
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode = '42501'; end if;

  select count(*) into total_users from public.users where deleted_at is null;
  select count(*), count(*) filter (where status = 'published'), count(*) filter (where status = 'pending_review')
    into total_businesses, active_businesses, pending_businesses from public.businesses;
  select count(*) into total_appointments from public.appointments;
  select count(*) into pending_reviews from public.reviews where moderation_status in ('pending', 'flagged');
  select coalesce(sum(amount_minor), 0) into paid_gmv from public.payments where status = 'paid';

  return jsonb_build_object(
    'totalUsers', total_users,
    'totalBusinesses', total_businesses,
    'activeBusinesses', active_businesses,
    'totalAppointments', total_appointments,
    'pendingBusinesses', pending_businesses,
    'pendingReviews', pending_reviews,
    'paidGmvMinor', paid_gmv
  );
end;
$$;

revoke all on function public.get_admin_platform_metrics() from public, anon;
grant execute on function public.get_admin_platform_metrics() to authenticated;

