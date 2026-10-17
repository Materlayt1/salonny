-- Booking invariants shared by native/web/direct RPC. No deletion, no old
-- request-payload backfill. Existing conflicting ranges stop this transaction.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
lock table public.appointments,public.customers,public.reviews,public.waitlist_entries in share row exclusive mode;

do $$ begin
  if to_regprocedure('public.create_appointment_with_coupon(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text,text)') is null then
    raise exception 'BOOKING_POLICY_PREREQUISITE_032' using errcode='23514';
  end if;
  if exists(select 1 from public.appointments a join public.appointments b on a.id<b.id
    and a.customer_user_id=b.customer_user_id and a.customer_user_id is not null
    and a.status in('pending','confirmed') and b.status in('pending','confirmed')
    and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(b.starts_at,b.ends_at,'[)'))
    or exists(select 1 from public.appointments a join public.appointments b on a.id<b.id
    and a.customer_id=b.customer_id and a.status in('pending','confirmed') and b.status in('pending','confirmed')
    and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(b.starts_at,b.ends_at,'[)'))
  then raise exception 'BOOKING_CUSTOMER_OVERLAP_INTEGRITY: administrator review required; no changes made' using errcode='23514'; end if;
end $$;

create table public.customer_booking_requests(
  business_id uuid not null references public.businesses(id) on delete restrict,
  idempotency_key text not null check(length(idempotency_key) between 16 and 128 and idempotency_key ~ '^[A-Za-z0-9:_-]+$'),
  actor_user_id uuid not null references public.users(id) on delete restrict,
  request_payload jsonb not null check(jsonb_typeof(request_payload)='object' and octet_length(request_payload::text)<=8192),
  appointment_id uuid not null unique references public.appointments(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(business_id,idempotency_key)
);
alter table public.customer_booking_requests enable row level security;
revoke all on table public.customer_booking_requests from public,anon,authenticated;

create or replace function public.assert_customer_booking_allowed(p_customer_user_id uuid,p_business_id uuid)
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if p_customer_user_id is not null and (
    exists(select 1 from public.businesses where id=p_business_id and owner_user_id=p_customer_user_id)
    or exists(select 1 from public.business_members where business_id=p_business_id and user_id=p_customer_user_id and active)
    or exists(select 1 from public.employees where business_id=p_business_id and user_id=p_customer_user_id and active)
  ) then raise exception 'self_booking_forbidden' using errcode='42501'; end if;
end $$;
revoke execute on function public.assert_customer_booking_allowed(uuid,uuid) from public,anon,authenticated;

create or replace function public.customer_booking_payload(
  p_branch_id uuid,p_employee_id uuid,p_service_id uuid,p_starts_at timestamptz,
  p_customer_name text,p_customer_phone text,p_customer_email text)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select jsonb_build_object('branchId',p_branch_id,'employeeId',p_employee_id,'serviceId',p_service_id,
    'startsAtEpoch',extract(epoch from p_starts_at),'name',trim(p_customer_name),
    'phone',trim(p_customer_phone),'email',nullif(trim(coalesce(p_customer_email,'')),''));
$$;
revoke execute on function public.customer_booking_payload(uuid,uuid,uuid,timestamptz,text,text,text) from public,anon,authenticated;

create or replace function public.guard_appointment_customer_policy()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_customer_user_id uuid;
begin
  -- Old appointments remain visible/cancellable/completable. No retroactive
  -- deletion or unexpected block on terminal cleanup of old self bookings.
  if tg_op='UPDATE' and new.business_id is not distinct from old.business_id
    and new.customer_id is not distinct from old.customer_id
    and new.customer_user_id is not distinct from old.customer_user_id
    and new.starts_at is not distinct from old.starts_at and new.ends_at is not distinct from old.ends_at
    and (new.status is not distinct from old.status or new.status not in('pending','confirmed')) then return new; end if;
  if new.starts_at is null or new.ends_at is null or not isfinite(new.starts_at) or not isfinite(new.ends_at) or new.ends_at<=new.starts_at then
    raise exception 'invalid_booking_input' using errcode='22023';
  end if;
  select user_id into v_customer_user_id from public.customers where id=new.customer_id and business_id=new.business_id;
  if not found then raise exception 'invalid_customer_scope' using errcode='23514'; end if;
  if v_customer_user_id is not null and new.customer_user_id is not null and new.customer_user_id<>v_customer_user_id then
    raise exception 'customer_identity_conflict' using errcode='23505';
  end if;
  -- Staff/legacy series cannot bypass account rules by omitting the linked UID.
  new.customer_user_id:=coalesce(new.customer_user_id,v_customer_user_id);
  perform public.assert_customer_booking_allowed(new.customer_user_id,new.business_id);
  if new.status in('pending','confirmed') and exists(select 1 from public.appointments a
    where a.id<>new.id and a.status in('pending','confirmed')
      and (a.customer_id=new.customer_id or (new.customer_user_id is not null and a.customer_user_id=new.customer_user_id))
      and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(new.starts_at,new.ends_at,'[)')) then
    -- The exclusion constraints below remain authoritative under real races.
    -- 40001 preserves the specific marker through older RPC exception handlers.
    raise exception 'customer_appointment_conflict' using errcode='40001';
  end if;
  return new;
end $$;
revoke execute on function public.guard_appointment_customer_policy() from public,anon,authenticated;
create trigger appointment_customer_policy_guard before insert or update of business_id,customer_id,customer_user_id,starts_at,ends_at,status
  on public.appointments for each row execute function public.guard_appointment_customer_policy();
alter table public.appointments add constraint appointments_customer_no_overlap
  exclude using gist(customer_user_id with =,tstzrange(starts_at,ends_at,'[)') with &&)
  where(customer_user_id is not null and status in('pending','confirmed'));
alter table public.appointments add constraint appointments_customer_record_no_overlap
  exclude using gist(customer_id with =,tstzrange(starts_at,ends_at,'[)') with &&)
  where(status in('pending','confirmed'));

create or replace function public.guard_review_self_policy()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.businesses where id=new.business_id and owner_user_id=new.customer_user_id)
    or exists(select 1 from public.business_members where business_id=new.business_id and user_id=new.customer_user_id and active)
    or exists(select 1 from public.employees where business_id=new.business_id and user_id=new.customer_user_id and active)
  then raise exception 'self_review_forbidden' using errcode='42501'; end if;
  return new;
