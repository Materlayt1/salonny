-- Split broad ALL policies into write-only policies where a dedicated read policy
-- already exists. This preserves permissions while avoiding duplicate SELECT RLS
-- evaluation on high-traffic marketplace tables.
do $$
declare
  target_policy record;
  check_expression text;
begin
  for target_policy in
    select p.schemaname, p.tablename, p.policyname, p.qual, p.with_check
    from pg_policies p
    where p.schemaname = 'public'
      and p.cmd = 'ALL'
      and p.roles @> array['authenticated']::name[]
      and exists (
        select 1
        from pg_policies read_policy
        where read_policy.schemaname = p.schemaname
          and read_policy.tablename = p.tablename
          and read_policy.policyname <> p.policyname
          and read_policy.cmd = 'SELECT'
          and read_policy.roles @> array['authenticated']::name[]
      )
  loop
    check_expression := coalesce(target_policy.with_check, target_policy.qual);
    execute format('drop policy %I on %I.%I', target_policy.policyname, target_policy.schemaname, target_policy.tablename);

    if check_expression is not null then
      execute format(
        'create policy %I on %I.%I for insert to authenticated with check (%s)',
        target_policy.policyname || '_insert',
        target_policy.schemaname,
        target_policy.tablename,
        check_expression
      );
    end if;
    if target_policy.qual is not null then
      execute format(
        'create policy %I on %I.%I for update to authenticated using (%s) with check (%s)',
        target_policy.policyname || '_update',
        target_policy.schemaname,
        target_policy.tablename,
        target_policy.qual,
        check_expression
      );
      execute format(
        'create policy %I on %I.%I for delete to authenticated using (%s)',
        target_policy.policyname || '_delete',
        target_policy.schemaname,
        target_policy.tablename,
        target_policy.qual
      );
    end if;
  end loop;
end;
$$;

