-- Customer coupons: authoritative pricing and one-use ledger in the same
-- transaction as booking. Cancellation does not silently restore a coupon.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$ begin
  if exists(select 1 from public.discounts where code is not null group by business_id,upper(trim(code)) having count(*)>1) then
    raise exception 'coupon_code_integrity_violation: review required; no changes made';
  end if;
end $$;
create unique index discounts_normalized_code_key on public.discounts(business_id,upper(trim(code))) where code is not null;
create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  discount_id uuid not null references public.discounts(id) on delete restrict,
  code text not null,
  customer_user_id uuid not null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  appointment_id uuid not null references public.appointments(id) on delete restrict,
  subtotal_minor integer not null check(subtotal_minor>=0),
  discount_minor integer not null check(discount_minor>0 and discount_minor<=subtotal_minor),
  kind text not null check(kind in('percentage','fixed')),
  value integer not null check(value>0),
  created_at timestamptz not null default now(),
  constraint coupon_user_once unique(business_id,code,customer_user_id),
  constraint coupon_customer_once unique(business_id,code,customer_id),
  constraint coupon_appointment_once unique(appointment_id)
);
create index coupon_redemptions_discount_idx on public.coupon_redemptions(discount_id);
alter table public.coupon_redemptions enable row level security;
revoke all privileges on public.coupon_redemptions from public,anon,authenticated;

-- No user/appointment data in the public offer list. Eligibility is evaluated
-- privately at quote and again during booking, not implied by this banner.
create or replace function public.list_business_coupons(p_business_id uuid)
returns table(code text,kind text,value integer,ends_at timestamptz,audience text)
language sql stable security definer set search_path='' as $$
  select upper(trim(d.code)),d.kind,d.value,d.ends_at,coalesce(c.audience_filter->>'segment','all')
  from public.discounts d join public.businesses b on b.id=d.business_id and b.status='published'
  left join public.campaigns c on c.id=d.campaign_id and c.business_id=d.business_id
  where d.business_id=p_business_id and d.active and upper(trim(d.code)) ~ '^[A-Z0-9_-]{3,30}$'
    and d.value>0 and (d.kind='fixed' or (d.kind='percentage' and d.value<=100))
    and (d.starts_at is null or d.starts_at<=now()) and (d.ends_at is null or d.ends_at>now())
    and (d.campaign_id is null or (c.id is not null and c.status in('active','scheduled')))
    and (d.usage_limit is null or (select count(*) from public.coupon_redemptions r where r.discount_id=d.id)<d.usage_limit)
  order by d.id limit 20;
$$;
revoke execute on function public.list_business_coupons(uuid) from public;
grant execute on function public.list_business_coupons(uuid) to anon,authenticated;

create or replace function public.quote_customer_coupon(p_business_id uuid,p_branch_id uuid,p_employee_id uuid,p_service_id uuid,p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_discount public.discounts%rowtype; v_price integer; v_currency text; v_amount integer; v_segment text; v_visits bigint; v_last timestamptz;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='28000'; end if;
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
revoke execute on function public.quote_customer_coupon(uuid,uuid,uuid,uuid,text) from public,anon;
grant execute on function public.quote_customer_coupon(uuid,uuid,uuid,uuid,text) to authenticated;

create or replace function public.create_appointment_with_coupon(
  p_business_id uuid,p_branch_id uuid,p_employee_id uuid,p_service_id uuid,p_starts_at timestamptz,
  p_customer_name text,p_customer_phone text,p_customer_email text,p_idempotency_key text,p_coupon_code text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_discount public.discounts%rowtype; v_campaign_id uuid; v_existing public.appointments%rowtype; v_saved public.appointments%rowtype;
  v_use public.coupon_redemptions%rowtype; v_id uuid; v_amount integer; v_constraint text;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='28000'; end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128 then raise exception 'INVALID_BOOKING' using errcode='22023'; end if;
  if upper(trim(coalesce(p_coupon_code,''))) !~ '^[A-Z0-9_-]{3,30}$' then raise exception 'COUPON_UNAVAILABLE' using errcode='22023'; end if;
  -- Serialize retries by business/key before discount -> booking locks. Private
  -- ledger remains authoritative even if a campaign code/value later changes.
  perform pg_advisory_xact_lock(hashtextextended('coupon-booking:'||p_business_id::text||':'||p_idempotency_key,0));
  select * into v_existing from public.appointments where business_id=p_business_id and idempotency_key=p_idempotency_key;
  if found then
    select * into v_use from public.coupon_redemptions where appointment_id=v_existing.id;
    if v_existing.customer_user_id is distinct from auth.uid() or v_existing.branch_id is distinct from p_branch_id or v_existing.employee_id is distinct from p_employee_id
      or v_existing.starts_at is distinct from p_starts_at or v_use.code is distinct from upper(trim(p_coupon_code))
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
revoke execute on function public.create_appointment_with_coupon(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text,text) from public,anon;
grant execute on function public.create_appointment_with_coupon(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
