-- Operational growth features: waitlist, resources, customer records, role
-- permissions, import jobs, booking links, loyalty/packages and delivery queue.

alter table public.appointments
  add column if not exists source text not null default 'marketplace'
    check (source in ('marketplace','direct_link','widget','walk_in','staff')),
  add column if not exists party_size integer not null default 1 check (party_size between 1 and 50),
  add column if not exists recurrence_group_id uuid,
  add column if not exists recurrence_rule text;

create table if not exists public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  desired_from timestamptz not null,
  desired_to timestamptz not null,
  party_size integer not null default 1 check (party_size between 1 and 50),
  priority integer not null default 100,
  status text not null default 'waiting' check (status in ('waiting','offered','accepted','expired','cancelled')),
  offer_expires_at timestamptz,
  offered_starts_at timestamptz,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (desired_from < desired_to)
);

create table if not exists public.business_resources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('room','chair','device','other')),
  capacity integer not null default 1 check (capacity between 1 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (branch_id, name)
);

create table if not exists public.service_resources (
  service_id uuid not null references public.services(id) on delete cascade,
  resource_id uuid not null references public.business_resources(id) on delete cascade,
  quantity integer not null default 1 check (quantity between 1 and 100),
  primary key (service_id, resource_id)
);

create table if not exists public.appointment_resource_reservations (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  resource_id uuid not null references public.business_resources(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

do $$ begin
  alter table public.appointment_resource_reservations
    add constraint appointment_resource_no_overlap
    exclude using gist (resource_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
    where (released_at is null);
exception when duplicate_object then null;
end $$;

create table if not exists public.customer_care_profiles (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  allergies text[] not null default '{}',
  anamnesis text,
  treatment_notes text,
  consent_status text not null default 'missing' check (consent_status in ('missing','requested','signed','revoked')),
  consent_at timestamptz,
  consent_version text,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_care_media (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  kind text not null check (kind in ('before','after','document')),
  storage_path text not null,
  caption text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.business_member_permissions (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  permissions jsonb not null default '{}'::jsonb,
  customer_visibility text not null default 'all' check (customer_visibility in ('all','assigned','none')),
  financial_visibility boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (business_id, user_id),
  foreign key (business_id, user_id) references public.business_members(business_id, user_id) on delete cascade
);

create table if not exists public.data_import_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null check (kind in ('customers','services')),
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  rejected_rows integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.booking_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  token text not null unique default encode(gen_random_bytes(9), 'hex'),
  label text not null,
  source text not null default 'direct',
  campaign text,
  active boolean not null default true,
  visits bigint not null default 0,
  conversions bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  points integer not null default 0 check (points >= 0),
  tier text not null default 'standard' check (tier in ('standard','silver','gold','vip')),
  referral_code text not null default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10)),
  updated_at timestamptz not null default now(),
  unique (business_id, customer_id),
  unique (business_id, referral_code)
);

create table if not exists public.service_packages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  name text not null,
  session_count integer not null check (session_count between 1 and 1000),
  validity_days integer not null default 365 check (validity_days between 1 and 3650),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_packages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  package_id uuid not null references public.service_packages(id) on delete restrict,
  remaining_sessions integer not null check (remaining_sessions >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.communication_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  channel public.notification_channel not null,
  recipient text not null,
  template_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','processing','delivered','retry','dead_letter','cancelled')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  provider text,
  provider_reference text,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists waitlist_business_status_priority_idx on public.waitlist_entries(business_id, status, priority, created_at);
create index if not exists resources_business_branch_active_idx on public.business_resources(business_id, branch_id) where active;
create index if not exists care_media_customer_created_idx on public.customer_care_media(customer_id, created_at desc);
create index if not exists booking_links_business_active_idx on public.booking_links(business_id) where active;
create index if not exists communication_jobs_claim_idx on public.communication_jobs(status, available_at, created_at) where status in ('queued','retry');
create index if not exists customer_packages_customer_expiry_idx on public.customer_packages(customer_id, expires_at) where remaining_sessions > 0;

alter table public.waitlist_entries enable row level security;
alter table public.business_resources enable row level security;
alter table public.service_resources enable row level security;
alter table public.appointment_resource_reservations enable row level security;
alter table public.customer_care_profiles enable row level security;
alter table public.customer_care_media enable row level security;
alter table public.business_member_permissions enable row level security;
alter table public.data_import_jobs enable row level security;
alter table public.booking_links enable row level security;
alter table public.loyalty_accounts enable row level security;
alter table public.service_packages enable row level security;
alter table public.customer_packages enable row level security;
alter table public.communication_jobs enable row level security;

create policy waitlist_tenant on public.waitlist_entries for all to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy resources_public_read on public.business_resources for select to anon, authenticated using (active or public.is_business_member(business_id));
create policy resources_manage on public.business_resources for all to authenticated using (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[])) with check (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]));
create policy service_resources_public_read on public.service_resources for select to anon, authenticated using (exists (select 1 from public.business_resources r where r.id = resource_id and r.active));
create policy service_resources_manage on public.service_resources for all to authenticated using (exists (select 1 from public.business_resources r where r.id = resource_id and public.has_business_role(r.business_id, array['OWNER','MANAGER']::public.business_member_role[]))) with check (exists (select 1 from public.business_resources r where r.id = resource_id and public.has_business_role(r.business_id, array['OWNER','MANAGER']::public.business_member_role[])));
create policy resource_reservations_tenant on public.appointment_resource_reservations for all to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy care_profiles_tenant on public.customer_care_profiles for all to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy care_media_tenant on public.customer_care_media for all to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy member_permissions_read on public.business_member_permissions for select to authenticated using (public.is_business_member(business_id));
create policy member_permissions_manage on public.business_member_permissions for all to authenticated using (public.has_business_role(business_id, array['OWNER']::public.business_member_role[])) with check (public.has_business_role(business_id, array['OWNER']::public.business_member_role[]));
create policy import_jobs_tenant on public.data_import_jobs for select to authenticated using (public.is_business_member(business_id));
create policy booking_links_tenant on public.booking_links for all to authenticated using (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[])) with check (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]));
create policy loyalty_tenant on public.loyalty_accounts for all to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy packages_public_read on public.service_packages for select to anon, authenticated using (active or public.is_business_member(business_id));
create policy packages_manage on public.service_packages for all to authenticated using (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[])) with check (public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[]));
create policy customer_packages_tenant on public.customer_packages for all to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
create policy communication_jobs_admin_read on public.communication_jobs for select to authenticated using (public.is_admin() or (business_id is not null and public.has_business_role(business_id, array['OWNER','MANAGER']::public.business_member_role[])));

