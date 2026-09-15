-- Authenticated customer self-service waitlist enrollment and offer acceptance.

create or replace function public.join_customer_waitlist(
  p_business_id uuid,
  p_branch_id uuid,
  p_service_id uuid,
  p_employee_id uuid,
  p_desired_from timestamptz,
  p_desired_to timestamptz
) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_user public.users%rowtype;
  v_customer_id uuid;
  v_entry_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'authentication_required'; end if;
  if p_desired_from >= p_desired_to or p_desired_to > now()+interval '180 days' then raise exception 'invalid_window'; end if;
  if not exists(select 1 from public.businesses where id=p_business_id and status='published')
    or not exists(select 1 from public.branches where id=p_branch_id and business_id=p_business_id and active)
    or not exists(select 1 from public.services where id=p_service_id and business_id=p_business_id and active)
    or (p_employee_id is not null and not exists(select 1 from public.employee_services es join public.employees e on e.id=es.employee_id where e.id=p_employee_id and e.business_id=p_business_id and es.service_id=p_service_id and e.active))
  then raise exception 'invalid_waitlist_target'; end if;
  select * into v_user from public.users where id=(select auth.uid());
  if length(coalesce(v_user.phone,''))<10 then raise exception 'phone_required'; end if;
  select id into v_customer_id from public.customers where business_id=p_business_id and user_id=(select auth.uid()) limit 1;
  if v_customer_id is null then
    insert into public.customers(business_id,user_id,full_name,phone,email)
    values(p_business_id,(select auth.uid()),coalesce(nullif(v_user.full_name,''),'Müşteri'),v_user.phone,v_user.email)
    on conflict(business_id,phone) do update set user_id=excluded.user_id,email=coalesce(excluded.email,public.customers.email),updated_at=now()
    returning id into v_customer_id;
  end if;
  if exists(select 1 from public.waitlist_entries where customer_id=v_customer_id and service_id=p_service_id and status in('waiting','offered')) then raise exception 'already_waiting'; end if;
  insert into public.waitlist_entries(business_id,branch_id,customer_id,service_id,employee_id,desired_from,desired_to,created_by)
  values(p_business_id,p_branch_id,v_customer_id,p_service_id,p_employee_id,p_desired_from,p_desired_to,(select auth.uid())) returning id into v_entry_id;
  return v_entry_id;
end $$;

create or replace function public.accept_customer_waitlist_offer(p_entry_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.waitlist_entries w set status='accepted',updated_at=now()
  from public.customers c where w.id=p_entry_id and c.id=w.customer_id and c.user_id=(select auth.uid())
    and w.status='offered' and w.offer_expires_at>now();
  return found;
end $$;

create or replace function public.get_my_waitlist_entries()
returns table(id uuid,status text,desired_from timestamptz,desired_to timestamptz,offered_starts_at timestamptz,offer_expires_at timestamptz,business_name text,service_name text)
language sql security definer set search_path=public,pg_temp stable as $$
  select w.id,w.status,w.desired_from,w.desired_to,w.offered_starts_at,w.offer_expires_at,b.name,s.name
  from public.waitlist_entries w join public.customers c on c.id=w.customer_id
  join public.businesses b on b.id=w.business_id join public.services s on s.id=w.service_id
  where c.user_id=(select auth.uid()) and w.status in('waiting','offered','accepted')
  order by w.created_at desc limit 100;
$$;

revoke all on function public.join_customer_waitlist(uuid,uuid,uuid,uuid,timestamptz,timestamptz) from public,anon;
revoke all on function public.accept_customer_waitlist_offer(uuid) from public,anon;
revoke all on function public.get_my_waitlist_entries() from public,anon;
grant execute on function public.join_customer_waitlist(uuid,uuid,uuid,uuid,timestamptz,timestamptz) to authenticated;
grant execute on function public.accept_customer_waitlist_offer(uuid) to authenticated;
grant execute on function public.get_my_waitlist_entries() to authenticated;
