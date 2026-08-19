-- Policies that call tenant/auth helper functions must never run for the anon role.
-- PostgreSQL deparses same-schema function names without the `public.` prefix, so
-- the earlier schema-qualified matcher intentionally has a final unqualified pass.
do $$
declare
  target_policy record;
begin
  for target_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and roles @> array['public']::name[]
      and (
        coalesce(qual, '') like '%auth.uid%'
        or coalesce(with_check, '') like '%auth.uid%'
        or coalesce(qual, '') like '%is_admin(%'
        or coalesce(with_check, '') like '%is_admin(%'
        or coalesce(qual, '') like '%is_business_member(%'
        or coalesce(with_check, '') like '%is_business_member(%'
        or coalesce(qual, '') like '%has_business_role(%'
        or coalesce(with_check, '') like '%has_business_role(%'
      )
  loop
    execute format(
      'alter policy %I on %I.%I to authenticated',
      target_policy.policyname,
      target_policy.schemaname,
      target_policy.tablename
    );
  end loop;
end;
$$;

