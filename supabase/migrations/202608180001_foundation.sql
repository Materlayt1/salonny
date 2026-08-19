-- Salonny foundation schema
-- Run with `supabase db reset` locally or through the Supabase migration runner.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create type public.app_role as enum ('CUSTOMER', 'BUSINESS_OWNER', 'BUSINESS_MANAGER', 'EMPLOYEE', 'ADMIN');
create type public.business_member_role as enum ('OWNER', 'MANAGER', 'EMPLOYEE');
create type public.appointment_state as enum ('pending', 'confirmed', 'completed', 'cancelled', 'no_show');
create type public.payment_state as enum ('pending', 'paid', 'refunded', 'failed');
create type public.payment_method as enum ('online', 'deposit', 'cash', 'card_at_business');
create type public.inventory_movement as enum ('in', 'out', 'adjustment');
create type public.notification_channel as enum ('in_app', 'push', 'email', 'sms', 'whatsapp');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'CUSTOMER',
  full_name text,
  phone text,
  avatar_path text,
  city text,
  locale text not null default 'tr-TR',
  timezone text not null default 'Europe/Istanbul',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.business_categories(id),
  slug text not null unique,
  name_tr text not null,
  icon text,
  filter_schema jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.business_categories(id),
  owner_user_id uuid not null references public.users(id),
  name text not null,
  slug text not null unique,
  description text,
  phone text,
  email text,
  whatsapp_phone text,
  website_url text,
  timezone text not null default 'Europe/Istanbul',
  status text not null default 'draft' check (status in ('draft', 'pending_review', 'published', 'suspended')),
  verified_at timestamptz,
  onboarding_completed_at timestamptz,
  rating_average numeric(3,2) not null default 0,
  review_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.business_member_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  slug text not null,
  phone text,
  email text,
  timezone text not null default 'Europe/Istanbul',
  active boolean not null default true,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, slug)
);

create table public.business_locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  address_line text not null,
  district text not null,
  city text not null,
  postal_code text,
  country_code char(2) not null default 'TR',
  latitude numeric(9,6) not null,
  longitude numeric(9,6) not null,
  geohash text,
  created_at timestamptz not null default now()
);

create table public.business_images (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  storage_path text not null,
  alt_text text,
  kind text not null default 'gallery' check (kind in ('logo', 'cover', 'gallery')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  valid_from date,
  valid_until date,
  check (is_closed or (opens_at is not null and closes_at is not null and opens_at < closes_at))
);

create table public.business_breaks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  check (starts_at < ends_at)
);

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  category_id uuid references public.service_categories(id) on delete set null,
  name text not null,
  description text,
  duration_minutes integer not null check (duration_minutes between 5 and 1440),
  price_minor integer not null check (price_minor >= 0),
  currency char(3) not null default 'TRY',
  buffer_before_minutes integer not null default 0 check (buffer_before_minutes >= 0),
  buffer_after_minutes integer not null default 0 check (buffer_after_minutes >= 0),
  deposit_type text check (deposit_type in ('fixed', 'percentage')),
  deposit_value integer,
  image_path text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.branch_services (
  branch_id uuid not null references public.branches(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  active boolean not null default true,
  price_override_minor integer,
  primary key (branch_id, service_id)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  display_name text not null,
  title text,
  bio text,
  avatar_path text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.employee_branches (
  employee_id uuid not null references public.employees(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  primary key (employee_id, branch_id)
);

create table public.employee_services (
  employee_id uuid not null references public.employees(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  price_override_minor integer,
  duration_override_minutes integer,
  primary key (employee_id, service_id)
);

create table public.employee_working_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  valid_from date,
  valid_until date,
  check (starts_at < ends_at)
);

create table public.employee_time_off (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  kind text not null default 'leave' check (kind in ('leave', 'vacation', 'blocked', 'break')),
  note text,
  check (starts_at < ends_at)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  full_name text not null,
  phone text not null,
  email text,
  notes text,
  marketing_consent boolean not null default false,
  total_visits integer not null default 0,
  total_spend_minor bigint not null default 0,
  last_visit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, phone)
);

create table public.appointment_statuses (
  code public.appointment_state primary key,
  name_tr text not null,
  terminal boolean not null default false,
  sort_order integer not null
);
insert into public.appointment_statuses values
  ('pending', 'Bekliyor', false, 10), ('confirmed', 'Onaylandı', false, 20),
  ('completed', 'Tamamlandı', true, 30), ('cancelled', 'İptal', true, 40), ('no_show', 'Gelmedi', true, 50);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  customer_user_id uuid references public.users(id) on delete set null,
  employee_id uuid not null references public.employees(id) on delete restrict,
  status public.appointment_state not null default 'pending' references public.appointment_statuses(code),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  total_minor integer not null default 0,
  currency char(3) not null default 'TRY',
  customer_note text,
  business_note text,
  cancellation_reason text,
  cancelled_at timestamptz,
  idempotency_key text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at),
  unique (business_id, idempotency_key)
);

