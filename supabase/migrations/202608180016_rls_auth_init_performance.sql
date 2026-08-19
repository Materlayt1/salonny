-- Evaluate auth.uid() once per statement instead of once per candidate row.
-- This follows Supabase's recommended `(select auth.uid())` RLS pattern.
do $$
declare
  target_policy record;
  next_qual text;
  next_check text;
  statement text;
begin
  for target_policy in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') like '%auth.uid%'
        or coalesce(with_check, '') like '%auth.uid%'
      )
  loop
    next_qual := target_policy.qual;
    next_check := target_policy.with_check;

    if next_qual is not null then
      next_qual := replace(next_qual, '( SELECT auth.uid() AS uid)', '__AUTH_UID_INIT__');
      next_qual := replace(next_qual, 'auth.uid()', '( SELECT auth.uid() AS uid)');
      next_qual := replace(next_qual, '__AUTH_UID_INIT__', '( SELECT auth.uid() AS uid)');
    end if;
    if next_check is not null then
      next_check := replace(next_check, '( SELECT auth.uid() AS uid)', '__AUTH_UID_INIT__');
      next_check := replace(next_check, 'auth.uid()', '( SELECT auth.uid() AS uid)');
      next_check := replace(next_check, '__AUTH_UID_INIT__', '( SELECT auth.uid() AS uid)');
    end if;

    statement := format(
      'alter policy %I on %I.%I',
      target_policy.policyname,
      target_policy.schemaname,
      target_policy.tablename
    );
    if next_qual is not null then statement := statement || ' using (' || next_qual || ')'; end if;
    if next_check is not null then statement := statement || ' with check (' || next_check || ')'; end if;
    execute statement;
  end loop;
end;
$$;

