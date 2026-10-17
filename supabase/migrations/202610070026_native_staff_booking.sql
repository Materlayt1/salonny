-- Additive deployment prerequisite for the native manager booking editor.
-- Apply after the availability, growth operations and resource trigger migrations.
-- This migration does not alter the legacy series RPC or any customer records.
begin;
create table public.staff_booking_requests (
  business_id uuid not null references public.businesses(id) on delete cascade,
  idempotency_key text not null check (length(idempotency_key) between 8 and 160 and idempotency_key ~ '^[a-zA-Z0-9_-]+$'),
  actor_user_id uuid not null references public.users(id),
  request_payload jsonb not null,
  appointment_id uuid references public.appointments(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (business_id, idempotency_key)
);
alter table public.staff_booking_requests enable row level security;
-- Only the definer RPC may read/write this private replay ledger.
revoke all on table public.staff_booking_requests from public, anon, authenticated;

create or replace function public.create_staff_appointment_atomic(
  p_business_id uuid,
  p_branch_id uuid,
  p_customer_id uuid,
  p_employee_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_payload jsonb;
  v_request public.staff_booking_requests%rowtype;
  v_customer_user_id uuid;
  v_timezone text;
  v_local_date date;
  v_name text;
  v_currency text;
  v_duration integer;
  v_price integer;
  v_buffer integer;
  v_id uuid;
begin
  if v_actor is null then raise exception 'authentication_required' using errcode='28000'; end if;
  -- Require an actual active tenant membership. has_business_role also permits
  -- global administrators, which is broader than this manager booking contract.
  if not exists(select 1 from public.business_members bm where bm.business_id=p_business_id
    and bm.user_id=v_actor and bm.active and bm.role in ('OWNER','MANAGER')) then
    raise exception 'business_manager_required' using errcode='42501';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 160
     or p_idempotency_key !~ '^[a-zA-Z0-9_-]+$' or p_starts_at is null or not isfinite(p_starts_at)
     or p_business_id is null or p_branch_id is null or p_customer_id is null
     or p_employee_id is null or p_service_id is null then
    raise exception 'invalid_booking_input' using errcode='22023';
  end if;
  v_payload := jsonb_build_object('branchId',p_branch_id,'customerId',p_customer_id,
    'employeeId',p_employee_id,'serviceId',p_service_id,'startsAtEpoch',extract(epoch from p_starts_at));
  -- Serialize retries BEFORE checking slots; a successful replay must return its
  -- original appointment even when that very appointment now occupies the slot.
  perform pg_advisory_xact_lock(hashtextextended('staff-booking:'||p_business_id::text||':'||p_idempotency_key, 0));
  select * into v_request from public.staff_booking_requests
    where business_id=p_business_id and idempotency_key=p_idempotency_key;
  if found then
    if v_request.actor_user_id<>v_actor or v_request.request_payload<>v_payload then
      raise exception 'idempotency_key_conflict' using errcode='23505';
    end if;
    if v_request.appointment_id is null then raise exception 'incomplete_booking_request'; end if;
    return v_request.appointment_id;
  end if;

  select c.user_id into v_customer_user_id from public.customers c
    where c.id=p_customer_id and c.business_id=p_business_id;
  if not found then raise exception 'invalid_customer' using errcode='22023'; end if;
  select b.timezone,s.name,s.currency,s.buffer_after_minutes,
    coalesce(es.duration_override_minutes,s.duration_minutes),
    coalesce(es.price_override_minor,bs.price_override_minor,s.price_minor)
  into v_timezone,v_name,v_currency,v_buffer,v_duration,v_price
  from public.businesses b
  join public.branches branch on branch.id=p_branch_id and branch.business_id=b.id and branch.active
  join public.services s on s.id=p_service_id and s.business_id=b.id and s.active
  join public.branch_services bs on bs.service_id=s.id and bs.branch_id=branch.id and bs.active
  join public.employees e on e.id=p_employee_id and e.business_id=b.id and e.active
  join public.employee_branches eb on eb.employee_id=e.id and eb.branch_id=branch.id
  join public.employee_services es on es.employee_id=e.id and es.service_id=s.id
  where b.id=p_business_id;
  if not found then raise exception 'booking_configuration_not_found' using errcode='22023'; end if;
  if exists(select 1 from public.service_resources sr join public.business_resources r on r.id=sr.resource_id
    where sr.service_id=p_service_id and (r.business_id<>p_business_id or (r.branch_id=p_branch_id and not r.active))) then
    raise exception 'resource_conflict' using errcode='23P01';
  end if;
  v_local_date := (p_starts_at at time zone v_timezone)::date;
  -- Same employee/day lock namespace as create_appointment_atomic.
  perform pg_advisory_xact_lock(hashtextextended(p_employee_id::text||v_local_date::text, 0));
  perform 1 from public.get_booking_slots(p_business_id,p_branch_id,p_employee_id,p_service_id,v_local_date) slot
    where slot.starts_at=p_starts_at;
  if not found then raise exception 'slot_not_available' using errcode='23P01'; end if;

  insert into public.staff_booking_requests(business_id,idempotency_key,actor_user_id,request_payload)
    values(p_business_id,p_idempotency_key,v_actor,v_payload);
  insert into public.appointments(business_id,branch_id,customer_id,customer_user_id,employee_id,
    status,starts_at,ends_at,total_minor,currency,created_by,source,party_size)
  values(p_business_id,p_branch_id,p_customer_id,v_customer_user_id,p_employee_id,'confirmed',
    p_starts_at,p_starts_at+make_interval(mins=>v_duration+v_buffer),v_price,v_currency,v_actor,'staff',1)
  returning id into v_id;
  -- Existing exclusion constraint and appointment_item_reserve_resources trigger
  -- remain authoritative. Any capacity/overlap failure rolls back the whole call,
  -- including reminder jobs, audit row and the replay ledger reservation.
  insert into public.appointment_items(appointment_id,business_id,service_id,employee_id,
    name_snapshot,duration_minutes,price_minor)
    values(v_id,p_business_id,p_service_id,p_employee_id,v_name,v_duration,v_price);
  update public.staff_booking_requests set appointment_id=v_id
    where business_id=p_business_id and idempotency_key=p_idempotency_key;
  if v_customer_user_id is not null then
    insert into public.notifications(user_id,business_id,appointment_id,type,title,body)
      values(v_customer_user_id,p_business_id,v_id,'appointment_confirmed','Randevunuz oluşturuldu',v_name||' randevunuz işletme tarafından oluşturuldu.');
  end if;
  insert into public.audit_logs(business_id,actor_user_id,action,entity_type,entity_id,after_data)
    values(p_business_id,v_actor,'appointment.staff_created','appointment',v_id::text,
      jsonb_build_object('branch_id',p_branch_id,'service_id',p_service_id,'employee_id',p_employee_id,'starts_at',p_starts_at));
  return v_id;
exception when exclusion_violation then raise exception 'appointment_or_resource_conflict' using errcode='23P01';
end;
$$;
revoke all on function public.create_staff_appointment_atomic(uuid,uuid,uuid,uuid,uuid,timestamptz,text) from public, anon;
grant execute on function public.create_staff_appointment_atomic(uuid,uuid,uuid,uuid,uuid,timestamptz,text) to authenticated;
notify pgrst, 'reload schema';
commit;