-- PostgreSQL enforces the central product invariant even under concurrent requests.
alter table public.appointments add constraint appointments_employee_no_overlap
  exclude using gist (employee_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
  where (status in ('pending', 'confirmed'));

create table public.appointment_items (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  name_snapshot text not null,
  duration_minutes integer not null,
  price_minor integer not null,
  sort_order integer not null default 0
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  appointment_id uuid references public.appointments(id) on delete set null,
  customer_user_id uuid references public.users(id) on delete set null,
  provider text not null,
  provider_reference text,
  method public.payment_method not null,
  status public.payment_state not null default 'pending',
  amount_minor integer not null check (amount_minor >= 0),
  commission_minor integer not null default 0,
  currency char(3) not null default 'TRY',
  metadata jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  appointment_id uuid not null unique references public.appointments(id) on delete restrict,
  customer_user_id uuid not null references public.users(id) on delete restrict,
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 2000),
  business_reply text check (char_length(business_reply) <= 2000),
  moderation_status text not null default 'pending' check (moderation_status in ('pending', 'approved', 'rejected', 'flagged')),
  created_at timestamptz not null default now(),
  replied_at timestamptz
);

create table public.favorites (
  user_id uuid not null references public.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, business_id)
);

create table public.notification_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  push_enabled boolean not null default true,
  email_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  whatsapp_enabled boolean not null default false,
  marketing_enabled boolean not null default false,
  quiet_hours jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel public.notification_channel not null,
  provider text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed')),
  provider_reference text,
  error_code text,
  attempted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_user_id uuid references public.users(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  channel text not null default 'in_app' check (channel in ('in_app', 'whatsapp', 'sms')),
  provider_reference text,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  sender_user_id uuid references public.users(id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  body text not null,
  provider_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  audience_filter jsonb not null default '{}'::jsonb,
  content jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'active', 'completed', 'cancelled')),
  scheduled_at timestamptz,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.discounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  code text,
  kind text not null check (kind in ('percentage', 'fixed')),
  value integer not null check (value > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer,
  per_customer_limit integer not null default 1,
  active boolean not null default true,
  unique (business_id, code)
);

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  price_minor integer,
  currency char(3) not null default 'TRY',
  interval text check (interval in ('month', 'year')),
  features jsonb not null default '{}'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  active boolean not null default true
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  status text not null check (status in ('trialing', 'active', 'past_due', 'cancelled')),
  provider text,
  provider_reference text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

create table public.business_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  booking_window_days integer not null default 60,
  minimum_notice_minutes integer not null default 120,
  cancellation_notice_minutes integer not null default 1440,
  auto_confirm boolean not null default true,
  require_deposit boolean not null default false,
  allow_waitlist boolean not null default false,
  custom_fields jsonb not null default '[]'::jsonb,
  provider_settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.inventory_products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  name text not null,
  sku text not null,
  stock_quantity numeric(12,3) not null default 0,
  minimum_stock numeric(12,3) not null default 0,
  purchase_price_minor integer,
  sale_price_minor integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, sku)
);

