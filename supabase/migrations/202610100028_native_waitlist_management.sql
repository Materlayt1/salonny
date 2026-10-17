-- Tenant-safe native waitlist management. No appointment, notification or job is
-- created here; an offer is informational and DOES NOT reserve availability.
-- Deploy atomically. Inconsistent historical records require explicit review,
-- never an automatic destructive repair.
begin;

do $$
begin
  if exists (
    select 1 from public.waitlist_entries w
    left join public.branches b on b.id=w.branch_id and b.business_id=w.business_id
    left join public.customers c on c.id=w.customer_id and c.business_id=w.business_id
    left join public.services s on s.id=w.service_id and s.business_id=w.business_id
    left join public.employees e on e.id=w.employee_id and e.business_id=w.business_id
    where b.id is null or c.id is null or s.id is null or (w.employee_id is not null and e.id is null)
  ) then
    raise exception 'waitlist_tenant_integrity_violation: existing records require administrator review; migration made no changes' using errcode='23514';
  end if;
  if exists(select 1 from public.waitlist_entries where status in ('waiting','offered')
    group by business_id,customer_id,service_id having count(*)>1) then
    raise exception 'waitlist_active_duplicate_violation: existing duplicates require administrator review; migration made no changes' using errcode='23514';
  end if;
end $$;

create unique index if not exists branches_business_id_id_waitlist_key on public.branches(business_id,id);
create unique index if not exists customers_business_id_id_package_key on public.customers(business_id,id);
create unique index if not exists services_business_id_id_package_key on public.services(business_id,id);
create unique index if not exists employees_business_id_id_waitlist_key on public.employees(business_id,id);

alter table public.waitlist_entries add constraint waitlist_tenant_branch_fk
  foreign key(business_id,branch_id) references public.branches(business_id,id) on delete cascade not valid;
alter table public.waitlist_entries add constraint waitlist_tenant_customer_fk
  foreign key(business_id,customer_id) references public.customers(business_id,id) on delete cascade not valid;
alter table public.waitlist_entries add constraint waitlist_tenant_service_fk
  foreign key(business_id,service_id) references public.services(business_id,id) on delete cascade not valid;
-- PostgreSQL 15+ supports selecting only the nullable referencing column.
alter table public.waitlist_entries add constraint waitlist_tenant_employee_fk
  foreign key(business_id,employee_id) references public.employees(business_id,id) on delete set null (employee_id) not valid;
alter table public.waitlist_entries validate constraint waitlist_tenant_branch_fk;
alter table public.waitlist_entries validate constraint waitlist_tenant_customer_fk;
alter table public.waitlist_entries validate constraint waitlist_tenant_service_fk;
alter table public.waitlist_entries validate constraint waitlist_tenant_employee_fk;
-- Replace rather than duplicate relations, preserving PostgREST embeds.
alter table public.waitlist_entries drop constraint if exists waitlist_entries_branch_id_fkey;
alter table public.waitlist_entries drop constraint if exists waitlist_entries_customer_id_fkey;
alter table public.waitlist_entries drop constraint if exists waitlist_entries_service_id_fkey;
alter table public.waitlist_entries drop constraint if exists waitlist_entries_employee_id_fkey;

-- Customer self-enrollment and manager enrollment share the SAME global scope:
-- one active customer/service entry per business, not per employee or branch.
create unique index waitlist_active_customer_service_key on public.waitlist_entries(business_id,customer_id,service_id)
  where status in ('waiting','offered');
create index waitlist_native_branch_status_priority_idx on public.waitlist_entries(business_id,branch_id,status,priority,created_at,id);

alter table public.waitlist_entries enable row level security;
drop policy if exists waitlist_tenant on public.waitlist_entries;
create policy waitlist_manager_read on public.waitlist_entries for select to authenticated using (
  exists(select 1 from public.business_members bm where bm.business_id=waitlist_entries.business_id
    and bm.user_id=(select auth.uid()) and bm.active and bm.role in ('OWNER','MANAGER'))
);
-- All authenticated writes must pass the atomic RPC; no direct REST bypass.
revoke insert,update,delete,truncate,references,trigger on public.waitlist_entries from public,anon,authenticated;
revoke select on public.waitlist_entries from public,anon;
grant select on public.waitlist_entries to authenticated;

create table public.native_waitlist_requests (
  business_id uuid not null references public.businesses(id) on delete cascade,
  idempotency_key text not null check(length(idempotency_key) between 8 and 160 and idempotency_key ~ '^[a-zA-Z0-9_-]+$'),
  actor_user_id uuid not null references public.users(id),
  request_payload jsonb not null,
  response_payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key(business_id,idempotency_key)
);
alter table public.native_waitlist_requests enable row level security;
revoke all on public.native_waitlist_requests from public,anon,authenticated;

