-- Dynamic category administration and transactional staff availability management.

create or replace function public.admin_upsert_business_category(
  p_category_id uuid,
  p_name_tr text,
  p_slug text,
  p_icon text,
  p_sort_order integer,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_category_id uuid;
begin
  if not public.is_admin() then
    raise exception 'admin_required';
  end if;
  if length(trim(p_name_tr)) < 2 or length(trim(p_name_tr)) > 80 then
    raise exception 'invalid_category_name';
  end if;
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(p_slug) > 80 then
    raise exception 'invalid_category_slug';
  end if;

  if p_category_id is null then
    insert into public.business_categories(name_tr, slug, icon, sort_order, active)
    values (trim(p_name_tr), p_slug, nullif(trim(p_icon), ''), p_sort_order, p_active)
    returning id into v_category_id;
  else
    update public.business_categories
    set name_tr = trim(p_name_tr),
        slug = p_slug,
        icon = nullif(trim(p_icon), ''),
        sort_order = p_sort_order,
        active = p_active
    where id = p_category_id
    returning id into v_category_id;
    if v_category_id is null then raise exception 'category_not_found'; end if;
  end if;
  return v_category_id;
end;
$$;

create or replace function public.save_employee_weekly_schedule(
  p_employee_id uuid,
  p_branch_id uuid,
  p_schedule jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
begin
  select e.business_id into v_business_id
  from public.employees e
  join public.employee_branches eb on eb.employee_id = e.id and eb.branch_id = p_branch_id
  join public.branches b on b.id = eb.branch_id and b.business_id = e.business_id
  where e.id = p_employee_id;

  if v_business_id is null then raise exception 'employee_or_branch_not_found'; end if;
  if not public.has_business_role(v_business_id, array['OWNER','MANAGER']::public.business_member_role[]) then
    raise exception 'business_manager_required';
  end if;
  if jsonb_typeof(p_schedule) <> 'array' or jsonb_array_length(p_schedule) > 14 then
    raise exception 'invalid_schedule';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_schedule) item
    where (item->>'weekday') !~ '^[0-6]$'
      or (item->>'startsAt')::time >= (item->>'endsAt')::time
  ) then
    raise exception 'invalid_schedule_period';
  end if;

  delete from public.employee_working_hours
  where employee_id = p_employee_id and branch_id = p_branch_id;

  insert into public.employee_working_hours(
    business_id, employee_id, branch_id, weekday, starts_at, ends_at
  )
  select
    v_business_id,
    p_employee_id,
    p_branch_id,
    (item->>'weekday')::smallint,
    (item->>'startsAt')::time,
    (item->>'endsAt')::time
  from jsonb_array_elements(p_schedule) item;
end;
$$;

create or replace function public.add_employee_time_off(
  p_employee_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_kind text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
  v_id uuid;
begin
  select business_id into v_business_id from public.employees where id = p_employee_id;
  if v_business_id is null then raise exception 'employee_not_found'; end if;
  if not public.has_business_role(v_business_id, array['OWNER','MANAGER']::public.business_member_role[]) then
    raise exception 'business_manager_required';
  end if;
  if p_starts_at >= p_ends_at or p_kind not in ('leave','vacation','blocked','break') then
    raise exception 'invalid_time_off';
  end if;
  insert into public.employee_time_off(business_id, employee_id, starts_at, ends_at, kind, note)
  values (v_business_id, p_employee_id, p_starts_at, p_ends_at, p_kind, nullif(trim(p_note), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.delete_employee_time_off(p_time_off_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_id uuid;
begin
  select business_id into v_business_id from public.employee_time_off where id = p_time_off_id;
  if v_business_id is null then raise exception 'time_off_not_found'; end if;
  if not public.has_business_role(v_business_id, array['OWNER','MANAGER']::public.business_member_role[]) then
    raise exception 'business_manager_required';
  end if;
  delete from public.employee_time_off where id = p_time_off_id;
end;
$$;

drop policy if exists employee_time_off_tenant on public.employee_time_off;
create policy employee_time_off_read on public.employee_time_off
  for select to authenticated
  using (
    public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[])
    or exists (
      select 1 from public.employees employee
      where employee.id = employee_id and employee.user_id = (select auth.uid())
    )
  );

revoke all on function public.admin_upsert_business_category(uuid,text,text,text,integer,boolean) from public, anon;
revoke all on function public.save_employee_weekly_schedule(uuid,uuid,jsonb) from public, anon;
revoke all on function public.add_employee_time_off(uuid,timestamptz,timestamptz,text,text) from public, anon;
revoke all on function public.delete_employee_time_off(uuid) from public, anon;
grant execute on function public.admin_upsert_business_category(uuid,text,text,text,integer,boolean) to authenticated;
grant execute on function public.save_employee_weekly_schedule(uuid,uuid,jsonb) to authenticated;
grant execute on function public.add_employee_time_off(uuid,timestamptz,timestamptz,text,text) to authenticated;
grant execute on function public.delete_employee_time_off(uuid) to authenticated;