create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  product_id uuid not null references public.inventory_products(id) on delete restrict,
  appointment_id uuid references public.appointments(id) on delete set null,
  movement public.inventory_movement not null,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_cost_minor integer,
  note text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.sponsored_campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  city text,
  district text,
  category_id uuid references public.business_categories(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  budget_minor integer not null check (budget_minor > 0),
  spent_minor integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed')),
  check (starts_at < ends_at)
);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  document_type text not null,
  document_version text not null,
  granted boolean not null,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  business_id uuid references public.businesses(id) on delete set null,
  actor_user_id uuid references public.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create index businesses_category_status_idx on public.businesses(category_id, status);
create index business_locations_city_district_idx on public.business_locations(city, district);
create index business_locations_coordinates_idx on public.business_locations(latitude, longitude);
create index services_business_active_idx on public.services(business_id, active);
create index employees_business_active_idx on public.employees(business_id, active);
create index appointments_business_start_idx on public.appointments(business_id, starts_at);
create index appointments_branch_start_idx on public.appointments(branch_id, starts_at);
create index appointments_customer_user_idx on public.appointments(customer_user_id, starts_at desc);
create index notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index reviews_business_approved_idx on public.reviews(business_id, created_at desc) where moderation_status = 'approved';
create index messages_conversation_created_idx on public.messages(conversation_id, created_at);

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

create trigger users_touch before update on public.users for each row execute function public.touch_updated_at();
create trigger businesses_touch before update on public.businesses for each row execute function public.touch_updated_at();
create trigger branches_touch before update on public.branches for each row execute function public.touch_updated_at();
create trigger services_touch before update on public.services for each row execute function public.touch_updated_at();
create trigger employees_touch before update on public.employees for each row execute function public.touch_updated_at();
create trigger customers_touch before update on public.customers for each row execute function public.touch_updated_at();
create trigger appointments_touch before update on public.appointments for each row execute function public.touch_updated_at();
create trigger payments_touch before update on public.payments for each row execute function public.touch_updated_at();

create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, full_name, phone, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.phone,
    case when new.raw_user_meta_data ->> 'requested_role' = 'business'
      then 'BUSINESS_OWNER'::public.app_role
      else 'CUSTOMER'::public.app_role
    end
  )
  on conflict (id) do nothing;
  insert into public.notification_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'ADMIN' and deleted_at is null)
$$;

create or replace function public.is_business_member(target_business_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_members
    where business_id = target_business_id and user_id = auth.uid() and active
  ) or public.is_admin()
$$;

create or replace function public.has_business_role(target_business_id uuid, allowed_roles public.business_member_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_members
    where business_id = target_business_id and user_id = auth.uid() and active and role = any(allowed_roles)
  ) or public.is_admin()
$$;

