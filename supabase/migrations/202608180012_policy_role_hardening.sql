-- Explicitly scope personal and tenant policies to signed-in users. Policies
-- created without a TO clause apply to anon as well, even when their check can
-- never succeed, and may force permission checks for tenant helper functions.

drop policy if exists discounts_public_read on public.discounts;
create policy discounts_anon_read on public.discounts for select to anon
using (active and exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published'));
create policy discounts_authenticated_read on public.discounts for select to authenticated
using (active or public.is_business_member(business_id));

do $$
declare
  target_policy record;
begin
  for target_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and roles = array['public']::name[]
      and (
        coalesce(qual, '') ~ '(auth\.uid|public\.is_admin|public\.is_business_member|public\.has_business_role)'
        or coalesce(with_check, '') ~ '(auth\.uid|public\.is_admin|public\.is_business_member|public\.has_business_role)'
      )
  loop
    execute format('alter policy %I on %I.%I to authenticated', target_policy.policyname, target_policy.schemaname, target_policy.tablename);
  end loop;
end;
$$;