create or replace function public.native_waitlist_management_ready(p_business_id uuid,p_branch_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.business_members bm join public.branches b on b.business_id=bm.business_id
    where bm.business_id=p_business_id and bm.user_id=(select auth.uid()) and bm.active
      and bm.role in ('OWNER','MANAGER') and b.id=p_branch_id and b.active);
$$;
revoke all on function public.native_waitlist_management_ready(uuid,uuid) from public,anon;
grant execute on function public.native_waitlist_management_ready(uuid,uuid) to authenticated;

create or replace function public.manage_native_waitlist(
  p_business_id uuid,p_branch_id uuid,p_action text,p_payload jsonb,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := auth.uid();
  v_request public.native_waitlist_requests%rowtype;
  v_entry public.waitlist_entries%rowtype;
  v_payload jsonb;
  v_allowed text[];
  v_customer uuid;
  v_service uuid;
  v_employee uuid;
  v_from timestamptz;
  v_to timestamptz;
  v_expected timestamptz;
  v_starts timestamptz;
  v_priority integer;
  v_party integer;
  v_minutes integer;
  v_notes text;
  v_timezone text;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if not exists(select 1 from public.business_members bm where bm.business_id=p_business_id
    and bm.user_id=v_actor and bm.active and bm.role in ('OWNER','MANAGER')) then
    raise exception 'business_manager_required' using errcode='42501';
  end if;
  if p_business_id is null or p_branch_id is null or p_idempotency_key is null
    or length(p_idempotency_key) not between 8 and 160 or p_idempotency_key !~ '^[a-zA-Z0-9_-]+$'
    or p_action is null or p_action not in ('create','update','prepareOffer','cancel','accept')
    or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>8192 then
    raise exception 'invalid_waitlist_input' using errcode='22023';
  end if;
  v_payload := jsonb_build_object('branchId',p_branch_id,'action',p_action,'payload',p_payload);
  perform pg_advisory_xact_lock(hashtextextended('native-waitlist:'||p_business_id::text||':'||p_idempotency_key,0));
  select * into v_request from public.native_waitlist_requests where business_id=p_business_id and idempotency_key=p_idempotency_key;
  if found then
    if v_request.actor_user_id<>v_actor or v_request.request_payload<>v_payload then
      raise exception 'idempotency_key_conflict' using errcode='23505';
    end if;
    return v_request.response_payload;
  end if;
  -- Replay precedes mutable branch/reference/state checks, including a later edit.
  select b.timezone into v_timezone from public.businesses b join public.branches branch
    on branch.business_id=b.id and branch.id=p_branch_id and branch.active where b.id=p_business_id;
  if not found then raise exception 'invalid_waitlist_target' using errcode='22023'; end if;

  v_allowed := case p_action
    when 'create' then array['customerId','serviceId','employeeId','desiredFrom','desiredTo','priority','notes','partySize']
    when 'update' then array['id','employeeId','desiredFrom','desiredTo','priority','notes','expectedUpdatedAt']
    when 'prepareOffer' then array['id','employeeId','startsAt','offerMinutes','expectedUpdatedAt']
    else array['id','expectedUpdatedAt'] end;
  if exists(select 1 from jsonb_object_keys(p_payload) as item(key) where not(item.key=any(v_allowed)))
    or not(p_payload ?& v_allowed) then raise exception 'invalid_waitlist_payload' using errcode='22023'; end if;

  if p_action='create' then
    v_customer := (p_payload->>'customerId')::uuid;
    v_service := (p_payload->>'serviceId')::uuid;
    v_party := (p_payload->>'partySize')::integer;
    if v_customer is null or v_service is null or v_party is null or v_party not between 1 and 50
      or not exists(select 1 from public.customers c where c.id=v_customer and c.business_id=p_business_id) then
      raise exception 'invalid_waitlist_customer' using errcode='22023';
    end if;
  else
    select * into v_entry from public.waitlist_entries where id=(p_payload->>'id')::uuid
      and business_id=p_business_id and branch_id=p_branch_id for update;
    if not found then raise exception 'waitlist_not_found' using errcode='P0002'; end if;
    v_expected := (p_payload->>'expectedUpdatedAt')::timestamptz;
    if v_expected is null or not isfinite(v_expected) then raise exception 'invalid_expected_timestamp' using errcode='22023'; end if;
    if v_entry.updated_at<>v_expected then raise exception 'waitlist_changed' using errcode='40001'; end if;
    v_customer := v_entry.customer_id;
    v_service := v_entry.service_id;
    if p_action in ('update','prepareOffer') and v_entry.status<>'waiting' then
      raise exception 'waitlist_not_waiting' using errcode='23P01';
    end if;
    if p_action in ('update','prepareOffer') and v_entry.party_size<>1 then
      raise exception 'legacy_group_waitlist_unsupported' using errcode='0A000';
    end if;
  end if;

  if p_action in ('create','update','prepareOffer') then
    v_employee := (p_payload->>'employeeId')::uuid;
    if not exists(select 1 from public.services s join public.branch_services bs on bs.service_id=s.id
        where s.id=v_service and s.business_id=p_business_id and s.active and bs.branch_id=p_branch_id and bs.active)
      or (v_employee is not null and not exists(select 1 from public.employees e
        join public.employee_branches eb on eb.employee_id=e.id and eb.branch_id=p_branch_id
        join public.employee_services es on es.employee_id=e.id and es.service_id=v_service
        where e.id=v_employee and e.business_id=p_business_id and e.active)) then
      raise exception 'invalid_waitlist_target' using errcode='22023';
    end if;
  end if;
  if p_action in ('create','update') then
    v_from := (p_payload->>'desiredFrom')::timestamptz;
    v_to := (p_payload->>'desiredTo')::timestamptz;
    v_priority := (p_payload->>'priority')::integer;
    v_notes := btrim(p_payload->>'notes');
    if v_from is null or v_to is null or not isfinite(v_from) or not isfinite(v_to)
      or v_from>=v_to or v_to<=clock_timestamp() or v_to>clock_timestamp()+interval '180 days'
      or v_priority is null or v_priority not between 0 and 1000 or v_notes is null or length(v_notes)>1000 then
      raise exception 'invalid_waitlist_window' using errcode='22023';
    end if;
    if p_action='create' then
      insert into public.waitlist_entries(business_id,branch_id,customer_id,service_id,employee_id,desired_from,desired_to,priority,notes,party_size,created_by)
        values(p_business_id,p_branch_id,v_customer,v_service,v_employee,v_from,v_to,v_priority,nullif(v_notes,''),v_party,v_actor)
        returning * into v_entry;
    else
      update public.waitlist_entries set employee_id=v_employee,desired_from=v_from,desired_to=v_to,priority=v_priority,notes=nullif(v_notes,''),
        updated_at=greatest(clock_timestamp(),v_entry.updated_at+interval '1 microsecond') where id=v_entry.id returning * into v_entry;
    end if;
  elsif p_action='prepareOffer' then
    v_starts := (p_payload->>'startsAt')::timestamptz;
    v_minutes := (p_payload->>'offerMinutes')::integer;
    if v_employee is null or v_starts is null or not isfinite(v_starts) or v_minutes is null or v_minutes not between 5 and 120 then
      raise exception 'invalid_waitlist_offer' using errcode='22023';
    end if;
    if v_starts<=clock_timestamp() or v_starts<v_entry.desired_from or v_starts>v_entry.desired_to
      or (v_entry.employee_id is not null and v_entry.employee_id<>v_employee) then
      raise exception 'waitlist_offer_outside_window' using errcode='23P01';
    end if;
    perform 1 from public.get_booking_slots(p_business_id,p_branch_id,v_employee,v_service,(v_starts at time zone v_timezone)::date) slot where slot.starts_at=v_starts;
    if not found then raise exception 'slot_not_available' using errcode='23P01'; end if;
    update public.waitlist_entries set status='offered',employee_id=v_employee,offered_starts_at=v_starts,
      offer_expires_at=least(clock_timestamp()+make_interval(mins=>v_minutes),v_starts),
      updated_at=greatest(clock_timestamp(),v_entry.updated_at+interval '1 microsecond') where id=v_entry.id returning * into v_entry;
  elsif p_action='cancel' then
    if v_entry.status not in ('waiting','offered') then raise exception 'waitlist_not_cancellable' using errcode='23P01'; end if;
    update public.waitlist_entries set status='cancelled',offer_expires_at=null,offered_starts_at=null,
      updated_at=greatest(clock_timestamp(),v_entry.updated_at+interval '1 microsecond') where id=v_entry.id returning * into v_entry;
  else
    -- Web compatibility only: marking an offer accepted NEVER books a slot.
    if v_entry.status<>'offered' or v_entry.offer_expires_at is null or v_entry.offer_expires_at<=clock_timestamp()
      or v_entry.offered_starts_at is null or v_entry.offered_starts_at<=clock_timestamp() then
      raise exception 'waitlist_offer_not_live' using errcode='23P01';
    end if;
    update public.waitlist_entries set status='accepted',updated_at=greatest(clock_timestamp(),v_entry.updated_at+interval '1 microsecond')
      where id=v_entry.id returning * into v_entry;
  end if;
  v_result := jsonb_build_object('saved',true,'id',v_entry.id,'status',v_entry.status,'updatedAt',v_entry.updated_at,
    'notificationSent',false,'appointmentCreated',false);
  insert into public.native_waitlist_requests(business_id,idempotency_key,actor_user_id,request_payload,response_payload)
    values(p_business_id,p_idempotency_key,v_actor,v_payload,v_result);
  return v_result;
end;
$$;
revoke all on function public.manage_native_waitlist(uuid,uuid,text,jsonb,text) from public,anon;
grant execute on function public.manage_native_waitlist(uuid,uuid,text,jsonb,text) to authenticated;
-- The old function ignored branch, employee compatibility and actual free slots.
revoke execute on function public.offer_next_waitlist_entry(uuid,uuid,timestamptz,integer) from public,anon,authenticated;

-- Preserve customer enrollment, but NEVER associate an existing phone record
-- (including an unlinked offline customer) with an unverified profile phone.
create or replace function public.join_customer_waitlist(
  p_business_id uuid,p_branch_id uuid,p_service_id uuid,p_employee_id uuid,p_desired_from timestamptz,p_desired_to timestamptz
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := auth.uid();
  v_user public.users%rowtype;
  v_customer_id uuid;
  v_entry_id uuid;
begin
  if v_actor is null then raise exception 'authentication_required' using errcode='28000'; end if;
  if p_desired_from is null or p_desired_to is null or not isfinite(p_desired_from) or not isfinite(p_desired_to)
    or p_desired_from>=p_desired_to or p_desired_to<=clock_timestamp() or p_desired_to>clock_timestamp()+interval '180 days' then
    raise exception 'invalid_window' using errcode='22023';
  end if;
  if not exists(select 1 from public.businesses where id=p_business_id and status='published')
    or not exists(select 1 from public.branches where id=p_branch_id and business_id=p_business_id and active)
    or not exists(select 1 from public.services s join public.branch_services bs on bs.service_id=s.id
      where s.id=p_service_id and s.business_id=p_business_id and s.active and bs.branch_id=p_branch_id and bs.active)
    or (p_employee_id is not null and not exists(select 1 from public.employee_services es join public.employees e on e.id=es.employee_id
      join public.employee_branches eb on eb.employee_id=e.id and eb.branch_id=p_branch_id
      where e.id=p_employee_id and e.business_id=p_business_id and es.service_id=p_service_id and e.active)) then
    raise exception 'invalid_waitlist_target' using errcode='22023';
  end if;
  select * into v_user from public.users where id=v_actor;
  if not found or length(coalesce(v_user.phone,''))<10 then raise exception 'phone_required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('customer-waitlist:'||p_business_id::text||':'||v_actor::text,0));
  select id into v_customer_id from public.customers where business_id=p_business_id and user_id=v_actor order by created_at,id limit 1;
  if v_customer_id is null then
    insert into public.customers(business_id,user_id,full_name,phone,email)
      values(p_business_id,v_actor,coalesce(nullif(v_user.full_name,''),'Müşteri'),v_user.phone,v_user.email)
      on conflict(business_id,phone) do nothing returning id into v_customer_id;
    if v_customer_id is null then
      select id into v_customer_id from public.customers where business_id=p_business_id and phone=v_user.phone and user_id=v_actor;
      if v_customer_id is null then raise exception 'phone_already_associated: contact business to verify ownership' using errcode='23505'; end if;
    end if;
  end if;
  insert into public.waitlist_entries(business_id,branch_id,customer_id,service_id,employee_id,desired_from,desired_to,created_by)
    values(p_business_id,p_branch_id,v_customer_id,p_service_id,p_employee_id,p_desired_from,p_desired_to,v_actor) returning id into v_entry_id;
  return v_entry_id;
end;
$$;
revoke all on function public.join_customer_waitlist(uuid,uuid,uuid,uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.join_customer_waitlist(uuid,uuid,uuid,uuid,timestamptz,timestamptz) to authenticated;
-- Customer-only get_my_waitlist_entries and accept_customer_waitlist_offer retain
-- their existing authentication/ownership contract; no new customer permissions.
notify pgrst, 'reload schema';
commit;