-- The function serializes per employee/day and the exclusion constraint remains the final guard.
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
  v_service public.services%rowtype;
  v_customer_id uuid;
  v_appointment_id uuid;
  v_duration integer;
  v_price integer;
  v_ends_at timestamptz;
  v_existing uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 8 then raise exception 'invalid_idempotency_key'; end if;

  select id into v_existing from public.appointments where business_id = p_business_id and idempotency_key = p_idempotency_key;
  if v_existing is not null then return v_existing; end if;

  select s.* into strict v_service from public.services s
  join public.branch_services bs on bs.service_id = s.id and bs.branch_id = p_branch_id and bs.active
  join public.employee_services es on es.service_id = s.id and es.employee_id = p_employee_id
  join public.employee_branches eb on eb.employee_id = p_employee_id and eb.branch_id = p_branch_id
  where s.id = p_service_id and s.business_id = p_business_id and s.active;

  select coalesce(es.duration_override_minutes, v_service.duration_minutes),
         coalesce(es.price_override_minor, bs.price_override_minor, v_service.price_minor)
  into v_duration, v_price
  from public.employee_services es
  join public.branch_services bs on bs.service_id = es.service_id and bs.branch_id = p_branch_id
  where es.employee_id = p_employee_id and es.service_id = p_service_id;

  v_ends_at := p_starts_at + make_interval(mins => v_duration + v_service.buffer_after_minutes);
  perform pg_advisory_xact_lock(hashtextextended(p_employee_id::text || p_starts_at::date::text, 0));

  if exists (
    select 1 from public.employee_time_off t
    where t.employee_id = p_employee_id and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(p_starts_at, v_ends_at, '[)')
  ) then raise exception 'appointment_conflict'; end if;

  insert into public.customers (business_id, user_id, full_name, phone, email)
  values (p_business_id, auth.uid(), p_customer_name, p_customer_phone, p_customer_email)
  on conflict (business_id, phone) do update set full_name = excluded.full_name, email = excluded.email, user_id = coalesce(public.customers.user_id, excluded.user_id)
  returning id into v_customer_id;

  insert into public.appointments (business_id, branch_id, customer_id, customer_user_id, employee_id, status, starts_at, ends_at, total_minor, currency, idempotency_key, created_by)
  values (p_business_id, p_branch_id, v_customer_id, auth.uid(), p_employee_id, 'confirmed', p_starts_at, v_ends_at, v_price, v_service.currency, p_idempotency_key, auth.uid())
  returning id into v_appointment_id;

  insert into public.appointment_items (appointment_id, business_id, service_id, employee_id, name_snapshot, duration_minutes, price_minor)
  values (v_appointment_id, p_business_id, p_service_id, p_employee_id, v_service.name, v_duration, v_price);

  insert into public.notifications (user_id, business_id, appointment_id, type, title, body)
  values (auth.uid(), p_business_id, v_appointment_id, 'appointment_confirmed', 'Randevunuz onaylandı', v_service.name || ' randevunuz oluşturuldu.');

  return v_appointment_id;
exception when exclusion_violation then
  raise exception 'appointment_conflict' using errcode = '23P01';
end; $$;

revoke all on function public.create_appointment_atomic(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text) from public;
grant execute on function public.create_appointment_atomic(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text) to authenticated;
revoke all on function public.touch_updated_at() from public;
revoke all on function public.handle_new_auth_user() from public;

-- RLS is mandatory on every tenant or personal-data table.
alter table public.business_categories enable row level security;
alter table public.appointment_statuses enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.users enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.branches enable row level security;
alter table public.business_locations enable row level security;
alter table public.business_images enable row level security;
alter table public.business_hours enable row level security;
alter table public.business_breaks enable row level security;
alter table public.service_categories enable row level security;
alter table public.services enable row level security;
alter table public.branch_services enable row level security;
alter table public.employees enable row level security;
alter table public.employee_branches enable row level security;
alter table public.employee_services enable row level security;
alter table public.employee_working_hours enable row level security;
alter table public.employee_time_off enable row level security;
alter table public.customers enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_items enable row level security;
alter table public.payments enable row level security;
alter table public.reviews enable row level security;
alter table public.favorites enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.campaigns enable row level security;
alter table public.discounts enable row level security;
alter table public.subscriptions enable row level security;
alter table public.business_settings enable row level security;
alter table public.inventory_products enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.sponsored_campaigns enable row level security;
alter table public.consents enable row level security;
alter table public.audit_logs enable row level security;

create policy business_categories_public_read on public.business_categories
for select to anon, authenticated using (true);
create policy appointment_statuses_public_read on public.appointment_statuses
for select to anon, authenticated using (true);
create policy subscription_plans_public_read on public.subscription_plans
for select to anon, authenticated using (true);