create or replace function public.offer_next_waitlist_entry(p_business_id uuid, p_service_id uuid, p_starts_at timestamptz, p_offer_minutes integer default 15)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if not public.has_business_role(p_business_id, array['OWNER','MANAGER']::public.business_member_role[]) then raise exception 'business_manager_required'; end if;
  update public.waitlist_entries set status='expired', offer_expires_at=null, offered_starts_at=null, updated_at=now()
    where business_id=p_business_id and status='offered' and offer_expires_at < now();
  select id into v_id from public.waitlist_entries
    where business_id=p_business_id and service_id=p_service_id and status='waiting' and p_starts_at between desired_from and desired_to
    order by priority, created_at for update skip locked limit 1;
  if v_id is not null then
    update public.waitlist_entries set status='offered', offered_starts_at=p_starts_at, offer_expires_at=now()+make_interval(mins=>greatest(5, least(p_offer_minutes, 120))), updated_at=now() where id=v_id;
  end if;
  return v_id;
end $$;

create or replace function public.bulk_import_customers(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_business_id uuid; v_job_id uuid; v_total int; v_imported int;
begin
  select business_id into v_business_id from public.business_members where user_id=(select auth.uid()) and active order by created_at limit 1;
  if v_business_id is null then raise exception 'business_required'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then raise exception 'invalid_import'; end if;
  v_total := jsonb_array_length(p_rows);
  insert into public.data_import_jobs(business_id,kind,total_rows,created_by) values(v_business_id,'customers',v_total,(select auth.uid())) returning id into v_job_id;
  insert into public.customers(business_id,full_name,phone,email,notes,marketing_consent)
    select v_business_id, trim(r->>'fullName'), trim(r->>'phone'), nullif(trim(r->>'email'),''), nullif(trim(r->>'notes'),''), coalesce((r->>'marketingConsent')::boolean,false)
    from jsonb_array_elements(p_rows) r where length(trim(r->>'fullName'))>=2 and length(trim(r->>'phone'))>=10
    on conflict (business_id,phone) do update set full_name=excluded.full_name,email=excluded.email,notes=excluded.notes,marketing_consent=excluded.marketing_consent,updated_at=now();
  get diagnostics v_imported = row_count;
  update public.data_import_jobs set status='completed',imported_rows=v_imported,rejected_rows=v_total-v_imported,completed_at=now() where id=v_job_id;
  return jsonb_build_object('jobId',v_job_id,'total',v_total,'imported',v_imported,'rejected',v_total-v_imported);
end $$;

create or replace function public.create_staff_appointment_series(
  p_customer_id uuid,
  p_employee_id uuid,
  p_service_id uuid,
  p_branch_id uuid,
  p_starts_at timestamptz,
  p_party_size integer default 1,
  p_repeat_count integer default 1,
  p_interval_days integer default 7,
  p_source text default 'staff'
)
returns uuid[] language plpgsql security definer set search_path = public, pg_temp as $$
declare v_business_id uuid; v_duration int; v_price int; v_name text; v_group uuid := gen_random_uuid(); v_ids uuid[] := '{}'; v_id uuid; i int;
begin
  select s.business_id,s.duration_minutes,s.price_minor,s.name into v_business_id,v_duration,v_price,v_name from public.services s where s.id=p_service_id and s.active;
  if v_business_id is null or not public.is_business_member(v_business_id) then raise exception 'business_required'; end if;
  if not exists(select 1 from public.branches b where b.id=p_branch_id and b.business_id=v_business_id and b.active) then raise exception 'invalid_branch'; end if;
  if not exists(select 1 from public.employees e join public.employee_services es on es.employee_id=e.id where e.id=p_employee_id and e.business_id=v_business_id and es.service_id=p_service_id and e.active) then raise exception 'invalid_employee'; end if;
  if not exists(select 1 from public.customers c where c.id=p_customer_id and c.business_id=v_business_id) then raise exception 'invalid_customer'; end if;
  if p_party_size not between 1 and 50 or p_repeat_count not between 1 and 52 or p_interval_days not between 1 and 365 then raise exception 'invalid_series'; end if;
  for i in 0..p_repeat_count-1 loop
    insert into public.appointments(business_id,branch_id,customer_id,employee_id,status,starts_at,ends_at,total_minor,currency,created_by,source,party_size,recurrence_group_id,recurrence_rule)
      values(v_business_id,p_branch_id,p_customer_id,p_employee_id,'confirmed',p_starts_at+make_interval(days=>i*p_interval_days),p_starts_at+make_interval(days=>i*p_interval_days,mins=>v_duration),v_price,'TRY',(select auth.uid()),p_source,p_party_size,case when p_repeat_count>1 then v_group end,case when p_repeat_count>1 then 'FREQ=DAILY;INTERVAL='||p_interval_days||';COUNT='||p_repeat_count end)
      returning id into v_id;
    insert into public.appointment_items(appointment_id,business_id,service_id,employee_id,name_snapshot,duration_minutes,price_minor)
      values(v_id,v_business_id,p_service_id,p_employee_id,v_name,v_duration,v_price);
    v_ids := array_append(v_ids,v_id);
  end loop;
  return v_ids;
end $$;

create or replace function public.resolve_booking_link(p_token text)
returns table(business_slug text, service_id uuid, source text, campaign text)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.booking_links set visits=visits+1 where token=p_token and active;
  return query select b.slug,l.service_id,l.source,l.campaign from public.booking_links l join public.businesses b on b.id=l.business_id where l.token=p_token and l.active and b.status='published';
end $$;

create or replace function public.track_booking_conversion(p_token text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (select auth.uid()) is null then raise exception 'authentication_required'; end if;
  update public.booking_links set conversions=conversions+1 where token=p_token and active;
end $$;

revoke all on function public.offer_next_waitlist_entry(uuid,uuid,timestamptz,integer) from public, anon;
revoke all on function public.bulk_import_customers(jsonb) from public, anon;
revoke all on function public.create_staff_appointment_series(uuid,uuid,uuid,uuid,timestamptz,integer,integer,integer,text) from public, anon;
revoke all on function public.resolve_booking_link(text) from public;
revoke all on function public.track_booking_conversion(text) from public, anon;
grant execute on function public.offer_next_waitlist_entry(uuid,uuid,timestamptz,integer) to authenticated;
grant execute on function public.bulk_import_customers(jsonb) to authenticated;
grant execute on function public.create_staff_appointment_series(uuid,uuid,uuid,uuid,timestamptz,integer,integer,integer,text) to authenticated;
grant execute on function public.resolve_booking_link(text) to anon, authenticated;
grant execute on function public.track_booking_conversion(text) to authenticated;