end $$;
revoke execute on function public.guard_review_self_policy() from public,anon,authenticated;
create trigger review_self_policy_guard before insert or update of business_id,customer_user_id
  on public.reviews for each row execute function public.guard_review_self_policy();

create or replace function public.guard_waitlist_self_policy()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_customer_user_id uuid;
begin
  select user_id into v_customer_user_id from public.customers where id=new.customer_id and business_id=new.business_id;
  if not found then raise exception 'invalid_customer_scope' using errcode='23514'; end if;
  perform public.assert_customer_booking_allowed(v_customer_user_id,new.business_id);
  return new;
end $$;
revoke execute on function public.guard_waitlist_self_policy() from public,anon,authenticated;
create trigger waitlist_self_policy_guard before insert or update of business_id,customer_id
  on public.waitlist_entries for each row execute function public.guard_waitlist_self_policy();

create or replace function public.create_appointment_atomic(
  p_business_id uuid,
  p_branch_id uuid,
  p_employee_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_service_name text;
  v_service_currency text;
  v_buffer_after integer;
  v_customer_id uuid;
  v_appointment_id uuid;
  v_duration integer;
  v_price integer;
  v_ends_at timestamptz;
  v_existing public.appointments%rowtype;
  v_timezone text;
  v_local_date date;
  v_auto_confirm boolean;
  v_status public.appointment_state;
  v_request public.customer_booking_requests%rowtype;
  v_payload jsonb;
  v_constraint text;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if p_business_id is null or p_branch_id is null or p_employee_id is null or p_service_id is null
    or p_starts_at is null or not isfinite(p_starts_at)
    or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
    or p_idempotency_key !~ '^[A-Za-z0-9:_-]+$'
    or char_length(trim(coalesce(p_customer_name,''))) not between 2 and 120
    or coalesce(p_customer_name,'') ~ '[[:cntrl:]]'
    or trim(coalesce(p_customer_phone,'')) !~ '^\+?[0-9 ().-]+$'
    or char_length(regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g')) not between 10 and 15
    or char_length(trim(coalesce(p_customer_phone,'')))>24
    or char_length(trim(coalesce(p_customer_email,''))) not between 3 and 254
    or trim(coalesce(p_customer_email,'')) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then raise exception 'invalid_booking_input' using errcode='22023'; end if;
  perform public.assert_customer_booking_allowed(auth.uid(),p_business_id);
  v_payload:=public.customer_booking_payload(p_branch_id,p_employee_id,p_service_id,p_starts_at,p_customer_name,p_customer_phone,p_customer_email);
  perform pg_advisory_xact_lock(hashtextextended('customer-booking:'||p_business_id::text||':'||p_idempotency_key,0));
  select * into v_request from public.customer_booking_requests where business_id=p_business_id and idempotency_key=p_idempotency_key;
  if found then
    if v_request.actor_user_id is distinct from auth.uid() or v_request.request_payload is distinct from v_payload
      or not exists(select 1 from public.appointments where id=v_request.appointment_id and business_id=p_business_id and customer_user_id=auth.uid())
      or exists(select 1 from public.coupon_redemptions where appointment_id=v_request.appointment_id)
    then raise exception 'BOOKING_KEY_CONFLICT' using errcode='23505'; end if;
    return v_request.appointment_id;
  end if;
  -- Legacy keys have no immutable request snapshot. Check observable scope;
  -- do not fabricate old contact payloads or silently attach a new coupon.
  select * into v_existing from public.appointments where business_id=p_business_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.customer_user_id is distinct from auth.uid() or v_existing.branch_id is distinct from p_branch_id
      or v_existing.employee_id is distinct from p_employee_id or v_existing.starts_at is distinct from p_starts_at
      or not exists(select 1 from public.appointment_items where appointment_id=v_existing.id and service_id=p_service_id)
      or exists(select 1 from public.coupon_redemptions where appointment_id=v_existing.id)
    then raise exception 'BOOKING_KEY_CONFLICT' using errcode='23505'; end if;
    return v_existing.id;
  end if;

  select s.name, s.currency, s.buffer_after_minutes, b.timezone,
         coalesce(es.duration_override_minutes, s.duration_minutes),
         coalesce(es.price_override_minor, bs.price_override_minor, s.price_minor),
         coalesce(settings.auto_confirm, true)
  into strict v_service_name, v_service_currency, v_buffer_after, v_timezone,
              v_duration, v_price, v_auto_confirm
  from public.services s
  join public.businesses b on b.id = s.business_id and b.status = 'published'
  join public.branches branch on branch.id = p_branch_id and branch.business_id = b.id and branch.active
  join public.branch_services bs on bs.service_id = s.id and bs.branch_id = branch.id and bs.active
  join public.employees e on e.id = p_employee_id and e.business_id = b.id and e.active
  join public.employee_services es on es.service_id = s.id and es.employee_id = e.id
  join public.employee_branches eb on eb.employee_id = e.id and eb.branch_id = branch.id
  left join public.business_settings settings on settings.business_id = b.id
  where s.id = p_service_id and s.business_id = p_business_id and s.active;

  v_local_date := (p_starts_at at time zone v_timezone)::date;
  perform pg_advisory_xact_lock(hashtextextended(p_employee_id::text || v_local_date::text, 0));

  perform 1
  from public.get_booking_slots(p_business_id, p_branch_id, p_employee_id, p_service_id, v_local_date) slot
  where slot.starts_at = p_starts_at;
  if not found then raise exception 'slot_not_available' using errcode = '23P01'; end if;

  v_ends_at := p_starts_at + make_interval(mins => v_duration + v_buffer_after);
  v_status := case when v_auto_confirm then 'confirmed'::public.appointment_state else 'pending'::public.appointment_state end;

  insert into public.customers (business_id, user_id, full_name, phone, email)
  values (p_business_id, auth.uid(), trim(p_customer_name), trim(p_customer_phone), nullif(trim(coalesce(p_customer_email, '')), ''))
  on conflict (business_id, phone) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    user_id = coalesce(public.customers.user_id, excluded.user_id)
  where public.customers.user_id is null or public.customers.user_id=excluded.user_id
  returning id into v_customer_id;
  if v_customer_id is null then raise exception 'customer_identity_conflict' using errcode='23505'; end if;

  insert into public.appointments
    (business_id, branch_id, customer_id, customer_user_id, employee_id, status, starts_at, ends_at, total_minor, currency, idempotency_key, created_by)
  values
    (p_business_id, p_branch_id, v_customer_id, auth.uid(), p_employee_id, v_status, p_starts_at, v_ends_at, v_price, v_service_currency, p_idempotency_key, auth.uid())
  returning id into v_appointment_id;

  insert into public.appointment_items
    (appointment_id, business_id, service_id, employee_id, name_snapshot, duration_minutes, price_minor)
  values
    (v_appointment_id, p_business_id, p_service_id, p_employee_id, v_service_name, v_duration, v_price);

  insert into public.notifications (user_id, business_id, appointment_id, type, title, body)
  values (
    auth.uid(), p_business_id, v_appointment_id,
    case when v_status = 'confirmed' then 'appointment_confirmed' else 'appointment_pending' end,
    case when v_status = 'confirmed' then 'Randevunuz onaylandı' else 'Randevu talebiniz alındı' end,
    v_service_name || ' randevunuz oluşturuldu.'
  );

  insert into public.notifications (user_id, business_id, appointment_id, type, title, body)
  select bm.user_id, p_business_id, v_appointment_id, 'new_appointment', 'Yeni randevu', trim(p_customer_name) || ' için ' || v_service_name
  from public.business_members bm
  where bm.business_id = p_business_id and bm.active and bm.role in ('OWNER', 'MANAGER') and bm.user_id <> auth.uid();

  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (p_business_id, auth.uid(), 'appointment.created', 'appointment', v_appointment_id::text,
    jsonb_build_object('status', v_status, 'starts_at', p_starts_at, 'employee_id', p_employee_id, 'service_id', p_service_id));

  insert into public.customer_booking_requests(business_id,idempotency_key,actor_user_id,request_payload,appointment_id)
    values(p_business_id,p_idempotency_key,auth.uid(),v_payload,v_appointment_id);
  return v_appointment_id;
exception
  when exclusion_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint in('appointments_customer_no_overlap','appointments_customer_record_no_overlap') then raise exception 'customer_appointment_conflict' using errcode='23P01'; end if;
    raise exception 'appointment_conflict' using errcode='23P01';
  when no_data_found then raise exception 'booking_configuration_not_found';
end;
$$;

create or replace function public.quote_customer_coupon(p_business_id uuid,p_branch_id uuid,p_employee_id uuid,p_service_id uuid,p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_discount public.discounts%rowtype; v_price integer; v_currency text; v_amount integer; v_segment text; v_visits bigint; v_last timestamptz;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='28000'; end if;
  perform public.assert_customer_booking_allowed(auth.uid(),p_business_id);
  if upper(trim(coalesce(p_code,''))) !~ '^[A-Z0-9_-]{3,30}$' then raise exception 'COUPON_UNAVAILABLE' using errcode='22023'; end if;
  select * into v_discount from public.discounts where business_id=p_business_id and upper(trim(code))=upper(trim(p_code)) and active;
  if not found or (v_discount.starts_at is not null and v_discount.starts_at>now()) or (v_discount.ends_at is not null and v_discount.ends_at<=now())
    or v_discount.value<=0 or (v_discount.kind='percentage' and v_discount.value>100) then raise exception 'COUPON_UNAVAILABLE' using errcode='P0001'; end if;
  v_segment:='all';
  if v_discount.campaign_id is not null then
    select coalesce(audience_filter->>'segment','all') into v_segment from public.campaigns
      where id=v_discount.campaign_id and business_id=p_business_id and status in('active','scheduled');
    if not found then raise exception 'COUPON_UNAVAILABLE' using errcode='P0001'; end if;
  end if;
  select count(*),max(ends_at) into v_visits,v_last from public.appointments where business_id=p_business_id and customer_user_id=auth.uid() and status='completed';
  if v_segment not in('all','new','loyal','inactive') or (v_segment='new' and v_visits>0) or (v_segment='loyal' and v_visits<5)
    or (v_segment='inactive' and (v_last is null or v_last>now()-interval '90 days')) then raise exception 'COUPON_NOT_ELIGIBLE' using errcode='P0001'; end if;
  if exists(select 1 from public.coupon_redemptions where business_id=p_business_id and code=upper(trim(p_code)) and customer_user_id=auth.uid()) then raise exception 'COUPON_ALREADY_USED' using errcode='P0001'; end if;
  if v_discount.usage_limit is not null and (select count(*) from public.coupon_redemptions where discount_id=v_discount.id)>=v_discount.usage_limit then raise exception 'COUPON_LIMIT' using errcode='P0001'; end if;
  select coalesce(es.price_override_minor,bs.price_override_minor,s.price_minor),s.currency into v_price,v_currency
    from public.services s join public.businesses b on b.id=s.business_id and b.status='published'
    join public.branches br on br.id=p_branch_id and br.business_id=b.id and br.active
    join public.branch_services bs on bs.branch_id=br.id and bs.service_id=s.id and bs.active
    join public.employees e on e.id=p_employee_id and e.business_id=b.id and e.active
    join public.employee_services es on es.employee_id=e.id and es.service_id=s.id
    join public.employee_branches eb on eb.employee_id=e.id and eb.branch_id=br.id
    where s.id=p_service_id and s.business_id=p_business_id and s.active;
  if not found or v_price<0 then raise exception 'COUPON_UNAVAILABLE' using errcode='P0001'; end if;
  v_amount:=least(v_price,case when v_discount.kind='percentage' then (v_price::bigint*v_discount.value/100)::integer else v_discount.value end);
  if v_amount<=0 then raise exception 'COUPON_UNAVAILABLE' using errcode='P0001'; end if;
  return jsonb_build_object('code',upper(trim(p_code)),'subtotalMinor',v_price,'discountMinor',v_amount,'totalMinor',v_price-v_amount,'currency',trim(v_currency));
end $$;

create or replace function public.create_appointment_with_coupon(
  p_business_id uuid,p_branch_id uuid,p_employee_id uuid,p_service_id uuid,p_starts_at timestamptz,
  p_customer_name text,p_customer_phone text,p_customer_email text,p_idempotency_key text,p_coupon_code text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_discount public.discounts%rowtype; v_campaign_id uuid; v_existing public.appointments%rowtype; v_saved public.appointments%rowtype;
  v_use public.coupon_redemptions%rowtype; v_id uuid; v_amount integer; v_constraint text;
  v_request public.customer_booking_requests%rowtype; v_payload jsonb;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='28000'; end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128 then raise exception 'INVALID_BOOKING' using errcode='22023'; end if;
  if upper(trim(coalesce(p_coupon_code,''))) !~ '^[A-Z0-9_-]{3,30}$' then raise exception 'COUPON_UNAVAILABLE' using errcode='22023'; end if;
  -- Serialize retries by business/key before discount -> booking locks. Private
  -- ledger remains authoritative even if a campaign code/value later changes.
  perform public.assert_customer_booking_allowed(auth.uid(),p_business_id);
  v_payload:=public.customer_booking_payload(p_branch_id,p_employee_id,p_service_id,p_starts_at,p_customer_name,p_customer_phone,p_customer_email);
  -- Plain and coupon paths share the lock BEFORE lookup/campaign/discount locks.
  perform pg_advisory_xact_lock(hashtextextended('customer-booking:'||p_business_id::text||':'||p_idempotency_key,0));
  select * into v_request from public.customer_booking_requests where business_id=p_business_id and idempotency_key=p_idempotency_key;
  if found and (v_request.actor_user_id is distinct from auth.uid() or v_request.request_payload is distinct from v_payload) then raise exception 'BOOKING_KEY_CONFLICT' using errcode='P0001'; end if;
  select * into v_existing from public.appointments where business_id=p_business_id and idempotency_key=p_idempotency_key;
  if found then
    select * into v_use from public.coupon_redemptions where appointment_id=v_existing.id;
    if v_existing.customer_user_id is distinct from auth.uid() or v_use.code is distinct from upper(trim(p_coupon_code))
      or (v_request.appointment_id is not null and v_request.appointment_id<>v_existing.id)
      or (v_request.appointment_id is null and (v_existing.branch_id is distinct from p_branch_id or v_existing.employee_id is distinct from p_employee_id or v_existing.starts_at is distinct from p_starts_at))
      or not exists(select 1 from public.appointment_items where appointment_id=v_existing.id and service_id=p_service_id)
    then raise exception 'BOOKING_KEY_CONFLICT' using errcode='P0001'; end if;
    return jsonb_build_object('id',v_existing.id,'status',v_existing.status,'subtotalMinor',v_use.subtotal_minor,'discountMinor',v_use.discount_minor,'totalMinor',v_existing.total_minor,'currency',trim(v_existing.currency),'couponCode',v_use.code);
  end if;
  -- Campaign status mutations lock campaign then discounts, so keep that order.
  select * into v_discount from public.discounts where business_id=p_business_id and upper(trim(code))=upper(trim(p_coupon_code));
  if not found then raise exception 'COUPON_UNAVAILABLE' using errcode='P0001'; end if;
  v_campaign_id:=v_discount.campaign_id;
  if v_discount.campaign_id is not null then perform 1 from public.campaigns where id=v_discount.campaign_id and business_id=p_business_id for share; end if;
  select * into v_discount from public.discounts where id=v_discount.id for update;
  if not found or v_discount.business_id is distinct from p_business_id or v_discount.campaign_id is distinct from v_campaign_id then raise exception 'COUPON_CHANGED' using errcode='P0001'; end if;
  perform public.quote_customer_coupon(p_business_id,p_branch_id,p_employee_id,p_service_id,p_coupon_code);
  v_id:=public.create_appointment_atomic(p_business_id,p_branch_id,p_employee_id,p_service_id,p_starts_at,p_customer_name,p_customer_phone,p_customer_email,p_idempotency_key);
  select * into v_saved from public.appointments where id=v_id and business_id=p_business_id and customer_user_id=auth.uid() for update;
  if not found then raise exception 'INVALID_BOOKING' using errcode='P0001'; end if;
  if v_saved.branch_id is distinct from p_branch_id or v_saved.employee_id is distinct from p_employee_id or v_saved.starts_at is distinct from p_starts_at
    or v_saved.starts_at<=now() or exists(select 1 from public.coupon_redemptions where appointment_id=v_id)
    or not exists(select 1 from public.appointment_items where appointment_id=v_id and service_id=p_service_id)
  then raise exception 'BOOKING_KEY_CONFLICT' using errcode='P0001'; end if;
  -- Use the actual committed booking price, not the earlier display quote.
  v_amount:=least(v_saved.total_minor,case when v_discount.kind='percentage' then (v_saved.total_minor::bigint*v_discount.value/100)::integer else v_discount.value end);
  if v_amount<=0 then raise exception 'COUPON_UNAVAILABLE' using errcode='P0001'; end if;
  insert into public.coupon_redemptions(business_id,discount_id,code,customer_user_id,customer_id,appointment_id,subtotal_minor,discount_minor,kind,value)
    values(p_business_id,v_discount.id,upper(trim(p_coupon_code)),auth.uid(),v_saved.customer_id,v_id,v_saved.total_minor,v_amount,v_discount.kind,v_discount.value);
  update public.appointments set total_minor=v_saved.total_minor-v_amount where id=v_id;
  return jsonb_build_object('id',v_id,'status',v_saved.status,'subtotalMinor',v_saved.total_minor,'discountMinor',v_amount,'totalMinor',v_saved.total_minor-v_amount,'currency',trim(v_saved.currency),'couponCode',upper(trim(p_coupon_code)));
exception when unique_violation then
  get stacked diagnostics v_constraint=constraint_name;
  if v_constraint in('coupon_user_once','coupon_customer_once','coupon_appointment_once') then raise exception 'COUPON_ALREADY_USED' using errcode='P0001'; end if;
  raise;
end $$;

create or replace function public.get_appointment_reschedule_slots(
  p_appointment_id uuid,
  p_date date
) returns table(starts_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments%rowtype;
  v_timezone text;
  v_duration integer;
  v_buffer_after integer;
  v_weekday integer;
  v_booking_window integer;
  v_minimum_notice integer;
  v_local_today date;
  v_has_employee_hours boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select * into v_appointment
  from public.appointments
  where id = p_appointment_id and customer_user_id = auth.uid();

  if not found then raise exception 'appointment_not_found'; end if;
  if v_appointment.status not in ('pending', 'confirmed') then raise exception 'appointment_not_changeable'; end if;
  perform public.assert_customer_booking_allowed(auth.uid(),v_appointment.business_id);
  if v_appointment.party_size>1 or (select count(*) from public.appointment_items where appointment_id=v_appointment.id)>1 then
    raise exception 'unsupported_customer_reschedule' using errcode='22023';
  end if;
  if not exists(select 1 from public.businesses b join public.branches br on br.business_id=b.id and br.id=v_appointment.branch_id and br.active
    join public.employees e on e.business_id=b.id and e.id=v_appointment.employee_id and e.active
    join public.employee_branches eb on eb.employee_id=e.id and eb.branch_id=br.id
    join public.appointment_items ai on ai.appointment_id=v_appointment.id and ai.business_id=b.id
    join public.services s on s.id=ai.service_id and s.business_id=b.id and s.active
    join public.branch_services bs on bs.branch_id=br.id and bs.service_id=s.id and bs.active
    join public.employee_services es on es.employee_id=e.id and es.service_id=s.id
    where b.id=v_appointment.business_id and b.status='published')
  then raise exception 'booking_configuration_not_found' using errcode='22023'; end if;


  select b.timezone,
         greatest(1,(extract(epoch from (v_appointment.ends_at-v_appointment.starts_at))/60)::integer),
         0,
         coalesce(bs.booking_window_days, 60),
         coalesce(bs.minimum_notice_minutes, 120)
  into v_timezone, v_duration, v_buffer_after, v_booking_window, v_minimum_notice
  from public.businesses b
  left join public.business_settings bs on bs.business_id = b.id
  left join public.appointment_items ai on ai.appointment_id = v_appointment.id
  left join public.services s on s.id = ai.service_id
  where b.id = v_appointment.business_id
  order by ai.sort_order nulls last
  limit 1;

  v_local_today := (now() at time zone v_timezone)::date;
  if p_date < v_local_today or p_date > v_local_today + v_booking_window then return; end if;
  v_weekday := extract(isodow from p_date)::integer - 1;

  select exists(
    select 1 from public.employee_working_hours ewh
    where ewh.employee_id = v_appointment.employee_id
      and ewh.branch_id = v_appointment.branch_id
      and ewh.weekday = v_weekday
      and (ewh.valid_from is null or ewh.valid_from <= p_date)
      and (ewh.valid_until is null or ewh.valid_until >= p_date)
  ) into v_has_employee_hours;

  return query
  with working_periods as (
    select ewh.starts_at, ewh.ends_at
    from public.employee_working_hours ewh
    where v_has_employee_hours
      and ewh.employee_id = v_appointment.employee_id
      and ewh.branch_id = v_appointment.branch_id
      and ewh.weekday = v_weekday
      and (ewh.valid_from is null or ewh.valid_from <= p_date)
      and (ewh.valid_until is null or ewh.valid_until >= p_date)
    union all
    select bh.opens_at, bh.closes_at
    from public.business_hours bh
    where not v_has_employee_hours
      and bh.branch_id = v_appointment.branch_id
      and bh.weekday = v_weekday
      and not bh.is_closed
      and (bh.valid_from is null or bh.valid_from <= p_date)
      and (bh.valid_until is null or bh.valid_until >= p_date)
  ), candidate_slots as (
    select generated.local_start,
           generated.local_start + make_interval(mins => v_duration + v_buffer_after) as local_end
    from working_periods wp
    cross join lateral generate_series(
      p_date + wp.starts_at,
      p_date + wp.ends_at - make_interval(mins => v_duration + v_buffer_after),
      interval '30 minutes'
    ) as generated(local_start)
  ), zoned_slots as (
    select cs.local_start at time zone v_timezone as slot_start,
           cs.local_end at time zone v_timezone as slot_end,
           cs.local_start::time as local_start_time,
           cs.local_end::time as local_end_time
    from candidate_slots cs
  )
  select zs.slot_start
  from zoned_slots zs
  where zs.slot_start >= now() + make_interval(mins => v_minimum_notice)
    and not exists (
      select 1 from public.business_breaks bb
      where bb.branch_id = v_appointment.branch_id
        and bb.weekday = v_weekday
        and tsrange(p_date + bb.starts_at, p_date + bb.ends_at, '[)') &&
            tsrange(p_date + zs.local_start_time, p_date + zs.local_end_time, '[)')
    )
    and not exists (
      select 1 from public.employee_time_off eto
      where eto.employee_id = v_appointment.employee_id
        and tstzrange(eto.starts_at, eto.ends_at, '[)') && tstzrange(zs.slot_start, zs.slot_end, '[)')
    )
    and not exists (
      select 1 from public.appointments other
      where (other.employee_id = v_appointment.employee_id or other.customer_id = v_appointment.customer_id or other.customer_user_id = auth.uid())
        and other.id <> v_appointment.id
        and other.status in ('pending', 'confirmed')
        and tstzrange(other.starts_at, other.ends_at, '[)') && tstzrange(zs.slot_start, zs.slot_end, '[)')
    )
  order by zs.slot_start;
end;
$$;

create or replace function public.reschedule_customer_appointment(
  p_appointment_id uuid,
  p_new_starts_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments%rowtype;
  v_timezone text;
  v_duration integer;
  v_buffer_after integer;
  v_minimum_notice integer;
  v_new_ends_at timestamptz;
  v_local_start timestamp;
  v_local_end timestamp;
  v_weekday integer;
  v_has_employee_hours boolean;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '28000'; end if;

  select * into v_appointment
  from public.appointments
  where id = p_appointment_id and customer_user_id = auth.uid()
  for update;

  if not found then raise exception 'appointment_not_found'; end if;
  if v_appointment.status not in ('pending', 'confirmed') then raise exception 'appointment_not_changeable'; end if;
  perform public.assert_customer_booking_allowed(auth.uid(),v_appointment.business_id);
  if v_appointment.party_size>1 or (select count(*) from public.appointment_items where appointment_id=v_appointment.id)>1 then
    raise exception 'unsupported_customer_reschedule' using errcode='22023';
  end if;
  if not exists(select 1 from public.businesses b join public.branches br on br.business_id=b.id and br.id=v_appointment.branch_id and br.active
    join public.employees e on e.business_id=b.id and e.id=v_appointment.employee_id and e.active
    join public.employee_branches eb on eb.employee_id=e.id and eb.branch_id=br.id
    join public.appointment_items ai on ai.appointment_id=v_appointment.id and ai.business_id=b.id
    join public.services s on s.id=ai.service_id and s.business_id=b.id and s.active
    join public.branch_services bs on bs.branch_id=br.id and bs.service_id=s.id and bs.active
    join public.employee_services es on es.employee_id=e.id and es.service_id=s.id
    where b.id=v_appointment.business_id and b.status='published')
  then raise exception 'booking_configuration_not_found' using errcode='22023'; end if;


  select b.timezone,
         greatest(1,(extract(epoch from (v_appointment.ends_at-v_appointment.starts_at))/60)::integer),
         0,
         coalesce(bs.minimum_notice_minutes, 120)
  into v_timezone, v_duration, v_buffer_after, v_minimum_notice
  from public.businesses b
  left join public.business_settings bs on bs.business_id = b.id
  left join public.appointment_items ai on ai.appointment_id = v_appointment.id
  left join public.services s on s.id = ai.service_id
  where b.id = v_appointment.business_id
  order by ai.sort_order nulls last
  limit 1;

  if p_new_starts_at is null or not isfinite(p_new_starts_at) then raise exception 'invalid_booking_input' using errcode='22023'; end if;
  if p_new_starts_at < now() + make_interval(mins => v_minimum_notice) then raise exception 'minimum_notice_required'; end if;
  if (p_new_starts_at at time zone v_timezone)::date>(now() at time zone v_timezone)::date
    +coalesce((select booking_window_days from public.business_settings where business_id=v_appointment.business_id),60)
  then raise exception 'outside_booking_window' using errcode='22023'; end if;
  perform 1 from public.get_appointment_reschedule_slots(p_appointment_id,(p_new_starts_at at time zone v_timezone)::date) slot where slot.starts_at=p_new_starts_at;
  if not found then raise exception 'slot_not_available' using errcode='23P01'; end if;

  v_new_ends_at := p_new_starts_at + make_interval(mins => v_duration + v_buffer_after);
  v_local_start := p_new_starts_at at time zone v_timezone;
  v_local_end := v_new_ends_at at time zone v_timezone;
  if v_local_start::date <> v_local_end::date then raise exception 'outside_working_hours'; end if;
  v_weekday := extract(isodow from v_local_start)::integer - 1;

  select exists(
    select 1 from public.employee_working_hours ewh
    where ewh.employee_id = v_appointment.employee_id
      and ewh.branch_id = v_appointment.branch_id
      and ewh.weekday = v_weekday
      and (ewh.valid_from is null or ewh.valid_from <= v_local_start::date)
      and (ewh.valid_until is null or ewh.valid_until >= v_local_start::date)
  ) into v_has_employee_hours;

  if v_has_employee_hours then
    if not exists (
      select 1 from public.employee_working_hours ewh
      where ewh.employee_id = v_appointment.employee_id and ewh.branch_id = v_appointment.branch_id and ewh.weekday = v_weekday
        and v_local_start::time >= ewh.starts_at and v_local_end::time <= ewh.ends_at
        and (ewh.valid_from is null or ewh.valid_from <= v_local_start::date)
        and (ewh.valid_until is null or ewh.valid_until >= v_local_start::date)
    ) then raise exception 'outside_working_hours'; end if;
  elsif not exists (
    select 1 from public.business_hours bh
    where bh.branch_id = v_appointment.branch_id and bh.weekday = v_weekday and not bh.is_closed
      and v_local_start::time >= bh.opens_at and v_local_end::time <= bh.closes_at
      and (bh.valid_from is null or bh.valid_from <= v_local_start::date)
      and (bh.valid_until is null or bh.valid_until >= v_local_start::date)
  ) then raise exception 'outside_working_hours'; end if;

  if exists (
    select 1 from public.business_breaks bb
    where bb.branch_id = v_appointment.branch_id and bb.weekday = v_weekday
      and tsrange(v_local_start::date + bb.starts_at, v_local_start::date + bb.ends_at, '[)') && tsrange(v_local_start, v_local_end, '[)')
  ) then raise exception 'appointment_conflict'; end if;

  if exists (
    select 1 from public.employee_time_off eto
    where eto.employee_id = v_appointment.employee_id and tstzrange(eto.starts_at, eto.ends_at, '[)') && tstzrange(p_new_starts_at, v_new_ends_at, '[)')
  ) then raise exception 'appointment_conflict'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_appointment.employee_id::text || v_local_start::date::text, 0));

  update public.appointments
  set starts_at = p_new_starts_at, ends_at = v_new_ends_at
  where id = v_appointment.id;

  insert into public.notifications (user_id, business_id, appointment_id, type, title, body, data)
  values (auth.uid(), v_appointment.business_id, v_appointment.id, 'appointment_rescheduled', 'Randevu saatiniz değiştirildi',
    to_char(v_local_start, 'DD.MM.YYYY HH24:MI'), jsonb_build_object('starts_at', p_new_starts_at));

  insert into public.notifications (user_id, business_id, appointment_id, type, title, body, data)
  select bm.user_id, v_appointment.business_id, v_appointment.id, 'appointment_rescheduled_by_customer', 'Müşteri randevu saatini değiştirdi',
    to_char(v_local_start, 'DD.MM.YYYY HH24:MI'), jsonb_build_object('starts_at', p_new_starts_at)
  from public.business_members bm
  where bm.business_id = v_appointment.business_id and bm.active and bm.role in ('OWNER', 'MANAGER') and bm.user_id <> auth.uid();

  insert into public.audit_logs (business_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (v_appointment.business_id, auth.uid(), 'appointment.customer_rescheduled', 'appointment', v_appointment.id::text,
    jsonb_build_object('starts_at', v_appointment.starts_at, 'ends_at', v_appointment.ends_at),
    jsonb_build_object('starts_at', p_new_starts_at, 'ends_at', v_new_ends_at));

  return jsonb_build_object('id', v_appointment.id, 'status', v_appointment.status, 'starts_at', p_new_starts_at, 'ends_at', v_new_ends_at);
exception when exclusion_violation then
  raise exception 'appointment_conflict' using errcode = '23P01';
end;
$$;

revoke execute on function public.get_appointment_reschedule_slots(uuid,date) from public,anon;
grant execute on function public.get_appointment_reschedule_slots(uuid,date) to authenticated;
revoke execute on function public.reschedule_customer_appointment(uuid,timestamptz) from public,anon;
grant execute on function public.reschedule_customer_appointment(uuid,timestamptz) to authenticated;
revoke execute on function public.create_appointment_atomic(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text) from public,anon;
grant execute on function public.create_appointment_atomic(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text) to authenticated;
revoke execute on function public.create_appointment_with_coupon(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text,text) from public,anon;
grant execute on function public.create_appointment_with_coupon(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text,text) to authenticated;
revoke execute on function public.quote_customer_coupon(uuid,uuid,uuid,uuid,text) from public,anon;
grant execute on function public.quote_customer_coupon(uuid,uuid,uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