create policy users_self_read on public.users for select using (id = auth.uid() or public.is_admin());
create policy users_self_update on public.users for update using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
create policy businesses_public_read on public.businesses for select using (status = 'published' or public.is_business_member(id));
create policy businesses_member_update on public.businesses for update using (public.has_business_role(id, array['OWNER','MANAGER']::public.business_member_role[])) with check (public.has_business_role(id, array['OWNER','MANAGER']::public.business_member_role[]));
create policy business_members_tenant on public.business_members for select using (public.is_business_member(business_id));
create policy business_members_manage on public.business_members for all using (public.has_business_role(business_id, array['OWNER']::public.business_member_role[])) with check (public.has_business_role(business_id, array['OWNER']::public.business_member_role[]));

create policy branches_public_read on public.branches for select using (active and exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published') or public.is_business_member(business_id));
create policy branches_manage on public.branches for all using (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[])) with check (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]));
create policy locations_public_read on public.business_locations for select using (exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published') or public.is_business_member(business_id));
create policy locations_manage on public.business_locations for all using (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[])) with check (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]));
create policy images_public_read on public.business_images for select using (exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published') or public.is_business_member(business_id));
create policy images_manage on public.business_images for all using (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[])) with check (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]));

create policy hours_public_read on public.business_hours for select using (exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published') or public.is_business_member(business_id));
create policy hours_manage on public.business_hours for all using (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[])) with check (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]));
create policy breaks_public_read on public.business_breaks for select using (exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published') or public.is_business_member(business_id));
create policy breaks_manage on public.business_breaks for all using (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[])) with check (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]));

create policy service_categories_public_read on public.service_categories for select using (active or public.is_business_member(business_id));
create policy service_categories_manage on public.service_categories for all using (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[])) with check (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]));
create policy services_public_read on public.services for select using (active and exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published') or public.is_business_member(business_id));
create policy services_manage on public.services for all using (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[])) with check (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]));
create policy employees_public_read on public.employees for select using (active and exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published') or public.is_business_member(business_id));
create policy employees_manage on public.employees for all using (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[])) with check (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]));

-- Join tables inherit access through their parent tenant.
create policy branch_services_public_read on public.branch_services for select using (exists (select 1 from public.services s where s.id = service_id and (s.active or public.is_business_member(s.business_id))));
create policy branch_services_manage on public.branch_services for all using (exists (select 1 from public.services s where s.id = service_id and public.has_business_role(s.business_id, array['OWNER','MANAGER']::public.business_member_role[])));
create policy employee_branches_public_read on public.employee_branches for select using (exists (select 1 from public.employees e where e.id = employee_id and (e.active or public.is_business_member(e.business_id))));
create policy employee_branches_manage on public.employee_branches for all using (exists (select 1 from public.employees e where e.id = employee_id and public.has_business_role(e.business_id, array['OWNER','MANAGER']::public.business_member_role[])));
create policy employee_services_public_read on public.employee_services for select using (exists (select 1 from public.employees e where e.id = employee_id and (e.active or public.is_business_member(e.business_id))));
create policy employee_services_manage on public.employee_services for all using (exists (select 1 from public.employees e where e.id = employee_id and public.has_business_role(e.business_id, array['OWNER','MANAGER']::public.business_member_role[])));

create policy employee_hours_public_read on public.employee_working_hours for select using (public.is_business_member(business_id) or exists (select 1 from public.businesses b where b.id = business_id and b.status = 'published'));
create policy employee_hours_manage on public.employee_working_hours for all using (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[])) with check (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]));
create policy employee_time_off_tenant on public.employee_time_off for all using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy customers_tenant on public.customers for all using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

create policy appointments_customer_read on public.appointments for select using (customer_user_id = auth.uid() or public.is_business_member(business_id));
create policy appointments_business_update on public.appointments for update using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy appointment_items_read on public.appointment_items for select using (public.is_business_member(business_id) or exists (select 1 from public.appointments a where a.id = appointment_id and a.customer_user_id = auth.uid()));
create policy payments_read on public.payments for select using (customer_user_id = auth.uid() or public.is_business_member(business_id));

create policy reviews_public_read on public.reviews for select using (moderation_status = 'approved' or customer_user_id = auth.uid() or public.is_business_member(business_id));
create policy reviews_customer_insert on public.reviews for insert with check (customer_user_id = auth.uid() and exists (select 1 from public.appointments a where a.id = appointment_id and a.customer_user_id = auth.uid() and a.status = 'completed'));
create policy reviews_business_reply on public.reviews for update using (public.is_business_member(business_id));
create policy favorites_self on public.favorites for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notification_preferences_self on public.notification_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_self on public.notifications for select using (user_id = auth.uid());
create policy notifications_self_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notification_deliveries_admin on public.notification_deliveries for select using (public.is_admin());

create policy conversations_access on public.conversations for select using (customer_user_id = auth.uid() or public.is_business_member(business_id));
create policy conversations_insert on public.conversations for insert with check (customer_user_id = auth.uid() or public.is_business_member(business_id));
create policy messages_access on public.messages for select using (public.is_business_member(business_id) or exists (select 1 from public.conversations c where c.id = conversation_id and c.customer_user_id = auth.uid()));
create policy messages_insert on public.messages for insert with check (sender_user_id = auth.uid() and (public.is_business_member(business_id) or exists (select 1 from public.conversations c where c.id = conversation_id and c.customer_user_id = auth.uid())));

create policy campaigns_tenant on public.campaigns for all using (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[])) with check (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]));
create policy discounts_public_read on public.discounts for select using (active or public.is_business_member(business_id));
create policy discounts_manage on public.discounts for all using (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]));
create policy subscriptions_tenant on public.subscriptions for select using (public.has_business_role(business_id, array['OWNER']::public.business_member_role[]));
create policy business_settings_tenant on public.business_settings for all using (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[])) with check (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]));
create policy inventory_products_tenant on public.inventory_products for all using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy inventory_transactions_tenant on public.inventory_transactions for all using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy sponsored_campaigns_tenant on public.sponsored_campaigns for all using (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[])) with check (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]));
create policy consents_self on public.consents for select using (user_id = auth.uid() or public.is_admin());
create policy consents_self_insert on public.consents for insert with check (user_id = auth.uid());
create policy audit_logs_tenant_read on public.audit_logs for select using (public.is_admin() or (business_id is not null and public.has_business_role(business_id, array['OWNER']::public.business_member_role[])));

-- Storage policies expect private business assets under business/<business_uuid>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-assets', 'business-assets', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy business_assets_public_read on storage.objects for select using (bucket_id = 'business-assets');
create policy business_assets_member_insert on storage.objects for insert to authenticated
with check (bucket_id = 'business-assets' and public.is_business_member(((storage.foldername(name))[2])::uuid));
create policy business_assets_member_update on storage.objects for update to authenticated
using (bucket_id = 'business-assets' and public.is_business_member(((storage.foldername(name))[2])::uuid));
create policy business_assets_member_delete on storage.objects for delete to authenticated
using (bucket_id = 'business-assets' and public.is_business_member(((storage.foldername(name))[2])::uuid));

insert into public.subscription_plans (code, name, price_minor, interval, features, limits) values
  ('FREE', 'Free', 0, 'month', '{"booking":true,"profile":true,"calendar":true}', '{"branches":1,"employees":3}'),
  ('PRO', 'Pro', null, 'month', '{"crm":true,"reports":true,"whatsapp":true,"campaigns":true}', '{"branches":1,"employees":15}'),
  ('BUSINESS', 'Business', null, 'month', '{"multi_branch":true,"advanced_reports":true,"api":true}', '{"branches":null,"employees":null}')
on conflict (code) do nothing;
